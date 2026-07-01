export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import fs from "fs";
import path from "path";
import { getSettingsAsync, saveSettingsAsync } from "@/lib/settings";
import { clearPhotoCache } from "@/lib/photos";

export async function GET() {
  return Response.json(await getSettingsAsync());
}

export async function POST(req: Request) {
  const body = (await req.json()) as { folder?: string };
  const folder = (body.folder ?? "").trim();

  if (!folder) {
    await saveSettingsAsync({ folder: "" });
    clearPhotoCache();
    return Response.json({ folder: "" });
  }

  const resolved = path.resolve(folder);
  try {
    if (!(await fs.promises.stat(resolved)).isDirectory()) {
      return Response.json({ error: "Path is not a folder" }, { status: 400 });
    }
  } catch {
    return Response.json({ error: "Folder does not exist" }, { status: 400 });
  }

  await saveSettingsAsync({ folder: resolved });
  clearPhotoCache();
  return Response.json({ folder: resolved });
}
