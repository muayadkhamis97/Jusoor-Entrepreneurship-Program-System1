import React from 'react';
import type { ReactNode } from 'react';
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';
import type { ParticipantLearningProgram } from '@workspace/api-client-react';

type Certificate = NonNullable<ParticipantLearningProgram['certificate']>;

type CertificatePdfPageProps = {
  certificate: Certificate;
  issuedDateEnglish: string;
  issuedDateArabic: string;
  verificationUrl: string;
};

export const CertificatePdfPage = React.forwardRef<HTMLElement, CertificatePdfPageProps>(function CertificatePdfPage({
  certificate,
  issuedDateEnglish,
  issuedDateArabic,
  verificationUrl,
}, ref): ReactNode {
  return <section ref={ref} className="certificate-pdf-page" aria-hidden="true">
    <div className="certificate-pdf-frame">
      <header className="certificate-pdf-brand">
        <span className="certificate-pdf-wordmark">JUSOOR <i>جسور</i></span>
        <span>ENTREPRENEURSHIP PROGRAM <b>·</b> برنامج ريادة الأعمال</span>
      </header>
      <div className="certificate-pdf-content">
        <span className="certificate-pdf-kicker">PROGRAM ACHIEVEMENT <b>·</b> إنجاز البرنامج</span>
        <h1>CERTIFICATE OF COMPLETION</h1>
        <h2 lang="ar" dir="rtl">شهادة إتمام البرنامج</h2>
        <p className="certificate-pdf-intro">This certificate is proudly presented to <span lang="ar" dir="rtl">تُمنح هذه الشهادة بكل فخر إلى</span></p>
        <strong className="certificate-pdf-participant">{certificate.participantName}</strong>
        <div className="certificate-pdf-business">{certificate.businessName}</div>
        <p className="certificate-pdf-program-label">for completing the program <span lang="ar" dir="rtl">لإتمام برنامج</span></p>
        <strong className="certificate-pdf-program">{certificate.programName}</strong>
      </div>
      <footer className="certificate-pdf-footer">
        <div><span>ISSUE DATE <b>·</b> تاريخ الإصدار</span><strong>{issuedDateEnglish}</strong><small lang="ar" dir="rtl">{issuedDateArabic}</small></div>
        <div className="certificate-pdf-seal" aria-hidden="true">J</div>
        <div className="certificate-pdf-code"><span>CERTIFICATE CODE <b>·</b> رمز الشهادة</span><strong>{certificate.certificateCode}</strong><small>{verificationUrl}</small></div>
      </footer>
    </div>
  </section>;
});

export function assertCertificateFits(page: HTMLElement) {
  const containers = [
    page,
    ...page.querySelectorAll<HTMLElement>('.certificate-pdf-frame, .certificate-pdf-content'),
  ];
  const hasOverflow = containers.some(container =>
    container.scrollWidth > container.clientWidth + 1 ||
    container.scrollHeight > container.clientHeight + 1,
  );
  if (hasOverflow) throw new Error('Certificate content does not fit on one page.');
}

export async function renderCertificatePdf(page: HTMLElement): Promise<HTMLCanvasElement> {
  await document.fonts.ready;
  assertCertificateFits(page);
  return html2canvas(page, {
    backgroundColor: '#fffdf7',
    scale: 2,
    logging: false,
    onclone: (clonedDocument) => {
      const clonedCertificate = clonedDocument.querySelector<HTMLElement>('.certificate-pdf-page');
      if (clonedCertificate) {
        clonedCertificate.style.left = '0';
        clonedCertificate.style.top = '0';
        clonedCertificate.style.opacity = '1';
      }
    },
  });
}

export function createCertificatePdf(canvas: HTMLCanvasElement, verificationUrl?: string): jsPDF {
  const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  pdf.addImage(canvas.toDataURL('image/png'), 'PNG', 0, 0, 297, 210, undefined, 'FAST');
  if (verificationUrl) pdf.link(206, 191, 86, 11, { url: verificationUrl });
  return pdf;
}

export async function downloadCertificatePdf(page: HTMLElement, verificationUrl: string, filename: string): Promise<{ pdf: jsPDF; canvas: HTMLCanvasElement }> {
  const canvas = await renderCertificatePdf(page);
  const pdf = createCertificatePdf(canvas, verificationUrl);
  pdf.save(filename);
  return { pdf, canvas };
}
