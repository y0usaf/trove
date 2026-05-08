import fs from "fs";
import path from "path";
import { getSettings } from "./settings";

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

function scanDir(dir: string, out: PhotoFile[]): void {
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    if (entry.name.startsWith(".")) continue;

    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      scanDir(fullPath, out);
      continue;
    }

    if (!entry.isFile() || !IMAGE_EXTS.has(path.extname(entry.name).toLowerCase())) continue;

    try {
      const stat = fs.statSync(fullPath);
      out.push({ path: fullPath, name: entry.name, modified: stat.mtimeMs, size: stat.size });
    } catch {
      // unreadable files are ignored
    }
  }
}

export function listPhotos(): PhotoFile[] {
  const root = getPhotoRoot();
  if (!root) return [];

  const now = Date.now();
  if (cache && cache.root === root && now - cache.createdAt < CACHE_MS) return cache.photos;

  const photos: PhotoFile[] = [];
  scanDir(root, photos);
  photos.sort((a, b) => b.modified - a.modified);
  cache = { root, photos, createdAt: now };
  return photos;
}

export function clearPhotoCache(): void {
  cache = null;
}
