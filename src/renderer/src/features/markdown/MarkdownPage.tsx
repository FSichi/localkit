import { useEffect, useRef, useState, type DragEvent, type MouseEvent, type RefObject } from 'react';
import { extensionsFor, fileKindOf, withoutExtension } from '../../../../shared/files.ts';
import { t } from '../../../../shared/i18n/index.ts';
import { resolveRelativePath, type MarkdownHeading } from '../../../../shared/markdown.ts';
import { notify, notifySaved } from '../../app/toasts.ts';
import { invoke } from '../../lib/bridge.ts';
import { droppedPaths, DropZone } from '../../ui/DropZone.tsx';
import { Icon } from '../../ui/Icon.tsx';
import { Page, PageHeader } from '../../ui/layout.tsx';
import { markdownStore, openMarkdown, type OpenMarkdown } from './markdown-store.ts';
import { useDocumentSearch } from './useDocumentSearch.ts';

const EXTENSIONS = extensionsFor('markdown');
/** How far below the top of the reader a heading counts as the current section. */
const ACTIVE_HEADING_OFFSET = 96;

function useActiveHeading(scrollerRef: RefObject<HTMLElement | null>, headings: MarkdownHeading[]) {
  const [active, setActive] = useState(headings[0]?.id ?? '');

  useEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller) return;
    const update = () => {
      const limit = scroller.getBoundingClientRect().top + ACTIVE_HEADING_OFFSET;
      let current = headings[0]?.id ?? '';
      for (const { id } of headings) {
        const element = document.getElementById(id);
        if (element && element.getBoundingClientRect().top <= limit) current = id;
      }
      // The last sections can't reach the top of the reader: at the end, the last one is the current one.
      const atEnd = scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight - 1;
      setActive(atEnd && scroller.scrollTop > 0 ? (headings.at(-1)?.id ?? '') : current);
    };
    update();
    scroller.addEventListener('scroll', update, { passive: true });
    return () => scroller.removeEventListener('scroll', update);
  }, [headings]);

  return active;
}

function SearchBox({ query, onChange, search }: { query: string; onChange: (query: string) => void; search: ReturnType<typeof useDocumentSearch> }) {
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const focusOnShortcut = (event: KeyboardEvent) => {
      if (event.ctrlKey && event.key.toLowerCase() === 'f') {
        event.preventDefault();
        input.current?.select();
      }
    };
    window.addEventListener('keydown', focusOnShortcut);
    return () => window.removeEventListener('keydown', focusOnShortcut);
  }, []);

  return (
    <label className="search md-search">
      <Icon name="search" size={14} />
      <input
        ref={input}
        value={query}
        placeholder={t.markdown.searchPlaceholder}
        aria-label={t.markdown.searchPlaceholder}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') (event.shiftKey ? search.previous : search.next)();
          if (event.key === 'Escape') onChange('');
        }}
      />
      {query && <span className="muted small numeric">{search.count ? `${search.position}/${search.count}` : t.markdown.noMatches}</span>}
      {search.count > 1 && (
        <>
          <button className="btn btn-ghost btn-small btn-icon" title={t.markdown.previousMatch} onClick={search.previous}>
            <Icon name="up" size={14} />
          </button>
          <button className="btn btn-ghost btn-small btn-icon" title={t.markdown.nextMatch} onClick={search.next}>
            <Icon name="down" size={14} />
          </button>
        </>
      )}
    </label>
  );
}

function Outline({ headings, active, onSelect }: { headings: MarkdownHeading[]; active: string; onSelect: (id: string) => void }) {
  const baseLevel = Math.min(...headings.map(({ level }) => level));
  return (
    <nav className="md-outline" aria-label={t.markdown.outline}>
      <h2 className="section-title">{t.markdown.outline}</h2>
      {headings.map(({ id, text, level }) => (
        <button key={id} className={`level-${level - baseLevel}`} aria-current={id === active ? 'location' : undefined} title={text} onClick={() => onSelect(id)}>
          {text}
        </button>
      ))}
    </nav>
  );
}

function Reader({ document: openDocument }: { document: OpenMarkdown }) {
  const { path, name, html, headings } = openDocument;
  const article = useRef<HTMLElement>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState('');
  const search = useDocumentSearch(article, query, html);
  const active = useActiveHeading(scroller, headings);

  useEffect(() => {
    scroller.current?.scrollTo({ top: 0 });
    setQuery('');
  }, [html]);

  const scrollToHeading = (id: string) => document.getElementById(id)?.scrollIntoView();

  const pickAnother = async () => {
    const [picked] = await invoke('dialog:pickFiles', EXTENSIONS);
    if (picked) openMarkdown(picked);
  };

  const exportPdf = async () => {
    const copy = article.current!.cloneNode(true) as HTMLElement;
    copy.querySelectorAll('.md-copy').forEach((button) => button.remove());
    const output = await invoke('markdown:exportPdf', withoutExtension(name), copy.innerHTML);
    if (output) notifySaved(t.markdown.exported, output);
  };

  const followLink = (href: string) => {
    if (href.startsWith('#')) return scrollToHeading(decodeURIComponent(href.slice(1)));
    if (/^https?:\/\//i.test(href)) return void window.open(href);
    const target = resolveRelativePath(path, href);
    if (target && fileKindOf(target) === 'markdown') openMarkdown(target);
  };

  const onClick = (event: MouseEvent) => {
    const target = event.target as HTMLElement;
    const copyButton = target.closest('.md-copy');
    if (copyButton) {
      invoke('clipboard:writeText', copyButton.parentElement?.querySelector('code')?.textContent ?? '');
      notify(t.markdown.copied);
      return;
    }
    const link = target.closest('a');
    if (link) {
      event.preventDefault();
      followLink(link.getAttribute('href') ?? '');
    }
  };

  const onDrop = (event: DragEvent) => {
    event.preventDefault();
    const [dropped] = droppedPaths(event).filter((candidate) => fileKindOf(candidate) === 'markdown');
    if (dropped) openMarkdown(dropped);
  };

  return (
    <div className="md-reader" onDragOver={(event) => event.preventDefault()} onDrop={onDrop}>
      <header className="md-toolbar">
        <strong className="md-title" title={path}>
          {name}
        </strong>
        <SearchBox query={query} onChange={setQuery} search={search} />
        <button className="btn btn-small" onClick={pickAnother}>
          <Icon name="file" size={14} /> {t.markdown.openAnother}
        </button>
        <button className="btn btn-small btn-icon" title={t.common.showInFolder} onClick={() => invoke('shell:showItem', path)}>
          <Icon name="folder" size={14} />
        </button>
        <button className="btn btn-small" onClick={exportPdf}>
          <Icon name="download" size={14} /> {t.markdown.exportPdf}
        </button>
      </header>
      <div className="md-body">
        {headings.length > 1 && <Outline headings={headings} active={active} onSelect={scrollToHeading} />}
        <div className="md-scroller" ref={scroller}>
          <article className="md-article" ref={article} onClick={onClick} dangerouslySetInnerHTML={{ __html: html }} />
        </div>
      </div>
    </div>
  );
}

export function MarkdownPage() {
  const { document: openDocument } = markdownStore.use();
  if (openDocument) return <Reader document={openDocument} />;
  return (
    <Page>
      <PageHeader title={t.markdown.title} subtitle={t.markdown.subtitle} />
      <DropZone extensions={EXTENSIONS} onFiles={([path]) => openMarkdown(path)} title={t.markdown.dropTitle} detail={t.markdown.dropDetail} />
      <p className="footnote">
        <Icon name="lock" size={13} /> {t.markdown.privacy}
      </p>
    </Page>
  );
}
