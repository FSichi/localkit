// Version 0.1.0 stored its data with Spanish keys. These pure functions translate it to the
// current schema; the file moves live in migrations.ts.
import type { Settings, Theme } from '../../shared/settings.ts';
import type { AudioSource, LibraryItem, Segment, Speaker } from '../../shared/transcription.ts';

type LegacyRecord = Record<string, unknown>;

const THEMES: Record<string, Theme> = { oscuro: 'dark', claro: 'light', sistema: 'system' };
const SOURCES: Record<string, AudioSource> = { ambos: 'both', sistema: 'system', mic: 'microphone' };
const SPEAKERS: Record<string, Speaker> = { yo: 'me', otros: 'others' };

export function migrateLegacySettings(legacy: LegacyRecord): Partial<Settings> {
  const settings: Partial<Settings> = {};
  const assign = <K extends keyof Settings>(key: K, value: unknown) => {
    if (value !== undefined) settings[key] = value as Settings[K];
  };
  assign('theme', THEMES[legacy.tema as string]);
  assign('language', legacy.idioma);
  assign('modelId', legacy.modelo);
  assign('audioSource', SOURCES[legacy.fuente as string]);
  assign('microphoneId', legacy.micId);
  assign('transcribeWhenDone', legacy.transcribirAlTerminar);
  assign('recordingsFolder', legacy.carpetaGrabaciones);
  assign('checkForUpdates', legacy.buscarActualizaciones);
  assign('lastSeenVersion', legacy.versionVista);
  const postponed = legacy.pospuesta as { version: string; hasta: number } | null | undefined;
  if (postponed) settings.postponedUpdate = { version: postponed.version, until: postponed.hasta };
  return settings;
}

function migrateSegment(legacy: LegacyRecord): Segment {
  const speaker = SPEAKERS[legacy.hablante as string];
  return { start: legacy.inicio as number, end: legacy.fin as number, text: legacy.texto as string, ...(speaker ? { speaker } : {}) };
}

export function migrateLegacyItem(legacy: LegacyRecord): LibraryItem {
  return {
    id: legacy.id as string,
    title: legacy.titulo as string,
    kind: legacy.tipo === 'grabacion' ? 'recording' : 'file',
    createdAt: legacy.creado as string,
    duration: legacy.duracion as number,
    audioPath: legacy.audio as string | undefined,
    tracksPath: legacy.pistas as string | undefined,
    folder: legacy.carpeta as string | undefined,
    source: SOURCES[legacy.fuente as string],
    language: legacy.idioma as string | undefined,
    quality: legacy.modelo as string | undefined,
    status: legacy.estado === 'transcripto' ? 'transcribed' : 'pending',
    segments: ((legacy.segmentos as LegacyRecord[]) ?? []).map(migrateSegment),
  };
}

/** Marker left by an unfinished recording. */
export function readRecordingMarker(marker: LegacyRecord): { source: AudioSource; startedAt: string } {
  if (marker.source) return marker as unknown as { source: AudioSource; startedAt: string };
  return { source: SOURCES[marker.fuente as string] ?? 'both', startedAt: marker.inicio as string };
}
