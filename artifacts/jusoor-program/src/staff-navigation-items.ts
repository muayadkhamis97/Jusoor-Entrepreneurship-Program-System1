import type { LucideIcon } from 'lucide-react';
import {
  Activity, BarChart3, BookOpen, BriefcaseBusiness, CalendarCheck, CalendarDays,
  CircleDollarSign, FileText, Handshake, KeyRound, LayoutDashboard, Palette,
  Shield, Trophy, UserRound, UsersRound,
} from 'lucide-react';

export type StaffNavigationItem = {
  href: string;
  label: string;
  icon: LucideIcon;
};

export function normalizeStaffNavigationPath(path: string): string {
  const pathname = path.split(/[?#]/, 1)[0] || '/';
  return pathname.replace(/\/+$/, '') || '/';
}

export function isStaffNavigationItemActive(currentPath: string, href: string): boolean {
  return normalizeStaffNavigationPath(currentPath) === normalizeStaffNavigationPath(href);
}

export type StaffNavigationRole = 'coordinator' | 'staff' | 'trainer' | 'mentor' | 'judge';

export function canAccessStaffNavigationPath(role: StaffNavigationRole, path: string): boolean {
  const normalized = normalizeStaffNavigationPath(path);
  return getStaffNavigationItems(role).some(item => item.href === normalized);
}

export function getStaffNavigationItems(role: StaffNavigationRole): StaffNavigationItem[] {
  if (role !== 'coordinator' && role !== 'staff') {
    return [{ href: '/profile', label: 'Profile', icon: UserRound }];
  }
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
    { href: '/communications', label: 'Communications', icon: Activity },
    { href: '/support', label: 'Support', icon: Handshake },
    { href: '/mentor-meeting-reports', label: 'Mentor meeting reports', icon: FileText },
    { href: '/pitches', label: 'Pitch & grants', icon: Trophy },
    ...(role === 'coordinator' ? [{ href: '/grants', label: 'Grant tracking', icon: CircleDollarSign }] : []),
    ...(role === 'coordinator'
      ? [
          { href: '/courses', label: 'Learning', icon: BookOpen },
          { href: '/applications', label: 'Applications', icon: FileText },
          { href: '/mentor-booking', label: 'Mentor booking', icon: CalendarCheck },
          { href: '/team', label: 'Team access', icon: Shield },
          { href: '/team-assignments', label: 'Team assignments', icon: Shield },
          { href: '/profiles', label: 'Manage profiles', icon: UsersRound },
          { href: '/access', label: 'Role access', icon: Shield },
        ]
      : [
          { href: '/courses', label: 'Course schedule', icon: CalendarDays },
          { href: '/team-assignments', label: 'Team assignments', icon: Shield },
        ]),
    { href: '/profile', label: 'Profile', icon: UserRound },
  ];
}
