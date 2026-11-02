import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ParticipantAnnouncement } from '@workspace/api-client-react';
import { CommunicationsPage, ParticipantAnnouncements } from '../communications-surfaces';
import { LanguageProvider, LanguageToggle } from '../language';
import { RoleAccessPage } from '../role-access';
import '../index.css';
import '../role-workspace.css';
import '../role-access.css';
import '../calendar-communications.css';

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
const sampleAnnouncement: ParticipantAnnouncement = {
  id: 1,
  programId: 4,
  programName: 'Venture Launch · Spring',
  businessId: 8,
  businessName: 'Cedar & Clay Foods',
  sessionId: null,
  sessionTitle: null,
  sessionDate: null,
  recordingUrl: null,
  kind: 'update',
  title: 'Founder-provided English subject',
  body: 'Founder-provided English message',
  scheduledFor: '2026-10-14T12:00:00.000Z',
  createdAt: '2026-10-14T12:00:00.000Z',
  readAt: null,
};

function ArabicRoleWorkspacesFixture() {
  return (
    <QueryClientProvider client={queryClient}>
      <LanguageProvider>
        <main>
          <LanguageToggle />
          <RoleAccessPage />
          <CommunicationsPage />
          <ParticipantAnnouncements announcements={[sampleAnnouncement]} />
        </main>
      </LanguageProvider>
    </QueryClientProvider>
  );
}

createRoot(document.getElementById('root')!).render(<ArabicRoleWorkspacesFixture />);
