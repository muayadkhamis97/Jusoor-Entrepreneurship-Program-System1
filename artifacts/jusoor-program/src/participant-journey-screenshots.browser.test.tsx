import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { createServer as createNetServer } from 'node:net';
import path from 'node:path';
import test from 'node:test';
import { chromium } from 'playwright-core';
import { createServer as createViteServer } from 'vite';

const packageRoot = path.resolve(import.meta.dirname, '..');
const workspaceRoot = path.resolve(packageRoot, '../..');
const chromiumPath = process.env.CHROMIUM_PATH || '/repl/tools/bin/chromium';
const captureScreenshots = process.env.CAPTURE_PARTICIPANT_SCREENSHOTS === '1';
const screenshotDir = path.join(workspaceRoot, 'generated-artifacts/participant-journey');

async function unusedPort(): Promise<number> {
  const listener = createNetServer();
  await new Promise<void>((resolve, reject) => {
    listener.once('error', reject);
    listener.listen(0, '127.0.0.1', resolve);
  });
  const address = listener.address();
  if (!address || typeof address === 'string') throw new Error('Could not allocate a browser-test port.');
  const port = address.port;
  await new Promise<void>((resolve, reject) => listener.close(error => error ? reject(error) : resolve()));
  return port;
}

const dashboard = {
  applications: [{
    applicationId: 2601,
    enrollmentSource: 'application',
    applicationStatus: 'accepted',
    submittedAt: '2026-09-28T10:00:00.000Z',
    program: { id: 26, name: 'Jusoor Growth Lab 2026', format: 'bootcamp', description: 'A practical growth program for founders.', startDate: '2026-10-01', endDate: '2027-03-31' },
    business: { id: 61, businessName: 'Olive & Oat', industry: 'Food innovation', stage: 'incubator' },
    sessions: [{
      id: 501, title: 'Customer Discovery Workshop', type: 'training', scheduledDate: '2026-12-18', startTime: '15:00',
      timeZone: 'Asia/Amman', durationMinutes: 90, facilitator: 'Maya Haddad', deliveryMode: 'online', location: null,
      zoomUrl: null, recordingUrl: null, status: 'scheduled',
    }],
    support: [{ id: 701, type: 'mentor', provider: 'Nour Khalil', topic: 'Customer interviews', scheduledDate: '2026-12-19', status: 'scheduled', mentorBookingUrl: 'https://example.test/mentor' }],
    calendlyMeetings: [{ id: 801, eventName: 'Mentor check-in', startsAt: '2026-12-19T11:00:00+03:00', endsAt: '2026-12-19T11:45:00+03:00', timezone: 'Asia/Amman', status: 'confirmed' }],
    googleCalendarMeetings: [],
    assignments: [{ id: 901, title: 'Map your customer interviews', instructions: 'Summarize what you learned from three customer conversations.', dueDate: '2026-12-21', sessionTitle: 'Customer Discovery Workshop', answer: null, status: null, score: null, feedback: null, submittedAt: null }],
    questions: [{ id: 1001, programId: 26, sessionTitle: 'Customer Discovery Workshop', assignmentTitle: null, question: 'How many interviews should I complete?', reply: 'Start with at least five conversations.', createdAt: '2026-12-10T09:00:00.000Z', repliedAt: '2026-12-11T12:00:00.000Z' }],
  }],
  announcements: [{
    id: 310, programId: 26, programName: 'Jusoor Growth Lab 2026', businessId: 61, businessName: 'Olive & Oat',
    sessionId: null, sessionTitle: null, sessionDate: null, recordingUrl: null, kind: 'reminder',
    title: 'Pitch practice sign-ups are open', body: 'Choose a practice slot by 24 December so the team can prepare useful feedback.',
    scheduledFor: '2026-11-12T08:00:00.000Z', createdAt: '2026-11-12T08:00:00.000Z', readAt: null, needsReply: true,
  }],
};
const noDataDashboard = {
  applications: dashboard.applications.map(enrollment => ({ ...enrollment, sessions: [], support: [], calendlyMeetings: [], assignments: [], questions: [] })),
  announcements: [],
};
const profile = {
  userId: 'demo-participant-rana', displayName: 'Rana Al-Haddad', email: 'rana@example.test',
  accountType: 'participant', phone: null, bio: 'Founder building more sustainable pantry staples.',
  organization: 'Olive & Oat', photoUrl: null,
};
const idea = {
  workbooks: [{
    applicationId: 2601, programId: 26, programName: 'Jusoor Growth Lab 2026', businessName: 'Olive & Oat',
    customerSegment: 'Busy households looking for lower-waste pantry options.',
    problemStatement: 'Small households struggle to find practical portions without excess packaging.',
    riskiestAssumption: 'Customers will pay a little more for refillable packaging.',
    mvpExperiment: 'Offer a small refill pilot to ten repeat customers.',
    successSignal: 'At least six customers reorder within one month.',
    evidenceAndNextStep: 'Interview customers after the pilot and compare repeat orders.',
    updatedAt: '2026-12-08T10:00:00.000Z',
  }],
};
const plan = {
  plans: [{
    applicationId: 2601, programId: 26, programName: 'Jusoor Growth Lab 2026', businessName: 'Olive & Oat',
    acquisitionChannels: 'Community markets and referrals.',
    outreachActions: 'Speak with five local shops and share a weekly product update.',
    fulfillmentSteps: 'Prepare small batches, confirm orders, then deliver in reusable jars.',
    reviewSignals: 'Repeat orders, customer referrals, and returned jars.',
    updatedAt: '2026-12-09T10:00:00.000Z',
  }],
};
const emptyIdea = { workbooks: [{ ...idea.workbooks[0], customerSegment: '', problemStatement: '', riskiestAssumption: '', mvpExperiment: '', successSignal: '', evidenceAndNextStep: '', updatedAt: null }] };
const emptyPlan = { plans: [{ ...plan.plans[0], acquisitionChannels: '', outreachActions: '', fulfillmentSteps: '', reviewSignals: '', updatedAt: null }] };
const learning = {
  programs: [{
    programId: 26, programName: 'Jusoor Growth Lab 2026', completedRequiredModules: 1, totalRequiredModules: 3,
    completionPercent: 33, activeSeconds: 2580, lastActivityAt: '2026-12-11T13:00:00.000Z',
    modules: [{ moduleId: 120, title: 'Customer discovery foundations', isRequired: true, dueAt: '2026-12-24T00:00:00.000Z', completedAt: null, completionStatus: 'in_progress', packages: [] }],
    quizzes: [], certificate: null,
  }],
};
const courses = {
  programs: [{
    programId: 26, programName: 'Jusoor Growth Lab 2026',
    modules: [{ id: 130, title: 'Course guide', description: 'An introduction to the learning materials.', position: 1, releaseAt: null, dueAt: null, isRequired: true, materials: [] }],
  }],
};
const teams = [{
  programId: 26, programName: 'Jusoor Growth Lab 2026', businessId: 61, businessName: 'Olive & Oat',
  industry: 'Food innovation', stage: 'incubator',
  members: [{ founderName: 'Rana Al-Haddad', isYou: true }, { founderName: 'Omar Nasser', isYou: false }],
}];
const peers = {
  programId: 26, programName: 'Jusoor Growth Lab 2026',
  preferences: { isListed: false, shareEmail: false, sharePhone: false },
  peers: [{ founderName: 'Mariam Saleh', businessName: 'Suma Pantry', industry: 'Food innovation', email: null, phone: null }],
};
const json = (body: unknown, status = 200) => ({ status, contentType: 'application/json', body: JSON.stringify(body) });
const pages = [
  { path: '/participant', slug: 'home', title: /Welcome|أهلاً/ },
  { path: '/participant/updates', slug: 'updates', title: /Updates|التحديثات/ },
  { path: '/participant/schedule', slug: 'schedule', title: /Schedule|الجدول/ },
  { path: '/participant/learning', slug: 'learning', title: /Learning|التعلّم/ },
  { path: '/participant/workbooks/idea', slug: 'workbook-idea', title: /Workbooks|دفاتر/ },
  { path: '/participant/workbooks/plan', slug: 'workbook-plan', title: /Workbooks|دفاتر/ },
  { path: '/participant/team', slug: 'team', title: /My team|فريقي/ },
  { path: '/participant/chat', slug: 'chat', title: /Chat|محادثة/ },
  { path: '/participant/profile', slug: 'profile', title: /profile|الملف الشخصي/i },
];

test('participant route journey retains the 403 gate, page-scoped content, RTL, responsive navigation, and workbook safeguards', { timeout: 180_000 }, async () => {
  const port = await unusedPort();
  const origin = `http://127.0.0.1:${port}`;
  const priorPort = process.env.PORT;
  const priorBasePath = process.env.BASE_PATH;
  process.env.PORT = String(port);
  process.env.BASE_PATH = '/';
  let vite: Awaited<ReturnType<typeof createViteServer>> | undefined;
  let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
  try {
    vite = await createViteServer({
      configFile: path.join(packageRoot, 'vite.config.ts'),
      root: packageRoot,
      server: { host: '127.0.0.1', port, strictPort: true },
      plugins: [{
        name: 'participant-route-clerk-test-double',
        enforce: 'pre',
        resolveId(source) {
          if (source === '@clerk/react') return path.join(packageRoot, 'src/test-fixtures/mock-clerk.tsx');
          if (source === '@clerk/react/internal') return '\0participant-route-clerk-internal';
          return null;
        },
        load(id) {
          if (id === '\0participant-route-clerk-internal') return `export const publishableKeyFromHost = () => 'pk_test_mock';`;
          return null;
        },
      }],
    });
    await vite.listen();
    browser = await chromium.launch({ executablePath: chromiumPath, headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
    if (captureScreenshots) mkdirSync(screenshotDir, { recursive: true });
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 1, hasTouch: true });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    let noDataMode = false;
    let failNextWorkbookSave = false;
    const apiPaths = new Set<string>();
    const pageErrors: string[] = [];
    page.on('pageerror', error => pageErrors.push(error.message));
    await page.route('**/*', async route => {
      const url = new URL(route.request().url());
      if (url.origin !== origin) {
        if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') await route.continue();
        else await route.abort();
        return;
      }
      if (!url.pathname.startsWith('/api/')) { await route.continue(); return; }
      apiPaths.add(`${route.request().method()} ${url.pathname}`);
      if (url.pathname === '/api/branding') await route.fulfill(json({ brandName: 'Jusoor Entrepreneurship Program', logoUrl: null, primaryColor: '#28665a', accentColor: '#c1a36b' }));
      else if (url.pathname === '/api/auth/me') await route.fulfill(json({ error: 'Participant account.' }, 403));
      else if (url.pathname === '/api/participant/dashboard') await route.fulfill(json(noDataMode ? noDataDashboard : dashboard));
      else if (url.pathname === '/api/participant/profile') await route.fulfill(json(profile));
      else if (url.pathname === '/api/participant/courses/progress') await route.fulfill(json(noDataMode ? { programs: [] } : learning));
      else if (url.pathname === '/api/participant/courses') await route.fulfill(json(noDataMode ? { programs: [{ ...courses.programs[0], modules: [] }] } : courses));
      else if (url.pathname === '/api/participant/idea-validation' && route.request().method() === 'GET') await route.fulfill(json(noDataMode ? emptyIdea : idea));
      else if (url.pathname === '/api/participant/business-plans' && route.request().method() === 'GET') await route.fulfill(json(noDataMode ? emptyPlan : plan));
      else if (url.pathname === '/api/participant/business-teams') await route.fulfill(json(noDataMode ? [] : teams));
      else if (url.pathname === '/api/participant/programs/26/peers') await route.fulfill(json(noDataMode ? { ...peers, peers: [] } : peers));
      else if (url.pathname.endsWith('/interactive-activities')) await route.fulfill(json({ activities: [] }));
      else if (url.pathname.endsWith('/questions')) await route.fulfill(json({ questions: [] }));
      else if (url.pathname.endsWith('/replies')) await route.fulfill(json([]));
      else if (url.pathname.startsWith('/api/participant/idea-validation/') || url.pathname.startsWith('/api/participant/business-plans/')) {
        if (failNextWorkbookSave) {
          failNextWorkbookSave = false;
          await route.fulfill(json({ error: 'Temporary workbook save failure.' }, 503));
        } else await route.fulfill(json({ error: 'Unexpected workbook save request.' }, 500));
      } else await route.fulfill(json([]));
    });

    const capturePage = async (slug: string, language: 'en' | 'ar') => {
      for (const viewport of [{ width: 1280, height: 900 }, { width: 390, height: 844 }]) {
        await page.setViewportSize(viewport);
        await page.evaluate(() => window.scrollTo(0, 0));
        await page.mouse.move(viewport.width - 1, viewport.height - 1);
        await page.waitForTimeout(100);
        const widths = await page.evaluate(() => ({ inner: window.innerWidth, doc: document.documentElement.scrollWidth }));
        assert.ok(widths.doc <= widths.inner, `${slug}/${language} horizontal overflow: ${widths.doc}px > ${widths.inner}px`);
        if (viewport.width === 390) {
          assert.equal(await page.getByRole('navigation', { name: language === 'ar' ? 'أقسام المشارك' : 'Participant sections' }).last().evaluate(element => getComputedStyle(element).position), 'fixed');
          assert.equal(await page.locator('.participant-mobile-nav > a').count(), 4, 'Mobile keeps four direct destinations and reserves More for overflow.');
          assert.equal(await page.locator('.participant-mobile-more > button').isVisible(), true);
        } else {
          assert.equal(await page.locator('.participant-desktop-nav > a').count(), 6, 'Desktop exposes all six participant page links.');
          assert.equal(await page.locator('.participant-desktop-nav button').count(), 0, 'Desktop does not use a More menu.');
        }
        if (captureScreenshots) {
          const suffix = `${slug}-${language}-${viewport.width}.png`;
          await page.screenshot({ path: path.join(screenshotDir, suffix), fullPage: false });
        }
      }
    };
    const openRoute = async (route: typeof pages[number]) => {
      await page.goto(`${origin}${route.path}${route.path.includes('?') ? '&' : '?'}testSession=participant`, { waitUntil: 'domcontentloaded' });
      await page.locator('.participant-layout').waitFor();
      await page.locator('.participant-layout-content h1').first().waitFor();
      await page.waitForTimeout(120);
      const headings = await page.locator('.participant-layout-content h1:visible').count();
      assert.equal(headings, 1, `${route.path} should render exactly one h1`);
      assert.equal(await page.getByRole('main').count(), 1, `${route.path} should expose one primary main landmark.`);
      await page.waitForTimeout(250);
      const focusState = await page.evaluate(() => {
        const heading = document.activeElement as HTMLElement | null;
        return {
          path: window.location.pathname,
          target: heading?.dataset.participantRouteHeading ?? null,
          tag: heading?.tagName ?? null,
          routeHeadings: [...document.querySelectorAll<HTMLElement>('[data-participant-route-heading]')].map(item => item.dataset.participantRouteHeading),
        };
      });
      assert.equal(focusState.target, focusState.path, `${route.path} route heading focus did not settle: ${JSON.stringify(focusState)}`);
      return page.locator('.participant-layout-content h1:visible').first();
    };

    for (const route of pages) {
      console.log(`Capturing participant route: ${route.path}`);
      const heading = await openRoute(route);
      await heading.waitFor();
      assert.match(await heading.innerText(), route.title, `${route.path} heading`);
      assert.equal(await page.getByRole('navigation', { name: 'Participant sections' }).first().count(), 1);
      await capturePage(route.slug, 'en');
      if (route.slug === 'home') {
        assert.ok(apiPaths.has('GET /api/auth/me'), 'Route should retain the existing auth-me access check.');
        assert.ok(apiPaths.has('GET /api/participant/dashboard'), 'Participant dashboard uses its generated API hook.');
        assert.ok(apiPaths.has('GET /api/participant/courses'), 'Home loads released learning modules to select the next action.');
        assert.ok(apiPaths.has('GET /api/participant/courses/progress'), 'Home loads learning progress to skip completed modules.');
        assert.equal(apiPaths.has('GET /api/participant/business-teams'), false, 'Home must not fetch team data.');
        assert.equal([...apiPaths].some(path => path.includes('/peers')), false, 'Home must not fetch the peer directory.');
      }
      await page.getByRole('banner').getByTestId('button-language-toggle').first().click();
      await page.waitForFunction(() => document.documentElement.lang === 'ar' && document.documentElement.dir === 'rtl');
      await page.waitForFunction(() => /[\u0600-\u06FF]/.test(document.body.innerText));
      await capturePage(route.slug, 'ar');
      await page.getByRole('banner').getByTestId('button-language-toggle').first().click();
      await page.waitForFunction(() => document.documentElement.lang === 'en' && document.documentElement.dir === 'ltr');
    }

    await openRoute(pages[0]);
    assert.equal(await page.locator('.participant-summary-tile').count(), 4);
    assert.deepEqual(await page.locator('.participant-summary-tile').evaluateAll(tiles => tiles.map(tile => (tile as HTMLAnchorElement).getAttribute('href'))), [
      '/participant/schedule',
      '/participant/updates',
      '/participant/workbooks/idea',
      '/participant/learning',
    ], 'All summary tiles navigate to their corresponding participant page.');
    assert.equal(await page.locator('.participant-home-update').count(), 1);
    assert.equal(await page.getByRole('link', { name: /See all updates/ }).getAttribute('href'), '/participant/updates');
    await page.setViewportSize({ width: 390, height: 844 });
    await page.locator('.participant-mobile-more > button').click();
    assert.equal(await page.locator('.participant-mobile-popover a').count(), 2);
    await page.locator('.participant-mobile-popover a[href="/participant/workbooks/idea"]').click();
    await page.waitForURL(url => url.pathname === '/participant/workbooks/idea');

    await openRoute(pages[1]);
    await page.getByTestId('participant-announcement-310').waitFor();
    assert.ok(await page.getByTestId('participant-announcement-310').getByText('Pitch practice sign-ups are open').isVisible());
    await openRoute(pages[2]);
    await page.getByTestId('session-participant-501').waitFor();
    await page.getByTestId('meeting-participant-Calendly-801').waitFor();
    assert.equal(await page.getByText('Asia/Amman', { exact: true }).count(), 1, 'Session and mentoring calendar time zones remain available.');
    await openRoute(pages[3]);
    await page.getByTestId('assignment-participant-901').waitFor();
    await page.getByText('Ask your trainer', { exact: true }).waitFor();
    assert.ok(await page.locator('.offline-learning-note').count() >= 1, 'Learning keeps offline-access guidance visible.');
    await openRoute(pages[4]);
    await page.getByRole('tablist', { name: 'Founder workbooks' }).waitFor();
    assert.equal(await page.locator('[role="tab"]').count(), 2);
    assert.equal(await page.getByTestId('input-idea-customerSegment-2601').isVisible(), true, 'Idea workbook fields remain expanded.');
    await page.locator('#participant-workbook-tab-0').press('ArrowRight');
    await page.waitForURL(url => url.pathname === '/participant/workbooks/plan');
    await page.getByTestId('input-business-plan-acquisitionChannels-2601').waitFor();
    assert.equal(await page.getByTestId('input-business-plan-acquisitionChannels-2601').isVisible(), true, 'Business-plan fields remain expanded.');
    await openRoute(pages[4]);
    await page.getByRole('banner').getByTestId('button-language-toggle').first().click();
    await page.waitForFunction(() => document.documentElement.lang === 'ar' && document.documentElement.dir === 'rtl');
    await page.locator('#participant-workbook-tab-0').press('ArrowLeft');
    await page.waitForURL(url => url.pathname === '/participant/workbooks/plan');
    await page.getByRole('banner').getByTestId('button-language-toggle').first().click();
    await page.waitForFunction(() => document.documentElement.lang === 'en' && document.documentElement.dir === 'ltr');
    await openRoute(pages[6]);
    await page.getByTestId('participant-business-teams').waitFor();
    await page.getByTestId('peer-directory-26').waitFor();
    const contactHelpId = await page.locator('.peer-directory-helper').getAttribute('id');
    assert.ok(contactHelpId);
    for (const id of ['checkbox-peer-email-26', 'checkbox-peer-phone-26']) {
      assert.equal(await page.getByTestId(id).isDisabled(), true);
      assert.equal(await page.getByTestId(id).getAttribute('aria-describedby'), contactHelpId);
    }
    await openRoute(pages[7]);
    await openRoute(pages[8]);

    await page.goto(`${origin}/participant?testSession=participant#participant-updates`, { waitUntil: 'domcontentloaded' });
    await page.waitForURL(/\/participant\/updates#participant-updates$/);
    await page.getByTestId('participant-announcement-310').waitFor();
    assert.equal(await page.locator('#participant-updates').count(), 1, 'The legacy updates hash reaches its new page and target.');
    await page.goto(`${origin}/participant?testSession=participant#participant-founder-support`, { waitUntil: 'domcontentloaded' });
    await page.waitForURL(/\/participant\/team#participant-founder-support$/);
    await page.locator('#participant-founder-support').waitFor();
    assert.equal(await page.locator('#participant-founder-support').count(), 1, 'Legacy founder-support links land on the new Team page.');

    await openRoute(pages[4]);
    const ideaField = page.getByTestId('input-idea-customerSegment-2601');
    await ideaField.fill('Unsaved answer must stay protected.');
    assert.equal(await page.locator('.idea-save-area').evaluate(element => getComputedStyle(element).position), 'fixed');
    failNextWorkbookSave = true;
    await page.getByTestId('button-save-idea-2601').click();
    await page.getByTestId('status-idea-save-2601').getByText('Your changes could not be saved. Please try again.').waitFor();
    assert.equal(await ideaField.inputValue(), 'Unsaved answer must stay protected.');
    const beforeUnloadBlocked = await page.evaluate(() => {
      const event = new Event('beforeunload', { cancelable: true });
      window.dispatchEvent(event);
      return event.defaultPrevented;
    });
    assert.equal(beforeUnloadBlocked, true, 'Unsaved workbook content still protects beforeunload.');
    let exitPrompted = false;
    page.once('dialog', async dialog => { exitPrompted = true; assert.equal(dialog.type(), 'confirm'); await dialog.dismiss(); });
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.getByRole('link', { name: 'Chat', exact: true }).click();
    assert.equal(exitPrompted, true, 'In-app route navigation still prompts for unsaved workbook text.');
    assert.equal(new URL(page.url()).pathname, '/participant/workbooks/idea');

    noDataMode = true;
    const heights: Record<string, { enDesktop: number; enMobile: number; arDesktop: number; arMobile: number }> = {};
    for (const route of pages) {
      console.log(`Measuring participant empty state: ${route.path}`);
      const heightRow = { enDesktop: 0, enMobile: 0, arDesktop: 0, arMobile: 0 };
      await openRoute(route);
      await page.setViewportSize({ width: 1280, height: 900 });
      heightRow.enDesktop = await page.evaluate(() => document.documentElement.scrollHeight);
      await page.setViewportSize({ width: 390, height: 844 });
      heightRow.enMobile = await page.evaluate(() => document.documentElement.scrollHeight);
      await page.getByRole('banner').getByTestId('button-language-toggle').first().click();
      await page.waitForFunction(() => document.documentElement.lang === 'ar' && document.documentElement.dir === 'rtl');
      heightRow.arMobile = await page.evaluate(() => document.documentElement.scrollHeight);
      await page.setViewportSize({ width: 1280, height: 900 });
      heightRow.arDesktop = await page.evaluate(() => document.documentElement.scrollHeight);
      await page.getByRole('banner').getByTestId('button-language-toggle').first().click();
      await page.waitForFunction(() => document.documentElement.lang === 'en' && document.documentElement.dir === 'ltr');
      heights[route.slug] = heightRow;
    }
    console.log('Participant no-data document scroll heights (English/Arabic):', JSON.stringify(heights));
    assert.deepEqual(pageErrors, [], 'Participant routes should not produce uncaught browser errors.');
  } finally {
    await browser?.close();
    await vite?.close();
    if (priorPort === undefined) delete process.env.PORT;
    else process.env.PORT = priorPort;
    if (priorBasePath === undefined) delete process.env.BASE_PATH;
    else process.env.BASE_PATH = priorBasePath;
  }
});
