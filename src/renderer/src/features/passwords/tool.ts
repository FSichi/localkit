import { t } from '../../../../shared/i18n/index.ts';
import type { ToolDefinition } from '../../app/tool-definition.ts';
import { PasswordsPage } from './PasswordsPage.tsx';

export const passwordsTool: ToolDefinition = {
  id: 'passwords',
  group: 'utilities',
  label: t.passwords.title,
  description: t.passwords.subtitle,
  icon: 'key',
  Page: PasswordsPage,
};
