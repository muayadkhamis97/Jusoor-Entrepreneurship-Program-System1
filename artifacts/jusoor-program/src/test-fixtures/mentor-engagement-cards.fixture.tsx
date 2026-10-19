import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { MentorEngagement } from '@workspace/api-client-react';
import { MentorEngagementCard, type MentorEngagementDraft } from '../mentor-engagement-card';
import { LanguageProvider } from '../language';
import '../index.css';
import '../workspace.css';
import '../role-workspace.css';
import '../program-controls.css';

const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
const items: MentorEngagement[] = [1, 2].map(id => ({
  id, businessId: id, businessName: `Business ${id}`, founderName: `Founder ${id}`,
  programName: 'Sample program', type: 'mentor', provider: 'Mentor',
  topic: `Engagement ${id}`, scheduledDate: null, status: 'requested', notes: null,
}));
function Fixture() {
  const [drafts, setDrafts] = useState<Record<number, MentorEngagementDraft>>({});
  return <div className="role-workspace"><main className="role-main">
    <h1>Mentor engagement feedback fixture</h1>
    <div className="answer-list">{items.map(item => <MentorEngagementCard key={item.id} item={item}
      draft={drafts[item.id] || { date: '', status: item.status, notes: '' }}
      onDraftChange={next => setDrafts(old => ({ ...old, [item.id]: next }))} />)}</div>
  </main></div>;
}
createRoot(document.getElementById('root')!).render(<LanguageProvider><QueryClientProvider client={client}><Fixture /></QueryClientProvider></LanguageProvider>);
