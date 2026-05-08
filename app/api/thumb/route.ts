export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import fs from "fs";
import path from "path";
import { assertImagePath } from "@/lib/photos";
import { pendingThumbnails, thumbnailCache } from "@/lib/thumb-cache";

const MAX_CACHE_ITEMS = 800;
const BROWSER_IMAGE_MIME: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".gif": "image/gif",
};
let sharpLoadFailed = false;

function unavailableSvg(message: string): Response {
  const safe = message.replace(/[<>&]/g, "");
  return new Response(
    `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="800" viewBox="0 0 800 800"><rect width="800" height="800" fill="#0a0a0a"/><text x="400" y="400" fill="#737373" font-family="sans-serif" font-size="34" text-anchor="middle">${safe}</text></svg>`,
    { headers: { "Content-Type": "image/svg+xml", "Cache-Control": "no-store" } },
  );
}

async function thumbnail(filePath: string): Promise<Buffer | null> {
  const stat = fs.statSync(filePath);
  const key = `${filePath}:${stat.mtimeMs}:${stat.size}`;
  const cached = thumbnailCache.get(key);
  if (cached) return cached;

  const pending = pendingThumbnails.get(key);
  if (pending) return pending;

  const work = (async () => {
    try {
      if (sharpLoadFailed) return null;

      const sharp = (await import("sharp")).default;
      const buffer = await sharp(filePath, { pages: 1 })
        .rotate()
        .resize(900, 900, { fit: "inside", withoutEnlargement: true })
        .jpeg({ quality: 84 })
        .toBuffer();

      if (thumbnailCache.size >= MAX_CACHE_ITEMS) thumbnailCache.delete(thumbnailCache.keys().next().value!);
      thumbnailCache.set(key, buffer);
      return buffer;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message.includes("Could not load") || message.includes("ERR_DLOPEN_FAILED")) sharpLoadFailed = true;
      return null;
    } finally {
      pendingThumbnails.delete(key);
    }
  })();

  pendingThumbnails.set(key, work);
  return work;
}

export async function GET(req: Request) {
  const input = new URL(req.url).searchParams.get("path");
  if (!input) return new Response("path required", { status: 400 });

  let filePath: string;
  try {
    filePath = assertImagePath(input).path;
  } catch (error) {
    return new Response(error instanceof Error ? error.message : String(error), { status: 403 });
  }

  if (!fs.existsSync(filePath)) return new Response("not found", { status: 404 });

  const data = await thumbnail(filePath);
  if (data) {
    return new Response(data as unknown as BodyInit, {
      headers: {
        "Content-Type": "image/jpeg",
        "Cache-Control": "no-store",
      },
    });
  }

  const mime = BROWSER_IMAGE_MIME[path.extname(filePath).toLowerCase()];
  if (!mime) return unavailableSvg("Preview unavailable");

  return new Response(fs.readFileSync(filePath), {
    headers: {
      "Content-Type": mime,
      "Cache-Control": "no-store",
    },
  });
}
