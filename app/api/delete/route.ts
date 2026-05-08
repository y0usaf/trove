export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import fs from "fs";
import path from "path";
import { assertImagePath, clearPhotoCache, TRASH_DIR } from "@/lib/photos";

interface DeleteResult {
  path: string;
  trashPath: string;
}

function uniqueTrashPath(root: string, relative: string): string {
  const firstChoice = path.join(root, TRASH_DIR, relative);
  fs.mkdirSync(path.dirname(firstChoice), { recursive: true });
  if (!fs.existsSync(firstChoice)) return firstChoice;

  const ext = path.extname(firstChoice);
  const base = path.basename(firstChoice, ext);
  const dir = path.dirname(firstChoice);
  let index = 1;

  while (true) {
    const candidate = path.join(dir, `${base}-${Date.now()}-${index}${ext}`);
    if (!fs.existsSync(candidate)) return candidate;
    index += 1;
  }
}

function moveToTrash(input: string): DeleteResult {
  const checked = assertImagePath(input);
  if (!fs.existsSync(checked.path)) throw new Error("File not found");
  if (!fs.statSync(checked.path).isFile()) throw new Error("Path is not a file");

  const trashPath = uniqueTrashPath(checked.root, checked.relative);
  try {
    fs.renameSync(checked.path, trashPath);
  } catch {
    fs.copyFileSync(checked.path, trashPath);
    fs.unlinkSync(checked.path);
  }

  return { path: checked.path, trashPath };
}

export async function POST(req: Request) {
  const body = (await req.json()) as { paths?: string[] };
  const paths = body.paths ?? [];
  if (paths.length === 0) return Response.json({ error: "No paths provided" }, { status: 400 });

  const deleted: DeleteResult[] = [];
  const errors: { path: string; error: string }[] = [];

  for (const input of paths) {
    try {
      deleted.push(moveToTrash(input));
    } catch (error) {
      errors.push({ path: input, error: error instanceof Error ? error.message : String(error) });
    }
  }

  clearPhotoCache();
  return Response.json({ deleted, errors });
}
