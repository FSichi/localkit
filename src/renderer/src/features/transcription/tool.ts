import { t } from '../../../../shared/i18n/index.ts';
import { navigate } from '../../app/app-store.ts';
import type { ToolDefinition } from '../../app/tool-definition.ts';
import { enqueueFiles } from './transcription-queue.ts';
import { TranscribePage } from './TranscribePage.tsx';

export const transcribeTool: ToolDefinition = {
  id: 'transcribe',
  group: 'multimedia',
  label: t.transcribe.title,
  description: t.transcribe.subtitle,
  icon: 'text',
  Page: TranscribePage,
  fileActions: [
    {
      kinds: ['video', 'audio'],
      label: t.home.actions.transcribe,
      icon: 'text',
      run(paths) {
        enqueueFiles(paths);
        navigate({ page: 'transcribe' });
      },
    },
  ],
};
