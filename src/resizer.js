import sharp from 'sharp'
import { mkdir } from 'node:fs/promises'
import path from 'node:path'

/**
 * Resizes an image to the given pixel width, preserving aspect ratio.
 * Creates the output directory if it does not exist.
 *
 * Resolves issue #4 (error handling): failures are caught and returned as false
 * rather than crashing the process.
 *
 * @param {string} inputPath  - Absolute or relative path to source image
 * @param {string} outputPath - Absolute or relative path for resized output
 * @param {number} widthPx    - Target width in pixels
 * @returns {Promise<boolean>} true on success, false on failure
 */
export async function resizeImage(inputPath, outputPath, widthPx) {
  try {
    await mkdir(path.dirname(outputPath), { recursive: true })
    await sharp(inputPath)
      .resize({ width: Math.round(widthPx) })
      .toFile(outputPath)
    return true
  } catch (err) {
    // Surface the error so the caller can log it; do not crash the queue
    console.error(`[SHARP] failed to resize ${inputPath} → ${outputPath}:`, err.message)
    return false
  }
}
