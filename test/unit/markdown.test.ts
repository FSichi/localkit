import { test } from 'node:test';
import assert from 'node:assert/strict';
import { findMatches, foldForSearch, resolveRelativePath, stripFrontMatter, uniqueSlug } from '../../src/shared/markdown.ts';

const DOCUMENT = 'C:\\Docs\\notes\\readme.md';

test('front matter is removed, and a rule in the text is not mistaken for it', () => {
  assert.equal(stripFrontMatter('---\ntitle: Hola\n---\n# Texto'), '# Texto');
  assert.equal(stripFrontMatter('---\r\ntitle: Hola\r\n---\r\n# Texto'), '# Texto');
  assert.equal(stripFrontMatter('# Texto\n\n---\n\nFin'), '# Texto\n\n---\n\nFin');
});

test('heading slugs are readable and unique', () => {
  const used = new Set<string>();
  assert.equal(uniqueSlug('¿Cómo instalar?', used), 'como-instalar');
  assert.equal(uniqueSlug('Cómo instalar', used), 'como-instalar-2');
  assert.equal(uniqueSlug('???', used), 'seccion');
});

test('folding keeps the length, so offsets match the original text', () => {
  assert.equal(foldForSearch('Canción AÑO'), 'cancion ano');
  assert.equal(foldForSearch('a😀b').length, 'a😀b'.length);
});

test('search ignores case and accents and does not overlap', () => {
  assert.deepEqual(findMatches('Canción, cancion y CANCIÓN', 'cancion'), [0, 9, 19]);
  assert.deepEqual(findMatches('aaaa', 'aa'), [0, 2]);
  assert.deepEqual(findMatches('texto', ''), []);
  assert.deepEqual(findMatches('texto', 'nada'), []);
});

test('relative links resolve next to the document', () => {
  assert.equal(resolveRelativePath(DOCUMENT, 'images/a.png'), 'C:\\Docs\\notes\\images\\a.png');
  assert.equal(resolveRelativePath(DOCUMENT, './a.png'), 'C:\\Docs\\notes\\a.png');
  assert.equal(resolveRelativePath(DOCUMENT, '../a%20b.png'), 'C:\\Docs\\a b.png');
  assert.equal(resolveRelativePath(DOCUMENT, 'other.md#section'), 'C:\\Docs\\notes\\other.md');
});

test('a document cannot reach outside relative paths', () => {
  for (const link of ['https://a.com/x.png', '//server/share/x.png', '\\\\server\\share\\x.png', 'C:\\Windows\\x.png', 'C:x.png', '/x.png', 'file:///C:/x.png', '../../../../x.png', '%ZZ', '']) {
    assert.equal(resolveRelativePath(DOCUMENT, link), null, link);
  }
});
