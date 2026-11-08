import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Router } from 'wouter';
import { Shell, TeamPage } from '../App';
import { LanguageProvider } from '../language';
import { staff } from './team-directory-data';
import '../index.css';
import '../system-redesign.css';

const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
// Use the real active navigation state, without visiting any authenticated route.
const fixtureLocation = (): [string, (path: string) => void] => ['/team', () => {}];

createRoot(document.getElementById('root')!).render(
  <QueryClientProvider client={client}>
    <LanguageProvider>
      <Router hook={fixtureLocation}>
        <Shell staff={staff[0]} displayName="Synthetic Directory Admin">
          <TeamPage />
        </Shell>
      </Router>
    </LanguageProvider>
  </QueryClientProvider>,
);
