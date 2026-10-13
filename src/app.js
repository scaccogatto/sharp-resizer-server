import express from 'express'
import { readdir, stat } from 'node:fs/promises'
import path from 'node:path'
import { buildSrcset, isValidFolder } from './srcset.js'
import { createCache } from './cache.js'

/** Cache-Control for versioned (`?v=`) output URLs: the bytes behind them never change. */
const IMMUTABLE = 'public, max-age=31536000, immutable'
/** Cache-Control for unversioned output URLs: clients must revalidate (ETag / Last-Modified). */
const REVALIDATE = 'no-cache'

/**
 * Recursively lists all files under dir with their modification time.
 * @param {string} dir
 * @returns {Promise<{file: string, mtimeMs: number}[]>} Absolute paths
 */
async function readFilesRecursive(dir) {
  let entries
  try {
    entries = await readdir(dir, { withFileTypes: true })
  } catch {
    return []
  }
  const nested = await Promise.all(
    entries.map(async entry => {
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) return readFilesRecursive(full)
      if (!entry.isFile()) return []
      try {
        const { mtimeMs } = await stat(full)
        return [{ file: full, mtimeMs }]
      } catch {
        // Removed between readdir and stat
        return []
      }
    }),
  )
  return nested.flat()
}

/**
 * Creates the Express application with the /json API and static file serving.
 * Does NOT call app.listen(): that is the caller's responsibility so tests
 * can import the app without binding a port.
 *
 * @param {{
 *   outDir: string,
 *   outDirName: string,
 *   entryPoint: string,
 *   multiplier: number,
 * }} opts
 *   outDir: filesystem path to the output directory.
 *   outDirName: URL segment the output directory is served under (e.g. 'output').
 *   entryPoint: URL prefix (e.g. 'images').
 *   multiplier: pixel width of folder 100 divided by 100 (e.g. 19.2).
 * @returns {{ app: import('express').Express, cache: ReturnType<typeof createCache> }}
 */
export function createApp({ outDir, outDirName, entryPoint, multiplier }) {
  const app = express()
  const cache = createCache()

  // Resolves issue #8: cache the recursive-readdir result in memory, using
  // ETag + Cache-Control so clients can avoid redownloading unchanged data.
  app.get(`/${entryPoint}/json`, async (req, res) => {
    const cached = cache.get()
    if (cached) {
      res.setHeader('ETag', cached.etag)
      res.setHeader('Cache-Control', 'no-cache')
      if (req.headers['if-none-match'] === cached.etag) {
        res.status(304).end()
        return
      }
      res.json(cached.data)
      return
    }

    const files = (await readFilesRecursive(outDir))
      .map(({ file, mtimeMs }) => ({ rel: path.relative(outDir, file), mtimeMs }))
      .filter(({ rel }) => isValidFolder(path.dirname(rel)))

    // The version token changes whenever a file is re-rendered, so manifest URLs
    // can be cached forever without ever serving stale bytes.
    const versions = new Map(files.map(({ rel, mtimeMs }) => [rel, Math.trunc(mtimeMs).toString(36)]))
    const data = buildSrcset(
      files.map(({ rel }) => rel),
      { outDirName, entryPoint, multiplier, versions },
    )
    const etag = `"${Date.now()}"`
    cache.set(data, etag)

    res.setHeader('ETag', etag)
    res.setHeader('Cache-Control', 'no-cache')
    res.json(data)
  })

  // Output files are rewritten in place when a source changes, so only URLs that
  // carry the manifest's `?v=` token are safe to cache as immutable. Plain URLs
  // are revalidated via the ETag/Last-Modified that express.static sends.
  app.use(
    `/${entryPoint}/${outDirName}`,
    express.static(outDir, {
      cacheControl: false,
      setHeaders: res => {
        const versioned = new URL(res.req.url ?? '/', 'http://localhost').searchParams.has('v')
        res.setHeader('Cache-Control', versioned ? IMMUTABLE : REVALIDATE)
      },
    }),
  )

  return { app, cache }
}
