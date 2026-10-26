import assert from 'node:assert/strict';
import { createServer as createNetServer } from 'node:net';
import path from 'node:path';
import test from 'node:test';
import { chromium } from 'playwright-core';
import { createServer as createViteServer } from 'vite';

const packageRoot = path.resolve(import.meta.dirname, '..');
const chromiumPath = process.env.CHROMIUM_PATH || '/repl/tools/bin/chromium';

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

test('public landing and sign-in avoid downloading the authenticated workspace', { timeout: 120_000 }, async () => {
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
    });
    await vite.listen();
    browser = await chromium.launch({
      executablePath: chromiumPath,
      headless: true,
      args: ['--no-sandbox', '--disable-dev-shm-usage'],
    });

    const page = await browser.newPage();
    const requested = new Set<string>();
    page.on('request', request => requested.add(new URL(request.url()).pathname));
    await page.route('**/*', async route => {
      const url = new URL(route.request().url());
      if (url.origin !== origin) {
        await route.abort();
        return;
      }
      if (url.pathname.startsWith('/api/')) {
        await route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ error: 'Unavailable in route test.' }) });
        return;
      }
      await route.continue();
    });

    await page.goto(origin, { waitUntil: 'domcontentloaded' });
    await page.getByRole('heading', { name: /Every founder/i }).waitFor();
    await page.waitForTimeout(500);
    assert.equal([...requested].some(pathname => /\/src\/App\.tsx$/.test(pathname)), false, 'The public landing must not request the authenticated app module.');
    assert.equal([...requested].some(pathname => /\/src\/analytics-surfaces\.tsx$/.test(pathname)), false, 'The public landing must not request the analytics module.');
    assert.equal([...requested].some(pathname => /api[-_]client[-_]react/i.test(pathname)), false, 'The public landing must not download the generated API client just to read branding.');

    await page.goto(`${origin}/sign-in`, { waitUntil: 'domcontentloaded' });
    await page.getByRole('heading', { name: /Welcome back/i }).waitFor();
    assert.equal([...requested].some(pathname => /\/src\/App\.tsx$/.test(pathname)), false, 'The sign-in page must not request the authenticated app module.');
    assert.equal([...requested].some(pathname => /\/src\/analytics-surfaces\.tsx$/.test(pathname)), false, 'The sign-in page must not request the analytics module.');
    assert.equal([...requested].some(pathname => /api[-_]client[-_]react/i.test(pathname)), false, 'The sign-in page must not download the generated API client before authentication.');
  } finally {
    if (browser) await browser.close();
    if (vite) await vite.close();
    if (priorPort === undefined) delete process.env.PORT;
    else process.env.PORT = priorPort;
    if (priorBasePath === undefined) delete process.env.BASE_PATH;
    else process.env.BASE_PATH = priorBasePath;
  }
});

test('public application, judging, and certificate routes stay outside the workspace at a nested base path', { timeout: 120_000 }, async () => {
  const port = await unusedPort();
  const origin = `http://127.0.0.1:${port}`;
  const basePath = '/workspace';
  const priorPort = process.env.PORT;
  const priorBasePath = process.env.BASE_PATH;

  process.env.PORT = String(port);
  process.env.BASE_PATH = `${basePath}/`;
  let vite: Awaited<ReturnType<typeof createViteServer>> | undefined;
  let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;

  try {
    vite = await createViteServer({
      configFile: path.join(packageRoot, 'vite.config.ts'),
      root: packageRoot,
      server: { host: '127.0.0.1', port, strictPort: true },
    });
    await vite.listen();
    browser = await chromium.launch({
      executablePath: chromiumPath,
      headless: true,
      args: ['--no-sandbox', '--disable-dev-shm-usage'],
    });

    const page = await browser.newPage();
    const requested = new Set<string>();
    page.on('request', request => requested.add(new URL(request.url()).pathname + new URL(request.url()).search));
    await page.route('**/*', async route => {
      const url = new URL(route.request().url());
      if (url.origin !== origin) {
        await route.abort();
        return;
      }
      if (url.pathname.startsWith('/api/')) {
        await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'Temporarily unavailable in route test.' }) });
        return;
      }
      await route.continue();
    });

    const assertWorkspaceNotRequested = (routeName: string) => {
      assert.equal([...requested].some(request => /\/src\/App\.tsx(?:\?|$)/.test(request)), false, `${routeName} must not request the authenticated workspace module.`);
    };

    await page.goto(`${origin}${basePath}/apply`, { waitUntil: 'domcontentloaded' });
    await page.getByRole('heading', { name: 'Programs are taking a moment.' }).waitFor();
    assert.ok([...requested].some(request => request === '/api/public/application-programs'), 'The application page must request the open program list.');
    assertWorkspaceNotRequested('The public application page');

    await page.goto(`${origin}${basePath}/judging#${'a'.repeat(43)}`, { waitUntil: 'domcontentloaded' });
    await page.getByRole('heading', { name: 'The form could not load.' }).waitFor();
    assert.ok([...requested].some(request => request === `/api/public/judging-form?token=${'a'.repeat(43)}`), 'The judging page must request its token-specific public form.');
    assertWorkspaceNotRequested('The public judging page');

    await page.goto(`${origin}${basePath}/verify-certificate?code=JUS-2026-AR-8F31D2`, { waitUntil: 'domcontentloaded' });
    await page.getByText('Certificate verification is temporarily unavailable. Please try again.').waitFor();
    assert.ok([...requested].some(request => request === '/api/certificates/JUS-2026-AR-8F31D2/verification'), 'The certificate page must request verification for the supplied code.');
    assertWorkspaceNotRequested('The public certificate verification page');
  } finally {
    if (browser) await browser.close();
    if (vite) await vite.close();
    if (priorPort === undefined) delete process.env.PORT;
    else process.env.PORT = priorPort;
    if (priorBasePath === undefined) delete process.env.BASE_PATH;
    else process.env.BASE_PATH = priorBasePath;
  }
});

test('signed-in visitors reach their role workspace only after session confirmation, including nested app paths', { timeout: 120_000 }, async () => {
  const port = await unusedPort();
  const origin = `http://127.0.0.1:${port}`;
  const basePath = '/workspace';
  const priorPort = process.env.PORT;
  const priorBasePath = process.env.BASE_PATH;
  process.env.PORT = String(port);
  process.env.BASE_PATH = `${basePath}/`;

  let vite: Awaited<ReturnType<typeof createViteServer>> | undefined;
  let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;

  try {
    vite = await createViteServer({
      configFile: path.join(packageRoot, 'vite.config.ts'),
      root: packageRoot,
      server: { host: '127.0.0.1', port, strictPort: true },
      plugins: [{
        name: 'startup-routing-clerk-test-double',
        enforce: 'pre',
        resolveId(source) {
          if (source === '@clerk/react') return path.join(packageRoot, 'src/test-fixtures/mock-clerk.tsx');
          if (source === '@clerk/react/internal') return '\0startup-routing-clerk-internal';
          return null;
        },
        load(id) {
          if (id === '\0startup-routing-clerk-internal') {
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

    const coordinator = {
      id: 41,
      email: 'coordinator@example.test',
      role: 'coordinator',
      primaryRole: 'coordinator',
      status: 'active',
      invitationEmailStatus: null,
      programIds: [],
      programRoles: [],
      createdAt: '2026-01-01T00:00:00.000Z',
    };
    const branding = { brandName: 'Jusoor', logoUrl: null, primaryColor: '#28665a', accentColor: '#c1a36b' };
    const participantProfile = {
      userId: 'test-participant',
      displayName: 'Founder Tester',
      email: 'participant@example.test',
      accountType: 'participant',
      phone: null,
      bio: null,
      organization: null,
      photoUrl: null,
    };

    const createPage = async (session: string) => {
      const page = await browser!.newPage();
      const requests = new Set<string>();
      page.on('request', request => requests.add(new URL(request.url()).pathname));
      await page.route('**/*', async route => {
        const url = new URL(route.request().url());
        if (url.origin !== origin) {
          await route.abort();
          return;
        }
        if (url.pathname === '/api/branding') {
          await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(branding) });
          return;
        }
        if (url.pathname === '/api/auth/me') {
          if (session?.endsWith('coordinator')) {
            await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(coordinator) });
          } else {
            await route.fulfill({ status: 403, contentType: 'application/json', body: JSON.stringify({ error: 'Participant account.' }) });
          }
          return;
        }
        if (url.pathname === '/api/participant/dashboard') {
          await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ applications: [], announcements: [] }) });
          return;
        }
        if (url.pathname === '/api/participant/profile') {
          await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(participantProfile) });
          return;
        }
        if (url.pathname.startsWith('/api/')) {
          await route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ error: 'Not part of this route test.' }) });
          return;
        }
        await route.continue();
      });
      return { page, requests };
    };

    const verifyRoleRoute = async (role: 'coordinator' | 'participant', entry: '/' | '/participant', expectedPath: '/' | '/participant') => {
      const session = entry === '/' && role === 'coordinator' ? 'pending-coordinator' : role;
      const { page, requests } = await createPage(session);
      await page.goto(`${origin}${basePath}${entry}?testSession=${session}`, { waitUntil: 'domcontentloaded' });

      if (session.startsWith('pending-')) {
        await page.getByRole('heading', { name: /Every founder/i }).waitFor();
        await page.waitForTimeout(100);
        assert.equal([...requests].some(pathname => /\/src\/App\.tsx$/.test(pathname)), false, 'The authenticated workspace must not be requested before Clerk confirms the session.');
        assert.equal([...requests].some(pathname => /\/api\/auth\/me$/.test(pathname)), false, 'The authenticated API must not be requested before Clerk confirms the session.');
      }

      const expectedUrl = `${basePath}${expectedPath}`;
      await page.waitForFunction(path => window.location.pathname.replace(/\/$/, '') === path.replace(/\/$/, ''), expectedUrl);
      if (role === 'coordinator') {
        await page.getByRole('heading', { name: 'Good work, moving.' }).waitFor();
      } else {
        await page.getByRole('heading', { name: /Welcome, Founder/i }).waitFor();
      }
      assert.equal([...requests].some(pathname => /\/src\/App\.tsx$/.test(pathname)), true, 'A confirmed signed-in visitor must load the authenticated workspace.');
      await page.close();
    };

    await verifyRoleRoute('coordinator', '/', '/');
    await verifyRoleRoute('participant', '/', '/participant');
    await verifyRoleRoute('coordinator', '/participant', '/');
    await verifyRoleRoute('participant', '/participant', '/participant');

    const signInPage = await browser.newPage();
    await signInPage.route('**/*', async route => {
      const url = new URL(route.request().url());
      if (url.origin !== origin) return route.abort();
      if (url.pathname === '/api/branding') {
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(branding) });
      }
      if (url.pathname.startsWith('/api/')) {
        return route.fulfill({ status: 404, contentType: 'application/json', body: '{}' });
      }
      return route.continue();
    });
    await signInPage.goto(`${origin}${basePath}/sign-in`, { waitUntil: 'domcontentloaded' });
    await signInPage.getByRole('heading', { name: /Welcome back/i }).waitFor();
    assert.equal(await signInPage.getByTestId('mock-clerk-sign-in').getAttribute('data-path'), `${basePath}/sign-in`);
    assert.equal(await signInPage.getByTestId('mock-clerk-sign-in').getAttribute('data-sign-up-url'), `${basePath}/sign-up`);
    await signInPage.close();

    const participantSignInPage = await browser.newPage();
    await participantSignInPage.route('**/*', async route => {
      const url = new URL(route.request().url());
      if (url.origin !== origin) return route.abort();
      if (url.pathname === '/api/branding') {
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(branding) });
      }
      if (url.pathname.startsWith('/api/')) return route.fulfill({ status: 404, contentType: 'application/json', body: '{}' });
      return route.continue();
    });
    await participantSignInPage.goto(`${origin}${basePath}/participant`, { waitUntil: 'domcontentloaded' });
    await participantSignInPage.getByRole('heading', { name: /Welcome back/i }).waitFor();
    assert.equal(await participantSignInPage.getByTestId('mock-clerk-sign-in').getAttribute('data-path'), `${basePath}/sign-in`);
    assert.equal(await participantSignInPage.getByTestId('mock-clerk-sign-in').getAttribute('data-force-redirect-url'), `${basePath}/participant`);
    await participantSignInPage.close();

    const signOutPage = await browser.newPage();
    await signOutPage.route('**/*', async route => {
      const url = new URL(route.request().url());
      if (url.origin !== origin) return route.abort();
      if (url.pathname === '/api/branding') {
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(branding) });
      }
      if (url.pathname === '/api/auth/me') {
        return route.fulfill({ status: 403, contentType: 'application/json', body: JSON.stringify({ error: 'Participant account.' }) });
      }
      if (url.pathname === '/api/participant/dashboard') {
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ applications: [], announcements: [] }) });
      }
      if (url.pathname === '/api/participant/profile') {
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(participantProfile) });
      }
      if (url.pathname.startsWith('/api/')) return route.fulfill({ status: 404, contentType: 'application/json', body: '{}' });
      return route.continue();
    });
    await signOutPage.goto(`${origin}${basePath}/participant?testSession=participant`, { waitUntil: 'domcontentloaded' });
    await signOutPage.getByTestId('button-participant-sign-out').waitFor();
    await signOutPage.getByTestId('button-participant-sign-out').click();
    await signOutPage.waitForFunction(path => window.location.pathname === path, `${basePath}/`);
    await signOutPage.getByRole('heading', { name: /Every founder/i }).waitFor();
    await signOutPage.close();

    const coordinatorSignOutPage = await browser.newPage();
    await coordinatorSignOutPage.route('**/*', async route => {
      const url = new URL(route.request().url());
      if (url.origin !== origin) return route.abort();
      if (url.pathname === '/api/branding') {
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(branding) });
      }
      if (url.pathname === '/api/auth/me') {
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(coordinator) });
      }
      if (url.pathname.startsWith('/api/')) return route.fulfill({ status: 404, contentType: 'application/json', body: '{}' });
      return route.continue();
    });
    await coordinatorSignOutPage.goto(`${origin}${basePath}/?testSession=coordinator`, { waitUntil: 'domcontentloaded' });
    await coordinatorSignOutPage.getByRole('heading', { name: 'Good work, moving.' }).waitFor();
    await coordinatorSignOutPage.getByRole('button', { name: 'Sign out' }).first().click();
    await coordinatorSignOutPage.waitForFunction(path => window.location.pathname.replace(/\/$/, '') === path, basePath);
    await coordinatorSignOutPage.getByRole('heading', { name: /Every founder/i }).waitFor();
    await coordinatorSignOutPage.close();
  } finally {
    if (browser) await browser.close();
    if (vite) await vite.close();
    if (priorPort === undefined) delete process.env.PORT;
    else process.env.PORT = priorPort;
    if (priorBasePath === undefined) delete process.env.BASE_PATH;
    else process.env.BASE_PATH = priorBasePath;
  }
});
