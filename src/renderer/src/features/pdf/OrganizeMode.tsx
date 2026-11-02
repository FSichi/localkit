import { useEffect, useRef, useState } from 'react';
import { extensionsFor, fileNameOf } from '../../../../shared/files.ts';
import { t } from '../../../../shared/i18n/index.ts';
import type { PageImageFormat } from '../../../../shared/jobs.ts';
import { Field, Tabs } from '../../ui/controls.tsx';
import { DropZone } from '../../ui/DropZone.tsx';
import { Icon } from '../../ui/Icon.tsx';
import { ProgressBar } from '../../ui/ProgressBar.tsx';
import {
  closeOrganizer,
  exportPageImages,
  movePage,
  openOrganizer,
  organizer,
  removePages,
  resetPages,
  rotatePages,
  savePages,
  selectAll,
  shiftPage,
  togglePage,
  type OrganizedPage,
} from './organize-store.ts';
import { renderPage } from './pdf-render.ts';

const THUMBNAIL_PIXELS_PER_INCH = 40;
const THUMBNAIL_QUALITY = 0.8;
const QUARTER_TURN = 90;

const IMAGE_FORMATS: { id: PageImageFormat; label: string }[] = [
  { id: 'png', label: 'PNG' },
  { id: 'jpeg', label: 'JPG' },
];

const IMAGE_QUALITIES: { id: string; label: string }[] = [
  { id: '150', label: t.pdf.organize.qualities.screen },
  { id: '300', label: t.pdf.organize.qualities.print },
];

/** Pages draw when they come into view, so a long document opens at once. */
function Thumbnail({ index, rotation }: { index: number; rotation: number }) {
  const holder = useRef<HTMLDivElement>(null);
  const [image, setImage] = useState('');

  useEffect(() => {
    const observer = new IntersectionObserver(async ([entry]) => {
      if (!entry.isIntersecting) return;
      observer.disconnect();
      const canvas = await renderPage(organizer.get().pdf!, index + 1, THUMBNAIL_PIXELS_PER_INCH);
      setImage(canvas.toDataURL('image/jpeg', THUMBNAIL_QUALITY));
    });
    observer.observe(holder.current!);
    return () => observer.disconnect();
  }, [index]);

  return (
    <div ref={holder} className="page-thumbnail">
      {image && <img src={image} alt="" style={{ transform: `rotate(${rotation}deg)` }} />}
    </div>
  );
}

interface PageCardProps {
  page: OrganizedPage;
  position: number;
  onDragStart: () => void;
  onDrop: () => void;
}

function PageCard({ page, position, onDragStart, onDrop }: PageCardProps) {
  const { index, rotation, selected } = page;
  return (
    <div
      className={`page-card ${selected ? 'selected' : ''}`}
      draggable
      data-page={index + 1}
      onDragStart={onDragStart}
      onDragOver={(event) => event.preventDefault()}
      onDrop={(event) => {
        event.preventDefault();
        onDrop();
      }}
    >
      <button className="page-select" aria-pressed={selected} aria-label={t.pdf.organize.pageLabel(position + 1)} onClick={() => togglePage(index)}>
        <Thumbnail index={index} rotation={rotation} />
      </button>
      <div className="page-card-footer">
        <span className="numeric">{position + 1}</span>
        <button className="btn btn-ghost btn-small btn-icon" title={t.common.moveUp} onClick={() => shiftPage(index, -1)}>
          <Icon name="back" size={13} />
        </button>
        <button className="btn btn-ghost btn-small btn-icon" title={t.common.moveDown} onClick={() => shiftPage(index, 1)}>
          <Icon name="forward" size={13} />
        </button>
        <button className="btn btn-ghost btn-small btn-icon" title={t.pdf.organize.rotateRight} onClick={() => rotatePages(QUARTER_TURN, index)}>
          <Icon name="refresh" size={13} />
        </button>
        <button className="btn btn-ghost btn-small btn-icon" title={t.common.remove} onClick={() => removePages(index)}>
          <Icon name="close" size={13} />
        </button>
      </div>
    </div>
  );
}

function Toolbar() {
  const { path, pages, fraction, imageFormat, imageQuality } = organizer.use();
  const selection = pages.filter((page) => page.selected).length;
  const busy = fraction != null;
  return (
    <div className="panel">
      <div className="organize-header">
        <strong title={path ?? ''}>{fileNameOf(path ?? '')}</strong>
        <span className="muted small">{selection ? t.pdf.organize.selected(selection, pages.length) : t.batch.pages(pages.length)}</span>
        <button className="btn btn-ghost btn-small" onClick={() => selectAll(selection < pages.length)}>
          {selection < pages.length ? t.pdf.organize.selectAll : t.pdf.organize.selectNone}
        </button>
        <button className="btn btn-ghost btn-small" onClick={resetPages}>
          {t.pdf.organize.reset}
        </button>
        <button className="btn btn-ghost btn-small" onClick={closeOrganizer}>
          {t.pdf.organize.close}
        </button>
      </div>
      <div className="organize-actions">
        <button className="btn btn-small" disabled={!selection} onClick={() => rotatePages(-QUARTER_TURN)}>
          {t.pdf.organize.rotateLeft}
        </button>
        <button className="btn btn-small" disabled={!selection} onClick={() => rotatePages(QUARTER_TURN)}>
          {t.pdf.organize.rotateRight}
        </button>
        <button className="btn btn-small" disabled={!selection || selection === pages.length} onClick={() => removePages()}>
          <Icon name="trash" size={13} /> {t.common.delete}
        </button>
      </div>
      <div className="panel-row">
        <Field label={t.pdf.organize.imageFormat}>
          <Tabs options={IMAGE_FORMATS} value={imageFormat} onChange={(format) => organizer.set({ imageFormat: format })} />
        </Field>
        <Field label={t.pdf.organize.imageQuality}>
          <Tabs options={IMAGE_QUALITIES} value={String(imageQuality)} onChange={(quality) => organizer.set({ imageQuality: Number(quality) })} />
        </Field>
        <button className="btn" disabled={busy || !pages.length} onClick={exportPageImages}>
          <Icon name="image" size={14} /> {selection ? t.pdf.organize.exportSelected(selection) : t.pdf.organize.exportAll}
        </button>
        <button className="btn btn-primary" disabled={busy || !pages.length} onClick={savePages}>
          <Icon name="download" size={14} /> {t.pdf.organize.save}
        </button>
      </div>
      {busy && <ProgressBar fraction={fraction} />}
    </div>
  );
}

export function OrganizeMode() {
  const { pdf, pages } = organizer.use();
  const dragged = useRef<number | null>(null);

  if (!pdf) return <DropZone extensions={extensionsFor('pdf')} onFiles={([path]) => openOrganizer(path)} title={t.pdf.dropTitle} detail={t.pdf.organize.dropDetail} />;

  return (
    <>
      <Toolbar />
      <div className="page-grid">
        {pages.map((page, position) => (
          <PageCard
            key={page.index}
            page={page}
            position={position}
            onDragStart={() => (dragged.current = page.index)}
            onDrop={() => {
              if (dragged.current !== null) movePage(dragged.current, page.index);
              dragged.current = null;
            }}
          />
        ))}
      </div>
    </>
  );
}
