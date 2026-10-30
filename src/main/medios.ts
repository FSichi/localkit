// FFmpeg: decodifica cualquier audio o video, separa las pistas de una grabación y genera el MP3.
import { app } from 'electron';
import { spawn, type ChildProcess } from 'node:child_process';
import { mkdirSync, rmSync, statSync } from 'node:fs';
import { join } from 'node:path';
import ffmpegEstatico from 'ffmpeg-static';
import type { Fuente, Hablante, PistaPreparada } from '../shared/tipos.ts';

// Empaquetada, la app no puede ejecutar nada desde dentro del .asar.
const FFMPEG = (ffmpegEstatico as unknown as string).replace('app.asar', 'app.asar.unpacked');
const FRECUENCIA = 16000;

const procesos = new Map<string, ChildProcess>();

export function carpetaTemporal(): string {
  const ruta = join(app.getPath('temp'), 'transcriptor');
  mkdirSync(ruta, { recursive: true });
  return ruta;
}

function segundos(texto: string): number {
  const [h, m, s] = texto.split(':').map(Number);
  return h * 3600 + m * 60 + s;
}

function ejecutar(trabajo: string, args: string[], alAvanzar?: (fraccion: number) => void): Promise<void> {
  return new Promise((resolver, rechazar) => {
    const proceso = spawn(FFMPEG, ['-hide_banner', '-nostdin', '-y', ...args], { windowsHide: true });
    procesos.set(trabajo, proceso);
    let duracion = 0;
    let final = '';
    proceso.stderr.setEncoding('utf8');
    proceso.stderr.on('data', (texto: string) => {
      final = (final + texto).slice(-600);
      if (!duracion) {
        const d = texto.match(/Duration: (\d+:\d+:\d+\.\d+)/);
        if (d) duracion = segundos(d[1]);
      }
      const t = texto.match(/time=(\d+:\d+:\d+\.\d+)/);
      if (t && duracion) alAvanzar?.(Math.min(1, segundos(t[1]) / duracion));
    });
    proceso.on('error', rechazar);
    proceso.on('close', (codigo, senal) => {
      procesos.delete(trabajo);
      if (codigo === 0) resolver();
      else if (senal) rechazar(new Error('Cancelado'));
      else {
        console.error('FFmpeg:', final);
        rechazar(new Error('No se pudo leer el archivo. Puede estar dañado o no tener audio.'));
      }
    });
  });
}

export function cancelarMedios(trabajo: string) {
  procesos.get(trabajo)?.kill();
}

const PAN = { mezcla: null, izq: 'pan=mono|c0=c0', der: 'pan=mono|c0=c1' } as const;

async function aPcm(trabajo: string, origen: string, canal: keyof typeof PAN, destino: string, alAvanzar: (f: number) => void) {
  const filtro = PAN[canal];
  await ejecutar(
    trabajo,
    ['-i', origen, '-vn', ...(filtro ? ['-af', filtro] : []), '-ac', '1', '-ar', String(FRECUENCIA), '-f', 'f32le', destino],
    alAvanzar,
  );
}

const carpetaTrabajo = (trabajo: string) => join(carpetaTemporal(), trabajo.replace(/[^\w-]/g, ''));

/** Decodifica a PCM de 16 kHz, en una pista por cada persona que haya que distinguir. */
export async function prepararPistas(
  trabajo: string,
  origen: string,
  fuente: Fuente | undefined,
  avisar: (fraccion: number) => void,
): Promise<PistaPreparada[]> {
  const carpeta = carpetaTrabajo(trabajo);
  mkdirSync(carpeta, { recursive: true });

  const pedidas: { canal: keyof typeof PAN; hablante?: Hablante }[] =
    fuente === 'ambos'
      ? [{ canal: 'der', hablante: 'otros' }, { canal: 'izq', hablante: 'yo' }]
      : fuente === 'sistema'
        ? [{ canal: 'der' }]
        : fuente === 'mic'
          ? [{ canal: 'izq' }]
          : [{ canal: 'mezcla' }];

  const pistas: PistaPreparada[] = [];
  for (const [i, pedida] of pedidas.entries()) {
    const nombre = `pista-${i}.pcm`;
    const destino = join(carpeta, nombre);
    await aPcm(trabajo, origen, pedida.canal, destino, (f) => avisar((i + f) / pedidas.length));
    pistas.push({
      url: `transcriptor://temp/${encodeURIComponent(trabajo)}/${nombre}`,
      hablante: pedida.hablante,
      duracion: statSync(destino).size / 4 / FRECUENCIA,
    });
  }
  return pistas;
}

export function limpiarTrabajo(trabajo: string) {
  rmSync(carpetaTrabajo(trabajo), { recursive: true, force: true });
}

export function rutaTemporal(trabajo: string, nombre: string): string {
  return join(carpetaTrabajo(trabajo), nombre.replace(/[^\w.-]/g, ''));
}

/** MP3 para escuchar: una mezcla pareja de lo grabado, en estéreo centrado. */
export async function generarMp3(trabajo: string, pistas: string, fuente: Fuente, destino: string) {
  const mezcla =
    fuente === 'ambos' ? 'pan=stereo|c0=0.6*c0+0.6*c1|c1=0.6*c0+0.6*c1' : fuente === 'sistema' ? 'pan=stereo|c0=c1|c1=c1' : 'pan=stereo|c0=c0|c1=c0';
  await ejecutar(trabajo, ['-i', pistas, '-af', mezcla, '-c:a', 'libmp3lame', '-q:a', '3', destino]);
}
