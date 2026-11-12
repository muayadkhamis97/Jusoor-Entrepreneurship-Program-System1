import type { LucideIcon } from 'lucide-react';
import {
  Activity, BarChart3, BookOpen, BriefcaseBusiness, CalendarCheck, CalendarDays,
  CircleDollarSign, ClipboardList, FileSpreadsheet, FileText, Handshake, KeyRound, LayoutDashboard, MessagesSquare, Palette,
  Shield, Trophy, UserRound, UsersRound,
} from 'lucide-react';

export type StaffNavigationItem = {
  href: string;
  label: string;
  mobileLabel?: string;
  icon: LucideIcon;
  group: StaffNavigationGroup;
};

export const staffNavigationGroupOrder = ['Operations', 'Learning', 'Communication', 'Settings'] as const;
export type StaffNavigationGroup = typeof staffNavigationGroupOrder[number];

export type StaffNavigationSection = {
  group: StaffNavigationGroup;
  items: StaffNavigationItem[];
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
    return [{ href: '/profile', label: 'Profile', icon: UserRound, group: 'Settings' }];
  }
  return [
    { href: '/', label: 'Overview', icon: LayoutDashboard, group: 'Operations' },
    { href: '/businesses', label: 'Businesses', mobileLabel: 'Business', icon: BriefcaseBusiness, group: 'Operations' },
    { href: '/programs', label: 'Programs', icon: Activity, group: 'Operations' },
    ...(role === 'coordinator'
      ? [
          { href: '/analytics', label: 'Analytics', icon: BarChart3, group: 'Operations' as const },
          { href: '/applications', label: 'Applications', icon: FileText, group: 'Operations' as const },
        ]
      : []),
    { href: '/sessions', label: 'Sessions', icon: CalendarDays, group: 'Operations' },
    { href: '/pitches', label: 'Pitch & grants', icon: Trophy, group: 'Operations' },
    ...(role === 'coordinator' ? [{ href: '/grants', label: 'Grant tracking', icon: CircleDollarSign, group: 'Operations' as const }] : []),
    { href: '/judging-forms', label: 'Judging forms', icon: ClipboardList, group: 'Operations' },
    { href: '/courses', label: role === 'coordinator' ? 'Courses' : 'Course schedule', icon: BookOpen, group: 'Learning' },
    ...(role === 'coordinator' ? [{ href: '/mentor-booking', label: 'Mentor booking', icon: CalendarCheck, group: 'Learning' as const }] : []),
    { href: '/communications', label: 'Communications', icon: Activity, group: 'Communication' },
    { href: '/chat', label: 'Chat', icon: MessagesSquare, group: 'Communication' },
    { href: '/support', label: 'Support', icon: Handshake, group: 'Communication' },
    { href: '/mentor-meeting-reports', label: 'Mentor meeting reports', icon: FileText, group: 'Communication' },
    ...(role === 'coordinator'
      ? [
          { href: '/branding', label: 'Branding', icon: Palette, group: 'Settings' as const },
          { href: '/api-integrations', label: 'Integration settings', icon: KeyRound, group: 'Settings' as const },
        ]
      : []),
    { href: '/google-sheets', label: 'Google Sheets', icon: FileSpreadsheet, group: 'Settings' },
    ...(role === 'coordinator'
      ? [
          { href: '/team', label: 'Team access', icon: Shield, group: 'Settings' as const },
          { href: '/team-assignments', label: 'Team assignments', icon: Shield, group: 'Settings' as const },
          { href: '/profiles', label: 'Manage profiles', icon: UsersRound, group: 'Settings' as const },
          { href: '/access', label: 'Role access', icon: Shield, group: 'Settings' as const },
        ]
      : [
          { href: '/team-assignments', label: 'Team assignments', icon: Shield, group: 'Settings' as const },
        ]),
    { href: '/profile', label: 'Profile', icon: UserRound, group: 'Settings' },
  ];
}

export function groupStaffNavigationItems(items: StaffNavigationItem[]): StaffNavigationSection[] {
  return staffNavigationGroupOrder.flatMap(group => {
    const groupedItems = items.filter(item => item.group === group);
    return groupedItems.length ? [{ group, items: groupedItems }] : [];
  });
}

const mobilePrimaryPaths = ['/', '/businesses', '/programs', '/sessions'];

export function getMobilePrimaryNavigationItems(items: StaffNavigationItem[]): StaffNavigationItem[] {
  const primary = mobilePrimaryPaths.flatMap(href => {
    const item = items.find(candidate => candidate.href === href);
    return item ? [item] : [];
  });
  const selectedPaths = new Set(primary.map(item => item.href));
  return [...primary, ...items.filter(item => !selectedPaths.has(item.href))].slice(0, 4);
}
