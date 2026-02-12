import express, { Request, Response, NextFunction } from 'express';
import multer from 'multer';
import OpenAI from 'openai';

const router = express.Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024 }
});

const DEFAULT_MODEL = 'google/gemini-flash-1.5';
const FALLBACK_MODELS = [
  'openai/gpt-4o-mini',
  'anthropic/claude-3-haiku',
  'allenai/molmo-2-8b'
];

// Initialize OpenAI client for fallback
const openaiClient = process.env.OPENAI_API_KEY ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY }) : null;

function parseJsonFromText(text: string): any | null {
  if (!text) return null;
  let jsonStr = text.trim();
  jsonStr = jsonStr.replace(/^```json?\s*/i, '').replace(/\s*```$/, '');
  const match = jsonStr.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    return JSON.parse(match[0]);
  } catch (_err) {
    return null;
  }
}

function normalizePieces(payload: any) {
  if (!payload || typeof payload !== 'object') return [];
  const rawPieces = Array.isArray(payload.pieces) ? payload.pieces : [];
  return rawPieces.map(function(piece) {
    if (!piece || typeof piece !== 'object') return null;
    const length = piece.length_in ?? piece.length ?? null;
    const width = piece.width_in ?? piece.width ?? null;
    const height = piece.height_in ?? piece.height ?? null;
    const weight = piece.weight ?? piece.weight_lbs ?? piece.weight_lb ?? null;
    return {
      length_in: typeof length === 'number' ? length : Number(length),
      width_in: typeof width === 'number' ? width : Number(width),
      height_in: typeof height === 'number' ? height : Number(height),
      weight: typeof weight === 'number' ? weight : Number(weight),
      unit: piece.unit || payload.unit || 'in'
    };
  }).filter(function(piece) {
    if (!piece) return false;
    return [piece.length_in, piece.width_in, piece.height_in, piece.weight].some(function(val) {
      return typeof val === 'number' && !Number.isNaN(val);
    });
  });
}

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function tryOpenRouterWithRetry(
  apiKey: string,
  model: string,
  prompt: string,
  dataUrl: string,
  maxRetries: number = 3
): Promise<{ success: boolean; data?: any; error?: string }> {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'https://trucking-crm.app',
          'X-Title': 'Trucking CRM OCR'
        },
        body: JSON.stringify({
          model,
          messages: [
            {
              role: 'user',
              content: [
                { type: 'text', text: prompt },
                { type: 'image_url', image_url: { url: dataUrl } }
              ]
            }
          ],
          temperature: 0.1,
          max_tokens: 300
        })
      });

      if (response.status === 429) {
        // Rate limited - wait with exponential backoff
        const waitTime = Math.min(1000 * Math.pow(2, attempt), 10000); // Max 10 seconds
        if (attempt < maxRetries - 1) {
          console.log(`[OpenRouter] Rate limited, retrying in ${waitTime}ms...`);
          await sleep(waitTime);
          continue;
        }
        const errorText = await response.text();
        return { success: false, error: `Rate limited: ${errorText}` };
      }

      if (!response.ok) {
        const errorText = await response.text();
        return { success: false, error: `OpenRouter API error (${response.status}): ${errorText}` };
      }

      const data = await response.json();
      return { success: true, data };
    } catch (err: any) {
      if (attempt < maxRetries - 1) {
        const waitTime = Math.min(1000 * Math.pow(2, attempt), 5000);
        await sleep(waitTime);
        continue;
      }
      return { success: false, error: err?.message || 'Unknown error' };
    }
  }
  return { success: false, error: 'Max retries exceeded' };
}

async function tryOpenAIFallback(dataUrl: string, prompt: string): Promise<{ success: boolean; data?: any; error?: string }> {
  if (!openaiClient) {
    return { success: false, error: 'OpenAI API key not configured' };
  }

  try {
    const response = await openaiClient.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: prompt },
            { type: 'image_url', image_url: { url: dataUrl } }
          ]
        }
      ],
      temperature: 0.1,
      max_tokens: 300
    });

    const content = response.choices?.[0]?.message?.content || '';
    
    // Return in the same format as OpenRouter for consistency
    return { success: true, data: { choices: [{ message: { content } }] } };
  } catch (err: any) {
    return { success: false, error: err?.message || 'OpenAI API error' };
  }
}

router.post(
  '/',
  upload.single('image'),
  async function(req: Request, res: Response, next: NextFunction) {
    try {
      const apiKey = process.env.OPENROUTER_API_KEY;
      if (!apiKey) {
        res.status(500).json({ error: 'OPENROUTER_API_KEY must be configured' });
        return;
      }

      if (!req.file) {
        res.status(400).json({ error: "Missing 'image' file field." });
        return;
      }

      const mime = req.file.mimetype || 'image/jpeg';
      const base64 = req.file.buffer.toString('base64');
      const dataUrl = `data:${mime};base64,${base64}`;

      const primaryModel = process.env.OPENROUTER_MODEL || DEFAULT_MODEL;
      const modelsToTry = [primaryModel, ...FALLBACK_MODELS];
      
      const prompt =
        'Extract dimensions for ALL items visible in the image. ' +
        'Return an array of pieces, each with length_in, width_in, height_in, and weight if shown. ' +
        'If the unit is shown, include unit (in/cm/mm/ft). If not shown, use "in". ' +
        'Prefer values explicitly labeled in the image (e.g., "Length = 12 in."). ' +
        'If only "L x W x H" is shown, use that ordering. ' +
        'If "@" is shown assume the number following it is the weight.' +
        'If uncertain, set a confidence < 0.7. ' +
        'Return ONLY valid JSON with this shape: ' +
        '{"pieces":[{"length_in":number|null,"width_in":number|null,"height_in":number|null,"weight":number|null,"unit":"in|cm|mm|ft","confidence":number,"notes":string}]}';

      // Try OpenRouter with multiple models
      let result: { success: boolean; data?: any; error?: string } | null = null;
      
      for (const model of modelsToTry) {
        console.log(`[OpenRouter] Trying model: ${model}`);
        result = await tryOpenRouterWithRetry(apiKey, model, prompt, dataUrl);
        
        if (result.success) {
          console.log(`[OpenRouter] Success with model: ${model}`);
          break;
        }
        
        // If rate limited, try next model
        if (result.error?.includes('Rate limited') || result.error?.includes('429')) {
          console.log(`[OpenRouter] Model ${model} rate limited, trying next model...`);
          continue;
        }
        
        // For other errors, also try next model
        console.log(`[OpenRouter] Model ${model} failed: ${result.error}, trying next model...`);
      }

      // If all OpenRouter models failed, try OpenAI fallback
      if (!result || !result.success) {
        console.log('[OpenRouter] All models failed, trying OpenAI fallback...');
        result = await tryOpenAIFallback(dataUrl, prompt);
      }

      if (!result || !result.success) {
        const errorMsg = result?.error || 'All API providers failed';
        res.status(503).json({ 
          error: 'Failed to extract dimensions', 
          details: errorMsg,
          suggestion: 'Please try again in a few moments or manually enter the dimensions.'
        });
        return;
      }

      const data = result.data;
      const content = data?.choices?.[0]?.message?.content || '';
      const parsed = parseJsonFromText(content);

      if (!parsed) {
        res.status(502).json({ error: 'Model returned non-JSON unexpectedly.', raw: content });
        return;
      }

      const pieces = normalizePieces(parsed);
      res.status(200).json({
        pieces,
        raw: parsed
      });
    } catch (err) {
      next(err);
    }
  }
);

export default router;
