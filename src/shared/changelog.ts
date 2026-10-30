// Lee el CHANGELOG.md y el cuerpo de los releases de GitHub, que salen de él.
// Formato:  ## [1.2.0] - 2026-10-29   →   ### Nuevo   →   - Un cambio
export interface SeccionNotas {
  titulo: string;
  items: string[];
}

export interface VersionNotas {
  version: string;
  fecha: string | null;
  secciones: SeccionNotas[];
}

const RE_VERSION = /^##\s+\[?v?(\d+\.\d+\.\d+)\]?(?:\s*[-–]\s*(\d{4}-\d{2}-\d{2}))?/;

function leerSecciones(lineas: string[], alTerminar: (linea: string) => boolean): SeccionNotas[] {
  const secciones: SeccionNotas[] = [];
  let actual: SeccionNotas | null = null;
  for (const linea of lineas) {
    if (alTerminar(linea)) break;
    const titulo = linea.match(/^###\s+(.+)/);
    if (titulo) {
      actual = { titulo: titulo[1].trim(), items: [] };
      secciones.push(actual);
      continue;
    }
    const item = linea.match(/^\s*[-*]\s+(.+)/);
    if (item && actual) actual.items.push(item[1].trim());
    // Una línea con sangría continúa el ítem anterior.
    else if (actual?.items.length && /^\s{2,}\S/.test(linea)) actual.items[actual.items.length - 1] += ` ${linea.trim()}`;
  }
  return secciones.filter((s) => s.items.length);
}

const aLineas = (texto: string) => String(texto ?? '').replace(/\r/g, '').split('\n');

export function parseChangelog(texto: string): VersionNotas[] {
  const lineas = aLineas(texto);
  const versiones: VersionNotas[] = [];
  lineas.forEach((linea, i) => {
    const m = linea.match(RE_VERSION);
    if (m) versiones.push({ version: m[1], fecha: m[2] ?? null, secciones: leerSecciones(lineas.slice(i + 1), (l) => RE_VERSION.test(l)) });
  });
  return versiones;
}

/** El cuerpo de un release: las secciones van primero; después de "---" vienen las instrucciones. */
export function parseSecciones(texto: string): SeccionNotas[] {
  return leerSecciones(aLineas(texto), (l) => /^---\s*$/.test(l) || /^##\s/.test(l));
}

/** El texto de una versión, tal como va en el release. Vacío si el CHANGELOG no la tiene. */
export function notasDeVersion(texto: string, version: string): string {
  const lineas = aLineas(texto);
  const inicio = lineas.findIndex((l) => l.match(RE_VERSION)?.[1] === version);
  if (inicio < 0) return '';
  const resto = lineas.slice(inicio + 1);
  const fin = resto.findIndex((l) => RE_VERSION.test(l));
  const cuerpo = (fin < 0 ? resto : resto.slice(0, fin)).join('\n').trim();
  return /^\s*[-*]\s+/m.test(cuerpo) ? cuerpo : '';
}

export function compararVersiones(a: string, b: string): number {
  const partes = (v: string) => v.split('-')[0].split('.').map((n) => Number(n) || 0);
  const [x, y] = [partes(a), partes(b)];
  for (let i = 0; i < 3; i++) {
    if ((x[i] ?? 0) !== (y[i] ?? 0)) return (x[i] ?? 0) - (y[i] ?? 0);
  }
  return 0;
}
