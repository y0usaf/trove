export const thumbnailCache = new Map<string, Buffer>();
export const pendingThumbnails = new Map<string, Promise<Buffer | null>>();
