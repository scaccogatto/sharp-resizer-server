import sharp from 'sharp'
import { mkdir } from 'node:fs/promises'
import path from 'node:path'

/**
 * Resizes an image to the given pixel width, preserving aspect ratio.
 * Creates the output directory if it does not exist.
 *
 * When `formats` is non-empty, also emits a `<basename>.<format>` sibling next
 * to `outputPath` for each format, via sharp's `.webp()`/`.avif()` at default
 * quality (issue: --formats).
 *
 * Resolves issue #4 (error handling): failures are caught and returned as false
 * rather than crashing the process.
 *
 * @param {string} inputPath        - Absolute or relative path to source image
 * @param {string} outputPath       - Absolute or relative path for resized output
 * @param {number} widthPx          - Target width in pixels
 * @param {('webp'|'avif')[]} [formats] - Extra formats to also emit alongside the original
 * @returns {Promise<boolean>} true on success, false on failure
 */
export async function resizeImage(inputPath, outputPath, widthPx, formats = []) {
  try {
    const width = Math.round(widthPx)
    await mkdir(path.dirname(outputPath), { recursive: true })
    await sharp(inputPath).resize({ width }).toFile(outputPath)

    const { dir, name } = path.parse(outputPath)
    for (const format of formats) {
      await sharp(inputPath)
        .resize({ width })
        [format]()
        .toFile(path.join(dir, `${name}.${format}`))
    }
    return true
  } catch (err) {
    // Surface the error so the caller can log it; do not crash the queue
    console.error(`[SHARP] failed to resize ${inputPath} → ${outputPath}:`, err.message)
    return false
  }
}
