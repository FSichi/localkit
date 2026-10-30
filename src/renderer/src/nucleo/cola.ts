// Cola de transcripciones: de a un trabajo por vez, con progreso y cancelación.
import { modeloPorId } from '../../../shared/modelos.ts';
import { duracionLegible } from '../../../shared/formato.ts';
import type { Fuente, Segmento } from '../../../shared/tipos.ts';
import { app, avisar, bibliotecaCambio, ir, modeloActual } from './app.ts';
import { Cancelado, cargarModelo, detenerMotor, modeloCargado, transcribirPista } from './motor.ts';
import { crearTienda } from './tienda.ts';

export interface Trabajo {
  id: string;
  titulo: string;
  ruta: string;
  fuente?: Fuente;
  itemId?: string;
  etapa: 'espera' | 'preparando' | 'descargando' | 'cargando' | 'transcribiendo';
  fraccion: number | null;
  detalle: string;
  parcial: string;
}

export const cola = crearTienda<{ trabajos: Trabajo[] }>({ trabajos: [] });

let enMarcha = false;
let actual: string | null = null;

function cambiar(id: string, cambios: Partial<Trabajo>) {
  cola.poner({ trabajos: cola.leer().trabajos.map((t) => (t.id === id ? { ...t, ...cambios } : t)) });
}

function quitar(id: string) {
  cola.poner({ trabajos: cola.leer().trabajos.filter((t) => t.id !== id) });
}

const sinExtension = (nombre: string) => nombre.replace(/\.[^.\\/]+$/, '');
const nombreDe = (ruta: string) => ruta.split(/[\\/]/).pop() ?? ruta;

export function agregarArchivos(rutas: string[]) {
  const nuevos: Trabajo[] = rutas.map((ruta) => ({
    id: crypto.randomUUID(),
    titulo: sinExtension(nombreDe(ruta)),
    ruta,
    etapa: 'espera',
    fraccion: null,
    detalle: 'En cola',
    parcial: '',
  }));
  cola.poner({ trabajos: [...cola.leer().trabajos, ...nuevos] });
  procesarCola();
}

export function agregarItem(item: { id: string; titulo: string; pistas?: string; audio?: string; fuente?: Fuente }) {
  const ruta = item.pistas ?? item.audio;
  if (!ruta) return;
  cola.poner({
    trabajos: [
      ...cola.leer().trabajos,
      { id: crypto.randomUUID(), titulo: item.titulo, ruta, fuente: item.pistas ? item.fuente : undefined, itemId: item.id, etapa: 'espera', fraccion: null, detalle: 'En cola', parcial: '' },
    ],
  });
  procesarCola();
}

export function cancelarTrabajo(id: string) {
  if (id !== actual) return quitar(id);
  window.api.cancelarMedios(id);
  window.api.cancelarDescarga(modeloActual());
  detenerMotor();
}

async function asegurarModelo(trabajo: Trabajo, modelo: string) {
  const { perfil } = app.leer();
  if (modeloCargado(modelo)) return;
  const estado = await window.api.estadoModelos(perfil);
  if (!estado.find((m) => m.id === modelo)?.descargado) {
    cambiar(trabajo.id, { etapa: 'descargando', fraccion: 0, detalle: `Descargando calidad ${modeloPorId(modelo).nombre}` });
    const soltar = window.api.alProgresoDescarga((p) => {
      if (p.modelo === modelo) cambiar(trabajo.id, { fraccion: p.hechos / p.total });
    });
    try {
      await window.api.descargarModelo(modelo, perfil);
    } finally {
      soltar();
    }
  }
  cambiar(trabajo.id, { etapa: 'cargando', fraccion: null, detalle: 'Cargando el modelo de IA' });
  await cargarModelo(modelo, perfil, (fraccion) => cambiar(trabajo.id, { fraccion }));
}

async function procesar(trabajo: Trabajo) {
  const { ajustes } = app.leer();
  const modelo = modeloActual();

  cambiar(trabajo.id, { etapa: 'preparando', fraccion: 0, detalle: 'Preparando el audio' });
  const soltar = window.api.alProgresoPreparacion((p) => {
    if (p.trabajo === trabajo.id) cambiar(trabajo.id, { fraccion: p.fraccion });
  });
  let pistas;
  try {
    pistas = await window.api.prepararPistas(trabajo.id, trabajo.ruta, trabajo.fuente);
  } finally {
    soltar();
  }
  const duracion = Math.max(...pistas.map((p) => p.duracion));

  await asegurarModelo(trabajo, modelo);

  const segmentos: Segmento[] = [];
  const total = pistas.reduce((n, p) => n + p.duracion, 0) || 1;
  let previas = 0;
  cambiar(trabajo.id, { etapa: 'transcribiendo', fraccion: 0, detalle: 'Transcribiendo' });
  for (const pista of pistas) {
    const peso = pista.duracion / total;
    const delTrabajo = await transcribirPista(pista.url, ajustes.idioma, pista.hablante, (a) => {
      const fraccion = previas + a.fraccion * peso;
      const resta = a.fraccion ? (a.transcurrido / a.fraccion) * (1 - a.fraccion) : Infinity;
      cambiar(trabajo.id, {
        fraccion,
        parcial: a.parcial,
        detalle: `${Math.round(fraccion * 100)} %${a.fraccion < 1 ? ` · quedan ~${duracionLegible(resta)}` : ''}`,
      });
    });
    segmentos.push(...delTrabajo);
    previas += peso;
  }
  segmentos.sort((a, b) => a.inicio - b.inicio);

  const datos = { duracion, idioma: ajustes.idioma, modelo: modeloPorId(modelo).nombre, estado: 'transcripto' as const, segmentos };
  const item = trabajo.itemId
    ? await window.api.actualizarItem(trabajo.itemId, datos)
    : await window.api.crearItem({ titulo: trabajo.titulo, tipo: 'archivo', creado: new Date().toISOString(), audio: trabajo.ruta, ...datos });

  bibliotecaCambio();
  avisar(`Listo: ${trabajo.titulo}`, { accion: { texto: 'Abrir', hacer: () => ir({ pagina: 'detalle', id: item.id }) } });
}

async function procesarCola() {
  if (enMarcha) return;
  enMarcha = true;
  for (;;) {
    const trabajo = cola.leer().trabajos.find((t) => t.etapa === 'espera');
    if (!trabajo) break;
    actual = trabajo.id;
    try {
      await procesar(trabajo);
    } catch (err) {
      if (err instanceof Cancelado || /Cancelado|abort/i.test(String((err as Error).message))) {
        avisar('Transcripción cancelada');
      } else {
        console.error(err);
        const mensaje = String((err as Error).message).replace(/^Error invoking remote method '[^']+': (Error: )?/, '');
        avisar(`${trabajo.titulo}: ${mensaje}`, { tipo: 'error' });
      }
    }
    actual = null;
    window.api.limpiarTrabajo(trabajo.id);
    quitar(trabajo.id);
  }
  enMarcha = false;
}
