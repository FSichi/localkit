// Formato de transcripciones: párrafos y exportaciones. Sin dependencias, para usarlo en todos lados.
import type { Hablante, Segmento } from './tipos.ts';

export interface Parrafo {
  inicio: number;
  fin: number;
  texto: string;
  hablante?: Hablante;
}

export const NOMBRE_HABLANTE: Record<Hablante, string> = { yo: 'Yo', otros: 'Otros' };

const PAUSA_PARRAFO = 1;
const LARGO_PARRAFO = 280;

export function aParrafos(segmentos: Segmento[]): Parrafo[] {
  const parrafos: Parrafo[] = [];
  let actual: Parrafo | null = null;
  for (const s of segmentos) {
    const pausa = actual ? s.inicio - actual.fin : 0;
    const largo = actual && actual.texto.length > LARGO_PARRAFO && /[.?!…]$/.test(actual.texto);
    if (!actual || actual.hablante !== s.hablante || pausa > PAUSA_PARRAFO || largo) {
      actual = { inicio: s.inicio, fin: s.fin, texto: s.texto, hablante: s.hablante };
      parrafos.push(actual);
    } else {
      actual.texto += ' ' + s.texto;
      actual.fin = s.fin;
    }
  }
  return parrafos;
}

export function reloj(segundos: number): string {
  const total = Math.max(0, Math.floor(segundos));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const dos = (n: number) => String(n).padStart(2, '0');
  return h ? `${h}:${dos(m)}:${dos(s)}` : `${dos(m)}:${dos(s)}`;
}

export function relojSrt(segundos: number): string {
  const ms = Math.round(Math.max(0, segundos) * 1000);
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  const dos = (n: number) => String(n).padStart(2, '0');
  return `${dos(h)}:${dos(m)}:${dos(s)},${String(ms % 1000).padStart(3, '0')}`;
}

export function duracionLegible(segundos: number): string {
  if (!isFinite(segundos)) return '…';
  if (segundos < 60) return `${Math.max(1, Math.round(segundos))} s`;
  const total = Math.round(segundos / 60);
  if (total < 60) return `${total} min`;
  return `${Math.floor(total / 60)} h ${total % 60} min`;
}

export function tamano(bytes: number): string {
  if (bytes >= 1e9) return `${(bytes / 1e9).toLocaleString('es-AR', { maximumFractionDigits: 1 })} GB`;
  return `${Math.max(1, Math.round(bytes / 1e6))} MB`;
}

export function contarPalabras(segmentos: Segmento[]): number {
  return segmentos.reduce((n, s) => n + s.texto.split(/\s+/).filter(Boolean).length, 0);
}

function prefijo(p: Parrafo, conTiempos: boolean): string {
  const partes: string[] = [];
  if (conTiempos) partes.push(`[${reloj(p.inicio)}]`);
  if (p.hablante) partes.push(`${NOMBRE_HABLANTE[p.hablante]}:`);
  return partes.length ? partes.join(' ') + ' ' : '';
}

export function aTxt(segmentos: Segmento[], conTiempos: boolean): string {
  return aParrafos(segmentos).map((p) => prefijo(p, conTiempos) + p.texto).join('\n\n') + '\n';
}

export function aSrt(segmentos: Segmento[]): string {
  return segmentos
    .map((s, i) => {
      const fin = Math.max(s.fin, s.inicio + 0.5);
      const quien = s.hablante ? `${NOMBRE_HABLANTE[s.hablante]}: ` : '';
      return `${i + 1}\n${relojSrt(s.inicio)} --> ${relojSrt(fin)}\n${quien}${s.texto}\n`;
    })
    .join('\n');
}

export function aMd(titulo: string, subtitulo: string, segmentos: Segmento[], conTiempos: boolean): string {
  const cuerpo = aParrafos(segmentos).map((p) => {
    const marcas: string[] = [];
    if (conTiempos) marcas.push(`\`${reloj(p.inicio)}\``);
    if (p.hablante) marcas.push(`**${NOMBRE_HABLANTE[p.hablante]}:**`);
    return (marcas.length ? marcas.join(' ') + ' ' : '') + p.texto;
  });
  return `# ${titulo}\n\n_${subtitulo}_\n\n${cuerpo.join('\n\n')}\n`;
}

const escapar = (t: string) =>
  t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Documento HTML que se imprime a PDF. */
export function aHtml(titulo: string, subtitulo: string, segmentos: Segmento[], conTiempos: boolean): string {
  const cuerpo = aParrafos(segmentos)
    .map((p) => {
      const tiempo = conTiempos ? `<span class="t">${reloj(p.inicio)}</span>` : '';
      const quien = p.hablante ? `<span class="h ${p.hablante}">${NOMBRE_HABLANTE[p.hablante]}</span>` : '';
      return `<p>${tiempo}${quien}${escapar(p.texto)}</p>`;
    })
    .join('\n');
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>${escapar(titulo)}</title><style>
body{font:11.5pt/1.65 "Segoe UI",system-ui,sans-serif;color:#16181c;margin:0}
h1{font-size:20pt;letter-spacing:-.02em;margin:0 0 4pt;font-weight:600}
.sub{color:#636873;font-size:10pt;margin:0 0 22pt;padding-bottom:12pt;border-bottom:1px solid #e3e4e8}
p{margin:0 0 10pt}
.t{color:#636873;font-size:9pt;margin-right:7pt;font-variant-numeric:tabular-nums}
.h{font-weight:600;margin-right:6pt}.h.yo{color:#2f4fc2}.h.otros{color:#1d7f4c}
</style></head><body><h1>${escapar(titulo)}</h1><p class="sub">${escapar(subtitulo)}</p>${cuerpo}</body></html>`;
}
