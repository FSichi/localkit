// Tipos compartidos entre el proceso principal, el preload y la interfaz.
import type { SeccionNotas } from './changelog.ts';

export type Hablante = 'yo' | 'otros';
export type Fuente = 'ambos' | 'sistema' | 'mic';
export type Tema = 'oscuro' | 'claro' | 'sistema';
export type Perfil = 'gpu' | 'cpu';
export type FormatoExporte = 'txt' | 'srt' | 'md' | 'pdf';

export interface Segmento {
  inicio: number;
  fin: number;
  texto: string;
  hablante?: Hablante;
}

export interface Item {
  id: string;
  titulo: string;
  tipo: 'archivo' | 'grabacion';
  creado: string;
  duracion: number;
  /** Audio para reproducir: el archivo original o el MP3 de la grabación. */
  audio?: string;
  /** Solo grabaciones: pistas originales (izquierda = micrófono, derecha = sistema). */
  pistas?: string;
  carpeta?: string;
  fuente?: Fuente;
  idioma?: string;
  modelo?: string;
  estado: 'pendiente' | 'transcripto';
  segmentos: Segmento[];
}

export type ResumenItem = Omit<Item, 'segmentos'> & { palabras: number; fragmento?: string };

export interface Ajustes {
  tema: Tema;
  idioma: string;
  /** Vacío hasta que se elige: la app propone el mejor según la placa de video. */
  modelo: string;
  fuente: Fuente;
  micId: string;
  transcribirAlTerminar: boolean;
  carpetaGrabaciones: string;
  buscarActualizaciones: boolean;
  /** Última versión con la que se abrió la app: para mostrar las novedades una vez. */
  versionVista: string;
  /** Aviso de versión nueva postergado con "Más tarde". */
  pospuesta: { version: string; hasta: number } | null;
}

export interface EstadoModelo {
  id: string;
  descargado: boolean;
  bytes: number;
}

export interface ProgresoDescarga {
  modelo: string;
  hechos: number;
  total: number;
}

export interface PistaPreparada {
  url: string;
  hablante?: Hablante;
  duracion: number;
}

export interface ProgresoPreparacion {
  trabajo: string;
  fraccion: number;
}

export interface ArchivoPublicado {
  nombre: string;
  url: string;
  tamano: number;
}

export interface VersionPublicada {
  version: string;
  fecha: string | null;
  url: string;
  secciones: SeccionNotas[];
  instalador: ArchivoPublicado | null;
  sha256: ArchivoPublicado | null;
}

export interface InfoActualizacion {
  actual: string;
  ultima: VersionPublicada | null;
  hayNueva: boolean;
  /** Falso al correr desde el código: no se puede autoactualizar. */
  instalada: boolean;
}

export interface EstadoActualizacion {
  fase: 'descargando' | 'verificando' | 'instalando';
  bytes: number;
  total: number;
}

export interface GrabacionIniciada {
  id: string;
  carpeta: string;
}
