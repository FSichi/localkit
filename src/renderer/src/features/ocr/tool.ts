import { t } from '../../../../shared/i18n/index.ts';
import { navigate } from '../../app/app-store.ts';
import type { ToolDefinition } from '../../app/tool-definition.ts';
import { openOcr } from './ocr-store.ts';
import { OcrPage } from './OcrPage.tsx';

export const ocrTool: ToolDefinition = {
  id: 'ocr',
  group: 'files',
  label: t.ocr.title,
  description: t.ocr.subtitle,
  icon: 'scan',
  Page: OcrPage,
  fileActions: [
    {
      kinds: ['image', 'pdf'],
      label: t.home.actions.extractText,
      icon: 'scan',
      run(paths) {
        openOcr(paths);
        navigate({ page: 'ocr' });
      },
    },
  ],
};
