import { t } from '../../../../shared/i18n/index.ts';
import { navigate } from '../../app/app-store.ts';
import type { FileAction, ToolDefinition } from '../../app/tool-definition.ts';
import { openPdf, type PdfMode } from './pdf-store.ts';
import { PdfPage } from './PdfPage.tsx';

function pdfAction(kinds: FileAction['kinds'], label: string, icon: FileAction['icon'], mode: PdfMode): FileAction {
  return {
    kinds,
    label,
    icon,
    run(paths) {
      openPdf(paths, mode);
      navigate({ page: 'pdf' });
    },
  };
}

export const pdfTool: ToolDefinition = {
  id: 'pdf',
  group: 'files',
  label: t.pdf.title,
  description: t.pdf.subtitle,
  icon: 'file',
  Page: PdfPage,
  fileActions: [
    pdfAction(['pdf'], t.home.actions.compressPdf, 'file', 'compress'),
    pdfAction(['pdf'], t.home.actions.mergePdf, 'library', 'merge'),
    pdfAction(['pdf'], t.home.actions.splitPdf, 'scissors', 'split'),
    pdfAction(['pdf'], t.home.actions.organizePdf, 'library', 'organize'),
    pdfAction(['image'], t.home.actions.imagesToPdf, 'file', 'fromImages'),
  ],
};
