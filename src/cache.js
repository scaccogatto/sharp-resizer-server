/**
 * Minimal in-memory cache for the /json endpoint.
 * Resolves issue #8 (cache reply): stores computed srcset JSON and an ETag;
 * the caller must call invalidate() whenever the output directory changes.
 *
 * @returns {{ get: () => {data: unknown, etag: string} | null, set: (data: unknown, etag: string) => void, invalidate: () => void }}
 */
export function createCache() {
  let entry = null

  return {
    get: () => entry,
    set: (data, etag) => {
      entry = { data, etag }
    },
    invalidate: () => {
      entry = null
    },
  }
}
