import type { LucideIcon } from 'lucide-react';
import { LogOut } from 'lucide-react';
import { Link } from 'wouter';
import { LanguageToggle, t } from './language';

export type StaffNavigationItem = {
  href: string;
  label: string;
  icon: LucideIcon;
};

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
