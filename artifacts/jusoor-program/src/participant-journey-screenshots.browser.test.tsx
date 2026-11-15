import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { createServer as createNetServer } from 'node:net';
import path from 'node:path';
import test from 'node:test';
import { chromium } from 'playwright-core';
import { createServer as createViteServer } from 'vite';
import type {
  ParticipantBusinessTeam,
  ParticipantDashboard,
  ParticipantIdeaValidationResponse,
  ParticipantBusinessPlansResponse,
  ParticipantLearningProgress,
  ParticipantPeerDirectory,
  ParticipantCourses,
} from '@workspace/api-client-react';

const packageRoot = path.resolve(import.meta.dirname, '..');
const workspaceRoot = path.resolve(packageRoot, '../..');
const chromiumPath = process.env.CHROMIUM_PATH || '/repl/tools/bin/chromium';
const captureScreenshots = process.env.CAPTURE_PARTICIPANT_SCREENSHOTS === '1';
const screenshotDir = path.join(workspaceRoot, 'generated-artifacts', 'participant-journey');

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

const program = {
  id: 26,
  name: 'Jusoor Growth Lab 2026',
  format: 'bootcamp',
  description: 'A practical growth program for founders building sustainable businesses.',
  startDate: '2026-10-01',
  endDate: '2027-03-31',
} as const;

const demoDashboard = {
  applications: [{
    applicationId: 2601,
    enrollmentSource: 'application',
    applicationStatus: 'accepted',
    submittedAt: '2026-09-28T10:00:00.000Z',
    program,
    business: {
      id: 61,
      businessName: 'Olive & Oat',
      industry: 'Food innovation',
      stage: 'incubator',
    },
    sessions: [
      {
        id: 501,
        title: 'Customer Discovery Workshop',
        type: 'training',
        scheduledDate: '2026-11-18',
        startTime: '15:00',
        durationMinutes: 90,
        facilitator: 'Maya Haddad',
        deliveryMode: 'online',
        location: null,
        zoomUrl: null,
        recordingUrl: null,
        status: 'scheduled',
      },
      {
        id: 502,
        title: 'Pricing and Unit Economics',
        type: 'training',
        scheduledDate: '2026-11-25',
        startTime: '16:00',
        durationMinutes: 90,
        facilitator: 'Omar Saleh',
        deliveryMode: 'in_person',
        location: 'Jusoor Innovation Space',
        zoomUrl: null,
        recordingUrl: null,
        status: 'scheduled',
      },
    ],
    support: [{
      id: 701,
      type: 'mentor',
      provider: 'Nour Khalil',
      topic: 'Customer interviews',
      scheduledDate: '2026-11-19',
      status: 'scheduled',
      mentorBookingUrl: 'https://example.test/mentor-booking',
    }],
    calendlyMeetings: [{
      id: 801,
      eventName: 'Mentor check-in',
      startsAt: '2026-11-19T11:00:00+03:00',
      endsAt: '2026-11-19T11:45:00+03:00',
      timezone: 'Asia/Amman',
      status: 'confirmed',
    }],
    googleCalendarMeetings: [],
    assignments: [{
      id: 901,
      title: 'Map your customer interviews',
      instructions: 'Summarize what you learned from three customer conversations and note one assumption to test next.',
      dueDate: '2026-11-21',
      sessionTitle: 'Customer Discovery Workshop',
      answer: null,
      status: null,
      score: null,
      feedback: null,
      submittedAt: null,
    }],
    questions: [{
      id: 1001,
      programId: 26,
      sessionTitle: 'Customer Discovery Workshop',
      assignmentTitle: null,
      question: 'How many interviews should we complete before refining our customer segment?',
      reply: 'Start with at least five conversations and look for repeated patterns.',
      createdAt: '2026-11-10T09:00:00.000Z',
      repliedAt: '2026-11-11T12:00:00.000Z',
    }],
  }],
  announcements: [{
    id: 310,
    programId: 26,
    programName: 'Jusoor Growth Lab 2026',
    businessId: 61,
    businessName: 'Olive & Oat',
    sessionId: null,
    sessionTitle: null,
    sessionDate: null,
    recordingUrl: null,
    kind: 'reminder',
    title: 'Pitch practice sign-ups are open',
    body: 'Choose a practice slot by 24 November so the team can prepare useful feedback.',
    scheduledFor: '2026-11-12T08:00:00.000Z',
    createdAt: '2026-11-12T08:00:00.000Z',
    readAt: null,
  }],
} satisfies ParticipantDashboard;

const demoProfile = {
  userId: 'demo-participant-rana',
  displayName: 'Rana Al-Haddad',
  email: 'rana@example.test',
  accountType: 'participant',
  phone: null,
  bio: 'Founder working on more sustainable pantry staples.',
  organization: 'Olive & Oat',
  photoUrl: null,
};

const demoBusinessTeams = [{
  programId: 26,
  programName: 'Jusoor Growth Lab 2026',
  businessId: 61,
  businessName: 'Olive & Oat',
  industry: 'Food innovation',
  stage: 'incubator',
  members: [
    { founderName: 'Rana Al-Haddad', isYou: true },
    { founderName: 'Omar Nasser', isYou: false },
  ],
}] satisfies ParticipantBusinessTeam[];

const demoPeerDirectory = {
  programId: 26,
  programName: 'Jusoor Growth Lab 2026',
  preferences: { isListed: false, shareEmail: false, sharePhone: false },
  peers: [{
    founderName: 'Mariam Saleh',
    businessName: 'Suma Pantry',
    industry: 'Food innovation',
    email: null,
    phone: null,
  }],
} satisfies ParticipantPeerDirectory;

const demoIdeaValidation = {
  workbooks: [{
    applicationId: 2601,
    programId: 26,
    programName: 'Jusoor Growth Lab 2026',
    businessName: 'Olive & Oat',
    customerSegment: 'Busy households looking for simple, lower-waste pantry options',
    problemStatement: 'Small households struggle to find practical portions without excess packaging.',
    riskiestAssumption: 'Customers will pay a little more for refillable packaging.',
    mvpExperiment: 'Offer a small refill pilot to ten repeat customers.',
    successSignal: 'At least six customers reorder within one month.',
    evidenceAndNextStep: 'Interview customers after the pilot and compare repeat orders.',
    updatedAt: '2026-11-08T10:00:00.000Z',
  }],
} satisfies ParticipantIdeaValidationResponse;

const demoBusinessPlans = {
  plans: [{
    applicationId: 2601,
    programId: 26,
    programName: 'Jusoor Growth Lab 2026',
    businessName: 'Olive & Oat',
    acquisitionChannels: 'Community markets and referrals',
    outreachActions: 'Speak with five local shops and share a weekly product update.',
    fulfillmentSteps: 'Prepare small batches, confirm orders, then deliver in reusable jars.',
    reviewSignals: 'Repeat orders, customer referrals, and returned jars.',
    updatedAt: '2026-11-09T10:00:00.000Z',
  }],
} satisfies ParticipantBusinessPlansResponse;

const demoLearningProgress = {
  programs: [{
    programId: 26,
    programName: 'Jusoor Growth Lab 2026',
    completedRequiredModules: 1,
    totalRequiredModules: 3,
    completionPercent: 33,
    activeSeconds: 2580,
    lastActivityAt: '2026-11-11T13:00:00.000Z',
    modules: [{
      moduleId: 120,
      title: 'Customer discovery foundations',
      isRequired: true,
      dueAt: '2026-11-24T00:00:00.000Z',
      completedAt: null,
      completionStatus: 'in_progress',
      packages: [],
    }],
    quizzes: [],
    certificate: null,
  }, {
    programId: 27,
    programName: 'Jusoor Growth Lab 2026 · Optional track',
    completedRequiredModules: 0,
    totalRequiredModules: 0,
    completionPercent: 0,
    activeSeconds: 0,
    lastActivityAt: null,
    modules: [],
    quizzes: [],
    certificate: null,
  }],
} satisfies ParticipantLearningProgress;

const demoCourses = {
  programs: [{
    programId: 26,
    programName: 'Jusoor Growth Lab 2026',
    modules: [{
      id: 130,
      title: 'Course guide',
      description: 'A brief introduction to the learning materials.',
      position: 1,
      releaseAt: null,
      dueAt: null,
      isRequired: true,
      materials: [],
    }],
  }],
} satisfies ParticipantCourses;

const jsonResponse = (body: unknown, status = 200) => ({
  status,
  contentType: 'application/json',
  body: JSON.stringify(body),
});

test('participant journey renders demo records at desktop and mobile widths in English and Arabic', { timeout: 120_000 }, async () => {
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
        name: 'participant-journey-clerk-test-double',
        enforce: 'pre',
        resolveId(source) {
          if (source === '@clerk/react') return path.join(packageRoot, 'src/test-fixtures/mock-clerk.tsx');
          if (source === '@clerk/react/internal') return '\0participant-journey-clerk-internal';
          return null;
        },
        load(id) {
          if (id === '\0participant-journey-clerk-internal') {
            return `export const publishableKeyFromHost = () => 'pk_test_mock';`;
          }
          return null;
        },
      }],
    });
    await vite.listen();
    browser = await chromium.launch({
      executablePath: chromiumPath,
      headless: true,
      args: ['--no-sandbox', '--disable-dev-shm-usage'],
    });

    if (captureScreenshots) mkdirSync(screenshotDir, { recursive: true });
    const page = await browser.newPage({
      viewport: { width: 1280, height: 900 },
      deviceScaleFactor: 1,
      hasTouch: true,
    });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const apiPaths = new Set<string>();
    const demoBranding = {
      brandName: 'Jusoor Entrepreneurship Program',
      logoUrl: null,
      primaryColor: '#28665a',
      accentColor: '#c1a36b',
    };

    await page.route('**/*', async route => {
      const url = new URL(route.request().url());
      if (url.origin !== origin) {
        if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
          await route.continue();
        } else {
          await route.abort();
        }
        return;
      }
      if (!url.pathname.startsWith('/api/')) {
        await route.continue();
        return;
      }

      apiPaths.add(`${route.request().method()} ${url.pathname}`);
      if (url.pathname === '/api/branding') {
        await route.fulfill(jsonResponse(demoBranding));
      } else if (url.pathname === '/api/auth/me') {
        // The existing participant entry path treats a non-staff session as a participant.
        // This route remains a 403 just as it does for a participant in production.
        await route.fulfill(jsonResponse({ error: 'Participant account.' }, 403));
      } else if (url.pathname === '/api/participant/dashboard') {
        await route.fulfill(jsonResponse(demoDashboard));
      } else if (url.pathname === '/api/participant/profile') {
        await route.fulfill(jsonResponse(demoProfile));
      } else if (url.pathname === '/api/participant/business-teams') {
        await route.fulfill(jsonResponse(demoBusinessTeams));
      } else if (url.pathname === '/api/participant/programs/26/peers') {
        await route.fulfill(jsonResponse(demoPeerDirectory));
      } else if (url.pathname === '/api/participant/idea-validation') {
        await route.fulfill(jsonResponse(demoIdeaValidation));
      } else if (url.pathname === '/api/participant/business-plans') {
        await route.fulfill(jsonResponse(demoBusinessPlans));
      } else if (url.pathname === '/api/participant/courses/progress') {
        await route.fulfill(jsonResponse(demoLearningProgress));
      } else if (url.pathname === '/api/participant/courses') {
        await route.fulfill(jsonResponse(demoCourses));
      } else if (url.pathname.endsWith('/interactive-activities')) {
        await route.fulfill(jsonResponse({ activities: [] }));
      } else if (url.pathname.endsWith('/questions')) {
        await route.fulfill(jsonResponse({ questions: [] }));
      } else if (url.pathname.endsWith('/replies')) {
        await route.fulfill(jsonResponse([]));
      } else {
        // Other participant-only GETs are kept inside this synthetic demo session.
        await route.fulfill(jsonResponse([]));
      }
    });

    const pageErrors: string[] = [];
    page.on('pageerror', error => pageErrors.push(error.message));
    await page.goto(`${origin}/participant?testSession=participant`, { waitUntil: 'domcontentloaded' });
    await page.getByRole('heading', { name: 'Welcome, Rana.' }).waitFor();
    await page.locator('#participant-next-action').waitFor();
    await page.locator('#participant-program-progress').waitFor();
    await page.locator('#participant-updates').waitFor();
    await page.locator('#participant-sessions').waitFor();
    await page.locator('#participant-mentoring').waitFor();
    await page.locator('#participant-learning').waitFor();
    await page.locator('#participant-founder-workbook').waitFor();
    await page.locator('#participant-business-plan-workbook').waitFor();
    await page.locator('#participant-founder-support').waitFor();
    await page.locator('#participant-assignments').waitFor();
    await page.locator('#participant-business-team').waitFor();
    assert.equal(await page.locator('.participant-next-action').count(), 1);

    const capture = async (label: string, locator?: string) => {
      for (const viewport of [{ width: 1280, height: 900 }, { width: 390, height: 844 }]) {
        await page.setViewportSize(viewport);
        if (locator) await page.locator(locator).scrollIntoViewIfNeeded();
        else await page.evaluate(() => window.scrollTo(0, 0));
        await page.mouse.move(viewport.width - 1, viewport.height - 1);
        await page.waitForTimeout(180);
        const viewportWidth = await page.evaluate(() => window.innerWidth);
        const documentWidth = await page.evaluate(() => document.documentElement.scrollWidth);
        assert.ok(documentWidth <= viewportWidth, `${label}: page overflows horizontally (${documentWidth}px > ${viewportWidth}px).`);
        if (captureScreenshots) {
          const locale = await page.evaluate(() => document.documentElement.lang);
          const fileName = `participant-${label}-${locale}-${viewport.width}.png`;
          await page.screenshot({ path: path.join(screenshotDir, fileName) });
        }
      }
    };

    assert.equal(await page.evaluate(() => document.documentElement.lang), 'en');
    assert.equal(await page.evaluate(() => document.documentElement.dir), 'ltr');
    assert.equal(await page.evaluate(() => window.location.pathname), '/participant');
    const sectionIds = [
      'participant-next-action',
      'participant-program-progress',
      'participant-updates',
      'participant-sessions',
      'participant-mentoring',
      'participant-learning',
      'participant-founder-workbook',
      'participant-business-plan-workbook',
      'participant-founder-support',
      'participant-assignments',
      'participant-business-team',
    ];
    const pageNavigation = page.getByTestId('participant-section-nav');
    assert.equal(await pageNavigation.getAttribute('aria-label'), 'On this page');
    assert.equal(await pageNavigation.locator('a').count(), sectionIds.length);
    assert.equal(await page.getByTestId('link-participant-next-action').getAttribute('aria-current'), 'location', 'The first section should be active before scrolling.');
    for (const id of sectionIds) {
      assert.equal(await page.locator(`#${id}`).count(), 1, `${id} must preserve its in-page anchor.`);
      assert.equal(await page.getByTestId(`link-${id}`).getAttribute('href'), `#${id}`);
    }
    await page.setViewportSize({ width: 390, height: 844 });
    assert.equal(await pageNavigation.locator('.participant-section-nav-links').evaluate(element => element.scrollWidth > element.clientWidth), true, 'The mobile section menu should remain a horizontally scrollable row.');
    await page.setViewportSize({ width: 1280, height: 900 });
    await capture('overview');

    await page.getByTestId('link-participant-updates').click();
    await page.waitForFunction(() => window.location.hash === '#participant-updates');
    const updateLinkState = await page.getByTestId('link-participant-updates').evaluate(element => ({
      current: element.getAttribute('aria-current'),
      hash: window.location.hash,
      targetTop: document.getElementById('participant-updates')?.getBoundingClientRect().top,
      navBottom: document.querySelector('.participant-section-nav')?.getBoundingClientRect().bottom,
      active: Array.from(document.querySelectorAll('.participant-section-nav a[aria-current="location"]')).map(link => link.getAttribute('data-testid')),
    }));
    assert.equal(updateLinkState.current, 'location', `The visible section link should be active after navigation: ${JSON.stringify(updateLinkState)}`);
    await capture('updates', '#participant-updates');
    await capture('sessions', '#participant-sessions');
    await capture('mentoring', '#participant-mentoring');
    await capture('learning', '#participant-learning');

    const ideaToggle = page.getByTestId('button-toggle-idea-workbook-2601');
    assert.equal(await ideaToggle.getAttribute('aria-expanded'), 'true', 'A workbook with saved steps starts expanded.');
    await ideaToggle.click();
    assert.equal(await ideaToggle.getAttribute('aria-expanded'), 'false');
    assert.equal(await page.getByTestId('panel-idea-workbook-2601').isHidden(), true);
    await capture('founder-workbook', '#participant-founder-workbook');
    await ideaToggle.click();
    const ideaFields = await page.getByTestId('panel-idea-workbook-2601').locator('textarea').evaluateAll(elements => elements.map(element => (element as HTMLTextAreaElement).dataset.testid));
    assert.deepEqual(ideaFields, [
      'input-idea-customerSegment-2601',
      'input-idea-problemStatement-2601',
      'input-idea-riskiestAssumption-2601',
      'input-idea-mvpExperiment-2601',
      'input-idea-successSignal-2601',
      'input-idea-evidenceAndNextStep-2601',
    ], 'Collapsing must preserve every founder-workbook field in its existing order.');

    const planToggle = page.getByTestId('button-toggle-business-plan-2601');
    assert.equal(await planToggle.getAttribute('aria-expanded'), 'true', 'A business plan with saved steps starts expanded.');
    await planToggle.click();
    assert.equal(await planToggle.getAttribute('aria-expanded'), 'false');
    assert.equal(await page.getByTestId('panel-business-plan-2601').isHidden(), true);
    await capture('business-plan', '#participant-business-plan-workbook');
    await planToggle.click();
    const planFields = await page.getByTestId('panel-business-plan-2601').locator('textarea').evaluateAll(elements => elements.map(element => (element as HTMLTextAreaElement).dataset.testid));
    assert.deepEqual(planFields, [
      'input-business-plan-acquisitionChannels-2601',
      'input-business-plan-outreachActions-2601',
      'input-business-plan-fulfillmentSteps-2601',
      'input-business-plan-reviewSignals-2601',
    ], 'Collapsing must preserve every business-plan field in its existing order.');

    await capture('founder-support', '#participant-founder-support');
    await capture('assignments', '#participant-assignments');
    await capture('team', '#participant-business-team');
    const contactHelp = page.locator('.peer-directory-helper');
    const contactHelpId = await contactHelp.getAttribute('id');
    assert.ok(contactHelpId);
    for (const id of ['checkbox-peer-email-26', 'checkbox-peer-phone-26']) {
      const contactToggle = page.getByTestId(id);
      assert.equal(await contactToggle.isDisabled(), true);
      assert.equal(await contactToggle.getAttribute('aria-describedby'), contactHelpId);
    }

    await page.getByTestId('participant-announcement-310').waitFor();
    await page.getByTestId('session-participant-501').waitFor();
    await page.getByTestId('participant-learning-progress').waitFor();
    await page.getByTestId('assignment-participant-901').waitFor();
    await page.locator('.offline-learning-note').waitFor();
    await page.locator('.lp-live-explanation').waitFor();

    const offlineNote = page.locator('.offline-learning-note');
    const noteStructure = await offlineNote.evaluate(element => ({
      icon: element.children[0]?.tagName,
      title: element.querySelector('.offline-learning-note-title > b')?.textContent?.trim(),
      body: element.querySelector('.offline-learning-note-body')?.textContent?.trim(),
      titleTop: element.querySelector('.offline-learning-note-title')?.getBoundingClientRect().top,
      bodyTop: element.querySelector('.offline-learning-note-body')?.getBoundingClientRect().top,
    }));
    assert.equal(noteStructure.icon, 'svg', 'The offline note icon should lead the separate title and body.');
    assert.ok(noteStructure.title);
    assert.ok(noteStructure.body);
    assert.ok(noteStructure.bodyTop! > noteStructure.titleTop!, 'The offline-study explanation should begin below its title.');
    assert.equal(await page.getByTestId('text-course-completion-27').innerText(), 'No required modules yet');
    assert.equal(await page.getByTestId('progress-course-27').count(), 0, 'A program with no required modules should not show a progress bar.');
    assert.equal(await page.getByText('No required modules yet', { exact: true }).count(), 2, 'Both course progress and certificate pathway explain the empty requirement.');
    assert.equal(await page.getByTestId('progress-course-26').getAttribute('aria-valuenow'), '33');
    assert.equal(await page.getByTestId('progress-course-26').getAttribute('aria-valuemin'), '0');
    assert.equal(await page.getByTestId('progress-course-26').getAttribute('aria-valuemax'), '100');
    assert.equal(await page.locator('.lp-live-explanation').innerText(), 'We count time while this page is visible and a course card is in view. Program Admins can see your total and cohort averages.');
    assert.equal((await page.locator('.participant-support-note').innerText()).replace(/\s+/g, ' ').trim(), 'Need program support? Contact the program team if you need help outside a session.');
    await capture('sessions', '[data-testid="session-participant-501"]');
    await capture('offline-study', '.offline-learning-note');
    await capture('support', '.participant-support-note');

    await page.getByTestId('button-language-toggle').click();
    await page.getByTestId('button-language-toggle').evaluate(element => (element as HTMLButtonElement).blur());
    await page.mouse.move(1, 1);
    await page.waitForFunction(() => document.documentElement.lang === 'ar' && document.documentElement.dir === 'rtl');
    await page.waitForFunction(() => /[\u0600-\u06FF]/.test(document.body.innerText));
    assert.equal(await page.getByTestId('button-language-toggle').locator('.language-toggle-mark').textContent(), 'EN');
    assert.equal(await page.getByTestId('text-course-completion-27').innerText(), 'لا توجد وحدات مطلوبة بعد');
    assert.equal(await page.locator('.lp-live-explanation').innerText(), 'نحتسب الوقت عندما تكون هذه الصفحة ظاهرة وإحدى بطاقات التعلّم معروضة. ويمكن لمسؤولي البرنامج الاطلاع على إجمالي وقتك ومتوسطات المجموعة.');
    assert.equal((await page.locator('.participant-support-note').innerText()).replace(/\s+/g, ' ').trim(), 'هل تحتاج إلى دعم البرنامج؟ تواصل مع فريق البرنامج إذا احتجت إلى مساعدة خارج الجلسة.');
    await capture('overview');
    await capture('updates', '#participant-updates');
    await capture('sessions', '[data-testid="session-participant-501"]');
    await capture('mentoring', '#participant-mentoring');
    await capture('offline-study', '.offline-learning-note');
    await capture('support', '.participant-support-note');
    await capture('learning', '#participant-learning');
    await capture('founder-workbook', '#participant-founder-workbook');
    await capture('business-plan', '#participant-business-plan-workbook');
    await capture('founder-support', '#participant-founder-support');
    await capture('assignments', '#participant-assignments');
    await capture('team', '#participant-business-team');
    assert.equal(await contactHelp.innerText(), 'فعّل ظهورك في دليل المجموعة أولاً لمشاركة بيانات الاتصال.');

    assert.deepEqual(pageErrors, [], 'The participant journey should render without uncaught browser errors.');
    assert.ok(apiPaths.has('GET /api/auth/me'), 'The test must traverse the normal participant role-routing branch.');
    assert.ok(apiPaths.has('GET /api/participant/dashboard'), 'The demo participant dashboard should load through its normal API client.');
    if (captureScreenshots) console.log(`Saved participant journey screenshots under ${path.relative(workspaceRoot, screenshotDir)}.`);
    await page.close();
  } finally {
    await browser?.close();
    await vite?.close();
    if (priorPort === undefined) delete process.env.PORT;
    else process.env.PORT = priorPort;
    if (priorBasePath === undefined) delete process.env.BASE_PATH;
    else process.env.BASE_PATH = priorBasePath;
  }
});
