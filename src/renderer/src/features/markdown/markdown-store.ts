import type { MarkdownDocument } from '../../../../shared/markdown.ts';
import { notifyError } from '../../app/toasts.ts';
import { invoke } from '../../lib/bridge.ts';
import { createStore } from '../../lib/create-store.ts';
import { describeError } from '../../lib/errors.ts';
import { renderMarkdown, type RenderedMarkdown } from './markdown-render.ts';

export type OpenMarkdown = Omit<MarkdownDocument, 'text'> & RenderedMarkdown;

export const markdownStore = createStore<{ document: OpenMarkdown | null }>({ document: null });

export async function openMarkdown(path: string) {
  try {
    const document = await invoke('markdown:read', path);
    markdownStore.set({ document: { path: document.path, name: document.name, ...(await renderMarkdown(document)) } });
  } catch (error) {
    notifyError(describeError(error));
  }
}
