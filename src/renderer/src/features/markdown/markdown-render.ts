// Turns Markdown into safe HTML. A document is untrusted content from any source, so it never gets
// to run scripts, load anything remote or reach outside its folder just by being opened.
import DOMPurify from 'dompurify';
import hljs from 'highlight.js/lib/common';
import { marked } from 'marked';
import { fileKindOf } from '../../../../shared/files.ts';
import { t } from '../../../../shared/i18n/index.ts';
import { resolveRelativePath, stripFrontMatter, uniqueSlug, type MarkdownDocument, type MarkdownHeading } from '../../../../shared/markdown.ts';
import { invoke } from '../../lib/bridge.ts';

export interface RenderedMarkdown {
  html: string;
  headings: MarkdownHeading[];
}

const FORBIDDEN_TAGS = ['style', 'form', 'button', 'select', 'textarea', 'iframe', 'object', 'embed', 'video', 'audio', 'source', 'picture'];
const FORBIDDEN_ATTRIBUTES = ['style', 'srcset'];
const OUTLINE_LEVELS = 'h1, h2, h3';
const ALL_HEADINGS = 'h1, h2, h3, h4, h5, h6';
const MAX_HIGHLIGHTED_CHARS = 100_000;

async function resolveImages(root: DocumentFragment, documentPath: string) {
  await Promise.all(
    [...root.querySelectorAll('img')].map(async (image) => {
      const source = image.getAttribute('src') ?? '';
      if (source.startsWith('data:image/')) return;
      const path = resolveRelativePath(documentPath, source);
      if (path && fileKindOf(path) === 'image') {
        image.src = await invoke('files:mediaUrl', path);
        return;
      }
      const placeholder = image.ownerDocument.createElement('span');
      placeholder.className = 'md-blocked-image';
      placeholder.textContent = image.alt ? `${t.markdown.blockedImage}: ${image.alt}` : t.markdown.blockedImage;
      image.replaceWith(placeholder);
    }),
  );
}

/** Task lists are the only form element a document needs. */
function removeFormControls(root: DocumentFragment) {
  root.querySelectorAll('input:not([type="checkbox"])').forEach((input) => input.remove());
}

function highlightCode(root: DocumentFragment) {
  for (const code of root.querySelectorAll<HTMLElement>('pre code')) {
    const language = code.className.match(/language-([\w+#-]+)/)?.[1];
    if (language && hljs.getLanguage(language) && (code.textContent?.length ?? 0) <= MAX_HIGHLIGHTED_CHARS) hljs.highlightElement(code);
  }
}

function addCopyButtons(root: DocumentFragment) {
  for (const block of root.querySelectorAll('pre')) {
    const button = block.ownerDocument.createElement('button');
    button.className = 'md-copy btn btn-small';
    button.textContent = t.common.copy;
    block.append(button);
  }
}

function labelHeadings(root: DocumentFragment): MarkdownHeading[] {
  const used = new Set<string>();
  const headings: MarkdownHeading[] = [];
  for (const heading of root.querySelectorAll(ALL_HEADINGS)) {
    const text = heading.textContent ?? '';
    heading.id = uniqueSlug(text, used);
    if (heading.matches(OUTLINE_LEVELS)) headings.push({ id: heading.id, text, level: Number(heading.tagName[1]) });
  }
  return headings;
}

export async function renderMarkdown({ path, text }: MarkdownDocument): Promise<RenderedMarkdown> {
  const html = marked.parse(stripFrontMatter(text), { async: false, gfm: true });
  // The fragment belongs to an inert document, so nothing loads until the result is on the page.
  const root = DOMPurify.sanitize(html, {
    USE_PROFILES: { html: true },
    FORBID_TAGS: FORBIDDEN_TAGS,
    FORBID_ATTR: FORBIDDEN_ATTRIBUTES,
    RETURN_DOM_FRAGMENT: true,
  });
  removeFormControls(root);
  await resolveImages(root, path);
  highlightCode(root);
  addCopyButtons(root);
  const headings = labelHeadings(root);
  const container = root.ownerDocument.createElement('div');
  container.append(root);
  return { html: container.innerHTML, headings };
}
