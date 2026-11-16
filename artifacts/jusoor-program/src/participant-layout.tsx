import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation } from 'wouter';
import { useClerk, useUser } from '@clerk/react';
import { CalendarDays, Home, MessageSquareText, MoreHorizontal, Users, BookOpen } from 'lucide-react';
import { getGetParticipantBusinessPlansQueryKey, getGetParticipantDashboardQueryKey, getGetParticipantIdeaValidationQueryKey, getGetProgramBrandingQueryKey, useGetParticipantBusinessPlans, useGetParticipantDashboard, useGetParticipantIdeaValidation, useGetProgramBranding } from '@workspace/api-client-react';
import { Button } from '@workspace/program-editorial/components/ui/button';
import { getDisplayBrandName, LanguageToggle, t, useAppLanguage } from './language';
import { ParticipantAccountActions } from './participant-account-actions';
import './participant-layout.css';

const mainTabs = [
  { href: '/participant', label: 'Home', icon: Home },
  { href: '/participant/updates', label: 'Updates', icon: MessageSquareText },
  { href: '/participant/schedule', label: 'Schedule', icon: CalendarDays },
  { href: '/participant/learning', label: 'Learning', icon: BookOpen },
  { href: '/participant/workbooks/idea', label: 'Workbooks', icon: BookOpen },
  { href: '/participant/team', label: 'My team', icon: Users },
] as const;
const mobileTabs = mainTabs.slice(0, 4);
const moreTabs = [
  { href: '/participant/workbooks/idea', label: 'Workbooks' },
  { href: '/participant/team', label: 'My team' },
] as const;

function pageTitle(path: string) {
  if (path.endsWith('/updates')) return 'Updates';
  if (path.endsWith('/schedule')) return 'Schedule';
  if (path.endsWith('/learning')) return 'Learning';
  if (path.includes('/workbooks')) return 'Workbooks';
  if (path.endsWith('/team')) return 'My team';
  if (path.endsWith('/chat')) return 'Chat';
  if (path.endsWith('/profile')) return 'My profile';
  return 'Home';
}

export function ParticipantLayout({ children }: { children: React.ReactNode }) {
  useAppLanguage();
  const [path, setPath] = useLocation();
  const { signOut } = useClerk();
  const { user } = useUser();
  const contentRef = useRef<HTMLElement>(null);
  const brandingQuery = useGetProgramBranding({ query: { queryKey: getGetProgramBrandingQueryKey() } });
  const dashboard = useGetParticipantDashboard({
    query: { queryKey: getGetParticipantDashboardQueryKey(), refetchOnWindowFocus: true, refetchInterval: 60_000 },
  });
  const acceptedIds = new Set((dashboard.data?.applications || []).filter(item => item.applicationStatus === 'accepted').map(item => item.applicationId));
  const workbookQueriesEnabled = acceptedIds.size > 0 && (path === '/participant' || path.startsWith('/participant/workbooks'));
  const ideaWorkbooks = useGetParticipantIdeaValidation({ query: { queryKey: getGetParticipantIdeaValidationQueryKey(), enabled: workbookQueriesEnabled } });
  const businessPlans = useGetParticipantBusinessPlans({ query: { queryKey: getGetParticipantBusinessPlansQueryKey(), enabled: workbookQueriesEnabled } });
  const [moreOpen, setMoreOpen] = useState(false);
  const name = user?.firstName || user?.fullName || 'Founder';
  const brandName = getDisplayBrandName(brandingQuery.data?.brandName);
  const unreadCount = useMemo(() => (dashboard.data?.announcements || []).filter(item => !item.readAt && new Date(item.scheduledFor).getTime() <= Date.now()).length, [dashboard.data?.announcements]);
  const ideaSteps = ['customerSegment', 'problemStatement', 'riskiestAssumption', 'mvpExperiment', 'successSignal', 'evidenceAndNextStep'];
  const planSteps = ['acquisitionChannels', 'outreachActions', 'fulfillmentSteps', 'reviewSignals'];
  const startedSteps = (ideaWorkbooks.data?.workbooks || []).filter(item => acceptedIds.has(item.applicationId)).reduce((sum, workbook) => sum + ideaSteps.filter(key => typeof workbook[key as keyof typeof workbook] === 'string' && String(workbook[key as keyof typeof workbook]).trim()).length, 0)
    + (businessPlans.data?.plans || []).filter(item => acceptedIds.has(item.applicationId)).reduce((sum, plan) => sum + planSteps.filter(key => typeof plan[key as keyof typeof plan] === 'string' && String(plan[key as keyof typeof plan]).trim()).length, 0);
  const totalWorkbookSteps = acceptedIds.size * 10;
  const workbookBadge = totalWorkbookSteps ? `${startedSteps}/${totalWorkbookSteps}` : '';
  const title = pageTitle(path);

  useEffect(() => {
    const brand = getDisplayBrandName(brandingQuery.data?.brandName);
    document.title = `${t(title)} · ${brand}`;
  }, [path, title, brandingQuery.data?.brandName]);

  useEffect(() => {
    const routePath = path.split('#')[0];
    const content = contentRef.current;
    if (!content) return;
    let animationFrame = 0;
    const focusCurrentHeading = () => {
      const headings = content.querySelectorAll<HTMLElement>('[data-participant-route-heading]');
      const heading = [...headings].find(element => element.dataset.participantRouteHeading === routePath);
      if (!heading) return false;
      heading.focus();
      return true;
    };
    if (focusCurrentHeading()) return;
    const observer = new MutationObserver(() => {
      if (focusCurrentHeading()) {
        observer.disconnect();
        window.cancelAnimationFrame(animationFrame);
      }
    });
    observer.observe(content, { childList: true, subtree: true });
    animationFrame = window.requestAnimationFrame(() => {
      if (focusCurrentHeading()) observer.disconnect();
    });
    const timeout = window.setTimeout(() => observer.disconnect(), 5000);
    return () => {
      observer.disconnect();
      window.cancelAnimationFrame(animationFrame);
      window.clearTimeout(timeout);
    };
  }, [path]);

  useEffect(() => {
    const rawHash = decodeURIComponent(window.location.hash.slice(1));
    if (!rawHash) return;
    const destinations: Record<string, string> = {
      'participant-next-action': '/participant',
      'participant-program-progress': '/participant',
      'participant-updates': '/participant/updates',
      'participant-sessions': '/participant/schedule',
      'participant-mentoring': '/participant/schedule',
      'participant-learning': '/participant/learning',
      'participant-assignments': '/participant/learning',
      'participant-founder-support': '/participant/team',
      'participant-founder-workbook': '/participant/workbooks/idea',
      'participant-business-plan-workbook': '/participant/workbooks/plan',
      'participant-business-team': '/participant/team',
    };
    let destination = destinations[rawHash];
    if (!destination) {
      if (rawHash.startsWith('participant-announcement-')) destination = '/participant/updates';
      else if (rawHash.startsWith('participant-session-')) destination = '/participant/schedule';
      else if (rawHash.startsWith('participant-assignment-') || rawHash.startsWith('participant-course-module-')) destination = '/participant/learning';
      else if (rawHash.startsWith('participant-founder-workbook-')) destination = '/participant/workbooks/idea';
      else if (rawHash.startsWith('participant-business-plan-workbook-')) destination = '/participant/workbooks/plan';
    }
    if (destination && path === '/participant') setPath(`${destination}#${encodeURIComponent(rawHash)}`);
  }, [path, setPath]);

  useEffect(() => {
    const hash = decodeURIComponent(window.location.hash.slice(1));
    if (!hash) return;
    let attempts = 0;
    const findTarget = () => {
      const target = document.getElementById(hash);
      if (target) {
        const behavior = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth';
        target.scrollIntoView({ behavior, block: 'start' });
        return true;
      }
      return false;
    };
    const timer = window.setInterval(() => {
      attempts += 1;
      if (findTarget() || attempts >= 30) window.clearInterval(timer);
    }, 100);
    return () => window.clearInterval(timer);
  }, [path]);

  return <div className="participant-layout" dir={document.documentElement.dir}>
    <a className="participant-skip-link" href="#participant-main">{t('Skip to content')}</a>
    <header className="participant-shell-header">
      <Link href="/participant" className="participant-shell-brand" aria-label={brandName}>
        {brandingQuery.data?.logoUrl ? <img src={brandingQuery.data.logoUrl} alt="" /> : <span className="participant-shell-mark">{brandName.slice(0, 1)}</span>}
        <span><b>{brandName}</b><small>{t('FOUNDER WORKSPACE')}</small></span>
      </Link>
      <nav className="participant-desktop-nav" aria-label={t('Participant sections')}>
        {mainTabs.map(item => {
          const Icon = item.icon;
          const active = path === item.href || item.label === 'Workbooks' && path.startsWith('/participant/workbooks');
          return <Link key={item.href} href={item.href} className="participant-nav-link" aria-current={active ? 'page' : undefined}>
            <Icon size={16} aria-hidden="true" /><span>{t(item.label)}</span>
          {item.label === 'Updates' && unreadCount > 0 && <span className="participant-nav-badge" role="img" aria-label={`${unreadCount} ${t('unread updates')}`}>{unreadCount}</span>}
          {item.label === 'Workbooks' && workbookBadge && <span className="participant-nav-badge" role="img" aria-label={`${t('Workbook progress')}: ${startedSteps} ${t('of')} ${totalWorkbookSteps} ${t('steps started')}`}>{workbookBadge}</span>}
          </Link>;
        })}
      </nav>
      <div className="participant-shell-actions">
        <LanguageToggle />
        <Link href="/participant/chat" className="participant-header-icon" aria-label={t('Chat')}><MessageSquareText size={17} /></Link>
        <Link href="/participant/profile" className="participant-header-icon" aria-label={t('My profile')}><Users size={17} /></Link>
        <ParticipantAccountActions signOut={signOut} name={name} />
      </div>
    </header>
    <nav className="participant-mobile-nav" aria-label={t('Participant sections')}>
      {mobileTabs.map(item => {
        const Icon = item.icon;
          const active = path === item.href || (item.href === '/participant/learning' && path.startsWith('/participant/workbooks'));
        return <Link key={item.href} href={item.href} aria-current={active ? 'page' : undefined}>
          <Icon size={18} aria-hidden="true" /><span>{t(item.label)}</span>
          {item.label === 'Updates' && unreadCount > 0 && <span className="participant-nav-badge" role="img" aria-label={`${unreadCount} ${t('unread updates')}`}>{unreadCount}</span>}
        </Link>;
      })}
      <div className="participant-mobile-more">
        <Button variant="pill" size="sm" aria-expanded={moreOpen} onClick={() => setMoreOpen(value => !value)}><MoreHorizontal size={18} aria-hidden="true" /><span>{t('More')}</span>{workbookBadge && <span className="participant-nav-badge" role="img" aria-label={`${t('Workbook progress')}: ${startedSteps} ${t('of')} ${totalWorkbookSteps} ${t('steps started')}`}>{workbookBadge}</span>}</Button>
        {moreOpen && <div className="participant-mobile-popover">{moreTabs.map(item => <Link key={item.href} href={item.href} onClick={() => setMoreOpen(false)}>{t(item.label)}</Link>)}</div>}
      </div>
    </nav>
    <div className="participant-route-announcement" aria-live="polite" aria-atomic="true">{t(title)}</div>
    <main className="participant-layout-content" id="participant-main" ref={contentRef}>{children}</main>
  </div>;
}
