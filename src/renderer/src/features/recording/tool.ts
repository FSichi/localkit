import { t } from '../../../../shared/i18n/index.ts';
import type { ToolDefinition } from '../../app/tool-definition.ts';
import { RecordPage } from './RecordPage.tsx';

export const recordTool: ToolDefinition = {
  id: 'record',
  group: 'voice',
  label: t.record.title,
  description: t.record.subtitle,
  icon: 'record',
  Page: RecordPage,
};
