// Draws QR codes. PNG comes from a canvas (which allows a logo), SVG from the library.
import QRCode, { type QRCodeErrorCorrectionLevel } from 'qrcode';

export interface QrStyle {
  size: number;
  margin: number;
  foreground: string;
  background: string;
  correction: QRCodeErrorCorrectionLevel;
}

const LOGO_RATIO = 0.22;
const LOGO_PADDING_RATIO = 0.12;

const toLibraryOptions = ({ size, margin, foreground, background, correction }: QrStyle) => ({
  width: size,
  margin,
  errorCorrectionLevel: correction,
  color: { dark: foreground, light: background },
});

function drawLogo(canvas: HTMLCanvasElement, logo: HTMLImageElement, background: string) {
  const context = canvas.getContext('2d')!;
  const side = canvas.width * LOGO_RATIO;
  const padding = side * LOGO_PADDING_RATIO;
  const position = (canvas.width - side) / 2;
  context.fillStyle = background;
  context.beginPath();
  context.roundRect(position - padding, position - padding, side + padding * 2, side + padding * 2, padding);
  context.fill();
  context.drawImage(logo, position, position, side, side);
}

export async function drawQr(canvas: HTMLCanvasElement, payload: string, style: QrStyle, logo?: HTMLImageElement | null) {
  // The logo covers part of the code, so it needs the highest error correction.
  await QRCode.toCanvas(canvas, payload, toLibraryOptions(logo ? { ...style, correction: 'H' } : style));
  if (logo) drawLogo(canvas, logo, style.background);
}

export const renderQrSvg = (payload: string, style: QrStyle) => QRCode.toString(payload, { ...toLibraryOptions(style), type: 'svg' });

export async function canvasToPngBytes(canvas: HTMLCanvasElement): Promise<Uint8Array> {
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
  return new Uint8Array(await blob!.arrayBuffer());
}
