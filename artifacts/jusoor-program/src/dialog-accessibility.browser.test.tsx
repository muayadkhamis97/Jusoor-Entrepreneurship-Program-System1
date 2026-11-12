import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createServer as createNetServer } from 'node:net';
import path from 'node:path';
import test, { before } from 'node:test';
import { chromium } from 'playwright-core';
import { createServer as createViteServer } from 'vite';
import { getMobilePrimaryNavigationItems, getStaffNavigationItems } from './staff-navigation-items';
import { loadArabicTranslations, translate } from './language';

const packageRoot = path.resolve(import.meta.dirname, '..');
const chromiumPath = process.env.CHROMIUM_PATH || '/repl/tools/bin/chromium';

before(async () => {
  await loadArabicTranslations();
});

test('production dialog call sites preserve dirty and pending-action safeguards', async () => {
  const paths = [
    'App.tsx',
    'analytics-surfaces.tsx',
    'api-integrations.tsx',
    'course-package-player.tsx',
    'course-quizzes.tsx',
    'course-surfaces.tsx',
    'grant-surfaces.tsx',
    'intake-surfaces.tsx',
    'learning-progress.tsx',
    'session-interactions.tsx',
  ];
  const sources = await Promise.all(paths.map(file => readFile(path.join(packageRoot, 'src', file), 'utf8')));
  const [app, analytics, api, packagePlayer, quizzes, courses, grants, intake, progress, sessions] = sources;

  assert.match(intake, /AccessibleDialogSurface/);
  assert.match(intake, /labelledBy=/);
  assert.match(app, /closeOnEscape=\{!loading\}/, 'record-delete confirmation must remain open while deleting');
  assert.ok(app.includes('disabled={loading} data-dialog-autofocus data-testid="button-keep-record"'), 'record-delete cancellation must be unavailable while deleting');
  assert.match(app, /closeOnEscape=\{!archive\.isPending\}/, 'program archival must remain open while pending');
  assert.match(analytics, /closeOnEscape=\{!removeKpi\.isPending\}/, 'KPI deletion must remain open while pending');
  assert.match(api, /closeOnEscape=\{secretCanClose\}/, 'one-time key dialog must require acknowledgement before dismissal');
  assert.match(api, /closeOnEscape=\{!revokeKey\.isPending\}/, 'key revocation must remain open while pending');
  assert.match(api, /revokeKey\.isPending && <p role="status" aria-live="polite">/, 'key revocation progress must be announced through a polite live status');
  assert.match(courses, /closeOnEscape=\{!busy && !dirty\}/, 'course forms must protect pending and dirty state');
  assert.match(courses, /confirmCourseFormDiscard && <UnsavedChangesDialog/);
  assert.match(courses, /onChange=\{\(\) => setCourseFormDirty\(true\)\}/);
  assert.ok(courses.includes('disabled={pendingDelete} data-testid="button-cancel-delete-course"'), 'course deletion cancellation must be unavailable while deleting');
  assert.match(quizzes, /closeOnEscape=\{!pending\}/, 'quiz save must remain open while pending');
  assert.ok(quizzes.includes("disabled={pending} aria-label={t('Close quiz editor')}"));
  assert.ok(quizzes.includes("onClick={onClose} disabled={pending}>{t('Close')}"));
  assert.match(quizzes, /clearCourseQuizDraft\(draftStorageKey\)/, 'saved drafts are only cleared through the save/discard flow');
  assert.match(grants, /closeOnEscape=\{!dirty && !saving\}/);
  assert.match(sessions, /closeOnEscape=\{!dirty && !pending\}/);
  assert.match(packagePlayer, /labelledBy="package-player-title"/);
  assert.match(packagePlayer, /closeOnOutsideInteraction=\{false\}/);
  assert.match(progress, /<DialogTitle>/);
  assert.match(progress, /<DialogDescription>/);
});

async function checkStaffMenu(page: import('playwright-core').Page, role: 'coordinator' | 'staff', language: 'en' | 'ar') {
  const items = getStaffNavigationItems(role);
  const primaryItems = getMobilePrimaryNavigationItems(items);
  const primaryLabels = primaryItems.map(item => translate(item.mobileLabel ?? item.label, language));
  const primaryPaths = new Set(primaryItems.map(item => item.href));
  const overflowItems = items.filter(item => !primaryPaths.has(item.href));
  const overflowLabels = overflowItems.map(item => translate(item.label, language));
  const roleButton = page.getByTestId(role === 'coordinator' ? 'role-coordinator' : 'role-staff');
  await roleButton.click();
  const navigation = page.getByTestId('mobile-staff-navigation');
  const activeLabel = primaryLabels[primaryItems.findIndex(item => item.href === '/sessions')];
  const activeHref = '/sessions';
  assert.equal(await navigation.getAttribute('aria-label'), translate('Main navigation', language));

  const links = navigation.getByRole('link');
  assert.equal(await links.count(), primaryItems.length, `${role} should show only its primary destinations in ${language}.`);
  for (const [index, label] of primaryLabels.entries()) {
    const link = links.nth(index);
    assert.equal((await link.locator('span').textContent())?.trim(), label, `${role} primary destination ${index + 1} should be labeled in ${language}.`);
    assert.ok(await link.isVisible(), `${role} primary destination "${label}" should remain visible in ${language}.`);
  }

  const moreButton = page.getByTestId('button-mobile-more');
  assert.equal(await moreButton.getAttribute('aria-label'), translate('More', language));
  await moreButton.focus();
  await page.keyboard.press('Enter');
  const moreMenu = page.getByRole('menu', { name: translate('More', language) });
  await moreMenu.waitFor();
  const menuItems = moreMenu.getByRole('menuitem');
  assert.equal(await menuItems.count(), overflowItems.length + 1, `${role} More menu should expose remaining routes and sign out in ${language}.`);
  for (const [index, label] of overflowLabels.entries()) {
    assert.equal((await menuItems.nth(index).textContent())?.trim(), label, `${role} menu destination ${index + 1} should be labeled in ${language}.`);
    assert.equal(await menuItems.nth(index).getAttribute('href'), overflowItems[index].href, `${role} menu item should preserve its route in ${language}.`);
  }
  assert.equal((await menuItems.nth(overflowItems.length).textContent())?.trim(), translate('Sign out', language));
  await page.keyboard.press('Escape');
  await moreMenu.waitFor({ state: 'detached' });
  assert.equal(await page.evaluate(() => document.activeElement?.getAttribute('data-testid')), 'button-mobile-more');

  const activeLink = navigation.getByRole('link', { name: activeLabel, exact: true });
  assert.equal(await activeLink.getAttribute('href'), activeHref);
  assert.equal(await activeLink.getAttribute('aria-current'), 'page', `${role} active page should be announced in ${language}.`);
  assert.match(await activeLink.getAttribute('class') || '', /mobile-active/, `${role} active page should be visually marked in ${language}.`);
  const activeStyle = await activeLink.evaluate(element => ({
    background: getComputedStyle(element).backgroundColor,
    color: getComputedStyle(element).color,
  }));
  const inactiveStyle = await links.nth(0).evaluate(element => ({
    background: getComputedStyle(element).backgroundColor,
    color: getComputedStyle(element).color,
  }));
  assert.notEqual(activeStyle.background, inactiveStyle.background, `${role} active page needs a visible background distinction in ${language}.`);
  assert.notEqual(activeStyle.color, inactiveStyle.color, `${role} active page needs a visible text distinction in ${language}.`);

  const scrollMetrics = await navigation.evaluate(element => ({
    width: element.clientWidth,
    contentWidth: element.scrollWidth,
    overflowX: getComputedStyle(element).overflowX,
    position: getComputedStyle(element).position,
  }));
  assert.equal(scrollMetrics.overflowX, 'hidden');
  assert.ok(scrollMetrics.contentWidth <= scrollMetrics.width + 1, `${role} bottom bar should fit without horizontal scrolling in ${language}.`);
  assert.equal(scrollMetrics.position, 'fixed');

  const assertFocusedLinkIsInView = async () => {
    const rect = await page.evaluate(() => {
      const item = document.activeElement?.getBoundingClientRect();
      const nav = document.querySelector<HTMLElement>('[data-testid="mobile-staff-navigation"]')?.getBoundingClientRect();
      return item && nav ? { itemLeft: item.left, itemRight: item.right, navLeft: nav.left, navRight: nav.right } : null;
    });
    assert.ok(rect && rect.itemRight > rect.navLeft && rect.itemLeft < rect.navRight, `${role} keyboard focus should scroll its destination into view in ${language}.`);
  };

  await links.first().focus();
  await assertFocusedLinkIsInView();
  for (let index = 1; index < primaryLabels.length; index += 1) {
    await page.keyboard.press('Tab');
    const focusedTestId = await page.evaluate(() => document.activeElement?.getAttribute('data-testid'));
    assert.equal(focusedTestId, await links.nth(index).getAttribute('data-testid'), `${role} destination ${index + 1} should be reachable by keyboard in ${language}.`);
    await assertFocusedLinkIsInView();
  }
  await page.keyboard.press('Tab');
  assert.equal(await page.evaluate(() => document.activeElement?.getAttribute('data-testid')), 'button-mobile-more', `${role} More menu should follow the primary links in keyboard order.`);
}

type AccessibilityTreeNode = {
  role?: { value?: string };
  name?: { value?: string };
  description?: { value?: string };
  properties?: Array<{ name: string; value?: { value?: unknown } }>;
};

async function getAccessibilityTree(page: import('playwright-core').Page) {
  const session = await page.context().newCDPSession(page);
  try {
    await session.send('Accessibility.enable');
    const { nodes } = await session.send('Accessibility.getFullAXTree');
    return nodes as AccessibilityTreeNode[];
  } finally {
    await session.detach();
  }
}

function axProperty(node: AccessibilityTreeNode | undefined, name: string) {
  return node?.properties?.find(property => property.name === name)?.value?.value;
}

async function assertAccessibleDialog(
  page: import('playwright-core').Page,
  {
    role,
    name,
    description,
    focusedName,
    actions,
  }: {
    role: 'dialog' | 'alertdialog';
    name: string;
    description?: string;
    focusedName: string;
    actions: string[];
  },
) {
  const nodes = (await getAccessibilityTree(page)).filter(node => node.role?.value && node.name?.value);
  const dialog = nodes.find(node => node.role?.value === role && node.name?.value === name);
  assert.ok(dialog, `Chromium accessibility tree should expose ${role} "${name}".`);
  if (description !== undefined) {
    assert.equal(dialog.description?.value, description, `${name} should expose its description.`);
  }
  const focused = nodes.find(node => node.role?.value !== 'RootWebArea' && axProperty(node, 'focused') === true);
  assert.equal(focused?.name?.value, focusedName, `${name} should expose the intended initial focus.`);
  const buttonNames = nodes
    .filter(node => node.role?.value === 'button')
    .map(node => node.name?.value);
  for (const action of actions) {
    assert.ok(buttonNames.includes(action), `${name} should expose the "${action}" action.`);
  }
  return nodes;
}

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

test('dialogs preserve focus and form state; mobile staff navigation labels its routes', { timeout: 120_000 }, async () => {
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
    const page = await browser.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true });
    const runtimeErrors: string[] = [];
    page.on('pageerror', error => runtimeErrors.push(error.message));
    await page.route('**/*', route => {
      const requestUrl = new URL(route.request().url());
      if (requestUrl.origin === `http://127.0.0.1:${port}` && route.request().method() === 'GET') {
        return route.continue();
      }
      return route.abort('blockedbyclient');
    });
    await page.goto(`${origin}/src/test-fixtures/dialog-accessibility.html`, { waitUntil: 'domcontentloaded' });

    await page.setViewportSize({ width: 1280, height: 800 });
    const reviewOpener = page.getByRole('button', { name: 'Open application review' });
    await reviewOpener.click();
    const applicationReview = page.getByRole('dialog', { name: 'Application review' });
    await applicationReview.waitFor();
    await assertAccessibleDialog(page, {
      role: 'dialog',
      name: 'Application review',
      description: 'Synthetic applicant and venture details.',
      focusedName: 'Application review',
      actions: ['Close review'],
    });
    assert.equal(await applicationReview.getAttribute('aria-modal'), 'true');
    assert.equal(await applicationReview.getAttribute('aria-describedby'), 'fixture-review-description');
    assert.equal(await page.evaluate(() => document.activeElement?.id), 'fixture-review-title', 'Application review should focus its heading.');
    const desktopBounds = await applicationReview.boundingBox();
    assert.ok(desktopBounds && desktopBounds.x >= 0 && desktopBounds.y >= 0 && desktopBounds.x + desktopBounds.width <= 1280 && desktopBounds.y + desktopBounds.height <= 800, 'Dialog should fit the desktop viewport.');
    await page.keyboard.press('Escape');
    await applicationReview.waitFor({ state: 'detached' });
    await page.waitForFunction(() => document.activeElement?.id === 'open-application-review');
    await page.setViewportSize({ width: 390, height: 844 });

    const openForm = page.getByRole('button', { name: 'Open sample form' });
    await openForm.click();
    const formDialog = page.getByRole('dialog', { name: 'Edit sample record' });
    await formDialog.waitFor();
    await assertAccessibleDialog(page, {
      role: 'dialog',
      name: 'Edit sample record',
      description: 'Update this sample record.',
      focusedName: 'Record name',
      actions: ['Cancel', 'Save record', 'Close sample form'],
    });
    assert.equal(await formDialog.getAttribute('aria-modal'), 'true');
    assert.equal(await formDialog.getAttribute('aria-labelledby'), 'fixture-form-title');
    assert.equal(await formDialog.getAttribute('aria-describedby'), 'fixture-form-description');
    assert.equal(await page.evaluate(() => document.activeElement?.id), 'fixture-form-input', 'Opening a form should focus its first field.');
    const formBounds = await formDialog.boundingBox();
    assert.ok(formBounds && formBounds.x >= 0 && formBounds.y >= 0 && formBounds.x + formBounds.width <= 390 && formBounds.y + formBounds.height <= 844, 'Dialog should fit the mobile viewport.');
    await formDialog.evaluate(element => {
      element.style.maxHeight = '180px';
      element.style.overflowY = 'auto';
    });
    await formDialog.dispatchEvent('wheel', { deltaY: 60, bubbles: true, cancelable: true });
    await formDialog.evaluate(element => {
      element.style.maxHeight = '';
      element.style.overflowY = '';
    });

    const field = page.getByLabel('Record name');
    await field.fill('Synthetic value stays here');
    await page.getByRole('button', { name: 'Save record' }).click();
    await page.getByRole('alert').getByText('The record could not be saved. Try again.').waitFor();
    const formErrorTree = await getAccessibilityTree(page);
    assert.ok(formErrorTree.some(node => node.role?.value === 'alert'), 'The form error should be exposed to assistive technology as an alert.');
    assert.ok(formErrorTree.some(node => node.name?.value === 'The record could not be saved. Try again.'), 'The alert text should be present in Chromium’s accessibility tree.');
    assert.equal(await field.inputValue(), 'Synthetic value stays here', 'A failed save must not clear form input.');
    assert.equal(await formDialog.count(), 1, 'A validation/server error should leave the dialog open.');

    await page.getByRole('button', { name: 'Save record' }).focus();
    await page.keyboard.press('Tab');
    assert.equal(await page.evaluate(() => document.activeElement?.getAttribute('aria-label')), 'Close sample form', 'Tab from the last dialog action should wrap to the first.');
    await page.keyboard.press('Shift+Tab');
    assert.equal(await page.evaluate(() => document.activeElement?.textContent?.trim()), 'Save record', 'Shift+Tab from the first control should wrap to the last.');

    await field.focus();
    await page.keyboard.press('Escape');
    await formDialog.waitFor({ state: 'detached' });
    await page.waitForFunction(() => document.activeElement?.id === 'open-sample-form');
    assert.equal(await page.evaluate(() => document.activeElement?.id), 'open-sample-form', 'Closing with Escape should restore focus to the opener.');

    await openForm.click();
    const reopenedForm = page.getByRole('dialog', { name: 'Edit sample record' });
    await reopenedForm.waitFor();
    await page.getByRole('button', { name: 'Cancel' }).click();
    await reopenedForm.waitFor({ state: 'detached' });
    await page.waitForFunction(() => document.activeElement?.id === 'open-sample-form');

    const openCourse = page.getByRole('button', { name: 'Open course content' });
    await openCourse.click();
    const courseDialog = page.getByRole('dialog', { name: 'Edit course content' });
    await courseDialog.waitFor();
    assert.equal(await page.evaluate(() => document.activeElement?.id), 'fixture-course-input', 'Opening course content should focus its first field.');
    const courseTitle = page.getByLabel('Course title');
    await courseTitle.fill('Course title with retained edits');
    await page.getByRole('button', { name: 'Save course' }).click();
    await page.getByRole('alert').getByText('Course content could not be saved.').waitFor();
    assert.equal(await courseTitle.inputValue(), 'Course title with retained edits', 'Course form values must remain after a validation error.');
    await page.getByRole('button', { name: 'Close course form' }).click();
    const courseDiscardPrompt = page.getByRole('alertdialog', { name: 'Discard unsaved changes?' });
    await courseDiscardPrompt.waitFor();
    await page.getByRole('button', { name: 'Keep editing' }).click();
    await courseDiscardPrompt.waitFor({ state: 'detached' });
    assert.equal(await courseTitle.inputValue(), 'Course title with retained edits', 'Keeping the form open must preserve course changes.');
    await page.keyboard.press('Escape');
    await courseDiscardPrompt.waitFor();
    await page.getByRole('button', { name: 'Discard changes' }).click();
    await courseDiscardPrompt.waitFor({ state: 'detached' });
    await courseDialog.waitFor({ state: 'detached' });
    assert.equal(await page.evaluate(() => document.activeElement?.id), 'open-course-content', 'Discarding a nested course form must restore focus to its original opener.');

    const openQuiz = page.getByRole('button', { name: 'Open quiz editor' });
    await openQuiz.click();
    const quizDialog = page.getByRole('dialog', { name: 'Create a quiz' });
    await quizDialog.waitFor();
    assert.equal(await page.evaluate(() => document.activeElement?.id), 'fixture-quiz-input', 'Opening the quiz editor should focus its first field.');
    const quizTitle = page.getByLabel('Quiz title');
    await page.getByRole('button', { name: 'Save quiz' }).click();
    await page.getByRole('alert').getByText('Add a quiz title.').waitFor();
    await quizTitle.fill('Knowledge check');
    assert.equal(await quizTitle.inputValue(), 'Knowledge check', 'Quiz draft values must remain editable after a validation error.');
    await page.getByRole('button', { name: 'Save quiz' }).focus();
    await page.keyboard.press('Tab');
    assert.equal(await page.evaluate(() => document.activeElement?.getAttribute('aria-label')), 'Close quiz editor', 'Tab from the last quiz action should wrap to the first control.');
    await page.keyboard.press('Escape');
    await quizDialog.waitFor({ state: 'detached' });
    await page.waitForFunction(() => document.activeElement?.id === 'open-quiz-editor');

    const openConfirm = page.getByRole('button', { name: 'Open confirmation' });
    await openConfirm.click();
    const confirmDialog = page.getByRole('alertdialog', { name: 'Confirm removal' });
    await confirmDialog.waitFor();
    await assertAccessibleDialog(page, {
      role: 'alertdialog',
      name: 'Confirm removal',
      description: 'This is a synthetic confirmation only.',
      focusedName: 'Cancel',
      actions: ['Cancel', 'Remove'],
    });
    assert.equal(await page.evaluate(() => document.activeElement?.id), 'fixture-confirm-cancel', 'Confirmation should initially focus its safe cancel action.');
    await page.keyboard.press('Escape');
    await confirmDialog.waitFor({ state: 'detached' });
    await page.waitForFunction(() => document.activeElement?.id === 'open-confirmation');
    assert.equal(await page.evaluate(() => document.activeElement?.id), 'open-confirmation', 'Closing a confirmation should restore focus to its opener.');
    await openConfirm.click();
    await page.getByRole('alertdialog', { name: 'Confirm removal' }).getByRole('button', { name: 'Remove' }).click();
    await page.getByRole('status').getByText('Synthetic record removed').waitFor();

    const dirtyOpener = page.getByRole('button', { name: 'Open dirty editor' });
    await dirtyOpener.click();
    const dirtyDialog = page.getByRole('dialog', { name: 'Edit a synthetic draft' });
    await dirtyDialog.waitFor();
    await page.getByLabel('Draft value').fill('Keep this synthetic draft');
    await page.keyboard.press('Escape');
    const discardPrompt = page.getByRole('alertdialog', { name: 'Discard unsaved changes?' });
    await discardPrompt.waitFor();
    await assertAccessibleDialog(page, {
      role: 'alertdialog',
      name: 'Discard unsaved changes?',
      description: 'Your changes have not been saved. Leave this editor and discard them?',
      focusedName: 'Keep editing',
      actions: ['Keep editing', 'Discard changes'],
    });
    await page.getByRole('button', { name: 'Keep editing' }).click();
    await discardPrompt.waitFor({ state: 'detached' });
    assert.equal(await page.getByLabel('Draft value').inputValue(), 'Keep this synthetic draft');
    await page.keyboard.press('Escape');
    await discardPrompt.waitFor();
    await page.getByRole('button', { name: 'Discard changes' }).click();
    await discardPrompt.waitFor({ state: 'detached' });
    await dirtyDialog.waitFor({ state: 'detached' });
    await page.waitForFunction(() => document.activeElement?.id === 'open-dirty-editor');

    const secretOpener = page.getByRole('button', { name: 'Open one-time key' });
    await secretOpener.click();
    const secretDialog = page.getByRole('dialog', { name: 'One-time program key' });
    await secretDialog.waitFor();
    await assertAccessibleDialog(page, {
      role: 'dialog',
      name: 'One-time program key',
      description: 'Synthetic secret used only to test acknowledgement behavior.',
      focusedName: 'Copy synthetic key',
      actions: ['Copy synthetic key', 'I saved the key'],
    });
    const secretTree = await getAccessibilityTree(page);
    assert.ok(secretTree.some(node => node.role?.value === 'alert'), 'The one-time-secret warning should be exposed as an alert.');
    assert.ok(secretTree.some(node => node.name?.value === 'This synthetic key is shown once. Keep it private.'), 'The one-time-secret warning text should be available in the accessibility tree.');
    assert.ok(
      secretTree.some(node => node.role?.value === 'button' && node.name?.value === 'I saved the key' && axProperty(node, 'disabled') === true),
      'The one-time-secret acknowledgement action should remain unavailable until the secret is copied.',
    );
    assert.equal(await page.evaluate(() => document.activeElement?.id), 'button-copy-synthetic-secret');
    await page.keyboard.press('Escape');
    assert.equal(await secretDialog.count(), 1, 'A one-time key cannot be dismissed before acknowledgement.');
    await page.mouse.click(4, 4);
    assert.equal(await secretDialog.count(), 1, 'Outside interaction cannot dismiss a one-time key before acknowledgement.');
    await page.getByRole('button', { name: 'Copy synthetic key' }).click();
    await page.keyboard.press('Escape');
    await secretDialog.waitFor({ state: 'detached' });
    await page.waitForFunction(() => document.activeElement?.id === 'open-synthetic-secret');

    const revokeOpener = page.getByRole('button', { name: 'Open key revocation' });
    await revokeOpener.click();
    const revokeDialog = page.getByRole('alertdialog', { name: 'Revoke synthetic key?' });
    await revokeDialog.waitFor();
    await assertAccessibleDialog(page, {
      role: 'alertdialog',
      name: 'Revoke synthetic key?',
      description: 'This is a local confirmation fixture.',
      focusedName: 'Keep key',
      actions: ['Keep key', 'Start synthetic revoke'],
    });
    await page.getByRole('button', { name: 'Start synthetic revoke' }).click();
    const pendingRevokeTree = await getAccessibilityTree(page);
    assert.ok(
      pendingRevokeTree.some(node => node.role?.value === 'button' && node.name?.value === 'Keep key' && axProperty(node, 'disabled') === true),
      'The pending destructive action should expose its disabled safe-cancel control.',
    );
    assert.ok(
      pendingRevokeTree.some(node => node.role?.value === 'button' && node.name?.value === 'Finish synthetic revoke'),
      'The pending destructive action should retain its available completion action.',
    );
    assert.ok(pendingRevokeTree.some(node => node.role?.value === 'status'), 'Pending revocation should expose a live status.');
    assert.ok(
      pendingRevokeTree.some(node => node.name?.value === 'Revocation is in progress.'),
      'The live status should have useful pending text.',
    );
    await page.keyboard.press('Escape');
    assert.equal(await revokeDialog.count(), 1, 'A pending revocation cannot be dismissed with Escape.');
    assert.equal(await page.getByRole('button', { name: 'Keep key' }).isDisabled(), true);
    await page.getByRole('button', { name: 'Finish synthetic revoke' }).click();
    await revokeDialog.waitFor({ state: 'detached' });
    await page.waitForFunction(() => document.activeElement?.id === 'open-synthetic-revoke');

    await page.getByRole('button', { name: 'Open removable-trigger dialog' }).click();
    const removableDialog = page.getByRole('dialog', { name: 'Trigger removal test' });
    await removableDialog.waitFor();
    await page.getByRole('button', { name: 'Remove opener from page' }).click();
    assert.equal(await page.locator('#open-removable-trigger').count(), 0);
    await page.getByRole('button', { name: 'Close test dialog' }).click();
    await removableDialog.waitFor({ state: 'detached' });
    await page.waitForFunction(() => document.activeElement?.getAttribute('data-testid') === 'dialog-focus-fallback');

    await page.getByRole('button', { name: 'Open dialog without a focused opener' }).click();
    const noOpenerDialog = page.getByRole('dialog', { name: 'No opener test' });
    await noOpenerDialog.waitFor();
    await page.getByRole('button', { name: 'Close no-opener dialog' }).click();
    await noOpenerDialog.waitFor({ state: 'detached' });
    await page.waitForFunction(() => document.activeElement?.getAttribute('data-testid') === 'dialog-focus-fallback');

    const languageToggle = page.getByTestId('button-language-toggle').first();
    await languageToggle.click();
    await page.waitForFunction(() => document.documentElement.lang === 'ar' && document.documentElement.dir === 'rtl');
    await dirtyOpener.click();
    await page.getByLabel('Draft value').fill('Arabic synthetic draft');
    await page.keyboard.press('Escape');
    const arabicDiscardPrompt = page.getByRole('alertdialog', { name: 'هل تريد تجاهل التغييرات غير المحفوظة؟' });
    await arabicDiscardPrompt.waitFor();
    await assertAccessibleDialog(page, {
      role: 'alertdialog',
      name: 'هل تريد تجاهل التغييرات غير المحفوظة؟',
      description: 'لم تُحفظ تغييراتك. هل تريد مغادرة هذه النافذة وتجاهلها؟',
      focusedName: 'متابعة التحرير',
      actions: ['متابعة التحرير', 'تجاهل التغييرات'],
    });
    await page.getByRole('button', { name: 'متابعة التحرير' }).click();
    await arabicDiscardPrompt.waitFor({ state: 'detached' });
    await page.keyboard.press('Escape');
    await arabicDiscardPrompt.waitFor();
    await page.getByRole('button', { name: 'تجاهل التغييرات' }).click();
    await dirtyDialog.waitFor({ state: 'detached' });
    await page.waitForFunction(() => document.activeElement?.id === 'open-dirty-editor');
    await languageToggle.click();
    await page.waitForFunction(() => document.documentElement.lang === 'en' && document.documentElement.dir === 'ltr');

    await page.setViewportSize({ width: 320, height: 800 });
    assert.equal(await page.getByTestId('localized-copy').textContent(), 'Choose your cohort');
    for (const role of ['coordinator', 'staff'] as const) {
      await checkStaffMenu(page, role, 'en');
      await languageToggle.click();
      await page.waitForFunction(() => document.documentElement.lang === 'ar' && document.documentElement.dir === 'rtl');
      assert.equal(await page.getByTestId('language-state').textContent(), 'ar');
      assert.equal(await page.getByTestId('localized-copy').textContent(), 'اختر المجموعة');
      await checkStaffMenu(page, role, 'ar');
      await languageToggle.click();
      await page.waitForFunction(() => document.documentElement.lang === 'en' && document.documentElement.dir === 'ltr');
    }

    const directRoutes = {
      coordinator: '/analytics/',
      staff: '/team-assignments/',
    } as const;
    for (const role of ['coordinator', 'staff'] as const) {
      for (const language of ['en', 'ar'] as const) {
        const params = new URLSearchParams({
          route: directRoutes[role],
          role,
          language,
        });
        await page.goto(`${origin}/src/test-fixtures/dialog-accessibility.html?${params}`, { waitUntil: 'domcontentloaded' });
        await page.waitForFunction(expected => document.documentElement.lang === expected, language);

        const assertActiveDestination = async (href: string) => {
          const items = getStaffNavigationItems(role);
          const item = items.find(candidate => candidate.href === href);
          assert.ok(item, `${role} should allow ${href}.`);
          const expectedLabel = translate(item.label, language);
          const primaryItems = getMobilePrimaryNavigationItems(items);
          const isPrimary = primaryItems.some(candidate => candidate.href === href);
          const testId = `${isPrimary ? 'mobile-nav' : 'mobile-menu'}-${href === '/' ? 'overview' : href.slice(1).replaceAll('/', '-')}`;
          await page.waitForFunction(route => {
            const marker = document.querySelector('[data-testid="staff-page-marker"]');
            return marker?.textContent === route;
          }, await page.evaluate(() => window.location.pathname));
          assert.equal(await page.getByTestId('staff-page-marker').textContent(), await page.evaluate(() => window.location.pathname));
          assert.equal(await page.getByTestId('staff-current-page-label').textContent(), expectedLabel);
          if (isPrimary) {
            const activeLink = page.getByTestId(testId);
            await activeLink.waitFor();
            assert.equal((await activeLink.locator('span').textContent())?.trim(), expectedLabel);
            assert.equal(await activeLink.getAttribute('aria-current'), 'page');
            assert.match(await activeLink.getAttribute('class') || '', /mobile-active/);
          } else {
            const moreButton = page.getByTestId('button-mobile-more');
            assert.match(await moreButton.getAttribute('class') || '', /mobile-active/);
            await moreButton.focus();
            await page.keyboard.press('Enter');
            const moreMenu = page.getByRole('menu', { name: translate('More', language) });
            await moreMenu.waitFor();
            const activeLink = moreMenu.getByTestId(testId);
            assert.equal((await activeLink.locator('span').textContent())?.trim(), expectedLabel);
            assert.equal(await activeLink.getAttribute('aria-current'), 'page');
            await page.keyboard.press('Escape');
          }
        };

        const directHref = directRoutes[role].replace(/\/+$/, '');
        await assertActiveDestination(directHref);
        const sessionsLink = page.getByTestId('mobile-nav-sessions');
        await sessionsLink.click();
        await page.waitForFunction(() => document.querySelector('[data-testid="staff-page-marker"]')?.textContent === '/sessions');
        await assertActiveDestination('/sessions');

        await page.goBack();
        await page.waitForFunction(route => document.querySelector('[data-testid="staff-page-marker"]')?.textContent === route, directRoutes[role]);
        await assertActiveDestination(directHref);

        await page.goForward();
        await page.waitForFunction(() => document.querySelector('[data-testid="staff-page-marker"]')?.textContent === '/sessions');
        await assertActiveDestination('/sessions');
      }
    }
    assert.deepEqual(runtimeErrors, [], 'Dialog opening, scrolling, closing, and navigation must not raise browser runtime errors.');
  } finally {
    if (browser) await browser.close();
    if (vite) await vite.close();
    if (priorPort === undefined) delete process.env.PORT;
    else process.env.PORT = priorPort;
    if (priorBasePath === undefined) delete process.env.BASE_PATH;
    else process.env.BASE_PATH = priorBasePath;
  }
});
