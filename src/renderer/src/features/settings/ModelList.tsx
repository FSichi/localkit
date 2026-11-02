import { useEffect, useState } from 'react';
import { formatBytes } from '../../../../shared/format.ts';
import { t } from '../../../../shared/i18n/index.ts';
import type { ModelDownloadProgress, ModelState } from '../../../../shared/transcription.ts';
import { WHISPER_MODELS, type WhisperModel } from '../../../../shared/whisper-models.ts';
import { appStore, currentModelId, updateSettings } from '../../app/app-store.ts';
import { notify, notifyError } from '../../app/toasts.ts';
import { invoke, on } from '../../lib/bridge.ts';
import { describeError, isCancellation } from '../../lib/errors.ts';
import { Icon } from '../../ui/Icon.tsx';
import { ProgressBar } from '../../ui/ProgressBar.tsx';
import { stopEngine } from '../transcription/whisper-engine.ts';
import { transcriptionQueue } from '../transcription/transcription-queue.ts';

interface ModelRowProps {
  model: WhisperModel;
  state?: ModelState;
  download: ModelDownloadProgress | null;
  downloadBusy: boolean;
  onDownload: () => void;
  onDelete: () => void;
}

function ModelRow({ model, state, download, downloadBusy, onDownload, onDelete }: ModelRowProps) {
  const { profile, supportsMaximumModel } = appStore.use();
  const available = !model.gpuOnly || supportsMaximumModel;
  const labels = t.models[model.tier];
  return (
    <div className="row model-row">
      <label className="radio">
        <input type="radio" name="model" aria-label={labels.name} disabled={!available} checked={currentModelId() === model.id} onChange={() => updateSettings({ modelId: model.id })} />
        <span />
      </label>
      <span className="row-body">
        <span className="row-title">{labels.name}</span>
        <span className="row-detail">{available ? labels.description : t.settings.needsGpu}</span>
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

export function ModelList() {
  const { profile } = appStore.use();
  const { jobs } = transcriptionQueue.use();
  const [states, setStates] = useState<ModelState[]>([]);
  const [download, setDownload] = useState<ModelDownloadProgress | null>(null);

  const refresh = () => invoke('models:list', profile).then(setStates);
  useEffect(() => {
    refresh();
    return on('models:progress', (progress) => setDownload(progress.doneBytes < progress.totalBytes ? progress : null));
  }, [profile, jobs.length]);

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
    if (jobs.length) return notify(t.settings.waitForTranscription);
    stopEngine();
    await invoke('models:delete', modelId);
    refresh();
    notify(t.settings.modelDeleted);
  };

  return (
    <div className="rows">
      {WHISPER_MODELS.map((model) => (
        <ModelRow
          key={model.id}
          model={model}
          state={states.find(({ id }) => id === model.id)}
          download={download?.modelId === model.id ? download : null}
          downloadBusy={Boolean(download)}
          onDownload={() => downloadModel(model.id)}
          onDelete={() => deleteModel(model.id)}
        />
      ))}
    </div>
  );
}
