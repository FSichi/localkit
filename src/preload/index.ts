// Puente seguro entre la interfaz y el proceso principal.
import { contextBridge, ipcRenderer, webUtils } from 'electron';
import type {
  Ajustes,
  EstadoActualizacion,
  EstadoModelo,
  FormatoExporte,
  Fuente,
  GrabacionIniciada,
  InfoActualizacion,
  Item,
  Perfil,
  PistaPreparada,
  ProgresoDescarga,
  ProgresoPreparacion,
  ResumenItem,
} from '../shared/tipos.ts';

function escuchar<T>(canal: string, fn: (datos: T) => void) {
  const manejador = (_e: unknown, datos: T) => fn(datos);
  ipcRenderer.on(canal, manejador);
  return () => {
    ipcRenderer.removeListener(canal, manejador);
  };
}

const invocar = ipcRenderer.invoke.bind(ipcRenderer);

const api = {
  inicio: (): Promise<{ ajustes: Ajustes; datos: string; version: string }> => invocar('app:inicio'),
  guardarAjustes: (cambios: Partial<Ajustes>): Promise<Ajustes> => invocar('ajustes:guardar', cambios),
  elegirCarpeta: (): Promise<string | null> => invocar('ajustes:elegirCarpeta'),

  buscarActualizacion: (forzar = false): Promise<InfoActualizacion> => invocar('actualizacion:buscar', forzar),
  instalarActualizacion: (): Promise<void> => invocar('actualizacion:instalar'),
  alProgresoActualizacion: (fn: (e: EstadoActualizacion) => void) => escuchar('actualizacion:progreso', fn),
  abrirWeb: (url: string) => invocar('app:abrirWeb', url),

  elegirArchivos: (): Promise<string[]> => invocar('archivos:elegir'),
  rutaDeArchivo: (archivo: File) => webUtils.getPathForFile(archivo),
  mostrarArchivo: (ruta: string) => invocar('archivos:mostrar', ruta),
  abrirCarpeta: (ruta: string) => invocar('archivos:abrirCarpeta', ruta),
  existeArchivo: (ruta: string): Promise<boolean> => invocar('archivos:existe', ruta),

  estadoModelos: (perfil: Perfil): Promise<EstadoModelo[]> => invocar('modelos:estado', perfil),
  descargarModelo: (id: string, perfil: Perfil): Promise<void> => invocar('modelos:descargar', id, perfil),
  cancelarDescarga: (id: string) => invocar('modelos:cancelar', id),
  borrarModelo: (id: string) => invocar('modelos:borrar', id),
  abrirCarpetaModelos: () => invocar('modelos:carpeta'),
  alProgresoDescarga: (fn: (p: ProgresoDescarga) => void) => escuchar('modelos:progreso', fn),

  prepararPistas: (trabajo: string, ruta: string, fuente?: Fuente): Promise<PistaPreparada[]> =>
    invocar('medios:preparar', trabajo, ruta, fuente),
  cancelarMedios: (trabajo: string) => invocar('medios:cancelar', trabajo),
  limpiarTrabajo: (trabajo: string) => invocar('medios:limpiar', trabajo),
  alProgresoPreparacion: (fn: (p: ProgresoPreparacion) => void) => escuchar('medios:progreso', fn),

  listarItems: (busqueda = ''): Promise<ResumenItem[]> => invocar('biblioteca:listar', busqueda),
  obtenerItem: (id: string): Promise<Item> => invocar('biblioteca:obtener', id),
  crearItem: (datos: Omit<Item, 'id'>): Promise<Item> => invocar('biblioteca:crear', datos),
  actualizarItem: (id: string, cambios: Partial<Item>): Promise<Item> => invocar('biblioteca:actualizar', id, cambios),
  eliminarItem: (id: string) => invocar('biblioteca:eliminar', id),
  exportarItem: (id: string, formato: FormatoExporte, conTiempos: boolean): Promise<string | null> =>
    invocar('biblioteca:exportar', id, formato, conTiempos),
  exportarAudio: (id: string): Promise<string | null> => invocar('biblioteca:exportarAudio', id),

  iniciarGrabacion: (fuente: Fuente): Promise<GrabacionIniciada> => invocar('grabacion:iniciar', fuente),
  enviarFragmento: (id: string, datos: Uint8Array) => ipcRenderer.send('grabacion:fragmento', id, datos),
  terminarGrabacion: (id: string, duracion: number): Promise<Item> => invocar('grabacion:terminar', id, duracion),
  descartarGrabacion: (id: string) => invocar('grabacion:descartar', id),
  recuperarGrabaciones: (): Promise<number> => invocar('grabacion:recuperar'),
};

export type Api = typeof api;

contextBridge.exposeInMainWorld('api', api);
