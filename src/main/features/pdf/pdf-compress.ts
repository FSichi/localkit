// PDF compression: recompresses the embedded images, which is where almost all the weight is.
// Anything that can't be safely recompressed (masks, predictors, CMYK) stays untouched.
import { statSync, writeFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';
import { PDFArray, PDFName, PDFNumber, PDFRawStream, PDFRef, type PDFDict, type PDFDocument } from 'pdf-lib';
import sharp, { type Sharp } from 'sharp';
import { t } from '../../../shared/i18n/index.ts';
import type { CompressionLevel } from '../../../shared/jobs.ts';
import type { JobProcessor } from '../../core/jobs.ts';
import { PendingOutput } from '../../core/output-files.ts';
import { openPdf } from './pdf-document.ts';

const LEVELS: Record<CompressionLevel, { quality: number; maxSide: number }> = {
  high: { quality: 80, maxSide: 2480 }, // ~210 dpi on A4
  medium: { quality: 68, maxSide: 1754 }, // ~150 dpi
  low: { quality: 50, maxSide: 1240 }, // ~105 dpi
};

const PROGRESS_EVERY_OBJECTS = 20;
const JPEG_FILTER = '/DCTDecode';
const DEFLATE_FILTER = '/FlateDecode';

const pdfName = (name: string) => PDFName.of(name);

function singleFilter(dict: PDFDict): string | null {
  const filter = dict.lookup(pdfName('Filter'));
  if (filter instanceof PDFName) return filter.asString();
  if (filter instanceof PDFArray && filter.size() === 1) return (filter.lookup(0) as PDFName).asString();
  return null;
}

function channelCount(dict: PDFDict): number | null {
  const colorSpace = dict.lookup(pdfName('ColorSpace'));
  if (colorSpace === pdfName('DeviceRGB')) return 3;
  if (colorSpace === pdfName('DeviceGray')) return 1;
  if (colorSpace instanceof PDFArray && colorSpace.lookup(0) === pdfName('ICCBased')) {
    const components = (colorSpace.lookup(1) as PDFRawStream | undefined)?.dict.lookup(pdfName('N'));
    if (components instanceof PDFNumber && [1, 3].includes(components.asNumber())) return components.asNumber();
  }
  return null;
}

const readInteger = (dict: PDFDict, key: string) => {
  const value = dict.lookup(pdfName(key));
  return value instanceof PDFNumber ? value.asNumber() : 0;
};

/** Reads an embedded image, if it is in a form that can be recompressed without risk. */
function openEmbeddedImage(stream: PDFRawStream): Sharp | null {
  const { dict } = stream;
  const filter = singleFilter(dict);
  if (filter !== JPEG_FILTER && filter !== DEFLATE_FILTER) return null;
  // Color-key masks, inverted /Decode arrays and predictors would change the colors.
  if (dict.lookup(pdfName('Mask')) instanceof PDFArray || dict.has(pdfName('Decode')) || dict.has(pdfName('DecodeParms'))) return null;
  const channels = channelCount(dict);
  if (!channels) return null;
  if (filter === JPEG_FILTER) return sharp(Buffer.from(stream.getContents()), { failOn: 'none' });

  const width = readInteger(dict, 'Width');
  const height = readInteger(dict, 'Height');
  if (readInteger(dict, 'BitsPerComponent') !== 8 || !width || !height) return null;
  const raw = inflateSync(stream.getContents());
  if (raw.length !== width * height * channels) return null;
  return sharp(raw, { raw: { width, height, channels: channels as 1 | 3 } });
}

/** Transparency masks are black-and-white images that can't become JPEG. */
function collectMaskRefs(document: PDFDocument): Set<string> {
  const masks = new Set<string>();
  for (const [, object] of document.context.enumerateIndirectObjects()) {
    if (!(object instanceof PDFRawStream)) continue;
    for (const key of ['SMask', 'Mask']) {
      const reference = object.dict.get(pdfName(key));
      if (reference instanceof PDFRef) masks.add(reference.toString());
    }
  }
  return masks;
}

async function recompressImage(document: PDFDocument, reference: PDFRef, stream: PDFRawStream, level: CompressionLevel) {
  const image = openEmbeddedImage(stream);
  if (!image) return;
  const { quality, maxSide } = LEVELS[level];
  const { data, info } = await image
    .resize({ width: maxSide, height: maxSide, fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality, mozjpeg: true })
    .toBuffer({ resolveWithObject: true });
  if (data.length >= stream.getContents().length) return;

  const replacement = document.context.stream(data, {
    Type: 'XObject',
    Subtype: 'Image',
    Width: info.width,
    Height: info.height,
    ColorSpace: info.channels === 1 ? 'DeviceGray' : 'DeviceRGB',
    BitsPerComponent: 8,
    Filter: 'DCTDecode',
  });
  const softMask = stream.dict.get(pdfName('SMask'));
  if (softMask) replacement.dict.set(pdfName('SMask'), softMask);
  document.context.assign(reference, replacement);
}

export const compressPdf: JobProcessor<'pdf.compress'> = async ({ path, level }, { outputFolder, reportProgress }) => {
  const bytesBefore = statSync(path).size;
  const document = await openPdf(path);
  const objects = document.context.enumerateIndirectObjects();
  const masks = collectMaskRefs(document);

  for (const [index, [reference, object]] of objects.entries()) {
    if (index % PROGRESS_EVERY_OBJECTS === 0) reportProgress(index / objects.length);
    if (!(object instanceof PDFRawStream) || object.dict.lookup(pdfName('Subtype')) !== pdfName('Image')) continue;
    if (masks.has(reference.toString()) || object.dict.lookup(pdfName('ImageMask'))?.toString() === 'true') continue;
    try {
      await recompressImage(document, reference, object, level);
    } catch (error) {
      // An odd image must not stop the rest: it just stays as it was.
      console.warn('PDF image left uncompressed:', error);
    }
  }

  const bytes = await document.save({ useObjectStreams: true });
  if (bytes.length >= bytesBefore) return { output: null, bytesBefore, bytesAfter: bytesBefore, noGain: true };
  const output = new PendingOutput({ source: path, suffix: t.fileSuffixes.compressed, extension: 'pdf', folder: outputFolder });
  writeFileSync(output.partialPath, bytes);
  return { output: output.commit(), bytesBefore, bytesAfter: bytes.length, reducesSize: true };
};
