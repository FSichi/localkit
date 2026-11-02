import { useEffect, useState } from 'react';
import { extensionsFor } from '../../../../shared/files.ts';
import { t } from '../../../../shared/i18n/index.ts';
import type { LibraryItemSummary } from '../../../../shared/transcription.ts';
import { appStore, navigate } from '../../app/app-store.ts';
import { invoke } from '../../lib/bridge.ts';
import { DropZone } from '../../ui/DropZone.tsx';
import { Icon } from '../../ui/Icon.tsx';
import { Page, PageHeader, Section } from '../../ui/layout.tsx';
import { ProgressBar } from '../../ui/ProgressBar.tsx';
import { LibraryRow } from '../library/LibraryRow.tsx';
import { cancelJob, enqueueFiles, transcriptionQueue, type TranscriptionJob } from './transcription-queue.ts';
import { TranscriptionFields } from './TranscriptionFields.tsx';

const RECENT_COUNT = 5;

function JobCard({ job }: { job: TranscriptionJob }) {
  return (
    <div className="job">
      <div className="job-header">
        <div className="job-info">
          <strong>{job.title}</strong>
          <span>{job.detail}</span>
        </div>
        <button className="btn btn-ghost btn-small btn-icon" title={t.common.cancel} onClick={() => cancelJob(job.id)}>
          <Icon name="close" size={14} />
        </button>
      </div>
      {job.stage !== 'queued' && <ProgressBar fraction={job.fraction} />}
      {job.partialText && <p className="job-preview">{job.partialText}</p>}
    </div>
  );
}

export function TranscribePage() {
  const { libraryRevision } = appStore.use();
  const { jobs } = transcriptionQueue.use();
  const [recent, setRecent] = useState<LibraryItemSummary[]>([]);

  useEffect(() => {
    invoke('library:list', '').then((items) => setRecent(items.slice(0, RECENT_COUNT)));
  }, [libraryRevision]);

  return (
    <Page>
      <PageHeader title={t.transcribe.title} subtitle={t.transcribe.subtitle} />
      <DropZone extensions={extensionsFor('audio', 'video')} onFiles={enqueueFiles} title={t.transcribe.dropTitle} detail={t.transcribe.dropDetail} />

      <TranscriptionFields />

      {jobs.length > 0 && (
        <Section title={t.transcribe.inProgress}>
          <div className="stack">
            {jobs.map((job) => (
              <JobCard key={job.id} job={job} />
            ))}
          </div>
        </Section>
      )}

      {recent.length > 0 && (
        <Section
          title={t.transcribe.recent}
          action={
            <button className="link-button" onClick={() => navigate({ page: 'library' })}>
              {t.common.viewAll}
            </button>
          }
        >
          <div className="rows">
            {recent.map((item) => (
              <LibraryRow key={item.id} item={item} />
            ))}
          </div>
        </Section>
      )}

      {!recent.length && !jobs.length && (
        <p className="footnote">
          <Icon name="lock" size={13} /> {t.transcribe.privacy}
        </p>
      )}
    </Page>
  );
}
