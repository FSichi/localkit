// Preferencias de la app, en un JSON dentro de la carpeta de datos del usuario.
import { app } from 'electron';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Ajustes } from '../shared/tipos.ts';

const ruta = () => join(app.getPath('userData'), 'ajustes.json');

function predeterminados(): Ajustes {
  return {
    tema: 'oscuro',
    idioma: 'es',
    modelo: '',
    fuente: 'ambos',
    micId: 'default',
    transcribirAlTerminar: true,
    carpetaGrabaciones: join(app.getPath('documents'), 'Transcriptor'),
    buscarActualizaciones: true,
    versionVista: '',
    pospuesta: null,
  };
}

let actuales: Ajustes | null = null;

export function leerAjustes(): Ajustes {
  if (actuales) return actuales;
  actuales = predeterminados();
  if (existsSync(ruta())) {
    try {
      actuales = { ...actuales, ...JSON.parse(readFileSync(ruta(), 'utf8')) };
    } catch {
      // Un archivo dañado no debe impedir abrir la app: se sigue con los valores por defecto.
    }
  }
  return actuales!;
}

export function guardarAjustes(cambios: Partial<Ajustes>): Ajustes {
  actuales = { ...leerAjustes(), ...cambios };
  writeFileSync(ruta(), JSON.stringify(actuales, null, 2));
  return actuales;
}
