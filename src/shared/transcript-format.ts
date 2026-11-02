// Turns segments into paragraphs and export formats. No dependencies, usable anywhere.
import { formatClock, formatSrtClock } from './format.ts';
import { t } from './i18n/index.ts';
import type { Segment, Speaker } from './transcription.ts';

export interface Paragraph {
  start: number;
  end: number;
  text: string;
  speaker?: Speaker;
}

const PARAGRAPH_PAUSE_SECONDS = 1;
const PARAGRAPH_MAX_CHARACTERS = 280;
const MIN_SUBTITLE_SECONDS = 0.5;

export function toParagraphs(segments: Segment[]): Paragraph[] {
  const paragraphs: Paragraph[] = [];
  let current: Paragraph | null = null;
  for (const segment of segments) {
    const pause = current ? segment.start - current.end : 0;
    const tooLong = current && current.text.length > PARAGRAPH_MAX_CHARACTERS && /[.?!…]$/.test(current.text);
    if (!current || current.speaker !== segment.speaker || pause > PARAGRAPH_PAUSE_SECONDS || tooLong) {
      current = { start: segment.start, end: segment.end, text: segment.text, speaker: segment.speaker };
      paragraphs.push(current);
    } else {
      current.text += ` ${segment.text}`;
      current.end = segment.end;
    }
  }
  return paragraphs;
}

export function countWords(segments: Segment[]): number {
  return segments.reduce((total, segment) => total + segment.text.split(/\s+/).filter(Boolean).length, 0);
}

function linePrefix(paragraph: Paragraph, withTimestamps: boolean): string {
  const parts: string[] = [];
  if (withTimestamps) parts.push(`[${formatClock(paragraph.start)}]`);
  if (paragraph.speaker) parts.push(`${t.speakers[paragraph.speaker]}:`);
  return parts.length ? `${parts.join(' ')} ` : '';
}

export function toPlainText(segments: Segment[], withTimestamps: boolean): string {
  return `${toParagraphs(segments).map((p) => linePrefix(p, withTimestamps) + p.text).join('\n\n')}\n`;
}

export function toSrt(segments: Segment[]): string {
  return segments
    .map((segment, index) => {
      const end = Math.max(segment.end, segment.start + MIN_SUBTITLE_SECONDS);
      const speaker = segment.speaker ? `${t.speakers[segment.speaker]}: ` : '';
      return `${index + 1}\n${formatSrtClock(segment.start)} --> ${formatSrtClock(end)}\n${speaker}${segment.text}\n`;
    })
    .join('\n');
}

export function toMarkdown(title: string, subtitle: string, segments: Segment[], withTimestamps: boolean): string {
  const body = toParagraphs(segments).map((paragraph) => {
    const marks: string[] = [];
    if (withTimestamps) marks.push(`\`${formatClock(paragraph.start)}\``);
    if (paragraph.speaker) marks.push(`**${t.speakers[paragraph.speaker]}:**`);
    return (marks.length ? `${marks.join(' ')} ` : '') + paragraph.text;
  });
  return `# ${title}\n\n_${subtitle}_\n\n${body.join('\n\n')}\n`;
}

const escapeHtml = (value: string) =>
  value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** HTML document that gets printed to PDF. */
export function toHtmlDocument(title: string, subtitle: string, segments: Segment[], withTimestamps: boolean): string {
  const body = toParagraphs(segments)
    .map((paragraph) => {
      const time = withTimestamps ? `<span class="time">${formatClock(paragraph.start)}</span>` : '';
      const speaker = paragraph.speaker ? `<span class="speaker ${paragraph.speaker}">${t.speakers[paragraph.speaker]}</span>` : '';
      return `<p>${time}${speaker}${escapeHtml(paragraph.text)}</p>`;
    })
    .join('\n');
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>${escapeHtml(title)}</title><style>
body{font:11.5pt/1.65 "Segoe UI",system-ui,sans-serif;color:#16181c;margin:0}
h1{font-size:20pt;letter-spacing:-.02em;margin:0 0 4pt;font-weight:600}
.subtitle{color:#636873;font-size:10pt;margin:0 0 22pt;padding-bottom:12pt;border-bottom:1px solid #e3e4e8}
p{margin:0 0 10pt}
.time{color:#636873;font-size:9pt;margin-right:7pt;font-variant-numeric:tabular-nums}
.speaker{font-weight:600;margin-right:6pt}.speaker.me{color:#2f4fc2}.speaker.others{color:#1d7f4c}
</style></head><body><h1>${escapeHtml(title)}</h1><p class="subtitle">${escapeHtml(subtitle)}</p>${body}</body></html>`;
}
