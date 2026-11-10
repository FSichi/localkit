// Every model the app can download, so the store and its cleanup know them all.
import type { DownloadableModel } from './models.ts';
import { OCR_MODELS } from './ocr-models.ts';
import { VOICE_MODEL } from './voices.ts';
import { WHISPER_MODELS } from './whisper-models.ts';

export const DOWNLOADABLE_MODELS: DownloadableModel[] = [...WHISPER_MODELS, ...OCR_MODELS, VOICE_MODEL];

export const findDownloadableModel = (id: string) => DOWNLOADABLE_MODELS.find((model) => model.id === id);
