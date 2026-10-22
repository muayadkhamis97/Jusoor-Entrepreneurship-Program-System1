import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { getListAnnouncementsQueryKey, getListBusinessesQueryKey, getListProgramsQueryKey } from '@workspace/api-client-react';
import { CommunicationsPage } from '../communications-surfaces';
import { LanguageProvider } from '../language';
import '../index.css';
import '../workspace.css';

// Synthetic cached data only; this does not grant API access or sign in.
const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
client.setQueryData(getListProgramsQueryKey(), [{ id: 11, name: 'Assigned program' }]);
client.setQueryData(getListBusinessesQueryKey(), [{ id: 91, programId: 11, businessName: 'Sample business' }]);
client.setQueryData(getListAnnouncementsQueryKey(), []);
createRoot(document.getElementById('root')!).render(
  <LanguageProvider><QueryClientProvider client={client}>
    <div className="role-workspace"><main className="role-main"><CommunicationsPage staffOnly /></main></div>
  </QueryClientProvider></LanguageProvider>,
);
