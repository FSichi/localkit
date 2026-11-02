import { t } from '../../../../shared/i18n/index.ts';
import { findModel, LANGUAGE_CODES, WHISPER_MODELS } from '../../../../shared/whisper-models.ts';
import { appStore, currentModelId, updateSettings } from '../../app/app-store.ts';
import { Field, Select } from '../../ui/controls.tsx';

const LANGUAGE_OPTIONS = LANGUAGE_CODES.map((id) => ({ id: id as string, label: t.languages[id] }));

/** Language and quality, the two choices behind any transcription. */
export function TranscriptionFields() {
  const { settings, supportsMaximumModel } = appStore.use();
  const modelId = currentModelId();
  const models = WHISPER_MODELS.filter((model) => !model.gpuOnly || supportsMaximumModel).map((model) => ({ id: model.id, label: t.models[model.tier].name }));

  return (
    <div className="panel-row">
      <Field label={t.transcribe.language}>
        <Select value={settings.language} options={LANGUAGE_OPTIONS} onChange={(language) => updateSettings({ language })} />
      </Field>
      <Field label={t.transcribe.quality}>
        <Select value={modelId} options={models} onChange={(id) => updateSettings({ modelId: id })} />
      </Field>
      <p className="field-note">{t.models[findModel(modelId).tier].description}</p>
    </div>
  );
}
