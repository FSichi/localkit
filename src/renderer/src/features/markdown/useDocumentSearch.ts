// Find in page. It paints matches with the CSS Highlight API, so the document's DOM is never touched.
import { useEffect, useMemo, useState, type RefObject } from 'react';
import { findMatches } from '../../../../shared/markdown.ts';

const MATCHES = 'md-search';
const CURRENT_MATCH = 'md-search-current';

interface TextSpan {
  node: Text;
  start: number;
}

function collectText(root: HTMLElement) {
  const spans: TextSpan[] = [];
  let text = '';
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode: (node) => (node.parentElement?.closest('.md-copy') ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT),
  });
  while (walker.nextNode()) {
    const node = walker.currentNode as Text;
    spans.push({ node, start: text.length });
    text += node.data;
  }
  return { spans, text };
}

/** The node and offset of a position in the joined text. Matches can span several nodes. */
function locate(spans: TextSpan[], position: number): [Text, number] {
  let low = 0;
  let high = spans.length - 1;
  while (low < high) {
    const middle = Math.ceil((low + high) / 2);
    if (spans[middle].start <= position) low = middle;
    else high = middle - 1;
  }
  return [spans[low].node, position - spans[low].start];
}

function findRanges(root: HTMLElement, query: string): Range[] {
  const { spans, text } = collectText(root);
  return findMatches(text, query).map((start) => {
    const range = document.createRange();
    range.setStart(...locate(spans, start));
    range.setEnd(...locate(spans, start + query.length - 1));
    range.setEnd(range.endContainer, range.endOffset + 1);
    return range;
  });
}

export function useDocumentSearch(articleRef: RefObject<HTMLElement | null>, query: string, contentKey: string) {
  const [index, setIndex] = useState(0);
  const ranges = useMemo(() => (articleRef.current ? findRanges(articleRef.current, query) : []), [query, contentKey]);

  useEffect(() => setIndex(0), [ranges]);

  useEffect(() => {
    CSS.highlights.set(MATCHES, new Highlight(...ranges));
    const current = ranges[index];
    if (current) {
      CSS.highlights.set(CURRENT_MATCH, new Highlight(current));
      current.startContainer.parentElement?.scrollIntoView({ block: 'center' });
    } else {
      CSS.highlights.delete(CURRENT_MATCH);
    }
    return () => {
      CSS.highlights.delete(MATCHES);
      CSS.highlights.delete(CURRENT_MATCH);
    };
  }, [ranges, index]);

  const move = (step: number) => {
    if (ranges.length) setIndex((index + step + ranges.length) % ranges.length);
  };

  return { count: ranges.length, position: ranges.length ? index + 1 : 0, next: () => move(1), previous: () => move(-1) };
}
