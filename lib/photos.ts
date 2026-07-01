import fs from "fs";
import path from "path";
import { getSettings, getSettingsAsync } from "./settings";

export const TRASH_DIR = ".photo-trash";

export const IMAGE_EXTS = new Set([
  ".jpg",
  ".jpeg",
  ".png",
  ".webp",
  ".gif",
  ".tif",
  ".tiff",
  ".heic",
  ".heif",
]);

export interface PhotoFile {
  path: string;
  name: string;
  modified: number;
  size: number;
}

let cache: { root: string; photos: PhotoFile[]; createdAt: number } | null = null;
const CACHE_MS = 30_000;

export function getPhotoRoot(): string | null {
  const folder = getSettings().folder.trim();
  if (!folder) return null;

  const root = path.resolve(folder);
  try {
    return fs.statSync(root).isDirectory() ? root : null;
  } catch {
    return null;
  }
}

export async function getPhotoRootAsync(): Promise<string | null> {
  const folder = (await getSettingsAsync()).folder.trim();
  if (!folder) return null;

  const root = path.resolve(folder);
  try {
    return (await fs.promises.stat(root)).isDirectory() ? root : null;
  } catch {
    return null;
  }
}

function isInside(root: string, target: string): boolean {
  const relative = path.relative(root, target);
  return relative !== "" && !relative.startsWith("..") && !path.isAbsolute(relative);
}

export function assertImagePath(input: string): { root: string; path: string; relative: string } {
  const root = getPhotoRoot();
  if (!root) throw new Error("No photo folder selected");

  const resolved = path.resolve(input);
  if (!isInside(root, resolved)) throw new Error("Path is outside the selected folder");

  const relative = path.relative(root, resolved);
  if (relative.split(path.sep).includes(TRASH_DIR)) throw new Error("Trash folder is not browsable");
  if (!IMAGE_EXTS.has(path.extname(resolved).toLowerCase())) throw new Error("Unsupported image type");

  return { root, path: resolved, relative };
}

export async function assertImagePathAsync(input: string): Promise<{ root: string; path: string; relative: string }> {
  const root = await getPhotoRootAsync();
  if (!root) throw new Error("No photo folder selected");

  const resolved = path.resolve(input);
  if (!isInside(root, resolved)) throw new Error("Path is outside the selected folder");

  const relative = path.relative(root, resolved);
  if (relative.split(path.sep).includes(TRASH_DIR)) throw new Error("Trash folder is not browsable");
  if (!IMAGE_EXTS.has(path.extname(resolved).toLowerCase())) throw new Error("Unsupported image type");

  return { root, path: resolved, relative };
}

function createLimiter(limit: number) {
  let active = 0;
  const queue: Array<() => void> = [];

  const runNext = () => {
    active -= 1;
    queue.shift()?.();
  };

  return async function limitWork<T>(work: () => Promise<T>): Promise<T> {
    if (active >= limit) await new Promise<void>((resolve) => queue.push(resolve));
    active += 1;
    try {
      return await work();
    } finally {
      runNext();
    }
  };
}

async function scanDir(dir: string, out: PhotoFile[], limitWork: ReturnType<typeof createLimiter>): Promise<void> {
  let entries: fs.Dirent[];
  try {
    entries = await limitWork(() => fs.promises.readdir(dir, { withFileTypes: true }));
  } catch {
    return;
  }

  await Promise.all(
    entries.map(async (entry) => {
      if (entry.name.startsWith(".")) return;

      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === TRASH_DIR) return;
        await scanDir(fullPath, out, limitWork);
        return;
      }

      if (!entry.isFile() || !IMAGE_EXTS.has(path.extname(entry.name).toLowerCase())) return;

      try {
        const stat = await limitWork(() => fs.promises.stat(fullPath));
        out.push({ path: fullPath, name: entry.name, modified: stat.mtimeMs, size: stat.size });
      } catch {
        // unreadable files are ignored
      }
    }),
  );
}

let pendingScan: { root: string; promise: Promise<PhotoFile[]> } | null = null;

export async function listPhotos(): Promise<PhotoFile[]> {
  const root = await getPhotoRootAsync();
  if (!root) return [];

  const now = Date.now();
  if (cache && cache.root === root && now - cache.createdAt < CACHE_MS) return cache.photos;
  if (pendingScan?.root === root) return pendingScan.promise;

  const promise = (async () => {
    const photos: PhotoFile[] = [];
    const limitWork = createLimiter(32);
    await scanDir(root, photos, limitWork);
    photos.sort((a, b) => b.modified - a.modified);
    cache = { root, photos, createdAt: Date.now() };
    return photos;
  })();
  pendingScan = { root, promise };

  try {
    return await promise;
  } finally {
    if (pendingScan?.promise === promise) pendingScan = null;
  }
}

export function clearPhotoCache(): void {
  cache = null;
}
