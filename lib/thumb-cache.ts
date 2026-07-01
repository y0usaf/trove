export const thumbnailCache = new Map<string, Buffer>();
export const pendingThumbnails = new Map<string, Promise<Buffer | null>>();

const MAX_THUMBNAIL_JOBS = Math.max(2, Math.min(6, Number(process.env.TROVE_THUMBNAIL_JOBS) || 4));
let activeThumbnailJobs = 0;
const thumbnailQueue: Array<() => void> = [];

export async function runThumbnailJob<T>(work: () => Promise<T>): Promise<T> {
  if (activeThumbnailJobs >= MAX_THUMBNAIL_JOBS) {
    await new Promise<void>((resolve) => thumbnailQueue.push(resolve));
  }

  activeThumbnailJobs += 1;
  try {
    return await work();
  } finally {
    activeThumbnailJobs -= 1;
    thumbnailQueue.shift()?.();
  }
}
