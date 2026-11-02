import { useEffect, useState } from 'react';
import { formatBytes } from '../../../../shared/format.ts';
import { t } from '../../../../shared/i18n/index.ts';
import type { DownloadableModel } from '../../../../shared/models.ts';
import { OCR_MODELS } from '../../../../shared/ocr-models.ts';
import type { ModelDownloadProgress, ModelState } from '../../../../shared/transcription.ts';
import { WHISPER_MODELS } from '../../../../shared/whisper-models.ts';
import { appStore, currentModelId, currentOcrModel, updateSettings } from '../../app/app-store.ts';
import { notify, notifyError } from '../../app/toasts.ts';
import { invoke, on } from '../../lib/bridge.ts';
import { describeError, isCancellation } from '../../lib/errors.ts';
import { Icon } from '../../ui/Icon.tsx';
import { ProgressBar } from '../../ui/ProgressBar.tsx';
import { ocrBatch } from '../ocr/ocr-store.ts';
import { stopEngine } from '../transcription/whisper-engine.ts';
import { transcriptionQueue } from '../transcription/transcription-queue.ts';

interface ModelEntry {
  model: DownloadableModel;
  name: string;
  description: string;
  available: boolean;
}

interface ModelRowProps {
  entry: ModelEntry;
  group: string;
  selected: boolean;
  state?: ModelState;
  download: ModelDownloadProgress | null;
  downloadBusy: boolean;
  onSelect: () => void;
  onDownload: () => void;
  onDelete: () => void;
}

function ModelRow({ entry, group, selected, state, download, downloadBusy, onSelect, onDownload, onDelete }: ModelRowProps) {
  const { profile } = appStore.use();
  const { model, name, description, available } = entry;
  return (
    <div className="row model-row">
      <label className="radio">
        <input type="radio" name={group} aria-label={name} disabled={!available} checked={selected} onChange={onSelect} />
        <span />
      </label>
      <span className="row-body">
        <span className="row-title">{name}</span>
        <span className="row-detail">{available ? description : t.settings.needsGpu}</span>
        {download && <ProgressBar fraction={download.doneBytes / download.totalBytes} />}
      </span>
      <span className="row-meta">{formatBytes(state?.bytes || model.bytes[profile])}</span>
      {download ? (
        <button className="btn btn-small" onClick={() => invoke('models:cancelDownload', model.id)}>
          {t.common.cancel}
        </button>
      ) : state?.downloaded ? (
        <>
          <span className="tag tag-ok">{t.settings.downloaded}</span>
          <button className="btn btn-ghost btn-small btn-icon" title={t.settings.deleteModel} onClick={onDelete}>
            <Icon name="trash" size={14} />
          </button>
        </>
      ) : (
        available && (
          <button className="btn btn-small" disabled={downloadBusy} onClick={onDownload}>
            <Icon name="download" size={13} /> {t.settings.download}
          </button>
        )
      )}
    </div>
  );
}

interface ModelListProps {
  group: string;
  entries: ModelEntry[];
  selectedId: string;
  /** Changes when the engine finishes something that can alter what is on disk. */
  revision: number;
  /** Why a model can't be deleted right now, if so. */
  busyMessage: string | null;
  onSelect: (id: string) => void;
  beforeDelete?: () => void;
}

function ModelList({ group, entries, selectedId, revision, busyMessage, onSelect, beforeDelete }: ModelListProps) {
  const { profile } = appStore.use();
  const [states, setStates] = useState<ModelState[]>([]);
  const [download, setDownload] = useState<ModelDownloadProgress | null>(null);

  const refresh = () => invoke('models:list', profile).then(setStates);
  useEffect(() => {
    refresh();
    const ownModels = new Set(entries.map(({ model }) => model.id));
    return on('models:progress', (progress) => {
      if (ownModels.has(progress.modelId)) setDownload(progress.doneBytes < progress.totalBytes ? progress : null);
    });
  }, [profile, revision]);

  const downloadModel = async (modelId: string) => {
    setDownload({ modelId, doneBytes: 0, totalBytes: 1 });
    try {
      await invoke('models:download', modelId, profile);
    } catch (error) {
      if (!isCancellation(error)) notifyError(describeError(error));
    }
    setDownload(null);
    refresh();
  };

  const deleteModel = async (modelId: string) => {
    if (busyMessage) return notify(busyMessage);
    beforeDelete?.();
    await invoke('models:delete', modelId);
    refresh();
    notify(t.settings.modelDeleted);
  };

  return (
    <div className="rows">
      {entries.map((entry) => (
        <ModelRow
          key={entry.model.id}
          entry={entry}
          group={group}
          selected={selectedId === entry.model.id}
          state={states.find(({ id }) => id === entry.model.id)}
          download={download?.modelId === entry.model.id ? download : null}
          downloadBusy={Boolean(download)}
          onSelect={() => onSelect(entry.model.id)}
          onDownload={() => downloadModel(entry.model.id)}
          onDelete={() => deleteModel(entry.model.id)}
        />
      ))}
    </div>
  );
}

export function TranscriptionModelList() {
  const { supportsMaximumModel } = appStore.use();
  const { jobs } = transcriptionQueue.use();
  const entries = WHISPER_MODELS.map((model) => ({ model, ...t.models[model.tier], available: !model.gpuOnly || supportsMaximumModel }));
  return (
    <ModelList
      group="transcription-model"
      entries={entries}
      selectedId={currentModelId()}
      revision={jobs.length}
      busyMessage={jobs.length ? t.settings.waitForTranscription : null}
      onSelect={(modelId) => updateSettings({ modelId })}
      beforeDelete={stopEngine}
    />
  );
}

export function OcrModelList() {
  const { running } = ocrBatch.use();
  const entries = OCR_MODELS.map((model) => ({ model, ...t.ocr.engines[model.tier], available: true }));
  return (
    <ModelList
      group="ocr-model"
      entries={entries}
      selectedId={currentOcrModel().id}
      revision={running ? 1 : 0}
      busyMessage={running ? t.settings.waitForOcr : null}
      onSelect={(ocrModelId) => updateSettings({ ocrModelId })}
    />
  );
}
