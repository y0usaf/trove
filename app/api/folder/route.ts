export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import fs from "fs";
import path from "path";
import { getSettings, saveSettings } from "@/lib/settings";
import { clearPhotoCache } from "@/lib/photos";

export async function GET() {
  return Response.json(getSettings());
}

export async function POST(req: Request) {
  const body = (await req.json()) as { folder?: string };
  const folder = (body.folder ?? "").trim();

  if (!folder) {
    saveSettings({ folder: "" });
    clearPhotoCache();
    return Response.json({ folder: "" });
  }

  const resolved = path.resolve(folder);
  try {
    if (!fs.statSync(resolved).isDirectory()) {
      return Response.json({ error: "Path is not a folder" }, { status: 400 });
    }
  } catch {
    return Response.json({ error: "Folder does not exist" }, { status: 400 });
  }

  saveSettings({ folder: resolved });
  clearPhotoCache();
  return Response.json({ folder: resolved });
}
