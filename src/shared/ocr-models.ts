// Text recognition engines: PP-OCRv6, whose detector and recognizer live in separate repositories.
import type { DownloadableModel } from './models.ts';
import { WHISPER_MODELS } from './whisper-models.ts';

export type OcrTier = 'fast' | 'balanced' | 'accurate';

export interface OcrModel extends DownloadableModel {
  tier: OcrTier;
  /** The name the OCR library knows this model by. */
  preset: string;
}

const REPOSITORY_FILES: Record<string, { part: string; file: string }> = {
  'det.onnx': { part: 'det', file: 'inference.onnx' },
  'rec.onnx': { part: 'rec', file: 'inference.onnx' },
  'rec.yml': { part: 'rec', file: 'inference.yml' },
};

function ocrModel(size: string, tier: OcrTier, bytes: number): OcrModel {
  const files = Object.keys(REPOSITORY_FILES);
  return {
    id: `PaddlePaddle/PP-OCRv6_${size}`,
    tier,
    preset: `PP-OCRv6_${size}`,
    bytes: { gpu: bytes, cpu: bytes },
    files: { gpu: files, cpu: files },
    sourceUrl(name) {
      const { part, file } = REPOSITORY_FILES[name];
      return `https://huggingface.co/PaddlePaddle/PP-OCRv6_${size}_${part}_onnx/resolve/main/${file}`;
    },
  };
}

export const OCR_MODELS: OcrModel[] = [ocrModel('tiny', 'fast', 6.4e6), ocrModel('small', 'balanced', 31e6), ocrModel('medium', 'accurate', 139e6)];

export const DEFAULT_OCR_MODEL_ID = OCR_MODELS[1].id;

export function findOcrModel(id: string): OcrModel {
  return OCR_MODELS.find((model) => model.id === id) ?? OCR_MODELS[1];
}

export function findDownloadableModel(id: string): DownloadableModel | undefined {
  return [...WHISPER_MODELS, ...OCR_MODELS].find((model) => model.id === id);
}
