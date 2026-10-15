import { useEffect, useMemo, useState } from 'react';
import { useLaunchParticipantCoursePackage } from '@workspace/api-client-react';
import type { CoursePackageLaunch, CourseScormProgressInput } from '@workspace/api-client-react';
import { Scorm12API, Scorm2004API } from 'scorm-again';
import { AlertCircle, ArrowLeft, BookOpen, LoaderCircle } from 'lucide-react';
import { t, useAppLanguage } from './language';
import { AccessibleDialogSurface } from './accessible-dialog';
import './course-package-player.css';

const basePath = import.meta.env.BASE_URL.replace(/\/$/, '');

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? value as Record<string, unknown> : {};
}

function normalizedCommit(commit: unknown): CourseScormProgressInput {
  const outer = asRecord(commit);
  const runtime = asRecord(outer.runtimeData);
  const cmi = asRecord(runtime.cmi || outer.cmi || runtime);
  const core = asRecord(cmi.core);
  const statusText = String(cmi.completion_status || cmi.lesson_status || core.lesson_status || 'unknown').toLowerCase();
  const successText = String(cmi.success_status || (statusText === 'passed' || statusText === 'failed' ? statusText : 'unknown')).toLowerCase();
  const raw = cmi.score_raw ?? asRecord(cmi.score).raw ?? outer.scoreRaw;
  const scaled = cmi.score_scaled ?? asRecord(cmi.score).scaled ?? outer.scoreScaled;
  return {
    state: outer,
    completionStatus: ['completed', 'passed', 'failed'].includes(statusText) ? 'completed' : ['incomplete', 'not_attempted'].includes(statusText) ? statusText as CourseScormProgressInput['completionStatus'] : 'unknown',
    successStatus: successText === 'passed' || successText === 'failed' ? successText : 'unknown',
    scoreRaw: raw === undefined || raw === null || raw === '' ? null : Number(raw),
    scoreScaled: scaled === undefined || scaled === null || scaled === '' ? null : Number(scaled),
    location: String(cmi.location ?? core.lesson_location ?? ''),
    suspendData: String(cmi.suspend_data ?? ''),
  };
}

function packageResourceUrl(materialId: number, path: string) {
  const safePath = path.split('/').map(part => encodeURIComponent(part)).join('/');
  return `${basePath}/api/participant/courses/materials/${materialId}/package/${safePath}`;
}

function withXapiParameters(url: string, launch: CoursePackageLaunch) {
  if (!launch.xapi) return url;
  const apiUrl = launch.xapi.endpoint.startsWith('/')
    ? new URL(`${basePath}${launch.xapi.endpoint}`, window.location.origin)
    : new URL(launch.xapi.endpoint, window.location.origin);
  if (!apiUrl.pathname.endsWith('/')) apiUrl.pathname += '/';
  const endpoint = apiUrl.toString();
  const query = new URLSearchParams({
    endpoint,
    auth: launch.xapi.authorization,
    actor: JSON.stringify(launch.xapi.actor),
    registration: launch.xapi.registration,
    activity_id: launch.xapi.activityId,
  });
  return `${url}${url.includes('?') ? '&' : '?'}${query.toString()}`;
}

export function CoursePackagePlayer({ materialId, title, onClose }: { materialId: number; title: string; onClose: () => void }) {
  useAppLanguage();
  const launchQuery = useLaunchParticipantCoursePackage(materialId, {
    query: { enabled: true, queryKey: [`/participant-package-launch/${materialId}`], retry: 1, gcTime: 0 },
  });
  const launch = launchQuery.data;
  const [resourceUrl, setResourceUrl] = useState('');
  const languageLabel = launch?.language === 'ar' ? 'العربية / Arabic' : 'English';
  const playerTitle = useMemo(() => `${title} · ${languageLabel}`, [title, languageLabel]);

  useEffect(() => {
    if (!launch) return undefined;
    let api: Scorm12API | Scorm2004API | null = null;
    if (launch.format !== 'xapi') {
      const progress = launch.progress;
      const settings = {
        autocommit: true,
        autocommitSeconds: 20,
        xhrWithCredentials: true,
        lmsCommitUrl: `${basePath}/api/participant/courses/materials/${materialId}/scorm-progress`,
        dataCommitFormat: 'json',
        requestHandler: (payload: unknown) => normalizedCommit(payload),
      };
      if (launch.format === 'scorm12') {
        const runtime = new Scorm12API(settings);
        if (progress) {
          runtime.cmi.core.lesson_location = progress.location;
          runtime.cmi.suspend_data = progress.suspendData;
        }
        api = runtime;
      } else {
        const runtime = new Scorm2004API(settings);
        if (progress) {
          runtime.cmi.location = progress.location;
          runtime.cmi.suspend_data = progress.suspendData;
        }
        api = runtime;
      }
      const host = window as Window & { API?: Scorm12API; API_1484_11?: Scorm2004API };
      if (launch.format === 'scorm12') host.API = api as Scorm12API;
      else host.API_1484_11 = api as Scorm2004API;
      setResourceUrl(packageResourceUrl(materialId, launch.launchPath));
      return () => {
        try {
          if (api && !api.isTerminated()) {
            if (launch.format === 'scorm12') (api as Scorm12API).LMSFinish('');
            else (api as Scorm2004API).Terminate('');
          }
        } catch { /* Package shutdown must not block closing the player. */ }
        if (host.API === api) delete host.API;
        if (host.API_1484_11 === api) delete host.API_1484_11;
      };
    }
    setResourceUrl(withXapiParameters(packageResourceUrl(materialId, launch.launchPath), launch));
    return undefined;
  }, [launch, materialId]);

  return <AccessibleDialogSurface className="package-player" overlayClassName="package-player-backdrop" labelledBy="package-player-title" initialFocusSelector="[data-dialog-autofocus]" onClose={onClose} closeOnOutsideInteraction={false} testId="dialog-learning-package">
      <header className="package-player-head">
        <button className="package-player-back" type="button" onClick={onClose} data-dialog-autofocus><ArrowLeft size={16} />{t('Close learning package')}</button>
        <div className="package-player-title"><BookOpen size={17} /><div><h2 id="package-player-title">{playerTitle}</h2><span>{launch?.format === 'xapi' ? 'Tin Can / xAPI' : launch?.format === 'scorm2004' ? 'SCORM 2004' : 'SCORM 1.2'}</span></div></div>
        <button className="package-player-close" type="button" aria-label={t('Close learning package')} onClick={onClose}>×</button>
      </header>
      {launchQuery.isLoading ? <div className="package-player-state" role="status"><span className="package-player-skeleton" /><span className="package-player-skeleton short" /><span>{t('Preparing your learning package…')}</span></div>
        : launchQuery.isError ? <div className="package-player-state package-player-error" role="alert"><AlertCircle size={21} /><h3>{t('This package could not be opened.')}</h3><p>{t('Your learning access has not changed. Retry to request a fresh launch.')}</p><button className="button button-outline" onClick={() => void launchQuery.refetch()}><LoaderCircle size={14} />{t('Retry package launch')}</button></div>
          : resourceUrl ? <iframe className="package-player-frame" src={resourceUrl} title={playerTitle} allow="fullscreen" /> : null}
  </AccessibleDialogSurface>;
}
