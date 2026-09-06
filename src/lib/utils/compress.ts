'use client'

/**
 * Client-side image preparation for an uploaded work.
 *
 * One decode, one working canvas, and everything the upload needs comes off it:
 * the stored JPEG, an inline preview, a thumbnail small enough to sit in the
 * trajectory chart, and the pixel metrics. Doing this in the browser keeps the
 * bytes leaving a phone on a classroom connection under half a megabyte and
 * keeps the measurement off the server entirely.
 */

import { IMAGE_MAX_EDGE, IMAGE_TARGET_BYTES, THUMB_MAX_EDGE } from '@/lib/constants'
import { measureImage } from '@/lib/metrics/image-metrics'
import type { ImageMetrics } from '@/lib/types'

export interface CompressResult {
  /** The bytes to upload. Always JPEG. */
  blob: Blob
  /** The same bytes inline, for an optimistic preview before storage answers. */
  dataUrl: string
  /** A THUMB_MAX_EDGE preview, small enough to store on the row itself. */
  thumbDataUrl: string
  metrics: ImageMetrics
  /** Dimensions of the compressed image, which is the image the metrics describe. */
  width: number
  height: number
  originalBytes: number
  bytes: number
}

/** MIME types the upload control accepts. Feed this straight to an accept attribute. */
export const ACCEPTED_IMAGE_TYPES: string[] = ['image/jpeg', 'image/png', 'image/webp']

/** Bounds of the JPEG quality search. */
const QUALITY_START = 0.86
const QUALITY_STEP = 0.08
const QUALITY_FLOOR = 0.42

/** 0.86, 0.78, 0.70, 0.62, 0.54, 0.46, 0.42. Seven encodes at most, then we stop. */
const QUALITY_LADDER: number[] = buildQualityLadder()

function buildQualityLadder(): number[] {
  const ladder: number[] = []
  for (let q = QUALITY_START; q > QUALITY_FLOOR; q -= QUALITY_STEP) {
    // Round away the accumulated float drift so the ladder is the one documented.
    ladder.push(Math.round(q * 100) / 100)
  }
  ladder.push(QUALITY_FLOOR)
  return ladder
}

/** Thumbnail quality. Low enough to inline, high enough to read a drawing at 224px. */
const THUMB_QUALITY = 0.7

/**
 * The one retry halves the long edge, but never below the edge the metrics run
 * at. Storing less than we measure would be a strange thing to have done.
 */
const MIN_RETRY_EDGE = 512

/** Filename extensions we can name a type for, used when the picker gives us none. */
const EXTENSION_TYPES: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  jpe: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  heic: 'image/heic',
  heif: 'image/heif',
  avif: 'image/avif',
  gif: 'image/gif',
  bmp: 'image/bmp',
  tif: 'image/tiff',
  tiff: 'image/tiff',
  pdf: 'application/pdf',
}

/**
 * A failure the person at the keyboard can act on. `hint` carries the second
 * sentence so a caller can render it the way ActionResult hints are rendered.
 */
export class ImageCompressionError extends Error {
  readonly hint?: string

  constructor(message: string, hint?: string) {
    super(message)
    this.name = 'ImageCompressionError'
    this.hint = hint
  }
}

/** True when the browser can decode this file and we are willing to store it. */
export function isSupportedImage(file: File): boolean {
  return ACCEPTED_IMAGE_TYPES.includes(resolveType(file))
}

/**
 * Decode, orient, downscale, measure and encode an uploaded photograph.
 * Throws ImageCompressionError with a message meant to be shown as written.
 */
export async function compressImage(
  file: File,
  opts?: { maxEdge?: number; targetBytes?: number },
): Promise<CompressResult> {
  assertUsable(file)

  const maxEdge = Math.max(64, Math.round(opts?.maxEdge ?? IMAGE_MAX_EDGE))
  const targetBytes = Math.max(20_000, Math.round(opts?.targetBytes ?? IMAGE_TARGET_BYTES))

  const decoded = await decode(file)
  try {
    let rendered = render(decoded.source, decoded.width, decoded.height, maxEdge)
    let attempt = await encodeUnderTarget(rendered.canvas, targetBytes)

    // One retry, and only one. Halving the edge cuts pixel count fourfold,
    // which clears the target for the photographs that quality alone cannot.
    if (!attempt.met) {
      const halved = Math.max(MIN_RETRY_EDGE, Math.round(rendered.longEdge / 2))
      if (halved < rendered.longEdge) {
        const smaller = render(decoded.source, decoded.width, decoded.height, halved)
        const retry = await encodeUnderTarget(smaller.canvas, targetBytes)
        if (retry.blob.size < attempt.blob.size) {
          rendered = smaller
          attempt = retry
        }
      }
    }

    // Measure the canvas we are actually storing, so the numbers describe the
    // image an instructor will open rather than one that no longer exists.
    const metrics = await measureImage(rendered.canvas)
    const thumb = render(rendered.canvas, rendered.width, rendered.height, THUMB_MAX_EDGE)
    const [dataUrl, thumbDataUrl] = await Promise.all([
      blobToDataUrl(attempt.blob),
      encode(thumb.canvas, THUMB_QUALITY).then(blobToDataUrl),
    ])

    return {
      blob: attempt.blob,
      dataUrl,
      thumbDataUrl,
      metrics,
      width: rendered.width,
      height: rendered.height,
      originalBytes: file.size,
      bytes: attempt.blob.size,
    }
  } finally {
    decoded.release()
  }
}

/* ------------------------------------------------------------------ *
 * Validation
 * ------------------------------------------------------------------ */

function assertUsable(file: File): void {
  if (file.size === 0) {
    throw new ImageCompressionError(
      'That file is empty.',
      'Pick the photo again, or take a fresh one.',
    )
  }

  const type = resolveType(file)
  if (ACCEPTED_IMAGE_TYPES.includes(type)) return

  if (type === 'image/heic' || type === 'image/heif') {
    throw new ImageCompressionError(
      'That looks like a HEIC file. Export it as JPEG or PNG from the share sheet on your phone and try again.',
      'On iPhone, Settings, Camera, Formats, Most Compatible saves new photos as JPEG.',
    )
  }
  if (type === 'application/pdf') {
    throw new ImageCompressionError(
      'That is a PDF, not a photograph.',
      'Photograph the work itself, or export the page as a JPEG.',
    )
  }
  throw new ImageCompressionError(
    'That file is not an image this app can read.',
    'Upload the work as a JPEG, PNG or WebP.',
  )
}

/** The declared MIME type, or one inferred from the extension when the picker gives none. */
function resolveType(file: File): string {
  const declared = file.type.trim().toLowerCase()
  if (declared) return declared
  const dot = file.name.lastIndexOf('.')
  if (dot < 0) return ''
  return EXTENSION_TYPES[file.name.slice(dot + 1).toLowerCase()] ?? ''
}

/* ------------------------------------------------------------------ *
 * Decoding
 * ------------------------------------------------------------------ */

interface Decoded {
  source: CanvasImageSource
  width: number
  height: number
  release(): void
}

/**
 * Decode the file with its EXIF orientation applied, so a photograph taken in
 * portrait is not analysed and stored on its side.
 */
async function decode(file: File): Promise<Decoded> {
  if (typeof createImageBitmap === 'function') {
    try {
      const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
      return {
        source: bitmap,
        width: bitmap.width,
        height: bitmap.height,
        release: () => bitmap.close(),
      }
    } catch {
      // Older Safari rejects the imageOrientation option outright. Fall through
      // to the img element, which applies EXIF orientation by default.
    }
  }
  return decodeViaElement(file)
}

async function decodeViaElement(file: File): Promise<Decoded> {
  if (typeof document === 'undefined' || typeof URL.createObjectURL !== 'function') {
    throw new ImageCompressionError(
      'Images can only be prepared in the browser.',
      'Call compressImage from a client component.',
    )
  }
  const url = URL.createObjectURL(file)
  const img = new Image()
  img.src = url
  try {
    await img.decode()
  } catch {
    URL.revokeObjectURL(url)
    throw new ImageCompressionError(
      'That image could not be opened. The file may be damaged or in a format this browser does not read.',
      'Export it again as JPEG or PNG, or take a fresh photo.',
    )
  }
  return {
    source: img,
    width: img.naturalWidth || img.width,
    height: img.naturalHeight || img.height,
    release: () => URL.revokeObjectURL(url),
  }
}

/* ------------------------------------------------------------------ *
 * Drawing and encoding
 * ------------------------------------------------------------------ */

type WorkCanvas = HTMLCanvasElement | OffscreenCanvas

interface Rendered {
  canvas: WorkCanvas
  width: number
  height: number
  longEdge: number
}

/**
 * The slice of the 2D context this module uses, declared structurally so the
 * document canvas and the offscreen canvas share one code path.
 */
interface Context2D {
  fillStyle: string | CanvasGradient | CanvasPattern
  imageSmoothingEnabled: boolean
  imageSmoothingQuality: ImageSmoothingQuality
  fillRect(x: number, y: number, w: number, h: number): void
  drawImage(image: CanvasImageSource, dx: number, dy: number, dw: number, dh: number): void
}

/** Draw a source down to fit `maxEdge`, on white so transparency reads as paper. */
function render(
  source: CanvasImageSource,
  sourceWidth: number,
  sourceHeight: number,
  maxEdge: number,
): Rendered {
  if (sourceWidth < 1 || sourceHeight < 1) {
    throw new ImageCompressionError(
      'That image has no pixels in it.',
      'Try a different file, or take a fresh photo.',
    )
  }
  const scale = Math.min(1, maxEdge / Math.max(sourceWidth, sourceHeight))
  const width = Math.max(1, Math.round(sourceWidth * scale))
  const height = Math.max(1, Math.round(sourceHeight * scale))

  const canvas = createCanvas(width, height)
  const ctx = context2d(canvas)
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, width, height)
  ctx.drawImage(source, 0, 0, width, height)

  return { canvas, width, height, longEdge: Math.max(width, height) }
}

interface Attempt {
  blob: Blob
  quality: number
  /** False when even the quality floor could not reach the byte target. */
  met: boolean
}

/**
 * Step the JPEG quality down until the blob fits, and stop at the floor. Every
 * encode is kept only if it is the smallest so far, so a failed search still
 * returns the best result it produced rather than the last one.
 */
async function encodeUnderTarget(canvas: WorkCanvas, targetBytes: number): Promise<Attempt> {
  let best: Blob | null = null
  let bestQuality = QUALITY_START

  for (const quality of QUALITY_LADDER) {
    const blob = await encode(canvas, quality)
    if (blob.size <= targetBytes) return { blob, quality, met: true }
    if (!best || blob.size < best.size) {
      best = blob
      bestQuality = quality
    }
  }

  if (!best) {
    throw new ImageCompressionError(
      'That image could not be compressed in this browser.',
      'Try a different browser, or upload a smaller photo.',
    )
  }
  return { blob: best, quality: bestQuality, met: false }
}

function encode(canvas: WorkCanvas, quality: number): Promise<Blob> {
  if (isOffscreen(canvas)) {
    return canvas.convertToBlob({ type: 'image/jpeg', quality })
  }
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob)
        else {
          reject(
            new ImageCompressionError(
              'That image could not be encoded in this browser.',
              'Try a different browser, or upload a smaller photo.',
            ),
          )
        }
      },
      'image/jpeg',
      quality,
    )
  })
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      if (typeof reader.result === 'string') resolve(reader.result)
      else reject(new ImageCompressionError('The compressed image could not be read back.'))
    }
    reader.onerror = () => {
      reject(
        new ImageCompressionError(
          'The compressed image could not be read back.',
          'Try the upload again.',
        ),
      )
    }
    reader.readAsDataURL(blob)
  })
}

function createCanvas(width: number, height: number): WorkCanvas {
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(width, height)
  if (typeof document === 'undefined') {
    throw new ImageCompressionError(
      'Images can only be prepared in the browser.',
      'Call compressImage from a client component.',
    )
  }
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  return canvas
}

function context2d(canvas: WorkCanvas): Context2D {
  const ctx: Context2D | null = isOffscreen(canvas)
    ? canvas.getContext('2d', { alpha: false })
    : canvas.getContext('2d', { alpha: false })
  if (!ctx) {
    throw new ImageCompressionError(
      'This browser refused a 2D canvas, so the image cannot be prepared.',
      'Try a different browser.',
    )
  }
  return ctx
}

function isOffscreen(canvas: WorkCanvas): canvas is OffscreenCanvas {
  return typeof OffscreenCanvas !== 'undefined' && canvas instanceof OffscreenCanvas
}
