import React from 'react';
import type { ReactNode } from 'react';
import type { jsPDF } from 'jspdf';
import type { ParticipantLearningProgram } from '@workspace/api-client-react';

type Certificate = NonNullable<ParticipantLearningProgram['certificate']>;
export type CertificateLanguage = 'en' | 'ar' | 'both';

type CertificatePdfPageProps = {
  certificate: Certificate;
  issuedDateEnglish: string;
  issuedDateArabic: string;
  verificationUrl: string;
  language?: CertificateLanguage;
  preview?: boolean;
  style?: React.CSSProperties;
};

export const CertificatePdfPage = React.forwardRef<HTMLElement, CertificatePdfPageProps>(function CertificatePdfPage({
  certificate,
  issuedDateEnglish,
  issuedDateArabic,
  verificationUrl,
  language = 'both',
  preview = false,
  style,
}, ref): ReactNode {
  const showEnglish = language !== 'ar';
  const showArabic = language !== 'en';
  return <section ref={ref} className={`certificate-pdf-page${preview ? ' is-preview' : ''}`} aria-hidden={!preview} style={style}>
    <div className="certificate-pdf-frame">
      <header className="certificate-pdf-brand">
        <span className="certificate-pdf-wordmark">{showEnglish && 'JUSOOR'}{showEnglish && showArabic && ' '}{showArabic && <i lang="ar" dir="rtl">جسور</i>}</span>
        <span>{showEnglish && 'ENTREPRENEURSHIP PROGRAM'}{showEnglish && showArabic && <b> · </b>}{showArabic && <span lang="ar" dir="rtl">برنامج ريادة الأعمال</span>}</span>
      </header>
      <div className="certificate-pdf-content">
        <span className="certificate-pdf-kicker">{showEnglish && 'PROGRAM ACHIEVEMENT'}{showEnglish && showArabic && <b> · </b>}{showArabic && <span lang="ar" dir="rtl">إنجاز البرنامج</span>}</span>
        {showEnglish && <h1>CERTIFICATE OF COMPLETION</h1>}
        {showArabic && <h2 lang="ar" dir="rtl">شهادة إتمام البرنامج</h2>}
        <p className="certificate-pdf-intro" dir={language === 'ar' ? 'rtl' : undefined}>
          {showEnglish && 'This certificate is proudly presented to'}
          {showEnglish && showArabic && ' '}
          {showArabic && <span lang="ar" dir="rtl">تُمنح هذه الشهادة بكل فخر إلى</span>}
        </p>
        <strong className="certificate-pdf-participant" dir="auto">{certificate.participantName}</strong>
        <div className="certificate-pdf-business" dir="auto">{certificate.businessName}</div>
        <p className="certificate-pdf-program-label" dir={language === 'ar' ? 'rtl' : undefined}>
          {showEnglish && 'for completing the program'}
          {showEnglish && showArabic && ' '}
          {showArabic && <span lang="ar" dir="rtl">لإتمام برنامج</span>}
        </p>
        <strong className="certificate-pdf-program" dir="auto">{certificate.programName}</strong>
      </div>
      <footer className="certificate-pdf-footer">
        <div>
          <span>{showEnglish && 'ISSUE DATE'}{showEnglish && showArabic && <b> · </b>}{showArabic && <span lang="ar" dir="rtl">تاريخ الإصدار</span>}</span>
          {showEnglish && <strong>{issuedDateEnglish}</strong>}
          {showArabic && (showEnglish
            ? <small lang="ar" dir="rtl">{issuedDateArabic}</small>
            : <strong lang="ar" dir="rtl">{issuedDateArabic}</strong>)}
        </div>
        <div className="certificate-pdf-seal" aria-hidden="true">J</div>
        <div className="certificate-pdf-code"><span>{showEnglish && 'CERTIFICATE CODE'}{showEnglish && showArabic && <b> · </b>}{showArabic && <span lang="ar" dir="rtl">رمز الشهادة</span>}</span><strong>{certificate.certificateCode}</strong>{verificationUrl && <small>{verificationUrl}</small>}</div>
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
  const { default: html2canvas } = await import('html2canvas');
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

export async function createCertificatePdf(canvas: HTMLCanvasElement, verificationUrl?: string): Promise<jsPDF> {
  const { jsPDF } = await import('jspdf');
  const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  pdf.addImage(canvas.toDataURL('image/png'), 'PNG', 0, 0, 297, 210, undefined, 'FAST');
  if (verificationUrl) pdf.link(206, 191, 86, 11, { url: verificationUrl });
  return pdf;
}

export async function downloadCertificatePdf(page: HTMLElement, verificationUrl: string, filename: string): Promise<{ pdf: jsPDF; canvas: HTMLCanvasElement }> {
  const canvas = await renderCertificatePdf(page);
  const pdf = await createCertificatePdf(canvas, verificationUrl);
  pdf.save(filename);
  return { pdf, canvas };
}
