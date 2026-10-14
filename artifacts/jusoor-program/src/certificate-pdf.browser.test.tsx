import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, mkdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createServer } from 'node:net';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { chromium } from 'playwright-core';
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
  programName: 'Jusoor Women-Led Social Enterprise Incubation Program برنامج جسور لحاضنات الأعمال الاجتماعية التي تقودها النساء',
  issuedAt: '2026-09-17T12:00:00.000Z',
  issuedByName: 'Program Coordinator',
  revokedAt: null,
  revokedByName: null,
  revocationReason: null,
} satisfies Certificate;

const verificationUrl = 'https://jusoor.example/verify-certificate?code=JUS-2026-AR-8F31D2';
const packageRoot = path.resolve(import.meta.dirname, '..');
const chromiumPath = process.env.CHROMIUM_PATH || '/repl/tools/bin/chromium';

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

test('browser download renders long English and Arabic details on one landscape A4 page', { timeout: 120_000 }, async () => {
  const browserPath = await import('node:fs/promises').then(({ access }) => access(chromiumPath).then(() => chromiumPath));
  const outputOverride = process.env.CERTIFICATE_BROWSER_ARTIFACT_DIR;
  const outputDir = outputOverride
    ? path.resolve(outputOverride)
    : await mkdtemp(path.join(tmpdir(), 'jusoor-certificate-browser-'));
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

    browser = await chromium.launch({
      executablePath: browserPath,
      headless: true,
      args: ['--no-sandbox', '--disable-dev-shm-usage'],
    });
    const context = await browser.newContext({ acceptDownloads: true });
    const page = await context.newPage();
    await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: 'domcontentloaded' });
    await page.addStyleTag({ url: '/src/learning-progress.css' });

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
            'Jusoor-Certificate-JUS-2026-AR-8F31D2.pdf',
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
    assert.equal(download.suggestedFilename(), 'Jusoor-Certificate-JUS-2026-AR-8F31D2.pdf');

    const pdfPath = path.join(outputDir, download.suggestedFilename());
    await download.saveAs(pdfPath);
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

    const imagePrefix = path.join(outputDir, 'Jusoor-Certificate-JUS-2026-AR-8F31D2');
    execFileSync('pdftoppm', ['-f', '1', '-singlefile', '-png', '-r', '100', pdfPath, imagePrefix]);
    const imagePath = `${imagePrefix}.png`;
    const image = await readFile(imagePath);
    assert.ok(image.length > 10_000, 'The rasterized certificate page should contain visible content.');
    assert.deepEqual([...image.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10], 'PDF raster must be a valid PNG image.');

    console.log(`Certificate PDF visual review image: ${imagePath}`);
    console.log(`Browser font faces: ${exportResult.loadedFonts.join(', ') || '(system fallback)'}`);
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
