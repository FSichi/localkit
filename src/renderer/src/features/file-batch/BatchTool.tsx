// The common shape of a batch tool: drop zone, options, file list and action bar.
import type { ReactNode } from 'react';
import { extensionsFor, type SupportedFileKind } from '../../../../shared/files.ts';
import { DropZone } from '../../ui/DropZone.tsx';
import type { Batch, BatchFile } from './batch-store.ts';
import { BatchActions } from './BatchActions.tsx';
import { BatchList } from './BatchList.tsx';

interface BatchToolProps {
  batch: Batch;
  kinds: SupportedFileKind[];
  dropTitle: string;
  dropDetail: string;
  actionLabel: string;
  actionDisabled?: boolean;
  actionHint?: ReactNode;
  onRun: () => void;
  sortable?: boolean;
  onCompare?: (file: BatchFile) => void;
  /** Options shown once there are files. */
  children?: ReactNode;
}

export function BatchTool({ batch, kinds, dropTitle, dropDetail, actionLabel, actionDisabled, actionHint, onRun, sortable, onCompare, children }: BatchToolProps) {
  const { files } = batch.use();
  return (
    <>
      <DropZone extensions={extensionsFor(...kinds)} onFiles={batch.add} title={dropTitle} detail={dropDetail} compact={files.length > 0} />
      {children}
      <BatchList batch={batch} sortable={sortable} onCompare={onCompare} />
      <BatchActions batch={batch} label={actionLabel} disabled={actionDisabled} hint={actionHint} onRun={onRun} />
    </>
  );
}
