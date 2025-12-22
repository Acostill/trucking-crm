import puppeteerCore from 'puppeteer-core';
import chromium from '@sparticuz/chromium';

/**
 * Fetches an image from a URL and converts it to base64
 */
async function fetchImageAsBase64(url: string): Promise<string | null> {
  try {
    const response = await fetch(url);
    if (!response.ok) {
      console.warn(`Failed to fetch image from ${url}: ${response.statusText}`);
      return null;
    }
    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const contentType = response.headers.get('content-type') || 'image/png';
    return `data:${contentType};base64,${buffer.toString('base64')}`;
  } catch (err) {
    console.warn(`Error fetching image from ${url}:`, err);
    return null;
  }
}

/**
 * Replaces Google Drive image URLs with base64 embedded images in HTML
 */
async function embedImagesInHTML(htmlContent: string): Promise<string> {
  // Find all img tags with Google Drive URLs
  const googleDriveImageRegex = /<img[^>]+src=["'](https:\/\/drive\.google\.com\/[^"']+)["'][^>]*>/gi;
  const matches = Array.from(htmlContent.matchAll(googleDriveImageRegex));
  
  let updatedHTML = htmlContent;
  
  for (const match of matches) {
    const fullImgTag = match[0];
    const driveUrl = match[1];
    
    // Convert Google Drive URL to direct image URL
    const fileIdMatch = driveUrl.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
    if (fileIdMatch) {
      const fileId = fileIdMatch[1];
      const directImageUrl = `https://drive.google.com/uc?export=view&id=${fileId}`;
      
      // Fetch and convert to base64
      const base64Image = await fetchImageAsBase64(directImageUrl);
      
      if (base64Image) {
        // Replace the src with base64
        updatedHTML = updatedHTML.replace(
          fullImgTag,
          fullImgTag.replace(driveUrl, base64Image)
        );
      }
    }
  }
  
  return updatedHTML;
}

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
  // Embed images (like Google Drive logos) as base64 before generating PDF
  const htmlWithEmbeddedImages = await embedImagesInHTML(htmlContent);
  
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
    
    // Set the HTML content with embedded images
    await page.setContent(htmlWithEmbeddedImages, {
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

