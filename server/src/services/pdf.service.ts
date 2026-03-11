import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import { FormType } from '../types';
import logger from '../utils/logger';

interface SignedPdfOptions {
  originalPdfBuffer: Buffer;
  formType: FormType;
  sectionBData: Record<string, unknown>;
  signatureDataUrl: string; // base64 data URL (image/png)
  physicianName: string;
  signerIp: string;
  signedAt: Date;
}

export const PdfService = {
  /**
   * Generate the final signed PDF by overlaying Section B data and the
   * physician's signature onto the original CMN PDF.
   */
  async generateSignedPdf(options: SignedPdfOptions): Promise<Buffer> {
    const {
      originalPdfBuffer,
      formType,
      sectionBData,
      signatureDataUrl,
      physicianName,
      signerIp,
      signedAt,
    } = options;

    try {
      const pdfDoc = await PDFDocument.load(originalPdfBuffer);
      const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
      const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
      const pages = pdfDoc.getPages();

      // We'll add Section B data and signature as an appended page if needed,
      // or overlay on existing pages. For maximum compatibility, we append a
      // new "Section B & Signature" page at the end.
      const sectionBPage = pdfDoc.addPage([612, 792]); // standard letter

      const textColor = rgb(0, 0, 0);
      const headerColor = rgb(0.1, 0.3, 0.7);
      let y = 740;
      const leftMargin = 50;
      const lineHeight = 16;

      // ── Header ──────────────────────────────────────────────────────────
      sectionBPage.drawText('SECTION B — PHYSICIAN CLINICAL INFORMATION', {
        x: leftMargin,
        y,
        size: 14,
        font: boldFont,
        color: headerColor,
      });
      y -= 8;
      sectionBPage.drawLine({
        start: { x: leftMargin, y },
        end: { x: 562, y },
        thickness: 1,
        color: headerColor,
      });
      y -= 20;

      sectionBPage.drawText(`Form Type: ${formType}`, {
        x: leftMargin, y, size: 10, font, color: textColor,
      });
      y -= lineHeight;

      // ── Section B Fields ────────────────────────────────────────────────
      const fieldLabels = getSectionBLabels(formType);

      for (const [key, value] of Object.entries(sectionBData)) {
        if (y < 100) {
          // Add new page if we run out of space
          const newPage = pdfDoc.addPage([612, 792]);
          y = 740;
          drawSectionBField(newPage, leftMargin, y, fieldLabels[key] || key, String(value), font, boldFont, textColor);
        } else {
          drawSectionBField(sectionBPage, leftMargin, y, fieldLabels[key] || key, String(value), font, boldFont, textColor);
        }

        // Multi-line values need more space
        const valueLines = String(value).split('\n').length;
        y -= lineHeight * (1 + valueLines) + 8;
      }

      // ── Signature Section ───────────────────────────────────────────────
      if (y < 200) {
        // Not enough room — use last page or add new one
        const sigPage = pdfDoc.addPage([612, 792]);
        y = 740;
        await drawSignatureSection(pdfDoc, sigPage, leftMargin, y, {
          signatureDataUrl,
          physicianName,
          signerIp,
          signedAt,
          font,
          boldFont,
          headerColor,
          textColor,
        });
      } else {
        y -= 20;
        await drawSignatureSection(pdfDoc, sectionBPage, leftMargin, y, {
          signatureDataUrl,
          physicianName,
          signerIp,
          signedAt,
          font,
          boldFont,
          headerColor,
          textColor,
        });
      }

      // ── Audit Stamp on First Page ───────────────────────────────────────
      if (pages.length > 0) {
        const firstPage = pages[0];
        const stampText = `Electronically signed by ${physicianName} on ${signedAt.toISOString()} | IP: ${signerIp}`;
        firstPage.drawText(stampText, {
          x: 50,
          y: 15,
          size: 6,
          font,
          color: rgb(0.5, 0.5, 0.5),
        });
      }

      const pdfBytes = await pdfDoc.save();
      logger.info('Signed PDF generated', { pages: pdfDoc.getPageCount() });
      return Buffer.from(pdfBytes);
    } catch (err) {
      logger.error('PDF generation failed', { error: (err as Error).message });
      throw new Error('Failed to generate signed PDF');
    }
  },

  /**
   * Generate a fax cover sheet PDF with the signing link and QR code.
   */
  async generateCoverSheet(options: {
    physicianName: string;
    patientInitials: string; // Only initials for PHI minimization
    formType: FormType;
    signingUrl: string;
    qrCodeDataUrl: string;  // base64 QR code image
  }): Promise<Buffer> {
    const { physicianName, patientInitials, formType, signingUrl, qrCodeDataUrl } = options;
    const pdfDoc = await PDFDocument.create();
    const page = pdfDoc.addPage([612, 792]);
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    const textColor = rgb(0, 0, 0);
    const headerColor = rgb(0.1, 0.3, 0.7);

    let y = 700;
    const leftMargin = 72;

    // Header
    page.drawText('UNIVERSAL MEDICAL SUPPLY', {
      x: leftMargin, y: 740, size: 18, font: boldFont, color: headerColor,
    });
    page.drawText('Physician E-Sign Request', {
      x: leftMargin, y: 720, size: 14, font, color: textColor,
    });
    y = 690;
    page.drawLine({ start: { x: leftMargin, y }, end: { x: 540, y }, thickness: 2, color: headerColor });
    y -= 30;

    // Body
    page.drawText(`To: Dr. ${physicianName}`, { x: leftMargin, y, size: 12, font: boldFont, color: textColor });
    y -= 20;
    page.drawText(`Re: CMN Form (${formType}) — Patient: ${patientInitials}`, { x: leftMargin, y, size: 11, font, color: textColor });
    y -= 30;

    page.drawText('Please review and sign the attached Certificate of Medical Necessity.', { x: leftMargin, y, size: 11, font, color: textColor });
    y -= 18;
    page.drawText('You can complete the form electronically using the link or QR code below:', { x: leftMargin, y, size: 11, font, color: textColor });
    y -= 30;

    page.drawText('Signing Link:', { x: leftMargin, y, size: 11, font: boldFont, color: textColor });
    y -= 18;
    page.drawText(signingUrl, { x: leftMargin, y, size: 11, font, color: rgb(0, 0, 0.8) });
    y -= 40;

    // QR Code
    try {
      const qrImageBytes = Buffer.from(qrCodeDataUrl.split(',')[1], 'base64');
      const qrImage = await pdfDoc.embedPng(qrImageBytes);
      page.drawImage(qrImage, { x: leftMargin, y: y - 150, width: 150, height: 150 });
      page.drawText('Scan to open on mobile', { x: leftMargin + 20, y: y - 165, size: 9, font, color: rgb(0.4, 0.4, 0.4) });
      y -= 190;
    } catch {
      // QR embedding failed — skip
      y -= 20;
    }

    page.drawText('A PIN will be provided separately for identity verification.', { x: leftMargin, y, size: 10, font, color: textColor });
    y -= 18;
    page.drawText('This link will expire in 30 days. If you have questions, contact UMS at', { x: leftMargin, y, size: 10, font, color: textColor });
    y -= 14;
    page.drawText('(800) 555-0123 or intake@universalmedicalsupply.com', { x: leftMargin, y, size: 10, font, color: textColor });
    y -= 40;

    // Footer
    page.drawLine({ start: { x: leftMargin, y }, end: { x: 540, y }, thickness: 0.5, color: rgb(0.7, 0.7, 0.7) });
    y -= 15;
    page.drawText('CONFIDENTIALITY NOTICE: This fax contains protected health information (PHI) intended only', { x: leftMargin, y, size: 7, font, color: rgb(0.5, 0.5, 0.5) });
    y -= 10;
    page.drawText('for the named recipient. If received in error, please notify the sender immediately and destroy this fax.', { x: leftMargin, y, size: 7, font, color: rgb(0.5, 0.5, 0.5) });

    const pdfBytes = await pdfDoc.save();
    return Buffer.from(pdfBytes);
  },
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function drawSectionBField(
  page: ReturnType<PDFDocument['addPage']>,
  x: number,
  y: number,
  label: string,
  value: string,
  font: Awaited<ReturnType<PDFDocument['embedFont']>>,
  boldFont: Awaited<ReturnType<PDFDocument['embedFont']>>,
  color: ReturnType<typeof rgb>,
) {
  page.drawText(`${label}:`, { x, y, size: 9, font: boldFont, color });
  const lines = value.split('\n');
  lines.forEach((line, i) => {
    page.drawText(line, { x: x + 10, y: y - 14 - i * 12, size: 9, font, color });
  });
}

async function drawSignatureSection(
  pdfDoc: PDFDocument,
  page: ReturnType<PDFDocument['addPage']>,
  x: number,
  y: number,
  opts: {
    signatureDataUrl: string;
    physicianName: string;
    signerIp: string;
    signedAt: Date;
    font: Awaited<ReturnType<PDFDocument['embedFont']>>;
    boldFont: Awaited<ReturnType<PDFDocument['embedFont']>>;
    headerColor: ReturnType<typeof rgb>;
    textColor: ReturnType<typeof rgb>;
  },
) {
  const { signatureDataUrl, physicianName, signerIp, signedAt, font, boldFont, headerColor, textColor } = opts;

  page.drawText('SECTION D — PHYSICIAN SIGNATURE', {
    x, y, size: 14, font: boldFont, color: headerColor,
  });
  y -= 8;
  page.drawLine({ start: { x, y }, end: { x: 562, y }, thickness: 1, color: headerColor });
  y -= 25;

  // Embed signature image
  try {
    const sigBase64 = signatureDataUrl.split(',')[1];
    const sigBytes = Buffer.from(sigBase64, 'base64');
    const sigImage = await pdfDoc.embedPng(sigBytes);
    const sigDims = sigImage.scale(0.5);
    const sigWidth = Math.min(sigDims.width, 250);
    const sigHeight = Math.min(sigDims.height, 80);
    page.drawImage(sigImage, { x, y: y - sigHeight, width: sigWidth, height: sigHeight });
    y -= sigHeight + 5;
  } catch {
    page.drawText('[Signature image could not be rendered]', { x, y: y - 20, size: 9, font, color: textColor });
    y -= 30;
  }

  // Signature line
  page.drawLine({ start: { x, y }, end: { x: x + 300, y }, thickness: 0.5, color: textColor });
  y -= 14;
  page.drawText(`Physician: ${physicianName}`, { x, y, size: 10, font, color: textColor });
  y -= 14;
  page.drawText(`Date: ${signedAt.toISOString().split('T')[0]}`, { x, y, size: 10, font, color: textColor });
  y -= 14;
  page.drawText(`Time: ${signedAt.toISOString().split('T')[1].split('.')[0]} UTC`, { x, y, size: 10, font, color: textColor });
  y -= 20;

  // E-SIGN Act compliance block
  page.drawText('E-SIGN VERIFICATION', { x, y, size: 8, font: boldFont, color: rgb(0.4, 0.4, 0.4) });
  y -= 12;
  page.drawText(`Signer IP: ${signerIp}`, { x, y, size: 7, font, color: rgb(0.5, 0.5, 0.5) });
  y -= 10;
  page.drawText(`Timestamp: ${signedAt.toISOString()}`, { x, y, size: 7, font, color: rgb(0.5, 0.5, 0.5) });
  y -= 10;
  page.drawText('This document was electronically signed in compliance with the E-SIGN Act (15 U.S.C. § 7001) and UETA.', {
    x, y, size: 7, font, color: rgb(0.5, 0.5, 0.5),
  });
}

function getSectionBLabels(formType: FormType): Record<string, string> {
  const common: Record<string, string> = {
    diagnosis: 'Primary Diagnosis (ICD-10)',
    clinical_notes: 'Additional Clinical Notes',
    clinical_justification: 'Clinical Justification',
  };

  switch (formType) {
    case FormType.CMS_484:
      return {
        ...common,
        o2_test_date: 'Date of Blood Gas / Oximetry Test',
        o2_test_result: 'Test Result (PaO2 / SpO2)',
        o2_test_condition: 'Condition During Test',
        lpm_prescribed: 'Liters Per Minute Prescribed',
        o2_frequency: 'Frequency of Use',
        portable_needed: 'Portable Oxygen Needed',
      };
    case FormType.CMS_10126:
      return {
        ...common,
        mobility_limitation: 'Mobility Limitation',
        bed_type: 'Bed Type',
        side_rails: 'Side Rails',
        mattress_type: 'Mattress Type',
      };
    case FormType.CMS_10125:
      return {
        ...common,
        mobility_limitation: 'Mobility Limitation in Home',
        manual_wheelchair_insufficient: 'Why Manual Wheelchair Is Insufficient',
        can_operate_pov: 'Patient Can Safely Operate POV',
        home_assessment: 'Home Assessment Completed',
      };
    default:
      return {
        ...common,
        equipment_description: 'Equipment / Supply Requested',
        medical_necessity: 'Medical Necessity',
        duration: 'Expected Duration of Need',
        alternatives_tried: 'Alternative Treatments Tried',
        additional_notes: 'Additional Notes',
      };
  }
}
