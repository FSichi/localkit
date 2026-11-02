import { useState, type DragEvent } from 'react';
import { invoke, pathForFile } from '../lib/bridge.ts';
import { Icon } from './Icon.tsx';

export function droppedPaths(event: DragEvent): string[] {
  return [...event.dataTransfer.files].map((file) => pathForFile(file)).filter(Boolean);
}

interface DropZoneProps {
  extensions: string[];
  onFiles: (paths: string[]) => void;
  title: string;
  detail: string;
  compact?: boolean;
}

export function DropZone({ extensions, onFiles, title, detail, compact }: DropZoneProps) {
  const [dragging, setDragging] = useState(false);

  const pickFiles = async () => {
    const paths = await invoke('dialog:pickFiles', extensions);
    if (paths.length) onFiles(paths);
  };

  return (
    <button
      className={`drop-zone ${dragging ? 'dragging' : ''} ${compact ? 'compact' : ''}`}
      onClick={pickFiles}
      onDragOver={(event) => {
        event.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(event) => {
        event.preventDefault();
        setDragging(false);
        const paths = droppedPaths(event);
        if (paths.length) onFiles(paths);
      }}
    >
      <span className="drop-zone-icon">
        <Icon name="upload" size={compact ? 16 : 20} />
      </span>
      <span className="drop-zone-text">
        <strong>{title}</strong>
        <span className="muted small">{detail}</span>
      </span>
    </button>
  );
}
