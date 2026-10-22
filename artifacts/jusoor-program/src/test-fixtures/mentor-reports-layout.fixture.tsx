import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  getListProgramsQueryKey,
  getListBusinessesQueryKey,
  getGetStaffMentorMeetingReportCoachesQueryKey,
  getGetStaffMentorMeetingReportsQueryKey,
  getGetStaffMentorAdditionalSessionRequestsQueryKey,
} from '@workspace/api-client-react';
import { StaffMentorMeetingReportsPage } from '../role-surfaces';
import { LanguageProvider, LanguageToggle } from '../language';
import '../index.css';
import '../workspace.css';
import '../role-workspace.css';
import '../program-controls.css';

// Synthetic, read-only layout fixture. No sign-in or real program data.
const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
const program = { programId: 1 };
client.setQueryData(getListProgramsQueryKey(), [{ id: 1, name: 'Sample program' }]);
client.setQueryData(getListBusinessesQueryKey(program), []);
client.setQueryData(getGetStaffMentorMeetingReportCoachesQueryKey(program), []);
client.setQueryData(getGetStaffMentorMeetingReportsQueryKey(program), []);
client.setQueryData(getGetStaffMentorAdditionalSessionRequestsQueryKey(program), []);

createRoot(document.getElementById('root')!).render(
  <LanguageProvider><QueryClientProvider client={client}>
    <div className="role-workspace"><main className="role-main">
      <LanguageToggle />
      <StaffMentorMeetingReportsPage />
    </main></div>
  </QueryClientProvider></LanguageProvider>,
);
