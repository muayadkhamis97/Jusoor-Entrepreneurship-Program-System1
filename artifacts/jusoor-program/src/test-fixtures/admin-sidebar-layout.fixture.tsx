import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Link, Router as WouterRouter, useLocation } from 'wouter';
import { getStaffNavigationItems, MobileStaffNavigation } from '../mobile-staff-navigation';
import { groupStaffNavigationItems } from '../staff-navigation-items';
import '../workspace.css';

const navItems = getStaffNavigationItems('coordinator');
const navGroups = groupStaffNavigationItems(navItems);

function fixtureLocationHook(): [string, (path: string) => void] {
  const [path, setPath] = useState('/');
  return [path, setPath];
}

function AdminSidebarFixture() {
  const [path, setPath] = useLocation();
  const currentItem = navItems.find(item => item.href === path);
  const currentGroup = navGroups.find(group => group.items.some(item => item.href === path))?.group;
  return (
    <div className="workspace noise">
      <aside className="sidebar" data-testid="admin-sidebar">
        <Link href="/" className="brand" data-testid="sidebar-brand">
          <span className="brand-mark">J</span>
          <span><b>Program Hub</b><small>PROGRAM HUB</small></span>
        </Link>
        <nav className="side-nav" aria-label="Main navigation">
          {navGroups.map(({ group, items }) => (
            <div className="side-nav-group" role="group" aria-label={group} key={group}>
              <span className="side-nav-group-label">{group}</span>
              {items.map(({ href, label, icon: Icon }) => {
                const active = path === href;
                return (
                  <Link
                    key={href}
                    href={href}
                    className={`nav-link ${active ? 'active' : ''}`}
                    aria-current={active ? 'page' : undefined}
                    data-testid={`admin-nav-${href === '/' ? 'overview' : href.slice(1)}`}
                    onClick={event => {
                      event.preventDefault();
                      setPath(href);
                    }}
                  >
                    <Icon size={17} aria-hidden="true" />
                    <span>{label}</span>
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="profile"><span className="profile-avatar">P</span><div className="profile-copy"><b>Admin User</b><small>Program admin</small></div></div>
        </div>
      </aside>
      <main className="main-panel">
        <header className="topbar"><nav className="crumb" aria-label="Breadcrumb"><Link href="/" className="crumb-home">PROGRAM HUB</Link>{currentGroup && <><span className="crumb-slash" aria-hidden="true">/</span><span className="crumb-section">{currentGroup}</span></>}<span className="crumb-slash" aria-hidden="true">/</span><b>{currentItem?.label || path}</b></nav><span hidden data-testid="sidebar-current-route">{path}</span></header>
        <MobileStaffNavigation items={navItems} currentPath={path} onSignOut={() => undefined} />
        <div className="page-content page-enter">
          <h1>Admin page: {currentItem?.label || path}</h1>
          <div style={{ minHeight: 1600 }}>Synthetic long page content for scroll verification.</div>
        </div>
      </main>
    </div>
  );
}

createRoot(document.getElementById('root')!).render(
  <WouterRouter hook={fixtureLocationHook}>
    <AdminSidebarFixture />
  </WouterRouter>,
);
