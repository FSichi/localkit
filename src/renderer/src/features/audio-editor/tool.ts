import { t } from '../../../../shared/i18n/index.ts';
import { navigate } from '../../app/app-store.ts';
import type { ToolDefinition } from '../../app/tool-definition.ts';
import { openAudioConversion, openAudioEditor } from './audio-editor-store.ts';
import { AudioEditorPage } from './AudioEditorPage.tsx';

export const audioEditorTool: ToolDefinition = {
  id: 'audioEditor',
  group: 'multimedia',
  label: t.audioEditor.title,
  description: t.audioEditor.subtitle,
  icon: 'wave',
  Page: AudioEditorPage,
  fileActions: [
    {
      kinds: ['audio'],
      label: t.home.actions.editAudio,
      icon: 'scissors',
      run([path]) {
        openAudioEditor(path);
        navigate({ page: 'audioEditor' });
      },
    },
    {
      kinds: ['audio'],
      label: t.home.actions.convertMedia,
      icon: 'refresh',
      run(paths) {
        openAudioConversion(paths);
        navigate({ page: 'audioEditor' });
      },
    },
  ],
};
