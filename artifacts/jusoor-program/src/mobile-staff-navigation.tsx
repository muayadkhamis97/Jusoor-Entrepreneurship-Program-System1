import { Fragment } from 'react';
import { Ellipsis, LogOut } from 'lucide-react';
import { Link } from 'wouter';
import { t } from './language';
import {
  getMobilePrimaryNavigationItems,
  getStaffNavigationItems,
  groupStaffNavigationItems,
  isStaffNavigationItemActive,
  type StaffNavigationItem,
} from './staff-navigation-items';
export { getStaffNavigationItems } from './staff-navigation-items';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
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
  const primaryItems = getMobilePrimaryNavigationItems(items);
  const primaryPaths = new Set(primaryItems.map(item => item.href));
  const overflowItems = items.filter(item => !primaryPaths.has(item.href));
  const overflowGroups = groupStaffNavigationItems(overflowItems);
  const moreIsActive = !primaryItems.some(item => isStaffNavigationItemActive(currentPath, item.href));

  return (
    <nav className="mobile-nav" aria-label={t('Main navigation')} data-testid="mobile-staff-navigation">
      {primaryItems.map(({ href, label, mobileLabel, icon: Icon }) => {
        const active = isStaffNavigationItemActive(currentPath, href);
        return (
          <Link
            href={href}
            key={href}
            className={active ? 'mobile-active' : undefined}
            aria-label={t(mobileLabel ?? label)}
            aria-current={active ? 'page' : undefined}
            data-testid={`mobile-nav-${href === '/' ? 'overview' : href.slice(1).replaceAll('/', '-')}`}
          >
            <Icon size={18} aria-hidden="true" />
            <span>{t(mobileLabel ?? label)}</span>
          </Link>
        );
      })}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className={`mobile-more-trigger ${moreIsActive ? 'mobile-active' : ''}`}
            aria-label={t('More')}
            data-testid="button-mobile-more"
          >
            <Ellipsis size={20} aria-hidden="true" />
            <span>{t('More')}</span>
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" side="top" className="mobile-more-menu" aria-label={t('More')}>
          {overflowGroups.map(({ group, items: groupItems }, index) => (
            <Fragment key={group}>
              <DropdownMenuLabel className="mobile-more-group-label">{t(group)}</DropdownMenuLabel>
              {groupItems.map(({ href, label, icon: Icon }) => {
                const active = isStaffNavigationItemActive(currentPath, href);
                return (
                  <DropdownMenuItem asChild key={href}>
                    <Link href={href} aria-current={active ? 'page' : undefined} data-testid={`mobile-menu-${href === '/' ? 'overview' : href.slice(1).replaceAll('/', '-')}`}>
                      <Icon size={16} aria-hidden="true" />
                      <span>{t(label)}</span>
                    </Link>
                  </DropdownMenuItem>
                );
              })}
              {index < overflowGroups.length - 1 && <DropdownMenuSeparator className="mobile-more-separator" />}
            </Fragment>
          ))}
          {overflowItems.length > 0 && <DropdownMenuSeparator className="mobile-more-separator" />}
          <DropdownMenuItem onSelect={onSignOut} data-testid="menuitem-mobile-signout">
            <LogOut size={16} aria-hidden="true" />
            <span>{t('Sign out')}</span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </nav>
  );
}
