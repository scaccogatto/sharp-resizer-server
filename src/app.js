import express from 'express'
import { readdir } from 'node:fs/promises'
import path from 'node:path'
import { buildSrcset, isValidFolder } from './srcset.js'
import { createCache } from './cache.js'

/**
 * Recursively lists all files under dir.
 * @param {string} dir
 * @returns {Promise<string[]>} Absolute paths
 */
async function readFilesRecursive(dir) {
  let results = []
  let entries
  try {
    entries = await readdir(dir, { withFileTypes: true })
  } catch {
    return []
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      results = results.concat(await readFilesRecursive(full))
    } else if (entry.isFile()) {
      results.push(full)
    }
  }
  return results
}

/**
 * Creates the Express application with the /json API and static file serving.
 * Does NOT call app.listen() — that is the caller's responsibility so tests
 * can import the app without binding a port.
 *
 * @param {{
 *   outDir: string,        - Filesystem path to the output directory
 *   outDirName: string,    - Directory name used in URLs (e.g. 'output')
 *   entryPoint: string,    - URL prefix (e.g. 'images')
 * }} opts
 * @returns {{ app: import('express').Application, cache: ReturnType<typeof createCache> }}
 */
export function createApp({ outDir, outDirName, entryPoint }) {
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
        return res.status(304).end()
      }
      return res.json(cached.data)
    }

    const absFiles = await readFilesRecursive(outDir)
    const relFiles = absFiles
      .map(f => path.relative(outDir, f))
      .filter(f => isValidFolder(path.dirname(f)))

    const data = buildSrcset(relFiles, outDirName, entryPoint)
    const etag = `"${Date.now()}"`
    cache.set(data, etag)

    res.setHeader('ETag', etag)
    res.setHeader('Cache-Control', 'no-cache')
    res.json(data)
  })

  // Fix: original was missing leading slash — `app.use(\`${e}/${o}\`, ...)` resolved
  // to a path without a leading /, which doesn't match URL requests.
  // Resized output is content-addressed by path (size folder + filename), so
  // clients can cache it hard; a re-render with the same name is the same image.
  app.use(`/${entryPoint}/${outDirName}`, express.static(outDir, {
    immutable: true,
    maxAge: '365d',
  }))

  return { app, cache }
}
