export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import fs from "fs";
import path from "path";
import { Readable } from "stream";
import { assertImagePathAsync } from "@/lib/photos";

const MIME: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".tif": "image/tiff",
  ".tiff": "image/tiff",
  ".heic": "image/heic",
  ".heif": "image/heif",
};

export async function GET(req: Request) {
  const input = new URL(req.url).searchParams.get("path");
  if (!input) return new Response("path required", { status: 400 });

  let filePath: string;
  try {
    filePath = (await assertImagePathAsync(input)).path;
  } catch (error) {
    return new Response(error instanceof Error ? error.message : String(error), { status: 403 });
  }

  try {
    await fs.promises.access(filePath, fs.constants.R_OK);
  } catch {
    return new Response("not found", { status: 404 });
  }

  const stream = Readable.toWeb(fs.createReadStream(filePath)) as unknown as ReadableStream;
  return new Response(stream, {
    headers: {
      "Content-Type": MIME[path.extname(filePath).toLowerCase()] ?? "application/octet-stream",
      "Cache-Control": "public, max-age=3600",
    },
  });
}
