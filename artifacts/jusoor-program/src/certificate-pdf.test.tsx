import assert from 'node:assert/strict';
import test from 'node:test';
import { deflateSync as deflate } from 'node:zlib';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { ParticipantLearningProgram } from '@workspace/api-client-react';
import {
  CertificatePdfPage,
  assertCertificateFits,
  createCertificatePdf,
} from './certificate-pdf';

type Certificate = NonNullable<ParticipantLearningProgram['certificate']>;

const certificate = Object.freeze({
  id: 481,
  certificateCode: 'JUS-2026-AR-8F31D2',
  participantName: 'Layla Al-Haddad ليلى الحداد — Founder and Managing Director',
  businessName: 'Olive Branch Foods شركة غصن الزيتون للأغذية المستدامة',
  programName: 'Women-Led Social Enterprise Incubation Program برنامج حاضنات الأعمال الاجتماعية التي تقودها النساء',
  issuedAt: '2026-09-17T12:00:00.000Z',
  issuedByName: 'Program Admin',
}) as Certificate;

function pngChunk(type: string, data: Buffer): Buffer {
  const name = Buffer.from(type);
  const body = Buffer.concat([name, data]);
  const crcTable = Array.from({ length: 256 }, (_, value) => {
    let crc = value;
    for (let bit = 0; bit < 8; bit++) crc = (crc & 1) ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
    return crc >>> 0;
  });
  let crc = 0xffffffff;
  for (const byte of body) crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE((crc ^ 0xffffffff) >>> 0);
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  return Buffer.concat([length, body, checksum]);
}

function onePixelPng(): string {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(1, 0);
  header.writeUInt32BE(1, 4);
  header[8] = 8;
  header[9] = 6;
  const pixel = Buffer.from([0, 255, 255, 255, 255]);
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk('IHDR', header),
    pngChunk('IDAT', deflate(pixel)),
    pngChunk('IEND', Buffer.alloc(0)),
  ]).toString('base64');
}

test('renders long English and Arabic certificate details, issue date, and unique code', () => {
  const markup = renderToStaticMarkup(
    <CertificatePdfPage
      certificate={certificate}
      issuedDateEnglish="17 Sept 2026"
      issuedDateArabic="١٧ أيلول ٢٠٢٦"
      verificationUrl="https://jusoor.example/verify-certificate?code=JUS-2026-AR-8F31D2"
    />,
  );

  for (const requiredText of [
    'Layla Al-Haddad ليلى الحداد',
    'Olive Branch Foods شركة غصن الزيتون',
    'Women-Led Social Enterprise Incubation Program برنامج',
    '17 Sept 2026',
    '١٧ أيلول ٢٠٢٦',
    certificate.certificateCode,
    'https://jusoor.example/verify-certificate?code=JUS-2026-AR-8F31D2',
  ]) {
    assert.ok(markup.includes(requiredText), `Missing certificate content: ${requiredText}`);
  }
  assert.match(markup, /class="certificate-pdf-page"/);
  assert.match(markup, /class="certificate-pdf-participant"/);
  assert.match(markup, /class="certificate-pdf-business"/);
  assert.match(markup, /class="certificate-pdf-program"/);
});

test('renders the selected certificate language without changing issued certificate data', () => {
  const before = JSON.stringify(certificate);
  const renderLanguage = (language: 'en' | 'ar' | 'both') => renderToStaticMarkup(
    <CertificatePdfPage
      certificate={certificate}
      issuedDateEnglish="17 Sept 2026"
      issuedDateArabic="١٧ أيلول ٢٠٢٦"
      verificationUrl="https://jusoor.example/verify-certificate?code=JUS-2026-AR-8F31D2"
      language={language}
    />,
  );

  const english = renderLanguage('en');
  assert.match(english, /CERTIFICATE OF COMPLETION/);
  assert.match(english, /This certificate is proudly presented to/);
  assert.match(english, /17 Sept 2026/);
  assert.doesNotMatch(english, /شهادة إتمام البرنامج|تُمنح هذه الشهادة بكل فخر إلى|١٧ أيلول ٢٠٢٦/);

  const arabic = renderLanguage('ar');
  assert.match(arabic, /شهادة إتمام البرنامج/);
  assert.match(arabic, /تُمنح هذه الشهادة بكل فخر إلى/);
  assert.match(arabic, /١٧ أيلول ٢٠٢٦/);
  assert.doesNotMatch(arabic, /CERTIFICATE OF COMPLETION|This certificate is proudly presented to|17 Sept 2026/);

  const bilingual = renderLanguage('both');
  assert.match(bilingual, /CERTIFICATE OF COMPLETION/);
  assert.match(bilingual, /شهادة إتمام البرنامج/);
  assert.match(bilingual, /17 Sept 2026/);
  assert.match(bilingual, /١٧ أيلول ٢٠٢٦/);
  assert.equal(JSON.stringify(certificate), before);
});

test('renders an accessible preview layout without a permanent verification link', () => {
  const markup = renderToStaticMarkup(
    <CertificatePdfPage
      certificate={{ ...certificate, certificateCode: 'Assigned after issuance' }}
      issuedDateEnglish="14 Oct 2026"
      issuedDateArabic="١٤ تشرين الأول ٢٠٢٦"
      verificationUrl=""
      preview
    />,
  );

  assert.match(markup, /class="certificate-pdf-page is-preview"/);
  assert.match(markup, /<section class="certificate-pdf-page is-preview" aria-hidden="false"/);
  assert.match(markup, /Layla Al-Haddad/);
  assert.match(markup, /Olive Branch Foods/);
  assert.match(markup, /Women-Led Social Enterprise Incubation Program/);
  assert.match(markup, /Assigned after issuance/);
  assert.doesNotMatch(markup, /<small>https:/);
});

test('creates one landscape A4 PDF page without changing the saved certificate data', async () => {
  const before = JSON.stringify(certificate);
  const image = `data:image/png;base64,${onePixelPng()}`;
  const verificationUrl = 'https://jusoor.example/verify-certificate?code=JUS-2026-AR-8F31D2';
  const pdf = await createCertificatePdf({ toDataURL: () => image } as HTMLCanvasElement, verificationUrl);
  const pdfBytes = new Uint8Array(pdf.output('arraybuffer'));
  const pdfText = new TextDecoder().decode(pdfBytes);

  assert.equal(pdf.getNumberOfPages(), 1);
  assert.ok(Math.abs(pdf.internal.pageSize.getWidth() - 297) < 0.01);
  assert.ok(Math.abs(pdf.internal.pageSize.getHeight() - 210) < 0.01);
  assert.equal(new TextDecoder().decode(pdfBytes.subarray(0, 8)), '%PDF-1.3');
  assert.ok(pdfText.includes('/URI'));
  assert.ok(pdfText.includes(verificationUrl));
  assert.equal(JSON.stringify(certificate), before);
});

test('rejects certificate content that exceeds its page bounds', () => {
  const overflowingPage = {
    clientWidth: 1122,
    clientHeight: 794,
    scrollWidth: 1122,
    scrollHeight: 796,
    querySelectorAll: () => [],
  } as unknown as HTMLElement;

  assert.throws(() => assertCertificateFits(overflowingPage), /does not fit on one page/);
});
