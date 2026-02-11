import express, { Request, Response, NextFunction } from 'express';
import multer from 'multer';
import { Mistral } from '@mistralai/mistralai';

const router = express.Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024 }
});

const DEFAULT_OCR_MODEL = 'mistral-ocr-latest';
const client = new Mistral({ apiKey: process.env.MISTRAL_API_KEY || '' });

function parseNumber(value: any): number | null {
  if (value == null) return null;
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

function extractTextFromResponse(payload: any): string {
  if (!payload) return '';
  if (typeof payload === 'string') return payload;
  if (Array.isArray(payload)) {
    return payload.map(extractTextFromResponse).filter(Boolean).join(' ');
  }
  if (typeof payload === 'object') {
    if (typeof payload.text === 'string') return payload.text;
    if (typeof payload.content === 'string') return payload.content;
    if (typeof payload.output === 'string') return payload.output;
    if (typeof payload.result === 'string') return payload.result;
    if (payload.pages) return extractTextFromResponse(payload.pages);
    if (payload.data) return extractTextFromResponse(payload.data);
    const values = Object.values(payload);
    return values.map(extractTextFromResponse).filter(Boolean).join(' ');
  }
  return '';
}

function extractDimensionsFromText(text: string) {
  if (!text) return null;
  const normalized = text.replace(/\s+/g, ' ').trim();
  const pattern =
    /(\d+(?:\.\d+)?)\s*(mm|cm|in|inch|inches|ft|feet)?\s*[x×]\s*(\d+(?:\.\d+)?)\s*(mm|cm|in|inch|inches|ft|feet)?\s*[x×]\s*(\d+(?:\.\d+)?)\s*(mm|cm|in|inch|inches|ft|feet)?/i;
  const match = normalized.match(pattern);
  if (!match) return null;
  const unit = (match[6] || match[4] || match[2] || '').toLowerCase() || null;
  return {
    length: Number(match[1]),
    width: Number(match[3]),
    height: Number(match[5]),
    unit,
    raw: match[0]
  };
}

// Alternative approach: Use vision model to directly analyze the image
async function extractDimensionsWithVision(imageBase64: string): Promise<{
  length: number | null;
  width: number | null;
  height: number | null;
  unit: string | null;
  confidence?: string;
} | null> {
  const apiKey = process.env.OPEN_ROUTER_API_KEY;
  if (!apiKey) {
    throw new Error('OPEN_ROUTER_API_KEY is not configured');
  }

  console.log('[Vision] Analyzing image with vision model');

  try {
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://trucking-crm.app',
        'X-Title': 'Trucking CRM OCR'
      },
      body: JSON.stringify({
        model: 'google/gemini-flash-1.5',
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: `Analyze this image and extract any dimensions (length, width, height) you can find. Look for:
- Dimension labels or measurements
- Pallet sizes, freight dimensions, box/container sizes
- Any L x W x H format or labeled dimensions
- Numbers followed by units (inches, feet, cm, mm)

Return ONLY a valid JSON object:
{
  "length": <number or null>,
  "width": <number or null>,
  "height": <number or null>,
  "unit": "<unit string or null>",
  "confidence": "high|medium|low"
}

If no dimensions are visible, return all null with confidence "low".`
              },
              {
                type: 'image_url',
                image_url: {
                  url: `data:image/jpeg;base64,${imageBase64}`
                }
              }
            ]
          }
        ],
        temperature: 0.1,
        max_tokens: 300
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[Vision] API error: ${response.status} - ${errorText}`);
      throw new Error(`Vision API error: ${response.status}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;

    console.log('[Vision] Raw response:', content);

    if (!content) {
      console.log('[Vision] No content in response');
      return null;
    }

    // Parse JSON from response
    let jsonStr = content.trim();
    jsonStr = jsonStr.replace(/^```json?\s*/i, '').replace(/\s*```$/, '');

    const jsonMatch = jsonStr.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.log('[Vision] No JSON object found in response');
      return null;
    }

    const parsed = JSON.parse(jsonMatch[0]);
    console.log('[Vision] Parsed dimensions:', parsed);

    return {
      length: parseNumber(parsed.length),
      width: parseNumber(parsed.width),
      height: parseNumber(parsed.height),
      unit: parsed.unit || null,
      confidence: parsed.confidence || 'low'
    };
  } catch (error) {
    console.error('[Vision] Error:', error);
    return null;
  }
}

async function structureDimensionsWithOpenRouter(ocrText: string): Promise<{
  length: number | null;
  width: number | null;
  height: number | null;
  unit: string | null;
  confidence?: string;
} | null> {
  const apiKey = process.env.OPEN_ROUTER_API_KEY;
  if (!apiKey) {
    throw new Error('OPEN_ROUTER_API_KEY is not configured');
  }

  if (!ocrText || ocrText.trim().length === 0) {
    console.log('[OpenRouter] No OCR text provided');
    return null;
  }

  console.log('[OpenRouter] OCR text:', ocrText.substring(0, 200) + (ocrText.length > 200 ? '...' : ''));

  const prompt = `You are an expert at extracting dimension data from text. Analyze the following text and extract any dimensions you find.

Text to analyze:
"""
${ocrText}
"""

Extract dimensions looking for:
- Patterns like: "48 x 40 x 36", "48x40x36", "48 X 40 X 36"
- Labels like: "Length: 48", "L: 48", "Width: 40", "W: 40", "Height: 36", "H: 36"
- Written forms: "length 48 inches", "48 inch length"
- Box/container dimensions, pallet sizes, freight dimensions
- Any three numbers that represent L x W x H dimensions
- Dimensions might be in format "LxWxH", "L W H", or with labels

Common units: inches (in), feet (ft), centimeters (cm), millimeters (mm)

Return ONLY a valid JSON object (no markdown, no explanation):
{
  "length": <number or null>,
  "width": <number or null>,
  "height": <number or null>,
  "unit": "<unit string or null>",
  "confidence": "high|medium|low"
}

If no dimensions are found, return all values as null with confidence "low".`;

  try {
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://trucking-crm.app',
        'X-Title': 'Trucking CRM OCR'
      },
      body: JSON.stringify({
        model: 'openai/gpt-3.5-turbo',
        messages: [
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.1,
        max_tokens: 300
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[OpenRouter] API error: ${response.status} - ${errorText}`);
      throw new Error(`OpenRouter API error: ${response.status}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;

    console.log('[OpenRouter] Raw response:', content);

    if (!content) {
      console.log('[OpenRouter] No content in response');
      return null;
    }

    // Try to parse the JSON response - handle markdown code blocks
    let jsonStr = content.trim();
    jsonStr = jsonStr.replace(/^```json?\s*/i, '').replace(/\s*```$/, '');

    const jsonMatch = jsonStr.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.log('[OpenRouter] No JSON object found in response');
      return null;
    }

    const parsed = JSON.parse(jsonMatch[0]);
    console.log('[OpenRouter] Parsed dimensions:', parsed);

    return {
      length: parseNumber(parsed.length),
      width: parseNumber(parsed.width),
      height: parseNumber(parsed.height),
      unit: parsed.unit || null,
      confidence: parsed.confidence || 'low'
    };
  } catch (error) {
    console.error('[OpenRouter] Error:', error);
    return null;
  }
}

router.post(
  '/dimensions',
  upload.single('image'),
  async function(req: Request, res: Response, next: NextFunction) {
    try {
      const apiKey = process.env.MISTRAL_API_KEY;
      const model = process.env.MISTRAL_OCR_MODEL || DEFAULT_OCR_MODEL;

      if (!apiKey) {
        res.status(500).json({
          error: 'MISTRAL_API_KEY must be configured'
        });
        return;
      }

      const file = req.file;
      const imageBase64 =
        (file && file.buffer ? file.buffer.toString('base64') : null) ||
        (req.body && (req.body.imageBase64 || req.body.image_base64));

      if (!imageBase64 || typeof imageBase64 !== 'string') {
        res.status(400).json({ error: 'Image file or base64 image is required' });
        return;
      }

      const providedDimensions = {
        height: parseNumber(req.body?.height),
        length: parseNumber(req.body?.length),
        width: parseNumber(req.body?.width)
      };

      const base64Value = String(imageBase64).replace(/^data:.*;base64,/, '');
      const fileBuffer = Buffer.from(base64Value, 'base64');
      const fileName =
        file?.originalname ||
        `ocr-upload.${file?.mimetype?.split('/')[1] || 'jpg'}`;

      const uploaded = await client.files.upload({
        purpose: 'ocr',
        file: {
          fileName,
          content: new Uint8Array(fileBuffer)
        }
      });

      const ocrResponse = await client.ocr.process({
        model,
        document: {
          type: 'file',
          fileId: uploaded.id
        },
        includeImageBase64: true
      });

      const ocrText = extractTextFromResponse(ocrResponse);

      // Strategy 1: Try vision model first (more accurate - sees the actual image)
      let structuredDimensions = null;
      try {
        console.log('[Strategy] Attempting vision-based extraction...');
        structuredDimensions = await extractDimensionsWithVision(base64Value);
      } catch (error) {
        console.error('[Strategy] Vision extraction failed:', error);
      }

      // Strategy 2: Fallback to OCR text-based extraction if vision fails
      if (!structuredDimensions ||
          (structuredDimensions.length === null &&
           structuredDimensions.width === null &&
           structuredDimensions.height === null)) {
        try {
          console.log('[Strategy] Attempting OCR text-based extraction...');
          structuredDimensions = await structureDimensionsWithOpenRouter(ocrText);
        } catch (error) {
          console.error('[Strategy] OCR text extraction failed:', error);
        }
      }

      // Strategy 3: Final fallback to regex-based extraction
      if (!structuredDimensions ||
          (structuredDimensions.length === null &&
           structuredDimensions.width === null &&
           structuredDimensions.height === null)) {
        console.log('[Strategy] Using regex-based extraction as final fallback...');
        structuredDimensions = extractDimensionsFromText(ocrText);
      }

      res.status(200).json({
        ok: true,
        providedDimensions,
        extractedDimensions: structuredDimensions,
        ocrText,
        ocrResponse
      });
    } catch (err) {
      next(err);
    }
  }
);

export default router;
