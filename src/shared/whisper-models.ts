// Transcription qualities. Files come from the ONNX repositories on Hugging Face.
import type { ComputeProfile } from './transcription.ts';

export type ModelTier = 'fast' | 'balanced' | 'accurate' | 'maximum';

export interface WhisperModel {
  id: string;
  tier: ModelTier;
  gpuOnly: boolean;
  /** Approximate download size per profile. */
  bytes: Record<ComputeProfile, number>;
  files: Record<ComputeProfile, string[]>;
  dtype: Record<ComputeProfile, Record<string, string>>;
}

const CONFIG_FILES = ['config.json', 'generation_config.json', 'preprocessor_config.json', 'tokenizer_config.json', 'tokenizer.json'];

function standardModel(id: string, tier: ModelTier, gpuBytes: number, cpuBytes: number): WhisperModel {
  return {
    id,
    tier,
    gpuOnly: false,
    bytes: { gpu: gpuBytes, cpu: cpuBytes },
    files: {
      gpu: [...CONFIG_FILES, 'onnx/encoder_model.onnx', 'onnx/decoder_model_merged_q4.onnx'],
      cpu: [...CONFIG_FILES, 'onnx/encoder_model.onnx', 'onnx/decoder_model_merged_quantized.onnx'],
    },
    dtype: {
      gpu: { encoder_model: 'fp32', decoder_model_merged: 'q4' },
      cpu: { encoder_model: 'fp32', decoder_model_merged: 'q8' },
    },
  };
}

export const WHISPER_MODELS: WhisperModel[] = [
  standardModel('onnx-community/whisper-tiny', 'fast', 122e6, 66e6),
  standardModel('onnx-community/whisper-base', 'balanced', 209e6, 139e6),
  standardModel('onnx-community/whisper-small', 'accurate', 589e6, 513e6),
  {
    id: 'onnx-community/whisper-large-v3-turbo',
    tier: 'maximum',
    gpuOnly: true,
    bytes: { gpu: 1.47e9, cpu: 1.47e9 },
    files: {
      gpu: [...CONFIG_FILES, 'onnx/encoder_model_fp16.onnx', 'onnx/decoder_model_merged_q4f16.onnx'],
      cpu: [],
    },
    dtype: {
      gpu: { encoder_model: 'fp16', decoder_model_merged: 'q4f16' },
      cpu: {},
    },
  },
];

export const MAXIMUM_MODEL_ID = 'onnx-community/whisper-large-v3-turbo';
export const DEFAULT_MODEL_ID = 'onnx-community/whisper-base';

export function findModel(id: string): WhisperModel {
  return WHISPER_MODELS.find((model) => model.id === id) ?? WHISPER_MODELS[1];
}

export const LANGUAGE_CODES = ['auto', 'es', 'en', 'pt', 'fr', 'it', 'de'] as const;
export type LanguageCode = (typeof LANGUAGE_CODES)[number];
