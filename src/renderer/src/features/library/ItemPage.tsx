import { useEffect, useMemo, useRef, useState } from 'react';
import { fileKindOf } from '../../../../shared/files.ts';
import { formatDuration, formatMediumDate, formatNumber, formatClock } from '../../../../shared/format.ts';
import { t } from '../../../../shared/i18n/index.ts';
import { countWords, speakerClass, speakerLabel, toParagraphs, toPlainText, type Paragraph } from '../../../../shared/transcript-format.ts';
import type { LibraryItem, TranscriptExportFormat } from '../../../../shared/transcription.ts';
import { navigate, touchLibrary } from '../../app/app-store.ts';
import { notify, notifySaved } from '../../app/toasts.ts';
import { invoke } from '../../lib/bridge.ts';
import { Dialog } from '../../ui/Dialog.tsx';
import { Icon } from '../../ui/Icon.tsx';
import { Page } from '../../ui/layout.tsx';
import { openAudioEditor } from '../audio-editor/audio-editor-store.ts';
import { openMedia } from '../media/media-store.ts';
import { enqueueLibraryItem, transcriptionQueue } from '../transcription/transcription-queue.ts';
import { AudioPlayer } from './AudioPlayer.tsx';

const EXPORT_FORMATS: TranscriptExportFormat[] = ['txt', 'md', 'pdf', 'srt'];
const TIME_TOLERANCE_SECONDS = 0.05;

function useItemAudio(audioPath: string | undefined) {
  const [audio, setAudio] = useState<HTMLAudioElement | null>(null);
  useEffect(() => {
    if (!audioPath) return;
    let element: HTMLAudioElement | null = null;
    let cancelled = false;
    (async () => {
      if (!(await invoke('files:exists', audioPath))) return;
      const url = await invoke('files:mediaUrl', audioPath);
      if (cancelled) return;
      element = new Audio(url);
      element.preload = 'metadata';
      setAudio(element);
    })();
    return () => {
      cancelled = true;
      element?.pause();
      element?.removeAttribute('src');
      setAudio(null);
    };
  }, [audioPath]);
  return audio;
}

function paragraphIndexAt(paragraphs: Paragraph[], time: number): number {
  let low = 0;
  let high = paragraphs.length - 1;
  let index = -1;
  while (low <= high) {
    const middle = (low + high) >> 1;
    if (paragraphs[middle].start <= time + TIME_TOLERANCE_SECONDS) {
      index = middle;
      low = middle + 1;
    } else high = middle - 1;
  }
  return index;
}

/** Highlights the paragraph being played. Touches the DOM directly to avoid re-rendering long transcripts. */
function useParagraphHighlight(audio: HTMLAudioElement | null, paragraphs: Paragraph[]) {
  const container = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!audio || !paragraphs.length) return;
    let active = -1;
    const onTime = () => {
      const index = paragraphIndexAt(paragraphs, audio.currentTime);
      if (index === active) return;
      const children = container.current?.children;
      children?.[active]?.classList.remove('active');
      children?.[index]?.classList.add('active');
      if (!audio.paused) children?.[index]?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      active = index;
    };
    audio.addEventListener('timeupdate', onTime);
    return () => audio.removeEventListener('timeupdate', onTime);
  }, [audio, paragraphs]);
  return container;
}

function DeleteDialog({ item, onCancel, onConfirm }: { item: LibraryItem; onCancel: () => void; onConfirm: () => void }) {
  return (
    <Dialog label={t.item.deleteTitle(item.title)} onDismiss={onCancel}>
      <h2>{t.item.deleteTitle(item.title)}</h2>
      <p>{item.kind === 'recording' ? t.item.deleteRecording : t.item.deleteFile}</p>
      <div className="dialog-actions">
        <button className="btn" autoFocus onClick={onCancel}>
          {t.common.cancel}
        </button>
        <button className="btn btn-danger" onClick={onConfirm}>
          {t.common.delete}
        </button>
      </div>
    </Dialog>
  );
}

/** Names for the voices told apart, used in the transcript and in every export. */
function VoiceNamesEditor({ item, onChange }: { item: LibraryItem; onChange: (item: LibraryItem) => void }) {
  const voices = [...new Set(item.segments.flatMap(({ voice }) => (voice ? [voice] : [])))].sort((a, b) => a - b);
  if (!voices.length) return null;

  const save = async (voice: number, name: string) => {
    const voiceNames = { ...item.voiceNames };
    const trimmed = name.trim();
    if (trimmed && trimmed !== t.voices.numbered(voice)) voiceNames[voice] = trimmed;
    else delete voiceNames[voice];
    if (JSON.stringify(voiceNames) !== JSON.stringify(item.voiceNames ?? {})) onChange(await invoke('library:update', item.id, { voiceNames }));
  };

  return (
    <div className="voice-names" title={t.voices.hint}>
      <span className="section-title">{t.voices.title}</span>
      {voices.map((voice) => {
        const label = speakerLabel({ voice }, item.voiceNames)!;
        return (
          <label key={voice} className={`voice-name ${speakerClass({ voice })}`}>
            <i />
            <input
              defaultValue={label}
              aria-label={t.voices.rename(t.voices.numbered(voice))}
              onBlur={(event) => save(voice, event.target.value)}
              onKeyDown={(event) => event.key === 'Enter' && event.currentTarget.blur()}
            />
          </label>
        );
      })}
    </div>
  );
}

function OpenVideoButton({ path }: { path: string }) {
  return (
    <button className="btn btn-ghost" onClick={() => invoke('shell:openPath', path)}>
      <Icon name="video" size={14} /> {t.item.openVideo}
    </button>
  );
}

function ItemActions({ item, withTimestamps, onToggleTimestamps, onDelete }: { item: LibraryItem; withTimestamps: boolean; onToggleTimestamps: () => void; onDelete: () => void }) {
  const video = item.videoPath ?? (item.audioPath && fileKindOf(item.audioPath) === 'video' ? item.audioPath : undefined);
  const copyText = async () => {
    await invoke('clipboard:writeText', toPlainText(item.segments, withTimestamps, item.voiceNames).trim());
    notify(t.item.copied);
  };
  const exportTranscript = async (format: TranscriptExportFormat) => {
    const path = await invoke('library:exportTranscript', item.id, format, withTimestamps);
    if (path) notifySaved(t.item.exported(format.toUpperCase()), path);
  };
  const addSubtitles = () => {
    openMedia([video!], 'subtitles');
    navigate({ page: 'media' });
  };
  const exportAudio = async () => {
    const path = await invoke('library:exportAudio', item.id);
    if (path) notifySaved(t.item.audioSaved, path);
  };
  const editAudio = () => {
    openAudioEditor(item.audioPath!, item.id);
    navigate({ page: 'audioEditor' });
  };
  const transcribed = item.status === 'transcribed';

  return (
    <div className="item-actions">
      {transcribed && (
        <>
          <button className="btn btn-primary" onClick={copyText}>
            <Icon name="copy" size={14} /> {t.common.copy}
          </button>
          <div className="button-group" role="group" aria-label={t.item.export}>
            {EXPORT_FORMATS.map((format) => (
              <button key={format} className="btn" onClick={() => exportTranscript(format)}>
                {format.toUpperCase()}
              </button>
            ))}
          </div>
          <button className="btn btn-icon" title={t.item.showTimestamps} aria-pressed={withTimestamps} onClick={onToggleTimestamps}>
            <Icon name="clock" />
          </button>
        </>
      )}
      <div className="item-actions-end">
        {item.videoPath && <OpenVideoButton path={item.videoPath} />}
        {item.audioPath && fileKindOf(item.audioPath) === 'audio' && (
          <button className="btn btn-ghost" onClick={editAudio}>
            <Icon name="scissors" size={14} /> {t.item.editAudio}
          </button>
        )}
        {transcribed && video && (
          <button className="btn btn-ghost" onClick={addSubtitles}>
            <Icon name="text" size={14} /> {t.home.actions.addSubtitles}
          </button>
        )}
        {item.audioPath && (
          <button className="btn btn-ghost" onClick={exportAudio}>
            <Icon name="download" size={14} /> {t.item.audio}
          </button>
        )}
        {item.folder && (
          <button className="btn btn-ghost btn-icon" title={t.item.openFolder} onClick={() => invoke('shell:openPath', item.folder!)}>
            <Icon name="folder" />
          </button>
        )}
        <button className="btn btn-ghost btn-icon" title={t.common.delete} onClick={onDelete}>
          <Icon name="trash" />
        </button>
      </div>
    </div>
  );
}

export function ItemPage({ id }: { id: string }) {
  const [item, setItem] = useState<LibraryItem | null>(null);
  const [withTimestamps, setWithTimestamps] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const { jobs } = transcriptionQueue.use();
  const inQueue = item ? jobs.some((job) => job.itemId === item.id) : false;

  const load = () => invoke('library:get', id).then(setItem).catch(() => navigate({ page: 'library' }));
  useEffect(() => {
    load();
  }, [id]);
  // When a recording that is open finishes transcribing, show the result.
  useEffect(() => {
    if (!inQueue && item?.status === 'pending') load();
  }, [inQueue]);

  const audio = useItemAudio(item?.audioPath);
  const paragraphs = useMemo(() => toParagraphs(item?.segments ?? []), [item]);
  const transcript = useParagraphHighlight(audio, paragraphs);

  if (!item) return null;

  const rename = async (title: string) => {
    const trimmed = title.trim();
    if (!trimmed || trimmed === item.title) return;
    setItem(await invoke('library:update', item.id, { title: trimmed }));
    touchLibrary();
  };

  const deleteItem = async () => {
    audio?.pause();
    await invoke('library:delete', item.id);
    touchLibrary();
    navigate({ page: 'library' });
    notify(t.item.deleted);
  };

  const seekTo = (seconds: number) => {
    if (!audio || getSelection()?.toString()) return;
    audio.currentTime = seconds;
    audio.play();
  };

  const transcribed = item.status === 'transcribed';

  return (
    <Page>
      <button className="link-button subtle" onClick={() => navigate({ page: 'library' })}>
        <Icon name="back" size={14} /> {t.library.title}
      </button>

      <header className="item-header">
        <input key={item.title} className="title-input" defaultValue={item.title} aria-label={t.item.titleLabel} onBlur={(event) => rename(event.target.value)} onKeyDown={(event) => event.key === 'Enter' && event.currentTarget.blur()} />
        <div className="item-meta">
          <span>{formatDuration(item.duration)}</span>
          {transcribed && <span>{t.item.words(formatNumber(countWords(item.segments)))}</span>}
          {item.quality && <span>{t.item.quality(item.quality)}</span>}
          <span>{formatMediumDate(item.createdAt)}</span>
        </div>
      </header>

      {audio && <AudioPlayer audio={audio} fallbackDuration={item.duration} />}

      {!inQueue && <ItemActions item={item} withTimestamps={withTimestamps} onToggleTimestamps={() => setWithTimestamps(!withTimestamps)} onDelete={() => setConfirmingDelete(true)} />}

      {transcribed && <VoiceNamesEditor item={item} onChange={setItem} />}

      {transcribed && paragraphs.length > 0 && (
        <div ref={transcript} className={`transcript ${withTimestamps ? 'with-timestamps' : ''} ${audio ? 'seekable' : ''}`}>
          {paragraphs.map((paragraph) => (
            <p key={paragraph.start} className="paragraph" onClick={() => seekTo(paragraph.start)}>
              <span className="timestamp">{formatClock(paragraph.start)}</span>
              {speakerLabel(paragraph) && <span className={`speaker ${speakerClass(paragraph)}`}>{speakerLabel(paragraph, item.voiceNames)}</span>}
              {paragraph.text}
            </p>
          ))}
        </div>
      )}
      {transcribed && !paragraphs.length && (
        <div className="empty">
          <p>{t.item.noSpeech}</p>
        </div>
      )}
      {!transcribed && (
        <div className="empty">
          <p>{inQueue ? t.item.transcribing : t.item.notTranscribed}</p>
          {!inQueue && (
            <div className="empty-actions">
              <button className="btn btn-primary" onClick={() => enqueueLibraryItem(item)}>
                {t.item.transcribeNow}
              </button>
            </div>
          )}
        </div>
      )}

      {confirmingDelete && <DeleteDialog item={item} onCancel={() => setConfirmingDelete(false)} onConfirm={deleteItem} />}
    </Page>
  );
}
