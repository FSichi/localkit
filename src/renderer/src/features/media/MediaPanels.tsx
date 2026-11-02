import { t } from '../../../../shared/i18n/index.ts';
import {
  AUDIO_FORMATS,
  VIDEO_FORMATS,
  type CompressionLevel,
  type MediaFormat,
  type SubtitleMode,
  type SubtitleOptions,
  type SubtitleSize,
  type VideoCodec,
  type VideoCompressionOptions,
} from '../../../../shared/jobs.ts';
import { Field, Select, Tabs } from '../../ui/controls.tsx';
import { OutputFolderPicker } from '../file-batch/OutputFolderPicker.tsx';
import { TranscriptionFields } from '../transcription/TranscriptionFields.tsx';
import { mediaOptions } from './media-store.ts';

const LEVELS: { id: CompressionLevel; label: string }[] = [
  { id: 'high', label: t.media.levels.high },
  { id: 'medium', label: t.media.levels.medium },
  { id: 'low', label: t.media.levels.low },
];

const RESOLUTIONS: { id: number; label: string }[] = [
  { id: 0, label: t.media.originalResolution },
  { id: 1080, label: '1080p' },
  { id: 720, label: '720p' },
  { id: 480, label: '480p' },
];

const CODECS: { id: VideoCodec; label: string }[] = [
  { id: 'h264', label: t.media.codecs.h264 },
  { id: 'h265', label: t.media.codecs.h265 },
];

const MODES: { id: VideoCompressionOptions['mode']; label: string }[] = [
  { id: 'quality', label: t.media.compressModes.quality },
  { id: 'targetSize', label: t.media.compressModes.targetSize },
];

const SIZE_PRESETS = [8, 10, 25, 50, 100];

const SUBTITLE_MODES: { id: SubtitleMode; label: string }[] = [
  { id: 'burn', label: t.media.subtitles.modes.burn },
  { id: 'track', label: t.media.subtitles.modes.track },
  { id: 'file', label: t.media.subtitles.modes.file },
];

const SUBTITLE_SIZES: { id: SubtitleSize; label: string }[] = [
  { id: 'small', label: t.media.subtitles.sizes.small },
  { id: 'medium', label: t.media.subtitles.sizes.medium },
  { id: 'large', label: t.media.subtitles.sizes.large },
];

const toFormatOptions = <T extends string>(formats: readonly T[]) => formats.map((format) => ({ id: format, label: format.toUpperCase() }));

const CONVERT_FORMATS: { id: MediaFormat; label: string }[] = toFormatOptions([...VIDEO_FORMATS, ...AUDIO_FORMATS]);

export function CompressPanel() {
  const { compression } = mediaOptions.use();
  const update = (changes: Partial<VideoCompressionOptions>) => mediaOptions.set({ compression: { ...compression, ...changes } });

  return (
    <div className="panel">
      <div className="panel-row">
        <Field label={t.media.compressBy}>
          <Tabs options={MODES} value={compression.mode} onChange={(mode) => update({ mode })} />
        </Field>
        {compression.mode === 'quality' ? (
          <Field label={t.media.quality}>
            <Tabs options={LEVELS} value={compression.level} onChange={(level) => update({ level })} />
          </Field>
        ) : (
          <Field label={t.media.targetSize}>
            <div className="inline-controls">
              <input
                className="input short"
                type="number"
                min={1}
                value={compression.targetMegabytes}
                aria-label={t.media.targetSize}
                onChange={(event) => update({ targetMegabytes: Math.max(1, Number(event.target.value) || 1) })}
              />
              <span className="muted">MB</span>
              {SIZE_PRESETS.map((size) => (
                <button key={size} className="btn btn-small" aria-pressed={compression.targetMegabytes === size} onClick={() => update({ targetMegabytes: size })}>
                  {size}
                </button>
              ))}
            </div>
          </Field>
        )}
      </div>
      <div className="panel-row">
        <Field label={t.media.resolution}>
          <Select value={compression.resolution} options={RESOLUTIONS} onChange={(resolution) => update({ resolution })} />
        </Field>
        <Field label={t.media.codec}>
          <Tabs options={CODECS} value={compression.codec} onChange={(codec) => update({ codec })} />
        </Field>
      </div>
      <OutputFolderPicker />
    </div>
  );
}

export function SubtitlesPanel() {
  const { subtitles } = mediaOptions.use();
  const update = (changes: Partial<SubtitleOptions>) => mediaOptions.set({ subtitles: { ...subtitles, ...changes } });

  return (
    <div className="panel">
      <div className="panel-row">
        <Field label={t.media.subtitles.how}>
          <Tabs options={SUBTITLE_MODES} value={subtitles.mode} onChange={(mode) => update({ mode })} />
        </Field>
        {subtitles.mode === 'burn' && (
          <Field label={t.media.subtitles.size}>
            <Tabs options={SUBTITLE_SIZES} value={subtitles.size} onChange={(size) => update({ size })} />
          </Field>
        )}
      </div>
      <p className="field-note">{t.media.subtitles.notes[subtitles.mode]}</p>
      <TranscriptionFields />
      <OutputFolderPicker />
    </div>
  );
}

export function ConvertPanel() {
  const { convertFormat } = mediaOptions.use();
  return (
    <div className="panel">
      <Field label={t.media.outputFormat}>
        <Tabs options={CONVERT_FORMATS} value={convertFormat} onChange={(format) => mediaOptions.set({ convertFormat: format })} />
      </Field>
      <OutputFolderPicker />
    </div>
  );
}

export function ExtractAudioPanel() {
  const { audioFormat } = mediaOptions.use();
  return (
    <div className="panel">
      <Field label={t.media.outputFormat}>
        <Tabs options={toFormatOptions(AUDIO_FORMATS)} value={audioFormat} onChange={(format) => mediaOptions.set({ audioFormat: format })} />
      </Field>
      <OutputFolderPicker />
    </div>
  );
}
