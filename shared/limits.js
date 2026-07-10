// Upload/data size limits shared by client (pre-flight UX) and server (multer
// hard limit). Keep both sides reading the SAME constant so the client never
// promises a size the server rejects (review FE-02).
export const MAX_UPLOAD_BYTES = 20 * 1024 * 1024
export const MAX_UPLOAD_MB = Math.floor(MAX_UPLOAD_BYTES / (1024 * 1024))
// Client-rasterized diagram PNGs (review B1) — server rejects anything larger.
export const MAX_DIAGRAM_PNG_BYTES = 2 * 1024 * 1024
