export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { listPhotos } from "@/lib/photos";

const SORTS = new Set(["modified", "name", "size"]);

export async function GET(req: Request) {
  const params = new URL(req.url).searchParams;
  const sort = SORTS.has(params.get("sort") ?? "") ? params.get("sort")! : "modified";
  const direction = params.get("direction") === "asc" ? "asc" : "desc";
  const page = Math.max(1, Number.parseInt(params.get("page") ?? "1", 10) || 1);
  const pageSize = Math.min(200, Math.max(1, Number.parseInt(params.get("pageSize") ?? "80", 10) || 80));

  const photos = [...listPhotos()].sort((a, b) => {
    let result = 0;
    if (sort === "modified") result = a.modified - b.modified;
    if (sort === "name") result = a.name.localeCompare(b.name, undefined, { numeric: true });
    if (sort === "size") result = a.size - b.size;
    return direction === "asc" ? result : -result;
  });

  const start = (page - 1) * pageSize;
  const slice = photos.slice(start, start + pageSize);

  return Response.json({
    photos: slice,
    page,
    total: photos.length,
    hasMore: start + pageSize < photos.length,
  });
}
