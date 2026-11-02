import { t } from '../../../../shared/i18n/index.ts';
import { navigate } from '../../app/app-store.ts';
import type { ToolDefinition } from '../../app/tool-definition.ts';
import { imageBatch } from './image-store.ts';
import { ImagesPage } from './ImagesPage.tsx';

export const imagesTool: ToolDefinition = {
  id: 'images',
  group: 'files',
  label: t.images.title,
  description: t.images.subtitle,
  icon: 'image',
  Page: ImagesPage,
  fileActions: [
    {
      kinds: ['image'],
      label: t.home.actions.optimizeImages,
      icon: 'image',
      run(paths) {
        imageBatch.add(paths);
        navigate({ page: 'images' });
      },
    },
  ],
};
