import { useEffect, useRef, useState } from 'react';
import { editedDuration, skipRemoved } from '../../../../shared/audio-edit.ts';
import { extensionsFor, fileNameOf } from '../../../../shared/files.ts';
import { formatClock } from '../../../../shared/format.ts';
import { t } from '../../../../shared/i18n/index.ts';
import type { EditedAudioFormat } from '../../../../shared/jobs.ts';
import { invoke } from '../../lib/bridge.ts';
import { Field, Tabs } from '../../ui/controls.tsx';
import { DropZone } from '../../ui/DropZone.tsx';
import { Icon } from '../../ui/Icon.tsx';
import { Page, PageHeader } from '../../ui/layout.tsx';
import { ProgressBar } from '../../ui/ProgressBar.tsx';
import { OutputFolderPicker } from '../file-batch/OutputFolderPicker.tsx';
import {
  audioEditor,
  closeAudioEditor,
  exportEdited,
  keepOnlySelection,
  openAudioEditor,
  removeSelection,
  restoreCut,
  saveAsNewRecording,
  selectRange,
  setAudioMode,
  undo,
  type AudioMode,
} from './audio-editor-store.ts';
import { AudioConvertMode } from './AudioConvertMode.tsx';
import { WaveformEditor } from './WaveformEditor.tsx';

const MODES: { id: AudioMode; label: string }[] = [
  { id: 'edit', label: t.audioEditor.modes.edit },
  { id: 'convert', label: t.audioEditor.modes.convert },
];

const FORMATS: { id: EditedAudioFormat; label: string }[] = [
  { id: 'same', label: t.audioEditor.sameFormat },
  { id: 'mp3', label: 'MP3' },
  { id: 'm4a', label: 'M4A' },
  { id: 'wav', label: 'WAV' },
];

/** Plays the audio as it will sound: removed parts are skipped. */
function usePreview(path: string) {
  const { cuts } = audioEditor.use();
  const [audio, setAudio] = useState<HTMLAudioElement | null>(null);
  const [position, setPosition] = useState(0);
  const [playing, setPlaying] = useState(false);
  const cutsRef = useRef(cuts);
  cutsRef.current = cuts;

  useEffect(() => {
    let element: HTMLAudioElement | null = null;
    let frame = 0;
    invoke('files:mediaUrl', path).then((url) => {
      element = new Audio(url);
      const follow = () => {
        const next = skipRemoved(element!.currentTime, cutsRef.current);
        if (next !== null) element!.currentTime = next;
        setPosition(element!.currentTime);
        if (!element!.paused) frame = requestAnimationFrame(follow);
      };
      element.addEventListener('play', () => {
        setPlaying(true);
        follow();
      });
      element.addEventListener('pause', () => setPlaying(false));
      element.addEventListener('seeked', () => setPosition(element!.currentTime));
      setAudio(element);
    });
    return () => {
      cancelAnimationFrame(frame);
      element?.pause();
      element?.removeAttribute('src');
    };
  }, [path]);

  const seek = (seconds: number) => {
    if (audio) audio.currentTime = skipRemoved(seconds, cutsRef.current) ?? seconds;
  };
  const toggle = () => (audio?.paused ? audio.play() : audio?.pause());
  return { position, playing, seek, toggle };
}

function Editor({ path }: { path: string }) {
  const { duration, waveform, cuts, history, selection, itemId, fraction, format } = audioEditor.use();
  const { position, playing, seek, toggle } = usePreview(path);
  const busy = fraction != null;

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.target as HTMLElement).closest('input, textarea, select')) return;
      if (event.code === 'Space') {
        event.preventDefault();
        toggle();
      } else if (event.ctrlKey && event.key.toLowerCase() === 'z') {
        event.preventDefault();
        undo();
      } else if (event.key === 'Delete' || event.key === 'Backspace') {
        removeSelection();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [toggle]);

  const markStart = () => selectRange({ start: position, end: Math.max(position, selection?.end ?? duration) });
  const markEnd = () => selectRange({ start: Math.min(position, selection?.start ?? 0), end: position });

  return (
    <>
      <div className="panel">
        <div className="organize-header">
          <strong title={path}>{fileNameOf(path)}</strong>
          <span className="muted small numeric">{cuts.length ? t.audioEditor.durations(formatClock(duration), formatClock(editedDuration(cuts, duration))) : formatClock(duration)}</span>
          <button className="btn btn-ghost btn-small" onClick={closeAudioEditor}>
            {t.pdf.organize.close}
          </button>
        </div>
        {waveform.length > 0 ? (
          <WaveformEditor waveform={waveform} duration={duration} cuts={cuts} selection={selection} position={position} onSelect={selectRange} onSeek={seek} />
        ) : (
          <ProgressBar fraction={null} />
        )}
        <div className="editor-transport">
          <button className="player-toggle" title={playing ? t.item.pause : t.item.play} onClick={toggle}>
            <Icon name={playing ? 'pause' : 'play'} size={13} />
          </button>
          <span className="numeric">{formatClock(position)}</span>
          <button className="btn btn-small" onClick={markStart}>
            {t.media.markStart}
          </button>
          <button className="btn btn-small" onClick={markEnd}>
            {t.media.markEnd}
          </button>
          <span className="muted small numeric editor-selection">
            {selection ? t.audioEditor.selection(formatClock(selection.start), formatClock(selection.end)) : t.audioEditor.selectHint}
          </span>
        </div>
        <div className="organize-actions">
          <button className="btn btn-small" disabled={!selection} onClick={removeSelection}>
            <Icon name="scissors" size={13} /> {t.audioEditor.remove}
          </button>
          <button className="btn btn-small" disabled={!selection} onClick={keepOnlySelection}>
            {t.audioEditor.keepOnly}
          </button>
          <button className="btn btn-small" disabled={!history.length} onClick={undo}>
            <Icon name="back" size={13} /> {t.audioEditor.undo}
          </button>
        </div>
        {cuts.length > 0 && (
          <div className="editor-cuts">
            <span className="section-title">{t.audioEditor.removedParts}</span>
            {cuts.map((cut, index) => (
              <button key={`${cut.start}-${cut.end}`} className="tag editor-cut" title={t.audioEditor.restore} onClick={() => restoreCut(index)}>
                {formatClock(cut.start)} – {formatClock(cut.end)} <Icon name="close" size={11} />
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="panel">
        <Field label={t.audioEditor.format}>
          <Tabs options={FORMATS} value={format} onChange={(value) => audioEditor.set({ format: value })} />
        </Field>
        <OutputFolderPicker />
        {busy && <ProgressBar fraction={fraction} />}
        <div className="action-bar">
          <span className="action-bar-text">{itemId ? t.audioEditor.recordingHint : t.audioEditor.exportHint}</span>
          <button className={`btn ${itemId ? '' : 'btn-primary'}`} disabled={busy || !cuts.length} onClick={exportEdited}>
            <Icon name="download" size={14} /> {t.audioEditor.export}
          </button>
          {itemId && (
            <button className="btn btn-primary" disabled={busy || !cuts.length} onClick={saveAsNewRecording}>
              {t.audioEditor.saveAsRecording}
            </button>
          )}
        </div>
      </div>
    </>
  );
}

function EditMode() {
  const { path } = audioEditor.use();
  if (path) return <Editor key={path} path={path} />;
  return <DropZone extensions={extensionsFor('audio')} onFiles={([first]) => openAudioEditor(first)} title={t.audioEditor.dropTitle} detail={t.audioEditor.dropDetail} />;
}

export function AudioEditorPage() {
  const { mode } = audioEditor.use();
  return (
    <Page>
      <PageHeader title={t.audioEditor.title} subtitle={t.audioEditor.subtitle} />
      <Tabs options={MODES} value={mode} onChange={setAudioMode} />
      {mode === 'edit' ? <EditMode /> : <AudioConvertMode />}
    </Page>
  );
}
