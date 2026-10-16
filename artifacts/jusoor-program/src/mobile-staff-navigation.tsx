import { LayoutGrid, LogOut } from 'lucide-react';
import { Link } from 'wouter';
import { LanguageToggle, t } from './language';
import { getStaffNavigationItems, isStaffNavigationItemActive, type StaffNavigationItem } from './staff-navigation-items';
export { getStaffNavigationItems } from './staff-navigation-items';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from './components/ui/dropdown-menu';

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
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button type="button" className="mobile-all-pages" aria-label={t('Open all pages menu')} data-testid="button-mobile-all-pages">
            <LayoutGrid size={17} aria-hidden="true" />
            <span>{t('All pages')}</span>
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" side="bottom" className="mobile-all-pages-menu" aria-label={t('All pages')}>
          {items.map(({ href, label, icon: Icon }) => {
            const active = isStaffNavigationItemActive(currentPath, href);
            return <DropdownMenuItem asChild key={href}>
              <Link href={href} aria-current={active ? 'page' : undefined} data-testid={`mobile-menu-${href === '/' ? 'overview' : href.slice(1).replaceAll('/', '-')}`}>
                <Icon size={16} aria-hidden="true" />
                <span>{t(label)}</span>
              </Link>
            </DropdownMenuItem>;
          })}
        </DropdownMenuContent>
      </DropdownMenu>
      {items.map(({ href, label, icon: Icon }) => {
        const active = isStaffNavigationItemActive(currentPath, href);
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
