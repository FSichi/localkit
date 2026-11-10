import { t } from '../../../../shared/i18n/index.ts';
import { navigate } from '../../app/app-store.ts';
import type { FileAction, ToolDefinition } from '../../app/tool-definition.ts';
import { openMedia, type MediaMode } from './media-store.ts';
import { MediaPage } from './MediaPage.tsx';

function mediaAction(kinds: FileAction['kinds'], label: string, icon: FileAction['icon'], mode: MediaMode): FileAction {
  return {
    kinds,
    label,
    icon,
    run(paths) {
      openMedia(paths, mode);
      navigate({ page: 'media' });
    },
  };
}

export const mediaTool: ToolDefinition = {
  id: 'media',
  group: 'multimedia',
  label: t.media.title,
  description: t.media.subtitle,
  icon: 'video',
  Page: MediaPage,
  fileActions: [
    mediaAction(['video'], t.home.actions.compressVideo, 'video', 'compress'),
    mediaAction(['video'], t.home.actions.convertMedia, 'refresh', 'convert'),
    mediaAction(['video'], t.home.actions.extractAudio, 'wave', 'extractAudio'),
    mediaAction(['video'], t.home.actions.trimMedia, 'scissors', 'trim'),
    mediaAction(['video'], t.home.actions.addSubtitles, 'text', 'subtitles'),
  ],
};
