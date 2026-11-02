// The page editor: changes stay in memory until the document is saved as a new file.
import type { PDFDocumentProxy } from 'pdfjs-dist';
import { fileNameOf, withoutExtension } from '../../../../shared/files.ts';
import { t } from '../../../../shared/i18n/index.ts';
import type { PageImageFormat } from '../../../../shared/jobs.ts';
import { notify, notifyError, notifySaved } from '../../app/toasts.ts';
import { invoke } from '../../lib/bridge.ts';
import { createStore } from '../../lib/create-store.ts';
import { describeError } from '../../lib/errors.ts';
import { runSingleJob } from '../file-batch/batch-store.ts';
import { openPdfDocument, renderPage } from './pdf-render.ts';

export interface OrganizedPage {
  /** Position in the original document. */
  index: number;
  /** Clockwise, on top of what the page already has. */
  rotation: number;
  selected: boolean;
}

interface OrganizerState {
  path: string | null;
  pdf: PDFDocumentProxy | null;
  pages: OrganizedPage[];
  /** Saving or exporting, from 0 to 1. */
  fraction: number | null;
  imageFormat: PageImageFormat;
  imageQuality: number;
}

const FULL_TURN = 360;
const JPEG_QUALITY = 0.92;

export const organizer = createStore<OrganizerState>({ path: null, pdf: null, pages: [], fraction: null, imageFormat: 'png', imageQuality: 150 });

const initialPages = (count: number): OrganizedPage[] => Array.from({ length: count }, (_, index) => ({ index, rotation: 0, selected: false }));

export async function openOrganizer(path: string) {
  await organizer.get().pdf?.loadingTask.destroy();
  organizer.set({ path: null, pdf: null, pages: [] });
  try {
    const pdf = await openPdfDocument(path);
    organizer.set({ path, pdf, pages: initialPages(pdf.numPages) });
  } catch (error) {
    notifyError(describeError(error));
  }
}

export async function closeOrganizer() {
  await organizer.get().pdf?.loadingTask.destroy();
  organizer.set({ path: null, pdf: null, pages: [] });
}

export const resetPages = () => organizer.set({ pages: initialPages(organizer.get().pdf?.numPages ?? 0) });

const updatePages = (change: (pages: OrganizedPage[]) => OrganizedPage[]) => organizer.set({ pages: change(organizer.get().pages) });

export const togglePage = (index: number) => updatePages((pages) => pages.map((page) => (page.index === index ? { ...page, selected: !page.selected } : page)));

export function selectAll(selected: boolean) {
  updatePages((pages) => pages.map((page) => ({ ...page, selected })));
}

/** Acts on the selection, or on the given page when it is used from the page itself. */
const isTarget = (page: OrganizedPage, index?: number) => (index === undefined ? page.selected : page.index === index);

export function rotatePages(degrees: number, index?: number) {
  updatePages((pages) => pages.map((page) => (isTarget(page, index) ? { ...page, rotation: (page.rotation + degrees + FULL_TURN) % FULL_TURN } : page)));
}

export function removePages(index?: number) {
  updatePages((pages) => pages.filter((page) => !isTarget(page, index)));
}

export function movePage(index: number, beforeIndex: number) {
  if (index === beforeIndex) return;
  updatePages((pages) => {
    const moved = pages.find((page) => page.index === index);
    const rest = pages.filter((page) => page.index !== index);
    const position = rest.findIndex((page) => page.index === beforeIndex);
    return moved ? [...rest.slice(0, position), moved, ...rest.slice(position)] : pages;
  });
}

export function shiftPage(index: number, delta: number) {
  updatePages((pages) => {
    const from = pages.findIndex((page) => page.index === index);
    const to = from + delta;
    if (to < 0 || to >= pages.length) return pages;
    const shifted = [...pages];
    [shifted[from], shifted[to]] = [shifted[to], shifted[from]];
    return shifted;
  });
}

export async function savePages() {
  const { path, pages } = organizer.get();
  const output = await invoke('dialog:pickSavePath', `${withoutExtension(fileNameOf(path!))}${t.fileSuffixes.organized}.pdf`, 'pdf');
  if (!output) return;
  organizer.set({ fraction: 0 });
  try {
    await runSingleJob({ type: 'pdf.organize', path: path!, pages: pages.map(({ index, rotation }) => ({ index, rotation })), output }, (fraction) => organizer.set({ fraction }));
    notifySaved(t.pdf.saved, output);
  } catch (error) {
    notifyError(describeError(error));
  }
  organizer.set({ fraction: null });
}

const canvasBytes = async (canvas: HTMLCanvasElement, format: PageImageFormat) => {
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, `image/${format}`, JPEG_QUALITY));
  return new Uint8Array(await blob!.arrayBuffer());
};

/** The selection, or the whole document when nothing is selected. */
export async function exportPageImages() {
  const { path, pdf, pages, imageFormat, imageQuality } = organizer.get();
  const selected = pages.filter((page) => page.selected);
  const chosen = selected.length ? selected : pages;
  const folder = await invoke('dialog:pickFolder');
  if (!folder) return;
  const baseName = withoutExtension(fileNameOf(path!));
  const digits = String(pdf!.numPages).length;
  organizer.set({ fraction: 0 });
  try {
    for (const [position, { index, rotation }] of chosen.entries()) {
      const canvas = await renderPage(pdf!, index + 1, imageQuality, rotation);
      const name = `${baseName}-${String(position + 1).padStart(digits, '0')}`;
      await invoke('files:writeToFolder', folder, name, imageFormat === 'jpeg' ? 'jpg' : 'png', await canvasBytes(canvas, imageFormat));
      organizer.set({ fraction: (position + 1) / chosen.length });
    }
    notify(t.pdf.organize.imagesSaved(chosen.length), { action: { label: t.common.open, run: () => invoke('shell:openPath', folder) } });
  } catch (error) {
    notifyError(describeError(error));
  }
  organizer.set({ fraction: null });
}
