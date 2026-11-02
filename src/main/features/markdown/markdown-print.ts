// The page used to print a Markdown document: always light, whatever the app's theme.
import { escapeHtml } from '../../../shared/transcript-format.ts';

const PRINT_STYLES = `
  body { margin: 0; color: #16181c; font: 11pt/1.6 'Segoe UI', system-ui, sans-serif; }
  h1, h2, h3, h4 { line-height: 1.25; margin: 1.4em 0 0.5em; break-after: avoid; }
  h1 { font-size: 21pt; } h2 { font-size: 16pt; } h3 { font-size: 13pt; } h4 { font-size: 11pt; }
  body > :first-child { margin-top: 0; }
  a { color: #2f4fc2; text-decoration: none; }
  img { max-width: 100%; }
  blockquote { margin: 1em 0; padding-left: 1em; border-left: 3px solid #d5d7dc; color: #4e535c; }
  hr { border: 0; border-top: 1px solid #e3e4e8; margin: 1.5em 0; }
  table { border-collapse: collapse; margin: 1em 0; width: 100%; }
  th, td { border: 1px solid #d5d7dc; padding: 5px 9px; text-align: left; }
  tr { break-inside: avoid; }
  code { font: 9.5pt Consolas, 'Cascadia Mono', monospace; background: #f4f4f6; padding: 1px 4px; border-radius: 3px; }
  pre { background: #f4f4f6; padding: 10px 12px; border-radius: 6px; white-space: pre-wrap; overflow-wrap: anywhere; }
  pre code { background: none; padding: 0; }
  .md-blocked-image { color: #636873; font-style: italic; }
  .hljs-keyword, .hljs-selector-tag, .hljs-built_in, .hljs-doctag { color: #8b3fc7; }
  .hljs-string, .hljs-attr, .hljs-symbol, .hljs-bullet, .hljs-addition { color: #1d7f4c; }
  .hljs-number, .hljs-literal, .hljs-variable, .hljs-template-variable { color: #b35900; }
  .hljs-title, .hljs-section, .hljs-name, .hljs-type { color: #2f4fc2; }
  .hljs-comment, .hljs-quote, .hljs-meta { color: #636873; }
  .hljs-deletion { color: #b93a37; }
`;

export function markdownPrintDocument(title: string, body: string): string {
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>${escapeHtml(title)}</title><style>${PRINT_STYLES}</style></head><body>${body}</body></html>`;
}
