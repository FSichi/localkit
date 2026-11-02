import { t } from '../../../../shared/i18n/index.ts';
import type { ToolDefinition } from '../../app/tool-definition.ts';
import { QrPage } from './QrPage.tsx';

export const qrTool: ToolDefinition = {
  id: 'qr',
  group: 'utilities',
  label: t.qr.title,
  description: t.qr.subtitle,
  icon: 'qr',
  Page: QrPage,
};
