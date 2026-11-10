import { t } from '../../../../shared/i18n/index.ts';
import { AUDIO_FORMATS } from '../../../../shared/jobs.ts';
import { createStore } from '../../lib/create-store.ts';
import { Field, Tabs } from '../../ui/controls.tsx';
import { createBatch } from '../file-batch/batch-store.ts';
import { BatchTool } from '../file-batch/BatchTool.tsx';
import { OutputFolderPicker } from '../file-batch/OutputFolderPicker.tsx';

// Encoding uses the whole CPU: running two at once only slows both down.
const CONVERT_CONCURRENCY = 1;

const FORMATS = AUDIO_FORMATS.map((format) => ({ id: format, label: format.toUpperCase() }));

export const audioConvertBatch = createBatch(['audio'], CONVERT_CONCURRENCY);

const convertOptions = createStore<{ format: (typeof AUDIO_FORMATS)[number] }>({ format: 'mp3' });

export function AudioConvertMode() {
  const { files } = audioConvertBatch.use();
  const { format } = convertOptions.use();
  return (
    <BatchTool
      batch={audioConvertBatch}
      kinds={['audio']}
      dropTitle={t.audioEditor.convertDropTitle}
      dropDetail={t.audioEditor.dropDetail}
      actionLabel={t.audioEditor.runConvert(files.length)}
      onRun={() => audioConvertBatch.run(({ path }) => ({ type: 'media.convert', path, format }))}
    >
      {files.length > 0 && (
        <div className="panel">
          <Field label={t.media.outputFormat}>
            <Tabs options={FORMATS} value={format} onChange={(value) => convertOptions.set({ format: value })} />
          </Field>
          <OutputFolderPicker />
        </div>
      )}
    </BatchTool>
  );
}
