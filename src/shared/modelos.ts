// Calidades de transcripción. Los archivos salen de los repos ONNX de Hugging Face.
import type { Perfil } from './tipos.ts';

export interface Modelo {
  id: string;
  nombre: string;
  descripcion: string;
  soloGpu: boolean;
  /** Bytes aproximados de descarga, por perfil. */
  bytes: Record<Perfil, number>;
  archivos: Record<Perfil, string[]>;
  dtype: Record<Perfil, Record<string, string>>;
}

const CONFIG = [
  'config.json',
  'generation_config.json',
  'preprocessor_config.json',
  'tokenizer_config.json',
  'tokenizer.json',
];

function estandar(id: string, nombre: string, descripcion: string, gpu: number, cpu: number): Modelo {
  return {
    id,
    nombre,
    descripcion,
    soloGpu: false,
    bytes: { gpu, cpu },
    archivos: {
      gpu: [...CONFIG, 'onnx/encoder_model.onnx', 'onnx/decoder_model_merged_q4.onnx'],
      cpu: [...CONFIG, 'onnx/encoder_model.onnx', 'onnx/decoder_model_merged_quantized.onnx'],
    },
    dtype: {
      gpu: { encoder_model: 'fp32', decoder_model_merged: 'q4' },
      cpu: { encoder_model: 'fp32', decoder_model_merged: 'q8' },
    },
  };
}

export const MODELOS: Modelo[] = [
  estandar('onnx-community/whisper-tiny', 'Rápida', 'Para probar o audios simples', 122e6, 66e6),
  estandar('onnx-community/whisper-base', 'Equilibrada', 'Buena en PCs sin placa de video', 209e6, 139e6),
  estandar('onnx-community/whisper-small', 'Precisa', 'Mejor con ruido y acentos', 589e6, 513e6),
  {
    id: 'onnx-community/whisper-large-v3-turbo',
    nombre: 'Máxima',
    descripcion: 'La mejor. Rápida con placa de video',
    soloGpu: true,
    bytes: { gpu: 1.47e9, cpu: 1.47e9 },
    archivos: {
      gpu: [...CONFIG, 'onnx/encoder_model_fp16.onnx', 'onnx/decoder_model_merged_q4f16.onnx'],
      cpu: [],
    },
    dtype: {
      gpu: { encoder_model: 'fp16', decoder_model_merged: 'q4f16' },
      cpu: {},
    },
  },
];

export const MODELO_MAXIMO = 'onnx-community/whisper-large-v3-turbo';
export const MODELO_BASE = 'onnx-community/whisper-base';

export function modeloPorId(id: string): Modelo {
  return MODELOS.find((m) => m.id === id) ?? MODELOS[1];
}

export const IDIOMAS: { id: string; nombre: string }[] = [
  { id: 'auto', nombre: 'Detectar automáticamente' },
  { id: 'es', nombre: 'Español' },
  { id: 'en', nombre: 'Inglés' },
  { id: 'pt', nombre: 'Portugués' },
  { id: 'fr', nombre: 'Francés' },
  { id: 'it', nombre: 'Italiano' },
  { id: 'de', nombre: 'Alemán' },
];
