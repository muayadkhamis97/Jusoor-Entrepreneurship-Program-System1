import assert from 'node:assert/strict';
import { createServer as createNetServer } from 'node:net';
import path from 'node:path';
import test from 'node:test';
import { chromium } from 'playwright-core';
import { createServer as createViteServer } from 'vite';
import { getStaffNavigationItems } from './staff-navigation-items';
import { translate } from './language';

const packageRoot = path.resolve(import.meta.dirname, '..');
const chromiumPath = process.env.CHROMIUM_PATH || '/repl/tools/bin/chromium';

async function checkStaffMenu(page: import('playwright-core').Page, role: 'coordinator' | 'staff', language: 'en' | 'ar') {
  const items = getStaffNavigationItems(role);
  const labels = items.map(item => translate(item.label, language));
  const roleButton = page.getByTestId(role === 'coordinator' ? 'role-coordinator' : 'role-staff');
  await roleButton.click();
  const navigation = page.getByTestId('mobile-staff-navigation');
  const activeLabel = labels[items.findIndex(item => item.href === '/sessions')];
  const activeHref = '/sessions';

  const links = navigation.getByRole('link');
  assert.equal(await links.count(), labels.length, `${role} should expose every permitted destination in ${language}.`);
  for (const [index, label] of labels.entries()) {
    const link = links.nth(index);
    assert.equal((await link.locator('span').textContent())?.trim(), label, `${role} destination ${index + 1} should be labeled in ${language}.`);
    assert.ok(await link.isVisible(), `${role} destination "${label}" should remain visible in ${language}.`);
  }

  const allPagesButton = page.getByTestId('button-mobile-all-pages');
  await allPagesButton.focus();
  await page.keyboard.press('Enter');
  const allPagesMenu = page.getByRole('menu', { name: translate('All pages', language) });
  await allPagesMenu.waitFor();
  const menuItems = allPagesMenu.getByRole('menuitem');
  assert.equal(await menuItems.count(), items.length, `${role} All pages menu should expose each permitted route in ${language}.`);
  for (const [index, label] of labels.entries()) {
    assert.equal((await menuItems.nth(index).textContent())?.trim(), label, `${role} menu destination ${index + 1} should be labeled in ${language}.`);
    assert.equal(await menuItems.nth(index).getAttribute('href'), items[index].href, `${role} menu item should preserve its route in ${language}.`);
  }
  await page.keyboard.press('Escape');
  await allPagesMenu.waitFor({ state: 'detached' });
  assert.equal(await page.evaluate(() => document.activeElement?.getAttribute('data-testid')), 'button-mobile-all-pages');

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
  }));
  assert.equal(scrollMetrics.overflowX, 'auto');
  assert.ok(scrollMetrics.contentWidth > scrollMetrics.width, `${role} menu should scroll horizontally in ${language}.`);

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
  for (let index = 1; index < labels.length; index += 1) {
    await page.keyboard.press('Tab');
    const focusedTestId = await page.evaluate(() => document.activeElement?.getAttribute('data-testid'));
    assert.equal(focusedTestId, await links.nth(index).getAttribute('data-testid'), `${role} destination ${index + 1} should be reachable by keyboard in ${language}.`);
    await assertFocusedLinkIsInView();
  }

  await navigation.scrollIntoViewIfNeeded();
  assert.equal(await page.evaluate(() => 'ontouchstart' in window), true, 'The browser fixture should expose touch input.');
  const lastLink = links.nth(labels.length - 1);
  const touchResult = await navigation.evaluate((element, direction) => {
    const menu = element as HTMLElement;
    menu.scrollLeft = direction === 'rtl' ? -menu.scrollWidth : menu.scrollWidth;
    const item = menu.querySelectorAll('a')[menu.querySelectorAll('a').length - 1]!.getBoundingClientRect();
    const nav = menu.getBoundingClientRect();
    return {
      overflowX: getComputedStyle(menu).overflowX,
      scrollPosition: menu.scrollLeft,
      visible: item.right > nav.left && item.left < nav.right,
    };
  }, language === 'ar' ? 'rtl' : 'ltr');
  assert.equal(touchResult.overflowX, 'auto', `${role} menu should allow touch scrolling in ${language}.`);
  assert.notEqual(touchResult.scrollPosition, 0, `${role} menu should scroll to its final item in ${language}.`);
  assert.ok(touchResult.visible, `${role} final destination should be reachable in the touch-scroll container in ${language}.`);
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
    await page.goto(`http://127.0.0.1:${port}/src/test-fixtures/dialog-accessibility.html`, { waitUntil: 'domcontentloaded' });

    const reviewOpener = page.getByRole('button', { name: 'Open application review' });
    await reviewOpener.click();
    const applicationReview = page.getByRole('dialog', { name: 'Application review' });
    await applicationReview.waitFor();
    assert.equal(await applicationReview.getAttribute('aria-modal'), 'true');
    assert.equal(await applicationReview.getAttribute('aria-describedby'), 'fixture-review-description');
    assert.equal(await page.evaluate(() => document.activeElement?.id), 'fixture-review-title', 'Application review should focus its heading.');
    await page.keyboard.press('Escape');
    await applicationReview.waitFor({ state: 'detached' });
    await page.waitForFunction(() => document.activeElement?.id === 'open-application-review');

    const openForm = page.getByRole('button', { name: 'Open sample form' });
    await openForm.click();
    const formDialog = page.getByRole('dialog', { name: 'Edit sample record' });
    await formDialog.waitFor();
    assert.equal(await formDialog.getAttribute('aria-modal'), 'true');
    assert.equal(await formDialog.getAttribute('aria-labelledby'), 'fixture-form-title');
    assert.equal(await formDialog.getAttribute('aria-describedby'), 'fixture-form-description');
    assert.equal(await page.evaluate(() => document.activeElement?.id), 'fixture-form-input', 'Opening a form should focus its first field.');
    const formBounds = await formDialog.boundingBox();
    assert.ok(formBounds && formBounds.x >= 0 && formBounds.y >= 0 && formBounds.x + formBounds.width <= 390 && formBounds.y + formBounds.height <= 844, 'Dialog should fit the mobile viewport.');

    const field = page.getByLabel('Record name');
    await field.fill('Synthetic value stays here');
    await page.getByRole('button', { name: 'Save record' }).click();
    await page.getByRole('alert').getByText('The record could not be saved. Try again.').waitFor();
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
    await courseDialog.waitFor({ state: 'detached' });
    await page.waitForFunction(() => document.activeElement?.id === 'open-course-content');

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
    assert.equal(await page.evaluate(() => document.activeElement?.id), 'fixture-confirm-cancel', 'Confirmation should initially focus its safe cancel action.');
    await page.keyboard.press('Escape');
    await confirmDialog.waitFor({ state: 'detached' });
    await page.waitForFunction(() => document.activeElement?.id === 'open-confirmation');
    assert.equal(await page.evaluate(() => document.activeElement?.id), 'open-confirmation', 'Closing a confirmation should restore focus to its opener.');

    await page.setViewportSize({ width: 320, height: 800 });
    const languageToggle = page.getByTestId('button-language-toggle').first();
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
  } finally {
    if (browser) await browser.close();
    if (vite) await vite.close();
    if (priorPort === undefined) delete process.env.PORT;
    else process.env.PORT = priorPort;
    if (priorBasePath === undefined) delete process.env.BASE_PATH;
    else process.env.BASE_PATH = priorBasePath;
  }
});
