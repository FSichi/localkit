import type { ComponentType } from 'react';
import { extensionsFor } from '../../../../shared/files.ts';
import { t } from '../../../../shared/i18n/index.ts';
import type { JobRequest } from '../../../../shared/jobs.ts';
import { Tabs } from '../../ui/controls.tsx';
import { DropZone } from '../../ui/DropZone.tsx';
import { Page, PageHeader } from '../../ui/layout.tsx';
import { BatchTool } from '../file-batch/BatchTool.tsx';
import type { BatchFile, BatchTask } from '../file-batch/batch-store.ts';
import { BatchList } from '../file-batch/BatchList.tsx';
import { mediaBatch, mediaOptions, setMediaMode, type MediaMode } from './media-store.ts';
import { CompressPanel, ConvertPanel, ExtractAudioPanel, SubtitlesPanel } from './MediaPanels.tsx';
import { buildSubtitlesRequest } from './subtitle-request.ts';
import { TrimEditor } from './TrimEditor.tsx';

const MODE_TABS: { id: MediaMode; label: string }[] = [
  { id: 'compress', label: t.media.modes.compress },
  { id: 'convert', label: t.media.modes.convert },
  { id: 'extractAudio', label: t.media.modes.extractAudio },
  { id: 'trim', label: t.media.modes.trim },
  { id: 'subtitles', label: t.media.modes.subtitles },
];

interface BatchMode {
  Panel: ComponentType;
  actionLabel: (count: number) => string;
  buildRequest: (file: BatchFile, task: BatchTask) => JobRequest | Promise<JobRequest>;
}

/** Each mode is a panel plus a way to build the job. */
const BATCH_MODES: Record<Exclude<MediaMode, 'trim'>, BatchMode> = {
  compress: {
    Panel: CompressPanel,
    actionLabel: t.media.runCompress,
    buildRequest: ({ path }) => ({ type: 'video.compress', path, options: mediaOptions.get().compression }),
  },
  convert: {
    Panel: ConvertPanel,
    actionLabel: t.media.runConvert,
    buildRequest: ({ path }) => ({ type: 'media.convert', path, format: mediaOptions.get().convertFormat }),
  },
  extractAudio: {
    Panel: ExtractAudioPanel,
    actionLabel: t.media.runExtract,
    buildRequest: ({ path }) => ({ type: 'media.convert', path, format: mediaOptions.get().audioFormat }),
  },
  subtitles: {
    Panel: SubtitlesPanel,
    actionLabel: t.media.runSubtitles,
    buildRequest: buildSubtitlesRequest,
  },
};

function TrimMode() {
  const { files } = mediaBatch.use();
  const file = files[0];
  return (
    <>
      <DropZone extensions={extensionsFor('video', 'audio')} onFiles={(paths) => mediaBatch.add(paths.slice(0, 1))} title={t.media.dropTitle} detail={t.media.dropDetail} compact={files.length > 0} />
      <BatchList batch={mediaBatch} />
      {file && !file.analyzing && !file.unreadable && <TrimEditor key={file.id} file={file} />}
    </>
  );
}

function BatchModeView({ mode }: { mode: BatchMode }) {
  const { files } = mediaBatch.use();
  return (
    <BatchTool
      batch={mediaBatch}
      kinds={['video', 'audio']}
      dropTitle={t.media.dropTitle}
      dropDetail={t.media.dropDetail}
      actionLabel={mode.actionLabel(files.length)}
      onRun={() => mediaBatch.run(mode.buildRequest)}
    >
      {files.length > 0 && <mode.Panel />}
    </BatchTool>
  );
}

export function MediaPage() {
  const { mode } = mediaOptions.use();
  return (
    <Page>
      <PageHeader title={t.media.title} subtitle={t.media.subtitle} />
      <Tabs options={MODE_TABS} value={mode} onChange={setMediaMode} />
      {mode === 'trim' ? <TrimMode /> : <BatchModeView mode={BATCH_MODES[mode]} />}
    </Page>
  );
}
