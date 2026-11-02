import { formatClock } from '../../../shared/format.ts';
import { t } from '../../../shared/i18n/index.ts';
import { recorderStore } from '../features/recording/recorder.ts';
import { transcriptionQueue } from '../features/transcription/transcription-queue.ts';
import { UpdateBadge } from '../features/updates/UpdateDialogs.tsx';
import { Icon, type IconName } from '../ui/Icon.tsx';
import { ProgressBar } from '../ui/ProgressBar.tsx';
import { appStore, navigate, type Route } from './app-store.ts';
import { TOOL_GROUPS, toolsInGroup } from './tools.ts';

function activePage(route: Route): Route['page'] {
  return route.page === 'item' ? 'library' : route.page;
}

function NavLink({ route, label, icon, current }: { route: Route; label: string; icon: IconName; current: Route['page'] }) {
  return (
    <button className="nav-link" aria-current={current === route.page ? 'page' : undefined} onClick={() => navigate(route)}>
      <Icon name={icon} />
      {label}
    </button>
  );
}

function ActivityStatus() {
  const { status, seconds } = recorderStore.use();
  const { jobs } = transcriptionQueue.use();
  const activeJob = jobs.find((job) => job.stage !== 'queued') ?? jobs[0];
  const recording = status === 'recording' || status === 'paused';
  if (!recording && !activeJob) return null;
  return (
    <div className="activity">
      {recording && (
        <button className="activity-card" onClick={() => navigate({ page: 'record' })}>
          <span className={`rec-dot ${status === 'recording' ? 'live' : ''}`} />
          <span>{status === 'recording' ? t.record.status.recording : t.record.status.paused}</span>
          <span className="muted numeric">{formatClock(seconds)}</span>
        </button>
      )}
      {activeJob && (
        <button className="activity-card stacked" onClick={() => navigate({ page: 'transcribe' })}>
          <span className="activity-row">
            <span>{t.transcribe.title}</span>
            {jobs.length > 1 && <span className="muted">+{jobs.length - 1}</span>}
          </span>
          <ProgressBar fraction={activeJob.fraction} />
        </button>
      )}
    </div>
  );
}

export function Sidebar() {
  const { route } = appStore.use();
  const current = activePage(route);
  return (
    <nav className="sidebar" aria-label={t.nav.sections}>
      <div className="brand">
        <span className="brand-logo">
          <Icon name="wave" size={17} />
        </span>
        {t.app.name}
      </div>
      <NavLink route={{ page: 'home' }} label={t.nav.home} icon="home" current={current} />
      {TOOL_GROUPS.map((group) => (
        <div key={group} className="nav-group">
          <span className="nav-group-title">{t.nav.groups[group]}</span>
          {toolsInGroup(group).map((tool) => (
            <NavLink key={tool.id} route={{ page: tool.id }} label={tool.label} icon={tool.icon} current={current} />
          ))}
        </div>
      ))}
      <div className="sidebar-footer">
        <UpdateBadge />
        <ActivityStatus />
        <NavLink route={{ page: 'settings' }} label={t.settings.title} icon="settings" current={current} />
      </div>
    </nav>
  );
}
