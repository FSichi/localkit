import { useEffect, useState } from 'react';
import { formatClock } from '../../../../shared/format.ts';
import { t } from '../../../../shared/i18n/index.ts';
import type { AudioSource, CaptureSource, RecordingCapture } from '../../../../shared/transcription.ts';
import { appStore, updateSettings } from '../../app/app-store.ts';
import { invoke } from '../../lib/bridge.ts';
import { Field, Select, Tabs, Toggle } from '../../ui/controls.tsx';
import { Icon, type IconName } from '../../ui/Icon.tsx';
import { Page, PageHeader, Section } from '../../ui/layout.tsx';
import { discardRecording, recorderStore, startRecording, stopRecording, togglePause } from './recorder.ts';
import { Waveform } from './Waveform.tsx';

const SOURCES: { id: AudioSource; icon: IconName }[] = [
  { id: 'both', icon: 'headphones' },
  { id: 'system', icon: 'monitor' },
  { id: 'microphone', icon: 'microphone' },
];

const CAPTURES: { id: RecordingCapture; label: string }[] = [
  { id: 'audio', label: t.record.capture.audio },
  { id: 'screen', label: t.record.capture.screen },
];

function RecordingPanel() {
  const { status, seconds, source } = recorderStore.use();
  const paused = status === 'paused';
  const saving = status === 'saving';
  return (
    <div className="recording-panel">
      <div className="recording-status">
        <span className={`rec-dot ${paused ? '' : 'live'}`} />
        <span>{saving ? t.record.status.saving : paused ? t.record.status.paused : t.record.status.recording}</span>
      </div>
      <div className="recording-timer">{formatClock(seconds)}</div>
      <Waveform source={source} />
      {source === 'both' && (
        <div className="legend">
          <span>
            <i className="swatch system" /> {t.record.legend.system}
          </span>
          <span>
            <i className="swatch microphone" /> {t.record.legend.microphone}
          </span>
        </div>
      )}
      <div className="recording-actions">
        <button className="btn btn-large" disabled={saving} onClick={discardRecording}>
          {t.record.discard}
        </button>
        <button className="btn btn-large" disabled={saving} onClick={togglePause}>
          <Icon name={paused ? 'play' : 'pause'} size={14} />
          {paused ? t.record.resume : t.record.pause}
        </button>
        <button className="btn btn-large btn-primary" disabled={saving} onClick={stopRecording}>
          <Icon name="stop" size={14} />
          {t.record.finish}
        </button>
      </div>
      <p className="footnote centered">{t.record.minimizeHint}</p>
    </div>
  );
}

function useMicrophones() {
  const [microphones, setMicrophones] = useState<MediaDeviceInfo[]>([]);
  useEffect(() => {
    const load = async () => {
      const devices = await navigator.mediaDevices.enumerateDevices();
      setMicrophones(devices.filter(({ kind, deviceId }) => kind === 'audioinput' && deviceId !== 'communications' && deviceId !== 'default'));
    };
    load();
    navigator.mediaDevices.addEventListener('devicechange', load);
    return () => navigator.mediaDevices.removeEventListener('devicechange', load);
  }, []);
  return microphones;
}

function ScreenPicker() {
  const { screenSourceId } = recorderStore.use();
  const [sources, setSources] = useState<CaptureSource[] | null>(null);

  const load = async () => {
    const found = await invoke('capture:listSources');
    setSources(found);
    if (!found.some(({ id }) => id === recorderStore.get().screenSourceId)) recorderStore.set({ screenSourceId: found.find(({ isScreen }) => isScreen)?.id ?? null });
  };

  useEffect(() => {
    load();
  }, []);

  return (
    <Section
      title={t.record.capture.sourcesLabel}
      action={
        <button className="btn btn-ghost btn-small btn-icon" title={t.record.capture.refresh} onClick={load}>
          <Icon name="refresh" size={14} />
        </button>
      }
    >
      {sources?.length === 0 && <p className="footnote">{t.record.capture.noSources}</p>}
      <div className="capture-sources" role="radiogroup" aria-label={t.record.capture.sourcesLabel}>
        {sources?.map(({ id, name, thumbnail }) => (
          <button key={id} className="capture-source" role="radio" aria-checked={id === screenSourceId} title={name} onClick={() => recorderStore.set({ screenSourceId: id })}>
            <img src={thumbnail} alt="" />
            <span>{name}</span>
          </button>
        ))}
      </div>
    </Section>
  );
}

function RecordingSetup() {
  const { settings } = appStore.use();
  const { status } = recorderStore.use();
  const microphones = useMicrophones();
  const microphoneOptions = [
    { id: 'default', label: t.record.defaultMicrophone },
    ...microphones.map(({ deviceId, label }) => ({ id: deviceId, label: label || t.record.microphone })),
  ];

  return (
    <>
      <Field label={t.record.capture.label}>
        <Tabs options={CAPTURES} value={settings.recordingCapture} onChange={(recordingCapture) => updateSettings({ recordingCapture })} />
      </Field>
      {settings.recordingCapture === 'screen' && <ScreenPicker />}

      <div className="source-cards" role="radiogroup" aria-label={t.record.sourceLabel}>
        {SOURCES.map(({ id, icon }) => (
          <button key={id} className="source-card" role="radio" aria-checked={settings.audioSource === id} onClick={() => updateSettings({ audioSource: id })}>
            <Icon name={icon} size={20} />
            <strong>{t.record.sources[id].title}</strong>
            <span>{t.record.sources[id].detail}</span>
          </button>
        ))}
      </div>

      <div className="panel-row">
        {settings.audioSource !== 'system' && (
          <Field label={t.record.microphone} wide>
            <Select value={settings.microphoneId} options={microphoneOptions} onChange={(microphoneId) => updateSettings({ microphoneId })} />
          </Field>
        )}
        <Toggle label={t.record.transcribeWhenDone} checked={settings.transcribeWhenDone} onChange={(transcribeWhenDone) => updateSettings({ transcribeWhenDone })} />
      </div>

      <button className="record-button" disabled={status === 'starting'} onClick={startRecording}>
        <span className="record-button-dot" />
        {status === 'starting' ? t.record.starting : t.record.start}
      </button>

      <div className="hints">
        {settings.recordingCapture === 'screen' && (
          <p>
            <Icon name="monitor" size={14} /> {t.record.capture.hint}
          </p>
        )}
        {settings.audioSource === 'both' && (
          <p>
            <Icon name="headphones" size={14} /> {t.record.headphonesHint}
          </p>
        )}
        <p>
          <Icon name="warning" size={14} /> {t.record.consentHint}
        </p>
      </div>
    </>
  );
}

export function RecordPage() {
  const { status } = recorderStore.use();
  const inProgress = status !== 'idle' && status !== 'starting';
  return (
    <Page>
      <PageHeader title={t.record.title} subtitle={t.record.subtitle} />
      {inProgress ? <RecordingPanel /> : <RecordingSetup />}
    </Page>
  );
}
