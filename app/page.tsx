"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type SortKey = "modified" | "name" | "size";
type Direction = "asc" | "desc";

interface Photo {
  path: string;
  name: string;
  modified: number;
  size: number;
}

interface PhotosResponse {
  photos: Photo[];
  total: number;
  hasMore: boolean;
}

interface DeleteResponse {
  deleted: { path: string; trashPath: string }[];
  errors: { path: string; error: string }[];
}

const PAGE_SIZE = 80;

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes)) return "—";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(unit === 0 || value >= 10 ? 0 : 1)} ${units[unit]}`;
}

function imageUrl(route: "thumb" | "image", photoPath: string, cacheKey = ""): string {
  const params = new URLSearchParams({ path: photoPath });
  if (cacheKey) params.set("v", cacheKey);
  return `/api/${route}?${params.toString()}`;
}

export default function Home() {
  const [folder, setFolder] = useState("");
  const [folderInput, setFolderInput] = useState("");
  const [folderDialogOpen, setFolderDialogOpen] = useState(false);
  const [folderError, setFolderError] = useState<string | null>(null);
  const [savingFolder, setSavingFolder] = useState(false);

  const [sort, setSort] = useState<SortKey>("modified");
  const [direction, setDirection] = useState<Direction>("desc");
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [page, setPage] = useState(0);
  const [total, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [deleting, setDeleting] = useState(false);
  const [viewer, setViewer] = useState<Photo | null>(null);
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  const selectedCount = selected.size;

  const loadPhotos = useCallback(async (nextPage: number, replace: boolean) => {
    setLoading(true);
    setPhotoError(null);
    try {
      const params = new URLSearchParams({
        sort,
        direction,
        page: String(nextPage),
        pageSize: String(PAGE_SIZE),
      });
      const response = await fetch(`/api/photos?${params.toString()}`);
      const data = (await response.json()) as PhotosResponse & { error?: string };
      if (!response.ok) throw new Error(data.error ?? `${response.status} ${response.statusText}`);

      setPhotos((current) => (replace ? data.photos : [...current, ...data.photos]));
      setPage(nextPage);
      setTotal(data.total);
      setHasMore(data.hasMore);
    } catch (error) {
      setPhotoError(error instanceof Error ? error.message : String(error));
    } finally {
      setLoading(false);
    }
  }, [direction, sort]);

  useEffect(() => {
    fetch("/api/folder")
      .then((response) => response.json() as Promise<{ folder?: string }>)
      .then((data) => {
        const savedFolder = data.folder ?? "";
        setFolder(savedFolder);
        setFolderInput(savedFolder);
        setFolderDialogOpen(!savedFolder);
      })
      .catch(() => setFolderDialogOpen(true));
  }, []);

  useEffect(() => {
    if (!folder) return;
    setSelected(new Set());
    void loadPhotos(1, true);
  }, [folder, loadPhotos]);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel || !folder) return;

    const observer = new IntersectionObserver((entries) => {
      if (!entries[0].isIntersecting || loading || !hasMore) return;
      void loadPhotos(page + 1, false);
    }, { rootMargin: "600px" });

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [folder, hasMore, loadPhotos, loading, page]);

  const saveFolder = async () => {
    setSavingFolder(true);
    setFolderError(null);
    try {
      const response = await fetch("/api/folder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ folder: folderInput }),
      });
      const data = (await response.json()) as { folder?: string; error?: string };
      if (!response.ok) throw new Error(data.error ?? `${response.status} ${response.statusText}`);

      const nextFolder = data.folder ?? "";
      setFolder(nextFolder);
      setFolderInput(nextFolder);
      setFolderDialogOpen(false);
      setPhotos([]);
      setSelected(new Set());
      setPage(0);
      setTotal(0);
      setHasMore(false);
      if (nextFolder === folder && nextFolder) void loadPhotos(1, true);
    } catch (error) {
      setFolderError(error instanceof Error ? error.message : String(error));
    } finally {
      setSavingFolder(false);
    }
  };

  const toggleSelected = (photoPath: string) => {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(photoPath)) next.delete(photoPath);
      else next.add(photoPath);
      return next;
    });
  };

  const deleteSelected = useCallback(async () => {
    const paths = Array.from(selected);
    if (paths.length === 0) return;
    if (!confirm(`Move ${paths.length} photo${paths.length === 1 ? "" : "s"} to .photo-trash?`)) return;

    setDeleting(true);
    try {
      const response = await fetch("/api/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paths }),
      });
      const data = (await response.json()) as DeleteResponse & { error?: string };
      if (!response.ok) throw new Error(data.error ?? `${response.status} ${response.statusText}`);

      const removed = new Set(data.deleted.map((item) => item.path));
      setPhotos((current) => current.filter((photo) => !removed.has(photo.path)));
      setSelected((current) => {
        const next = new Set(current);
        removed.forEach((path) => next.delete(path));
        return next;
      });
      setTotal((current) => Math.max(0, current - removed.size));
      if (viewer && removed.has(viewer.path)) setViewer(null);

      if (data.errors.length > 0) {
        alert(`Some files could not be deleted:\n${data.errors.map((item) => `${item.path}: ${item.error}`).join("\n")}`);
      }
    } catch (error) {
      alert(`Delete failed: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setDeleting(false);
    }
  }, [selected, viewer]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setViewer(null);
      if (event.key !== "Delete" && event.key !== "Backspace") return;
      const tag = (event.target as HTMLElement).tagName;
      if (["INPUT", "TEXTAREA", "SELECT", "BUTTON"].includes(tag)) return;
      if (selectedCount === 0) return;
      event.preventDefault();
      void deleteSelected();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [deleteSelected, selectedCount]);

  const headerCount = useMemo(() => {
    if (!folder) return "No folder selected";
    if (loading && photos.length === 0) return "Loading…";
    return `${photos.length.toLocaleString()} / ${total.toLocaleString()} loaded`;
  }, [folder, loading, photos.length, total]);

  return (
    <main className="min-h-screen bg-neutral-950 text-neutral-100">
      <header className="sticky top-0 z-30 border-b border-neutral-800 bg-neutral-950/95 px-4 py-3 backdrop-blur">
        <div className="flex flex-wrap items-center gap-3">
          <div className="min-w-0 flex-1">
            <h1 className="text-lg font-semibold">Photo Viewer</h1>
            <p className="truncate text-xs text-neutral-500">{folder || "Choose a folder"}</p>
          </div>

          <div className="text-xs text-neutral-500">{headerCount}</div>

          <select
            value={sort}
            onChange={(event) => setSort(event.target.value as SortKey)}
            className="border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm outline-none focus:border-blue-500"
          >
            <option value="modified">Date</option>
            <option value="name">Name</option>
            <option value="size">Size</option>
          </select>

          <button
            type="button"
            onClick={() => setDirection((current) => (current === "asc" ? "desc" : "asc"))}
            className="border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm hover:border-blue-500"
          >
            {direction === "asc" ? "↑" : "↓"}
          </button>

          <button
            type="button"
            onClick={() => setSelected(new Set(photos.map((photo) => photo.path)))}
            disabled={photos.length === 0}
            className="border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm hover:border-blue-500 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Select loaded
          </button>

          <button
            type="button"
            onClick={() => setSelected(new Set())}
            disabled={selectedCount === 0}
            className="border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm hover:border-blue-500 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Clear
          </button>

          <button
            type="button"
            onClick={deleteSelected}
            disabled={selectedCount === 0 || deleting}
            className="bg-red-600 px-3 py-2 text-sm font-medium text-white hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {deleting ? "Deleting…" : `Delete${selectedCount ? ` (${selectedCount})` : ""}`}
          </button>

          <button
            type="button"
            onClick={() => setFolderDialogOpen(true)}
            className="border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm hover:border-blue-500"
          >
            Folder
          </button>
        </div>
      </header>

      {photoError && <div className="m-4 border border-red-900 bg-red-950/40 p-3 text-sm text-red-300">{photoError}</div>}

      {!folder && <div className="flex h-80 items-center justify-center text-sm text-neutral-500">Choose a photo folder to start.</div>}

      {folder && photos.length > 0 && (
        <section className="grid grid-cols-1 gap-3 p-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">
          {photos.map((photo) => {
            const isSelected = selected.has(photo.path);
            return (
              <article
                key={photo.path}
                onClick={() => toggleSelected(photo.path)}
                className={`cursor-pointer overflow-hidden border bg-neutral-800 ${isSelected ? "border-blue-400" : "border-neutral-700"}`}
              >
                <div className="relative aspect-square bg-black">
                  <div className="absolute inset-0 flex items-center justify-center">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={imageUrl("thumb", photo.path, `${photo.modified}-${photo.size}-2`)}
                      alt={photo.name}
                      loading="lazy"
                      className="max-h-full max-w-full object-contain"
                      onError={(event) => { event.currentTarget.style.opacity = "0.25"; }}
                    />
                  </div>

                  <button
                    type="button"
                    onClick={(event) => { event.stopPropagation(); setViewer(photo); }}
                    className="absolute right-2 top-2 bg-black/60 px-3 py-1 text-xs text-white opacity-80 hover:opacity-100"
                  >
                    View
                  </button>
                </div>

                <div className={`space-y-1 p-3 ${isSelected ? "bg-blue-600 text-white" : "bg-neutral-800"}`}>
                  <p className="truncate text-sm font-medium text-neutral-100" title={photo.name}>{photo.name}</p>
                  <p className={`flex justify-between gap-3 text-xs ${isSelected ? "text-blue-50" : "text-neutral-400"}`}>
                    <span>{new Date(photo.modified).toLocaleDateString()}</span>
                    <span>{formatBytes(photo.size)}</span>
                  </p>
                </div>
              </article>
            );
          })}
        </section>
      )}

      {folder && !loading && photos.length === 0 && !photoError && (
        <div className="flex h-80 items-center justify-center text-sm text-neutral-500">No supported images found.</div>
      )}

      {folder && (
        <div ref={sentinelRef} className="flex justify-center px-4 py-8">
          {loading ? (
            <span className="text-xs text-neutral-500">Loading…</span>
          ) : photos.length > 0 && !hasMore ? (
            <span className="text-xs text-neutral-600">All loaded</span>
          ) : null}
        </div>
      )}

      {folderDialogOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4">
          <div className="w-full max-w-xl border border-neutral-800 bg-neutral-950 p-5 shadow-2xl">
            <h2 className="text-lg font-semibold">Photo folder</h2>
            <p className="mt-1 text-sm text-neutral-400">Enter an absolute folder path on this machine. Deleted photos move to <code>.photo-trash</code> inside that folder.</p>

            <input
              autoFocus
              value={folderInput}
              onChange={(event) => setFolderInput(event.target.value)}
              onKeyDown={(event) => { if (event.key === "Enter") void saveFolder(); }}
              placeholder="/home/you/Pictures"
              className="mt-4 w-full border border-neutral-700 bg-black px-3 py-2 text-sm outline-none focus:border-blue-500"
            />

            {folderError && <p className="mt-2 text-sm text-red-400">{folderError}</p>}

            <div className="mt-5 flex justify-end gap-2">
              {folder && (
                <button type="button" onClick={() => setFolderDialogOpen(false)} className="border border-neutral-700 px-3 py-2 text-sm hover:bg-neutral-900">
                  Cancel
                </button>
              )}
              <button type="button" onClick={saveFolder} disabled={savingFolder} className="bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-50">
                {savingFolder ? "Saving…" : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}

      {viewer && (
        <div className="fixed inset-0 z-50 flex flex-col bg-black/95 p-3" onClick={() => setViewer(null)}>
          <div className="mb-3 flex items-center gap-3 text-sm">
            <div className="min-w-0 flex-1 truncate text-neutral-300">{viewer.name}</div>
            <button type="button" onClick={() => setViewer(null)} className="border border-neutral-700 px-3 py-2 text-white hover:bg-neutral-900">
              Close
            </button>
          </div>
          <div className="flex min-h-0 flex-1 items-center justify-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={imageUrl("image", viewer.path)} alt={viewer.name} className="max-h-full max-w-full object-contain" onClick={(event) => event.stopPropagation()} />
          </div>
        </div>
      )}
    </main>
  );
}
