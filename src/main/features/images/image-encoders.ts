// One encoder per output format. Adding a format means adding an entry here.
import type { Sharp } from 'sharp';
import type { ImageOptions } from '../../../shared/jobs.ts';

export type OutputFormat = 'jpeg' | 'png' | 'webp' | 'avif' | 'gif' | 'tiff';

interface ImageEncoder {
  extension: string;
  encode(image: Sharp, options: ImageOptions): Sharp;
}

// AVIF's scale goes further: its 60 looks like a JPEG 80.
const AVIF_QUALITY_RATIO = 0.75;
const JPEG_BEST_QUALITY = 95;

export const IMAGE_ENCODERS: Record<OutputFormat, ImageEncoder> = {
  jpeg: {
    extension: 'jpg',
    encode: (image, { quality, lossless }) =>
      image.flatten({ background: '#ffffff' }).jpeg({ quality: lossless ? JPEG_BEST_QUALITY : quality, mozjpeg: true }),
  },
  png: {
    extension: 'png',
    encode: (image, { quality, lossless }) =>
      lossless
        ? image.png({ compressionLevel: 9, effort: 10 })
        : image.png({ palette: true, quality, compressionLevel: 9, effort: 10 }),
  },
  webp: {
    extension: 'webp',
    encode: (image, { quality, lossless }) => image.webp({ quality, lossless, effort: 6, smartSubsample: true }),
  },
  avif: {
    extension: 'avif',
    encode: (image, { quality, lossless }) => image.avif({ quality: Math.round(quality * AVIF_QUALITY_RATIO), lossless, effort: 5 }),
  },
  gif: {
    extension: 'gif',
    encode: (image) => image.gif({ effort: 10 }),
  },
  tiff: {
    extension: 'tif',
    encode: (image) => image.tiff({ compression: 'lzw' }),
  },
};
