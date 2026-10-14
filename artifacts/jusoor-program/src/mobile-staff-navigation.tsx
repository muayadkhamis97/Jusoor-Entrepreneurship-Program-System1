import type { LucideIcon } from 'lucide-react';
import {
  Activity,
  BarChart3,
  BookOpen,
  BriefcaseBusiness,
  CalendarCheck,
  CalendarDays,
  CircleDollarSign,
  FileText,
  Handshake,
  KeyRound,
  LayoutDashboard,
  LogOut,
  Palette,
  Shield,
  Trophy,
} from 'lucide-react';
import { Link } from 'wouter';
import { LanguageToggle, t } from './language';

export type StaffNavigationItem = {
  href: string;
  label: string;
  icon: LucideIcon;
};

export function getStaffNavigationItems(role: 'coordinator' | 'staff'): StaffNavigationItem[] {
  return [
    { href: '/', label: 'Overview', icon: LayoutDashboard },
    { href: '/businesses', label: 'Businesses', icon: BriefcaseBusiness },
    { href: '/programs', label: 'Programs', icon: Activity },
    ...(role === 'coordinator'
      ? [
          { href: '/analytics', label: 'Analytics', icon: BarChart3 },
          { href: '/branding', label: 'Branding', icon: Palette },
          { href: '/api-integrations', label: 'API integrations', icon: KeyRound },
        ]
      : []),
    { href: '/sessions', label: 'Sessions', icon: CalendarDays },
    ...(role === 'coordinator' ? [{ href: '/communications', label: 'Communications', icon: Activity }] : []),
    { href: '/support', label: 'Support', icon: Handshake },
    { href: '/pitches', label: 'Pitch & grants', icon: Trophy },
    ...(role === 'coordinator' ? [{ href: '/grants', label: 'Grant tracking', icon: CircleDollarSign }] : []),
    ...(role === 'coordinator'
      ? [
          { href: '/courses', label: 'Learning', icon: BookOpen },
          { href: '/applications', label: 'Applications', icon: FileText },
          { href: '/mentor-booking', label: 'Mentor booking', icon: CalendarCheck },
          { href: '/team', label: 'Team access', icon: Shield },
          { href: '/access', label: 'Role access', icon: Shield },
        ]
      : [{ href: '/courses', label: 'Course schedule', icon: CalendarDays }]),
  ];
}

export function MobileStaffNavigation({
  items,
  currentPath,
  onSignOut,
}: {
  items: StaffNavigationItem[];
  currentPath: string;
  onSignOut: () => void;
}) {
  return (
    <nav className="mobile-nav" aria-label={t('Main navigation')} data-testid="mobile-staff-navigation">
      {items.map(({ href, label, icon: Icon }) => {
        const active = currentPath === href;
        return (
          <Link
            href={href}
            key={href}
            className={active ? 'mobile-active' : undefined}
            aria-current={active ? 'page' : undefined}
            data-testid={`mobile-nav-${href === '/' ? 'overview' : href.slice(1).replaceAll('/', '-')}`}
          >
            <Icon size={18} aria-hidden="true" />
            <span>{t(label)}</span>
          </Link>
        );
      })}
      <LanguageToggle />
      <button type="button" className="mobile-signout" onClick={onSignOut}>
        <LogOut size={17} aria-hidden="true" />
        <span>{t('Sign out')}</span>
      </button>
    </nav>
  );
}
