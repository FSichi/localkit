// Text recognition results and the pure logic around them.

/** A line of text, positioned in pixels of the image that was read. */
export interface OcrLine {
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface OcrPage {
  imageWidth: number;
  imageHeight: number;
  lines: OcrLine[];
}

export interface PageBox {
  x: number;
  y: number;
  width: number;
  height: number;
  /** Clockwise, as stored in the PDF. */
  rotation: number;
}

export interface TextPlacement {
  x: number;
  y: number;
  /** Counterclockwise, in degrees. */
  angle: number;
  /** Length of the line on the page, in points. */
  length: number;
}

const SPANISH_MARKS = /[¿ñáéíóú]/i;
const CHINESE_CHARACTER = /\p{Script=Han}/gu;
const LATIN_LETTER = /\p{Script=Latin}/gu;
/** Below this share of the letters, Chinese characters are icons the model mistook for text. */
const MAX_STRAY_SHARE = 0.03;
/** Text sits above the bottom of its box, and descenders reach below that line. */
const BASELINE_RAISE = 0.2;

/**
 * The model doesn't know "¡", so a Spanish sentence that closes with "!" gets it back at its start.
 * A line starting with a capital counts as a new sentence, so titles don't swallow the one below.
 */
export function restoreOpeningExclamations(text: string): string {
  if (!SPANISH_MARKS.test(text)) return text;
  let result = '';
  let sentenceStart = 0;
  for (let index = 0; index < text.length; index++) {
    result += text[index];
    const closes = /[.?!…]/.test(text[index]);
    const newLine = text[index] === '\n' && /\p{Lu}/u.test(text[index + 1] ?? '');
    if (text[index] === '!' && !result.slice(sentenceStart).includes('¡')) {
      result = `${result.slice(0, sentenceStart)}¡${result.slice(sentenceStart)}`;
    }
    if ((closes && !/[.?!…]/.test(text[index + 1] ?? '')) || newLine) {
      sentenceStart = result.length;
      while (/\s/.test(text[index + 1 + (sentenceStart - result.length)] ?? '')) sentenceStart++;
    }
  }
  return result;
}

/** The model reads Chinese too, so in a Western text it turns icons into stray characters. */
export function removeStrayCharacters(text: string): string {
  const chinese = text.match(CHINESE_CHARACTER)?.length ?? 0;
  const latin = text.match(LATIN_LETTER)?.length ?? 0;
  if (!chinese || chinese > latin * MAX_STRAY_SHARE) return text;
  return text.replace(/\p{Script=Han}[ \t]*/gu, '');
}

/** Where a line read from a rendered page goes on the PDF page, whatever its rotation. */
export function toPagePlacement(line: OcrLine, page: OcrPage, box: PageBox): TextPlacement {
  const quarterTurned = box.rotation % 180 !== 0;
  const viewWidth = quarterTurned ? box.height : box.width;
  const viewHeight = quarterTurned ? box.width : box.height;
  const scale = viewWidth / page.imageWidth;
  const viewX = line.x * scale;
  const viewY = viewHeight - (line.y + line.height * (1 - BASELINE_RAISE)) * scale;
  const placements: Record<number, [number, number]> = {
    0: [viewX, viewY],
    90: [box.width - viewY, viewX],
    180: [box.width - viewX, box.height - viewY],
    270: [viewY, box.height - viewX],
  };
  const [x, y] = placements[box.rotation];
  return { x: box.x + x, y: box.y + y, angle: box.rotation, length: line.width * scale };
}
