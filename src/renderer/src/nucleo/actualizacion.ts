// Versión nueva: consulta al abrir, aviso con novedades y novedades después de actualizar.
import { parseChangelog, type VersionNotas } from '../../../shared/changelog.ts';
import type { EstadoActualizacion, InfoActualizacion } from '../../../shared/tipos.ts';
import cambios from '../../../../CHANGELOG.md?raw';
import { app, guardarAjustes } from './app.ts';
import { crearTienda } from './tienda.ts';

const DIAS_POSPUESTA = 3;

interface EstadoVersion {
  info: InfoActualizacion | null;
  buscando: boolean;
  error: string;
  modal: 'version' | 'novedades' | null;
  novedades: VersionNotas[];
  progreso: EstadoActualizacion | null;
  errorInstalacion: string;
}

export const actualizacion = crearTienda<EstadoVersion>({
  info: null,
  buscando: false,
  error: '',
  modal: null,
  novedades: [],
  progreso: null,
  errorInstalacion: '',
});

export const notasLocales = () => parseChangelog(cambios);

const sinPrefijoIpc = (err: unknown) => String((err as Error).message).replace(/^Error invoking remote method '[^']+': (Error: )?/, '');

export async function comprobarActualizacion(forzar = false) {
  actualizacion.poner({ buscando: true, error: '' });
  try {
    const info = await window.api.buscarActualizacion(forzar);
    actualizacion.poner({ info, buscando: false });
    return info;
  } catch (err) {
    actualizacion.poner({ buscando: false, error: sinPrefijoIpc(err) });
    return null;
  }
}

export function posponerVersion() {
  const { info } = actualizacion.leer();
  if (info?.ultima) guardarAjustes({ pospuesta: { version: info.ultima.version, hasta: Date.now() + DIAS_POSPUESTA * 86400000 } });
  actualizacion.poner({ modal: null });
}

export async function instalarVersion() {
  actualizacion.poner({ errorInstalacion: '', progreso: { fase: 'descargando', bytes: 0, total: actualizacion.leer().info?.ultima?.instalador?.tamano ?? 0 } });
  const soltar = window.api.alProgresoActualizacion((progreso) => actualizacion.poner({ progreso }));
  try {
    await window.api.instalarActualizacion();
  } catch (err) {
    actualizacion.poner({ progreso: null, errorInstalacion: sinPrefijoIpc(err) });
  } finally {
    soltar();
  }
}

/** Al abrir: una vez después de actualizar, las novedades; si hay versión nueva, el aviso. */
export async function iniciarActualizaciones() {
  const { ajustes, version } = app.leer();
  if (ajustes.versionVista !== version) {
    await guardarAjustes({ versionVista: version });
    const nota = notasLocales().find((v) => v.version === version);
    if (ajustes.versionVista && nota) actualizacion.poner({ modal: 'novedades', novedades: [nota] });
  }
  if (!ajustes.buscarActualizaciones) return;
  const info = await comprobarActualizacion();
  if (!info?.hayNueva || !info.ultima) return;
  const { pospuesta } = ajustes;
  if (pospuesta?.version === info.ultima.version && Date.now() < pospuesta.hasta) return;
  if (!actualizacion.leer().modal) actualizacion.poner({ modal: 'version' });
}
