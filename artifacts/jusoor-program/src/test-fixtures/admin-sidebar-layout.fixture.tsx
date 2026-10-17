import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Link, Router as WouterRouter, useLocation } from 'wouter';
import { getStaffNavigationItems } from '../mobile-staff-navigation';
import '../workspace.css';

const navItems = getStaffNavigationItems('coordinator');

function fixtureLocationHook(): [string, (path: string) => void] {
  const [path, setPath] = useState('/overview');
  return [path, setPath];
}

function AdminSidebarFixture() {
  const [path, setPath] = useLocation();
  return (
    <div className="workspace noise">
      <aside className="sidebar" data-testid="admin-sidebar">
        <Link href="/" className="brand" data-testid="sidebar-brand">
          <span className="brand-mark">J</span>
          <span><b>Program Hub</b><small>PROGRAM HUB</small></span>
        </Link>
        <div className="workspace-tag"><span className="live-dot" />PROGRAM OPERATIONS</div>
        <nav className="side-nav" aria-label="Main navigation">
          {navItems.map(({ href, label, icon: Icon }) => {
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
        </nav>
        <div className="sidebar-bottom">
          <div className="sidebar-note"><span aria-hidden="true">✦</span><div><b>One journey, in view.</b><span>Move each founder forward.</span></div></div>
          <div className="profile"><span className="profile-avatar">P</span><div className="profile-copy"><b>Admin User</b><small>Program admin</small></div></div>
        </div>
      </aside>
      <main className="main-panel">
        <header className="topbar"><div className="crumb"><span>PROGRAM HUB</span><span>/</span><b data-testid="sidebar-current-route">{path}</b></div></header>
        <div className="page-content page-enter">
          <h1>Admin page: {path}</h1>
          <div style={{ minHeight: 1600 }}>Synthetic long page content for scroll verification.</div>
        </div>
        <footer className="footer footer-brandless"><span>PROGRAM OPERATIONS</span></footer>
      </main>
    </div>
  );
}

createRoot(document.getElementById('root')!).render(
  <WouterRouter hook={fixtureLocationHook}>
    <AdminSidebarFixture />
  </WouterRouter>,
);
