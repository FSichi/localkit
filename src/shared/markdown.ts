// Markdown reader: pure helpers shared by the main process and the UI.

export const MARKDOWN_MAX_BYTES = 20 * 1024 * 1024;

export interface MarkdownDocument {
  path: string;
  name: string;
  text: string;
}

export interface MarkdownHeading {
  id: string;
  text: string;
  level: number;
}

const FRONT_MATTER = /^---\r?\n[\s\S]*?\r?\n---[ \t]*(?:\r?\n|$)/;

/** Metadata for other tools: rendered as Markdown it would show up as stray text. */
export function stripFrontMatter(text: string): string {
  return text.replace(FRONT_MATTER, '');
}

/** An id for a heading, unique among those already in `used`. */
export function uniqueSlug(text: string, used: Set<string>): string {
  const base = foldForSearch(text).trim().replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '') || 'seccion';
  let slug = base;
  for (let suffix = 2; used.has(slug); suffix++) slug = `${base}-${suffix}`;
  used.add(slug);
  return slug;
}

/** Ignores case and accents without changing the length, so positions still match the original. */
export function foldForSearch(text: string): string {
  return Array.from({ length: text.length }, (_, index) => {
    const folded = text[index].normalize('NFD')[0].toLowerCase();
    return folded.length === 1 ? folded : text[index];
  }).join('');
}

/** Where a query appears in a text, as start offsets. */
export function findMatches(text: string, query: string): number[] {
  const needle = foldForSearch(query);
  if (!needle) return [];
  const haystack = foldForSearch(text);
  const matches: number[] = [];
  for (let at = haystack.indexOf(needle); at !== -1; at = haystack.indexOf(needle, at + needle.length)) matches.push(at);
  return matches;
}

function decodePath(path: string): string | null {
  try {
    return decodeURIComponent(path);
  } catch {
    return null;
  }
}

/**
 * The file a relative link in a document points to, or null for anything else: other schemes,
 * absolute paths and network shares must never be reached just by opening a document.
 */
export function resolveRelativePath(documentPath: string, link: string): string | null {
  const relative = decodePath(link.split(/[?#]/)[0]);
  if (!relative || /^[a-z][a-z0-9+.-]*:/i.test(relative) || /^[\\/]/.test(relative)) return null;
  const parts = documentPath.split(/[\\/]/).slice(0, -1);
  for (const part of relative.split(/[\\/]/)) {
    if (part === '..') {
      if (parts.length <= 1) return null;
      parts.pop();
    } else if (part && part !== '.') {
      parts.push(part);
    }
  }
  return parts.join('\\');
}
