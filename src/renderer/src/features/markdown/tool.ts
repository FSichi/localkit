import { t } from '../../../../shared/i18n/index.ts';
import { navigate } from '../../app/app-store.ts';
import type { ToolDefinition } from '../../app/tool-definition.ts';
import { openMarkdown } from './markdown-store.ts';
import { MarkdownPage } from './MarkdownPage.tsx';

export const markdownTool: ToolDefinition = {
  id: 'markdown',
  group: 'files',
  label: t.markdown.title,
  description: t.markdown.subtitle,
  icon: 'book',
  Page: MarkdownPage,
  fileActions: [
    {
      kinds: ['markdown'],
      label: t.home.actions.readMarkdown,
      icon: 'book',
      run([path]) {
        openMarkdown(path);
        navigate({ page: 'markdown' });
      },
    },
  ],
};
