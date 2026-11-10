import { t } from '../../../../shared/i18n/index.ts';
import type { ToolDefinition } from '../../app/tool-definition.ts';
import { LibraryPage } from './LibraryPage.tsx';

export const libraryTool: ToolDefinition = {
  id: 'library',
  group: 'multimedia',
  label: t.library.title,
  description: t.library.subtitle,
  icon: 'library',
  Page: LibraryPage,
};
