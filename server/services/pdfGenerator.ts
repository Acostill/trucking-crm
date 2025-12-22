import puppeteerCore from 'puppeteer-core';
import chromium from '@sparticuz/chromium';

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
  let executablePath: string | undefined;
  let launchArgs: string[] = ['--no-sandbox', '--disable-setuid-sandbox'];
  
  // Try to get Chromium executable path for serverless environments
  try {
    if (process.env.PUPPETEER_EXECUTABLE_PATH) {
      // Use custom executable path if provided
      executablePath = process.env.PUPPETEER_EXECUTABLE_PATH;
    } else {
      // Try to use @sparticuz/chromium (works in AWS Lambda/serverless)
      executablePath = await chromium.executablePath();
      launchArgs = chromium.args;
    }
  } catch (err) {
    // If chromium.executablePath() fails, try to use system Chrome/Chromium
    console.warn('Could not get Chromium executable path, trying system Chrome:', err);
    // Will try to use system Chrome if available
    executablePath = undefined;
  }
  
  const browser = await puppeteerCore.launch({
    args: launchArgs,
    defaultViewport: { width: 1920, height: 1080 },
    executablePath: executablePath,
    headless: true,
  });

  try {
    const page = await browser.newPage();
    
    // Set the HTML content
    await page.setContent(htmlContent, {
      waitUntil: 'networkidle0'
    });

    // Generate PDF with options
    const pdfBuffer = await page.pdf({
      format: options?.format || 'Letter',
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

