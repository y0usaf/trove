export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import fs from "fs";
import path from "path";
import { randomUUID } from "crypto";
import { assertImagePathAsync, clearPhotoCache, TRASH_DIR } from "@/lib/photos";

interface DeleteResult {
  path: string;
  trashPath: string;
}

function createLimiter(limit: number) {
  let active = 0;
  const queue: Array<() => void> = [];

  return async function limitWork<T>(work: () => Promise<T>): Promise<T> {
    if (active >= limit) await new Promise<void>((resolve) => queue.push(resolve));
    active += 1;
    try {
      return await work();
    } finally {
      active -= 1;
      queue.shift()?.();
    }
  };
}

async function uniqueTrashPath(root: string, relative: string): Promise<string> {
  const firstChoice = path.join(root, TRASH_DIR, relative);
  const dir = path.dirname(firstChoice);
  await fs.promises.mkdir(dir, { recursive: true });

  const ext = path.extname(firstChoice);
  const base = path.basename(firstChoice, ext);

  for (let attempt = 0; attempt < 10; attempt += 1) {
    const suffix = `${Date.now()}-${randomUUID().slice(0, 8)}`;
    const candidate = path.join(dir, `${base}-${suffix}${ext}`);
    try {
      await fs.promises.access(candidate, fs.constants.F_OK);
    } catch {
      return candidate;
    }
  }

  throw new Error("Could not create unique trash path");
}

async function moveToTrash(input: string): Promise<DeleteResult> {
  const checked = await assertImagePathAsync(input);
  const stat = await fs.promises.stat(checked.path).catch(() => null);
  if (!stat) throw new Error("File not found");
  if (!stat.isFile()) throw new Error("Path is not a file");

  const trashPath = await uniqueTrashPath(checked.root, checked.relative);
  try {
    await fs.promises.rename(checked.path, trashPath);
  } catch {
    await fs.promises.copyFile(checked.path, trashPath, fs.constants.COPYFILE_EXCL);
    await fs.promises.unlink(checked.path);
  }

  return { path: checked.path, trashPath };
}

export async function POST(req: Request) {
  const body = (await req.json()) as { paths?: string[] };
  const paths = body.paths ?? [];
  if (paths.length === 0) return Response.json({ error: "No paths provided" }, { status: 400 });

  const limitWork = createLimiter(6);
  const results = await Promise.allSettled(paths.map((input) => limitWork(() => moveToTrash(input))));
  const deleted: DeleteResult[] = [];
  const errors: { path: string; error: string }[] = [];

  results.forEach((result, index) => {
    if (result.status === "fulfilled") deleted.push(result.value);
    else errors.push({ path: paths[index], error: result.reason instanceof Error ? result.reason.message : String(result.reason) });
  });

  clearPhotoCache();
  return Response.json({ deleted, errors });
}
