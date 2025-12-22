import puppeteer from 'puppeteer';

/**
 * Generates a PDF from HTML content
 * @param htmlContent - The HTML content to convert to PDF
 * @param options - Optional PDF generation options
 * @returns Promise resolving to a Buffer containing the PDF
 */
export async function generatePDFFromHTML(
  htmlContent: string,
  options?: {
    format?: 'Letter' | 'Legal' | 'Tabloid' | 'Ledger' | 'A0' | 'A1' | 'A2' | 'A3' | 'A4' | 'A5' | 'A6';
    margin?: {
      top?: string;
      right?: string;
      bottom?: string;
      left?: string;
    };
    printBackground?: boolean;
    landscape?: boolean;
  }
): Promise<Buffer> {
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  try {
    const page = await browser.newPage();
    
    // Set the HTML content
    await page.setContent(htmlContent, {
      waitUntil: 'networkidle0'
    });

    // Generate PDF with options
    const pdfBuffer = await page.pdf({
      format: options?.format || 'A4',
      margin: options?.margin || {
        top: '20mm',
        right: '20mm',
        bottom: '20mm',
        left: '20mm'
      },
      printBackground: options?.printBackground !== false,
      landscape: options?.landscape || false
    });

    return Buffer.from(pdfBuffer);
  } finally {
    await browser.close();
  }
}

