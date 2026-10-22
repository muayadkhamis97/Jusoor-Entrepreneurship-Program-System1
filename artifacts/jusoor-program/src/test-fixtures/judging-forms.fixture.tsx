import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { getListBusinessesQueryKey, getListJudgingFormsQueryKey, getListProgramsQueryKey } from '@workspace/api-client-react';
import type { Business, JudgingFormSummary, Program } from '@workspace/api-client-react';
import { JudgingFormsPage } from '../judging-form-surfaces';
import { LanguageProvider, LanguageToggle } from '../language';
import '../index.css';
import '../workspace.css';
import '../role-workspace.css';
import '../program-controls.css';

// DEVELOPMENT-ONLY staff builder harness for /src/test-fixtures/judging-forms.html.
// It mounts the real JudgingFormsPage with synthetic cache entries only:
//   - programs list: [{ id: 11, name: 'Sample program' }]
//   - businesses for { programId: 11 }: ids 201, 202, 203
//   - judging forms list: empty, or one sample draft summary with ?seed=draft
// The cache grants no authentication or permissions and writes nothing. Every
// create/update/status/detail/responses request still goes through the generated
// hooks, so browser tests must intercept /api/staff/judging-forms*, /api/programs*
// and /api/businesses* before opening this page. No production code reads this file.
const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
const created = '2026-10-01T09:00:00Z';
const programs: Program[] = [{ id: 11, name: 'Sample program', format: 'bootcamp', mentorSessionsPerBusiness: 0, status: 'active', archivedAt: null, createdAt: created }];
const business = (id: number, businessName: string): Business => ({ id, programId: 11, businessName, founderName: 'Sample founder', email: `founder${id}@example.test`, stage: 'pitch', createdAt: created });
const forms: JudgingFormSummary[] = new URLSearchParams(location.search).get('seed') === 'draft'
  ? [{ id: 501, programId: 11, programName: 'Sample program', title: 'Sample demo day form', status: 'draft', responseCount: 0, publishedAt: null }]
  : [];

client.setQueryData(getListProgramsQueryKey(), programs);
client.setQueryData(getListBusinessesQueryKey({ programId: 11 }), [business(201, 'Sample business A'), business(202, 'Sample business B'), business(203, 'Sample business C')]);
client.setQueryData(getListJudgingFormsQueryKey(), forms);

createRoot(document.getElementById('root')!).render(
  <LanguageProvider><QueryClientProvider client={client}>
    <div className="role-workspace"><div className="role-main"><LanguageToggle /><JudgingFormsPage /></div></div>
  </QueryClientProvider></LanguageProvider>,
);
