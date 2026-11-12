import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Router } from 'wouter';
import { ProgramAnalyticsPage } from '../analytics-surfaces';
import { CourseManagementPage } from '../course-surfaces';
import { GrantManagementPage } from '../grant-surfaces';
import { LanguageProvider } from '../language';
import '../index.css';
import '../workspace.css';
import '../system-redesign.css';
import '../program-controls.css';

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
const location = (): [string, (path: string) => void] => [window.location.pathname, () => {}];
const page = new URLSearchParams(window.location.search).get('page');
const content = page === 'analytics'
  ? <ProgramAnalyticsPage />
  : page === 'learning'
    ? <CourseManagementPage />
    : <GrantManagementPage />;

createRoot(document.getElementById('root')!).render(
  <LanguageProvider>
    <QueryClientProvider client={queryClient}>
      <Router hook={location}>
        <div className="workspace">
          <aside className="sidebar" aria-hidden="true" />
          <div className="main-panel">
            <header className="topbar" aria-hidden="true" />
            <main className="page-content">{content}</main>
          </div>
        </div>
      </Router>
    </QueryClientProvider>
  </LanguageProvider>,
);
