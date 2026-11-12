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
  }],
} satisfies ParticipantLearningProgress;

const demoCourses = {
  programs: [],
} satisfies ParticipantCourses;

const jsonResponse = (body: unknown, status = 200) => ({
  status,
  contentType: 'application/json',
  body: JSON.stringify(body),
});

test('participant journey renders demo records and captures English and Arabic at 390px', { timeout: 120_000 }, async () => {
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
      viewport: { width: 390, height: 844 },
      deviceScaleFactor: 1,
      isMobile: true,
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
    await page.getByTestId('session-participant-501').waitFor();
    await page.getByTestId('participant-business-teams').waitFor();
    await page.getByTestId('participant-announcement-310').waitFor();
    await page.getByTestId('participant-learning-progress').waitFor();
    await page.getByTestId('assignment-participant-901').waitFor();

    const capture = async (label: string, locator?: string) => {
      if (locator) await page.locator(locator).scrollIntoViewIfNeeded();
      await page.mouse.move(389, 843);
      await page.waitForTimeout(180);
      const viewportWidth = await page.evaluate(() => window.innerWidth);
      const documentWidth = await page.evaluate(() => document.documentElement.scrollWidth);
      assert.ok(documentWidth <= viewportWidth, `${label}: page overflows horizontally (${documentWidth}px > ${viewportWidth}px).`);
      if (captureScreenshots) {
        const locale = await page.evaluate(() => document.documentElement.lang);
        const fileName = `participant-${label}-${locale}-390.png`;
        await page.screenshot({ path: path.join(screenshotDir, fileName) });
      }
    };

    assert.equal(await page.evaluate(() => document.documentElement.lang), 'en');
    assert.equal(await page.evaluate(() => document.documentElement.dir), 'ltr');
    await capture('overview');
    await capture('sessions', '[data-testid="session-participant-501"]');
    await capture('team', '[data-testid="participant-business-teams"]');
    await capture('updates', '[data-testid="participant-announcement-310"]');
    await capture('learning', '[data-testid="participant-learning-progress"]');

    await page.getByTestId('button-language-toggle').click();
    await page.getByTestId('button-language-toggle').evaluate(element => (element as HTMLButtonElement).blur());
    await page.mouse.move(1, 1);
    await page.waitForFunction(() => document.documentElement.lang === 'ar' && document.documentElement.dir === 'rtl');
    await page.waitForFunction(() => /[\u0600-\u06FF]/.test(document.body.innerText));
    assert.equal(await page.getByTestId('button-language-toggle').locator('.language-toggle-mark').textContent(), 'EN');
    await capture('overview');
    await capture('sessions', '[data-testid="session-participant-501"]');
    await capture('team', '[data-testid="participant-business-teams"]');
    await capture('updates', '[data-testid="participant-announcement-310"]');
    await capture('learning', '[data-testid="participant-learning-progress"]');

    assert.deepEqual(pageErrors, [], 'The participant journey should render without uncaught browser errors.');
    assert.ok(apiPaths.has('GET /api/auth/me'), 'The test must traverse the normal participant role-routing branch.');
    assert.ok(apiPaths.has('GET /api/participant/dashboard'), 'The demo participant dashboard should load through its normal API client.');
    if (captureScreenshots) console.log(`Saved 10 participant screenshots under ${path.relative(workspaceRoot, screenshotDir)}.`);
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
