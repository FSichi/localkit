// Optimizes and converts images with sharp (libvips + mozjpeg, libwebp, libaom and imagequant).
import decodeHeic from 'heic-decode';
import { readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import sharp, { type Sharp } from 'sharp';
import type { FileInfo } from '../../../shared/files.ts';
import { extensionOf } from '../../../shared/files.ts';
import { t } from '../../../shared/i18n/index.ts';
import type { ImageOptions } from '../../../shared/jobs.ts';
import type { JobProcessor } from '../../core/jobs.ts';
import { PendingOutput, withPendingOutput } from '../../core/output-files.ts';
import { tempRoot } from '../../core/temp-files.ts';
import { IMAGE_ENCODERS, type OutputFormat } from './image-encoders.ts';

const THUMBNAIL_SIDE = 96;
const THUMBNAIL_BACKDROP = '#2c3036';
const IS_HEIC = /^(heic|heif)$/;
const BROWSER_READABLE = /^(jpe?g|png|webp|avif|gif|svg)$/;
const CAN_BE_ANIMATED = /^(gif|webp)$/;

/** Format for "same as the original". What can't be written becomes the closest one. */
function nativeFormat(path: string): OutputFormat {
  const extension = extensionOf(path);
  if (extension === 'jpg' || extension === 'jpeg' || IS_HEIC.test(extension)) return 'jpeg';
  if (extension === 'webp' || extension === 'avif' || extension === 'gif') return extension;
  if (extension === 'tif' || extension === 'tiff') return 'tiff';
  return 'png';
}

async function openImage(path: string, animated: boolean): Promise<Sharp> {
  if (IS_HEIC.test(extensionOf(path))) {
    const { width, height, data } = await decodeHeic({ buffer: readFileSync(path) });
    return sharp(Buffer.from(data), { raw: { width, height, channels: 4 } });
  }
  return sharp(path, { animated, failOn: 'none', limitInputPixels: false });
}

async function buildPipeline(path: string, options: ImageOptions) {
  const format = options.format === 'same' ? nativeFormat(path) : options.format;
  const animated = CAN_BE_ANIMATED.test(extensionOf(path)) && (format === 'gif' || format === 'webp');
  // rotate() applies the camera orientation before the metadata goes away.
  let image = (await openImage(path, animated)).rotate();
  if (options.maxSide) image = image.resize({ width: options.maxSide, height: options.maxSide, fit: 'inside', withoutEnlargement: true });
  if (!options.stripMetadata) image = image.keepMetadata();
  return { image: IMAGE_ENCODERS[format].encode(image, options), format };
}

export async function estimateImageBytes(path: string, options: ImageOptions): Promise<number> {
  const { image } = await buildPipeline(path, options);
  return (await image.toBuffer()).length;
}

export const processImage: JobProcessor<'image.process'> = async ({ path, options }, { outputFolder }) => {
  const bytesBefore = statSync(path).size;
  const { image, format } = await buildPipeline(path, options);
  const sameFormat = format === nativeFormat(path) && !IS_HEIC.test(extensionOf(path));
  const output = new PendingOutput({ source: path, suffix: sameFormat ? t.fileSuffixes.optimized : '', extension: IMAGE_ENCODERS[format].extension, folder: outputFolder });
  return withPendingOutput(output, async () => {
    const { size } = await image.toFile(output.partialPath);
    // Optimizing an already optimized image can make it bigger: then it isn't saved.
    if (sameFormat && !options.maxSide && size >= bytesBefore) {
      output.discard();
      return { output: null, bytesBefore, bytesAfter: bytesBefore, noGain: true };
    }
    return { output: output.commit(), bytesBefore, bytesAfter: size, reducesSize: true };
  });
};

export async function readImageInfo(path: string): Promise<Partial<FileInfo>> {
  if (IS_HEIC.test(extensionOf(path))) return {};
  const image = sharp(path, { failOn: 'none', limitInputPixels: false });
  const { width, height, autoOrient } = await image.metadata();
  const thumbnail = await image
    .rotate()
    .resize({ width: THUMBNAIL_SIDE, height: THUMBNAIL_SIDE, fit: 'cover' })
    .flatten({ background: THUMBNAIL_BACKDROP })
    .jpeg({ quality: 70 })
    .toBuffer();
  return {
    width: autoOrient?.width ?? width,
    height: autoOrient?.height ?? height,
    thumbnail: `data:image/jpeg;base64,${thumbnail.toString('base64')}`,
  };
}

/** A copy the browser can display, for formats Chromium doesn't open. */
export async function browserReadablePath(path: string): Promise<string> {
  if (BROWSER_READABLE.test(extensionOf(path))) return path;
  const target = join(tempRoot(), `preview-${Date.now()}.jpg`);
  const image = await openImage(path, false);
  writeFileSync(target, await image.rotate().flatten({ background: '#ffffff' }).jpeg({ quality: 90 }).toBuffer());
  return target;
}
