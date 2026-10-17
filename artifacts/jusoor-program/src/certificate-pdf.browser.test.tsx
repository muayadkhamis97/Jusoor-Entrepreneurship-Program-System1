import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, mkdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createServer } from 'node:net';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { chromium, firefox, webkit } from 'playwright-core';
import { createServer as createViteServer } from 'vite';
import type { ParticipantLearningProgram } from '@workspace/api-client-react';
import { CertificatePdfPage } from './certificate-pdf';

type Certificate = NonNullable<ParticipantLearningProgram['certificate']>;

const certificate = {
  id: 481,
  applicationId: 862,
  programId: 24,
  certificateCode: 'JUS-2026-AR-8F31D2',
  participantName: 'Layla Al-Haddad ليلى الحداد — Founder and Managing Director',
  businessName: 'Olive Branch Foods شركة غصن الزيتون للأغذية المستدامة',
  programName: 'Women-Led Social Enterprise Incubation Program برنامج حاضنات الأعمال الاجتماعية التي تقودها النساء',
  issuedAt: '2026-09-17T12:00:00.000Z',
  issuedByName: 'Program Admin',
  revokedAt: null,
  revokedByName: null,
  revocationReason: null,
} satisfies Certificate;

const packageRoot = path.resolve(import.meta.dirname, '..');
const chromiumPath = process.env.CHROMIUM_PATH || '/repl/tools/bin/chromium';
const browserEngines = [
  { name: 'Chromium', type: chromium },
  { name: 'Firefox', type: firefox },
  { name: 'WebKit', type: webkit },
] as const;
const issuedCertificates = new Map([
  ['D35F9C80-2F1A-4D42-8CB3-301C4C9CD8A1', {
    status: 'issued',
    certificateCode: 'D35F9C80-2F1A-4D42-8CB3-301C4C9CD8A1',
    participantName: 'Amina Founder',
    businessName: 'Amina Ventures',
    programName: 'Learning Program',
    issuedAt: '2026-10-11T13:45:00.000Z',
    revokedAt: null,
  }],
  ['JUS-2026-AR-8F31D2', {
    status: 'issued',
    certificateCode: 'JUS-2026-AR-8F31D2',
    participantName: 'Bilal Founder',
    businessName: 'Bilal Ventures',
    programName: 'Learning Program',
    issuedAt: '2026-10-11T13:45:00.000Z',
    revokedAt: null,
  }],
  ['E35F9C80-2F1A-4D42-8CB3-301C4C9CD8A1', {
    status: 'revoked',
    certificateCode: 'E35F9C80-2F1A-4D42-8CB3-301C4C9CD8A1',
    participantName: 'Rana Founder',
    businessName: 'Rana Ventures',
    programName: 'Learning Program',
    issuedAt: '2026-10-11T13:45:00.000Z',
    revokedAt: '2026-10-12T09:30:00.000Z',
  }],
]);

async function unusedPort(): Promise<number> {
  const listener = createServer();
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

for (const engine of browserEngines) test(`${engine.name} download renders long English and Arabic details on one landscape A4 page`, { timeout: 120_000 }, async () => {
  const browserPath = engine.name === 'Chromium'
    ? await import('node:fs/promises').then(({ access }) => access(chromiumPath).then(() => chromiumPath))
    : undefined;
  const outputOverride = process.env.CERTIFICATE_BROWSER_ARTIFACT_DIR;
  const outputDir = outputOverride
    ? path.join(path.resolve(outputOverride), engine.name.toLowerCase())
    : await mkdtemp(path.join(tmpdir(), 'program-certificate-browser-'));
  await mkdir(outputDir, { recursive: true });

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

    browser = await engine.type.launch({
      ...(browserPath ? { executablePath: browserPath } : {}),
      headless: true,
      args: ['--no-sandbox', '--disable-dev-shm-usage'],
    });
    const context = await browser.newContext({ acceptDownloads: true });
    const page = await context.newPage();
    await page.route('**/api/branding', route => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ brandName: 'Program Hub', primaryColor: '#28665a', accentColor: '#c7755d', logoUrl: null }),
    }));
    await page.route('**/api/certificates/*/verification', async route => {
      const requestedCode = new URL(route.request().url()).pathname.split('/').at(-2)?.toUpperCase() ?? '';
      const certificateRecord = issuedCertificates.get(requestedCode);
      if (certificateRecord) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(certificateRecord),
        });
      } else if (requestedCode === 'NOT-A-CODE') {
        await route.fulfill({
          status: 400,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'Enter a valid certificate code.' }),
        });
      } else {
        await route.fulfill({
          status: 404,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'No certificate was found for this code.' }),
        });
      }
    });
    await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: 'domcontentloaded' });
    await page.addStyleTag({ url: '/src/learning-progress.css' });

    const verificationUrl = `${page.url().replace(/\/$/, '')}/verify-certificate?code=${encodeURIComponent(certificate.certificateCode)}`;
    const markup = renderToStaticMarkup(
      <CertificatePdfPage
        certificate={certificate}
        issuedDateEnglish="17 Sept 2026"
        issuedDateArabic="١٧ أيلول ٢٠٢٦"
        verificationUrl={verificationUrl}
      />,
    );
    await page.evaluate((certificateMarkup) => {
      document.body.innerHTML = `<main><button id="download-certificate" type="button">Download certificate</button>${certificateMarkup}</main>`;
    }, markup);
    await page.evaluate(() => document.fonts.ready);

    await page.evaluate((verification) => {
      const button = document.querySelector<HTMLButtonElement>('#download-certificate');
      if (!button) throw new Error('Certificate export button is missing from the browser fixture.');
      button.addEventListener('click', async () => {
        try {
          const moduleUrl = new URL('/src/certificate-pdf.tsx', window.location.origin).href;
          const { downloadCertificatePdf } = await import(/* @vite-ignore */ moduleUrl);
          const certificatePage = document.querySelector<HTMLElement>('.certificate-pdf-page');
          if (!certificatePage) throw new Error('Certificate page is missing from the browser fixture.');
          const { pdf, canvas } = await downloadCertificatePdf(
            certificatePage,
            verification,
            'Program-Certificate-JUS-2026-AR-8F31D2.pdf',
          );
          await document.fonts.ready;
          const fields = [
            '.certificate-pdf-participant',
            '.certificate-pdf-business',
            '.certificate-pdf-program',
            '.certificate-pdf-footer > div:first-child strong',
            '.certificate-pdf-footer > div:first-child small',
            '.certificate-pdf-code strong',
          ];
          const context = canvas.getContext('2d');
          const pageRect = certificatePage.getBoundingClientRect();
          const pixelCounts = fields.map((selector) => {
            const field = document.querySelector<HTMLElement>(selector);
            if (!field || !context) return 0;
            const rect = field.getBoundingClientRect();
            const scaleX = canvas.width / pageRect.width;
            const scaleY = canvas.height / pageRect.height;
            const x = Math.max(0, Math.round((rect.left - pageRect.left) * scaleX));
            const y = Math.max(0, Math.round((rect.top - pageRect.top) * scaleY));
            const width = Math.max(1, Math.round(rect.width * scaleX));
            const height = Math.max(1, Math.round(rect.height * scaleY));
            const sample = context.getImageData(x, y, width, height).data;
            let darkPixels = 0;
            for (let index = 0; index < sample.length; index += 4) {
              if (sample[index] < 205 && sample[index + 1] < 205 && sample[index + 2] < 205) darkPixels++;
            }
            return darkPixels;
          });
          (window as Window & { __certificateExportResult?: unknown }).__certificateExportResult = {
            pageCount: pdf.getNumberOfPages(),
            widthMm: pdf.internal.pageSize.getWidth(),
            heightMm: pdf.internal.pageSize.getHeight(),
            fontStatus: document.fonts.status,
            loadedFonts: Array.from(document.fonts).map(face => face.family),
            pixelCounts,
          };
        } catch (error) {
          (window as Window & { __certificateExportResult?: unknown }).__certificateExportResult = {
            error: error instanceof Error ? error.message : String(error),
          };
        }
      });
    }, verificationUrl);

    const downloadPromise = page.waitForEvent('download', { timeout: 60_000 });
    await page.locator('#download-certificate').click();
    const download = await downloadPromise;
    assert.equal(download.suggestedFilename(), 'Program-Certificate-JUS-2026-AR-8F31D2.pdf');

    const pdfPath = path.join(outputDir, download.suggestedFilename());
    await download.saveAs(pdfPath);
    const pdfUrls = execFileSync('pdfinfo', ['-url', pdfPath], { encoding: 'utf8' });
    const embeddedVerificationUrl = pdfUrls.match(/https?:\/\/[^\s]+/)?.[0];
    assert.equal(
      embeddedVerificationUrl,
      verificationUrl,
      `The downloaded PDF must contain the exact verification link annotation: ${pdfUrls}`,
    );
    assert.ok(embeddedVerificationUrl, 'The downloaded PDF must have a clickable verification URL annotation.');
    await page.waitForFunction(() => Boolean((window as Window & { __certificateExportResult?: unknown }).__certificateExportResult));
    const exportResult = await page.evaluate(() => (window as Window & { __certificateExportResult?: {
      error?: string;
      pageCount: number;
      widthMm: number;
      heightMm: number;
      fontStatus: FontFaceSet['status'];
      loadedFonts: string[];
      pixelCounts: number[];
    } }).__certificateExportResult);

    assert.ok(exportResult, 'Browser did not report completion of the certificate export.');
    assert.ok(!exportResult.error, exportResult.error);
    assert.equal(exportResult.pageCount, 1);
    assert.ok(Math.abs(exportResult.widthMm - 297) < 0.01);
    assert.ok(Math.abs(exportResult.heightMm - 210) < 0.01);
    assert.notEqual(exportResult.fontStatus, 'loading', 'Font loading should settle before the PDF is saved.');
    assert.equal(exportResult.pixelCounts.length, 6);
    console.log(`Rendered text pixel counts (participant, business, program, dates, code): ${exportResult.pixelCounts.join(', ')}`);
    assert.ok(exportResult.pixelCounts.every(count => count > 20), `Certificate text regions were blank or clipped: ${exportResult.pixelCounts.join(', ')}`);

    const pdfInfo = execFileSync('pdfinfo', [pdfPath], { encoding: 'utf8' });
    assert.match(pdfInfo, /Pages:\s+1\b/);
    const pageSize = pdfInfo.match(/Page size:\s+([\d.]+) x ([\d.]+) pts/);
    assert.ok(pageSize, `Could not read the downloaded PDF page size: ${pdfInfo}`);
    assert.ok(Number(pageSize[1]) > Number(pageSize[2]), 'Downloaded PDF must be landscape.');
    assert.ok(Math.abs(Number(pageSize[1]) - 841.89) < 0.1, 'Downloaded PDF must be A4 width.');
    assert.ok(Math.abs(Number(pageSize[2]) - 595.28) < 0.1, 'Downloaded PDF must be A4 height.');

    const imagePrefix = path.join(outputDir, 'Program-Certificate-JUS-2026-AR-8F31D2');
    execFileSync('pdftoppm', ['-f', '1', '-singlefile', '-png', '-r', '100', pdfPath, imagePrefix]);
    const imagePath = `${imagePrefix}.png`;
    const image = await readFile(imagePath);
    assert.ok(image.length > 10_000, 'The rasterized certificate page should contain visible content.');
    assert.deepEqual([...image.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10], 'PDF raster must be a valid PNG image.');

    if (engine.name === 'Chromium') {
      const pdfBrowserUrl = pathToFileURL(pdfPath).href;
      await page.goto(pdfBrowserUrl, { waitUntil: 'domcontentloaded' });
      assert.equal(page.url(), pdfBrowserUrl, 'The browser should open the generated PDF file.');
    }

    const assertIssuedResult = async (url: string, code: string, participantName: string, businessName: string) => {
      await page.goto(url, { waitUntil: 'domcontentloaded' });
      try {
        await page.getByTestId('certificate-verification-issued').waitFor({ timeout: 5_000 });
      } catch {
        throw new Error(`Expected issued result for ${code}; page at ${page.url()} rendered: ${await page.locator('body').innerText()}`);
      }
      assert.equal(await page.getByTestId('input-certificate-code').inputValue(), code);
      const result = page.getByTestId('certificate-verification-issued');
      await result.getByText(participantName, { exact: true }).waitFor();
      await result.getByText(businessName, { exact: true }).waitFor();
      await result.getByText(code, { exact: true }).waitFor();
      const renderedResult = await result.innerText();
      assert.doesNotMatch(renderedResult, /@|clerkUserId|issuedByStaffId|revocationReason|revokedByName/i);
      assert.deepEqual(
        Object.keys(issuedCertificates.get(code)!).sort(),
        ['businessName', 'certificateCode', 'issuedAt', 'participantName', 'programName', 'revokedAt', 'status'],
      );
    };
    await assertIssuedResult(
      embeddedVerificationUrl,
      certificate.certificateCode,
      'Bilal Founder',
      'Bilal Ventures',
    );
    const uuidCode = 'D35F9C80-2F1A-4D42-8CB3-301C4C9CD8A1';
    await assertIssuedResult(
      `${new URL(embeddedVerificationUrl).origin}/verify-certificate?code=${encodeURIComponent(uuidCode)}`,
      uuidCode,
      'Amina Founder',
      'Amina Ventures',
    );

    const revokedCode = 'E35F9C80-2F1A-4D42-8CB3-301C4C9CD8A1';
    await page.goto(`${new URL(embeddedVerificationUrl).origin}/verify-certificate?code=${revokedCode}`, { waitUntil: 'domcontentloaded' });
    const revokedResult = page.getByTestId('certificate-verification-revoked');
    await revokedResult.waitFor();
    assert.equal(await page.getByTestId('input-certificate-code').inputValue(), revokedCode);
    await revokedResult.getByText('Certificate revoked — not valid', { exact: true }).waitFor();
    await revokedResult.getByText('Rana Founder', { exact: true }).waitFor();
    const renderedRevokedResult = await revokedResult.innerText();
    assert.doesNotMatch(renderedRevokedResult, /@|issuedByStaffId|revocationReason|revokedByName|private reason/i);

    await page.goto(`${new URL(embeddedVerificationUrl).origin}/verify-certificate?code=not-a-code`, { waitUntil: 'domcontentloaded' });
    await page.getByTestId('certificate-verification-invalid').waitFor();
    assert.equal(await page.getByTestId('input-certificate-code').inputValue(), 'not-a-code');
    assert.match(await page.getByTestId('certificate-verification-invalid').innerText(), /invalid/i);

    const unknownCode = 'A0000000-0000-4000-8000-000000000000';
    await page.goto(`${new URL(embeddedVerificationUrl).origin}/verify-certificate?code=${unknownCode}`, { waitUntil: 'domcontentloaded' });
    await page.getByTestId('certificate-verification-not-found').waitFor();
    assert.equal(await page.getByTestId('input-certificate-code').inputValue(), unknownCode);
    assert.match(await page.getByTestId('certificate-verification-not-found').innerText(), /No certificate was found/i);

    console.log(`${engine.name} certificate PDF visual review image: ${imagePath}`);
    console.log(`${engine.name} font faces: ${exportResult.loadedFonts.join(', ') || '(system fallback)'}`);
    await context.close();
  } finally {
    if (browser) await browser.close();
    if (vite) await vite.close();
    if (priorPort === undefined) delete process.env.PORT;
    else process.env.PORT = priorPort;
    if (priorBasePath === undefined) delete process.env.BASE_PATH;
    else process.env.BASE_PATH = priorBasePath;
    if (!outputOverride) await rm(outputDir, { recursive: true, force: true });
  }
});
