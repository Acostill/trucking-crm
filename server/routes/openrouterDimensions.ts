import express, { Request, Response, NextFunction } from 'express';
import multer from 'multer';

const router = express.Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024 }
});

const DEFAULT_MODEL = 'allenai/molmo-2-8b:free';

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

      const model = process.env.OPENROUTER_MODEL || DEFAULT_MODEL;
      const prompt =
        'Extract the box dimensions from the image. ' +
        'Return the length, width, and height as numbers (inches if shown). ' +
        "Prefer values explicitly labeled in the image (e.g., 'Length = 12 in.'). " +
        'If only "L x W x H" is shown, use that. ' +
        'If uncertain, set a confidence < 0.7. ' +
        'Return ONLY valid JSON with keys: length_in, width_in, height_in, unit, confidence, notes.';

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

      if (!response.ok) {
        const errorText = await response.text();
        res.status(response.status).json({ error: 'OpenRouter API error', details: errorText });
        return;
      }

      const data = await response.json();
      const content = data?.choices?.[0]?.message?.content || '';
      const parsed = parseJsonFromText(content);

      if (!parsed) {
        res.status(502).json({ error: 'Model returned non-JSON unexpectedly.', raw: content });
        return;
      }

      res.status(200).json(parsed);
    } catch (err) {
      next(err);
    }
  }
);

export default router;
