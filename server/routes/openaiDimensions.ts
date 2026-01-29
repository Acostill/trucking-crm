import express, { Request, Response, NextFunction } from 'express';
import multer from 'multer';
import OpenAI from 'openai';

const router = express.Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024 }
});

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

function getOutputText(response: any): string | null {
  if (!response) return null;
  if (typeof response.output_text === 'string') return response.output_text;
  const output = response.output;
  if (Array.isArray(output)) {
    for (const item of output) {
      const content = item?.content;
      if (Array.isArray(content)) {
        for (const piece of content) {
          if (typeof piece?.text === 'string') return piece.text;
        }
      }
    }
  }
  return null;
}

router.post(
  '/',
  upload.single('image'),
  async function(req: Request, res: Response, next: NextFunction) {
    try {
      if (!process.env.OPENAI_API_KEY) {
        res.status(500).json({ error: 'OPENAI_API_KEY must be configured' });
        return;
      }

      if (!req.file) {
        res.status(400).json({ error: "Missing 'image' file field." });
        return;
      }

      const mime = req.file.mimetype || 'image/jpeg';
      const base64 = req.file.buffer.toString('base64');
      const dataUrl = `data:${mime};base64,${base64}`;

      const response = await client.responses.create({
        model: 'gpt-4.1-mini',
        input: [
          {
            role: 'user',
            content: [
              {
                type: 'input_text',
                text:
                  'Extract the box dimensions from the image. ' +
                  'Return the length, width, and height as numbers (inches if shown). ' +
                  "Prefer values explicitly labeled in the image (e.g., 'Length = 12 in.'). " +
                  'If only "L x W x H" is shown, use that. If uncertain, set a confidence < 0.7.'
              },
              { type: 'input_image', image_url: dataUrl }
            ]
          }
        ],
        text: {
          format: {
            type: 'json_schema',
            name: 'dimensions',
            schema: {
              type: 'object',
              additionalProperties: false,
              properties: {
                length_in: { type: ['number', 'null'] },
                width_in: { type: ['number', 'null'] },
                height_in: { type: ['number', 'null'] },
                unit: { type: 'string', enum: ['in', 'cm', 'mm', 'unknown'] },
                confidence: { type: 'number', minimum: 0, maximum: 1 },
                notes: { type: 'string' }
              },
              required: ['length_in', 'width_in', 'height_in', 'unit', 'confidence', 'notes']
            },
            strict: true
          }
        }
      });

      const outputText = getOutputText(response);
      if (!outputText) {
        res.status(502).json({ error: 'Model returned no output text.' });
        return;
      }

      let parsed: any;
      try {
        parsed = JSON.parse(outputText);
      } catch (_err) {
        res.status(502).json({
          error: 'Model returned non-JSON unexpectedly.',
          raw: outputText
        });
        return;
      }

      res.status(200).json(parsed);
    } catch (err) {
      next(err);
    }
  }
);

export default router;
