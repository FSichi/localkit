// Estado general de la app: ajustes, equipo, navegación y avisos.
import { MODELO_BASE, MODELO_MAXIMO, modeloPorId } from '../../../shared/modelos.ts';
import type { Ajustes, Perfil } from '../../../shared/tipos.ts';
import { crearTienda } from './tienda.ts';

export type Ruta =
  | { pagina: 'transcribir' }
  | { pagina: 'grabar' }
  | { pagina: 'biblioteca' }
  | { pagina: 'ajustes' }
  | { pagina: 'detalle'; id: string };

export interface EstadoApp {
  listo: boolean;
  ajustes: Ajustes;
  perfil: Perfil;
  /** La placa de video soporta la calidad Máxima. */
  gpuMaxima: boolean;
  nombreGpu: string;
  datos: string;
  version: string;
  ruta: Ruta;
  /** Sube cuando cambia la biblioteca, para que las vistas vuelvan a leerla. */
  versionBiblioteca: number;
}

export const app = crearTienda<EstadoApp>({
  listo: false,
  ajustes: {
    tema: 'oscuro',
    idioma: 'es',
    modelo: '',
    fuente: 'ambos',
    micId: 'default',
    transcribirAlTerminar: true,
    carpetaGrabaciones: '',
    buscarActualizaciones: true,
    versionVista: '',
    pospuesta: null,
  },
  perfil: 'cpu',
  gpuMaxima: false,
  nombreGpu: '',
  datos: '',
  version: '',
  ruta: { pagina: 'transcribir' },
  versionBiblioteca: 0,
});

export const ir = (ruta: Ruta) => app.poner({ ruta });
export const bibliotecaCambio = () => app.poner({ versionBiblioteca: app.leer().versionBiblioteca + 1 });

export function aplicarTema(tema: Ajustes['tema']) {
  const oscuro = tema === 'sistema' ? matchMedia('(prefers-color-scheme: dark)').matches : tema === 'oscuro';
  document.documentElement.dataset.tema = oscuro ? 'oscuro' : 'claro';
}

export async function guardarAjustes(cambios: Partial<Ajustes>) {
  const ajustes = await window.api.guardarAjustes(cambios);
  app.poner({ ajustes });
  if (cambios.tema) aplicarTema(cambios.tema);
}

async function detectarEquipo() {
  try {
    const adaptador = await navigator.gpu?.requestAdapter({ powerPreference: 'high-performance' });
    if (!adaptador) return { perfil: 'cpu' as const, gpuMaxima: false, nombreGpu: '' };
    const info = adaptador.info;
    return {
      perfil: 'gpu' as const,
      gpuMaxima: adaptador.features.has('shader-f16'),
      nombreGpu: info?.description || info?.vendor || '',
    };
  } catch {
    return { perfil: 'cpu' as const, gpuMaxima: false, nombreGpu: '' };
  }
}

/** La calidad a usar: la elegida, o la mejor que soporte el equipo. */
export function modeloActual(): string {
  const { ajustes, gpuMaxima } = app.leer();
  const propuesto = ajustes.modelo || (gpuMaxima ? MODELO_MAXIMO : MODELO_BASE);
  return modeloPorId(propuesto).soloGpu && !gpuMaxima ? MODELO_BASE : propuesto;
}

export async function iniciarApp() {
  const [{ ajustes, datos, version }, equipo] = await Promise.all([window.api.inicio(), detectarEquipo()]);
  app.poner({ ajustes, datos, version, ...equipo, listo: true });
  aplicarTema(ajustes.tema);
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => aplicarTema(app.leer().ajustes.tema));
}

// ---------- Avisos ----------
export interface Aviso {
  id: number;
  texto: string;
  tipo: 'info' | 'error';
  accion?: { texto: string; hacer: () => void };
}

export const avisos = crearTienda<{ lista: Aviso[] }>({ lista: [] });
let siguiente = 1;

export function avisar(texto: string, opciones: Partial<Pick<Aviso, 'tipo' | 'accion'>> = {}) {
  const id = siguiente++;
  avisos.poner({ lista: [...avisos.leer().lista, { id, texto, tipo: 'info', ...opciones }] });
  setTimeout(() => avisos.poner({ lista: avisos.leer().lista.filter((a) => a.id !== id) }), opciones.accion ? 7000 : 3200);
}
