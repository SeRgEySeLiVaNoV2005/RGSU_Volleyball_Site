import { put } from '@vercel/blob';
import { setCors, requireAuth, fail, ok } from './_lib.js';

export default async function handler(req, res) {
  if (setCors(req, res, 'POST, OPTIONS')) return;

  if (req.method !== 'POST') return fail(res, 405, 'Method not allowed');

  if (!requireAuth(req, res)) return;

  var body = req.body;
  if (!body || !body.image || !body.filename) {
    res.status(400).json({ error: 'Нет данных изображения' });
    return;
  }

  try {
    // Decode base64 image data
    var base64Data = body.image;
    // Strip data URL prefix if present (e.g. "data:image/jpeg;base64,...")
    var matches = base64Data.match(/^data:([^;]+);base64,(.+)$/);
    var mimeType = 'image/png';
    if (matches) {
      mimeType = matches[1];
      base64Data = matches[2];
    }

    var imageBuffer = Buffer.from(base64Data, 'base64');

    // Generate unique filename
    var timestamp = Date.now();
    var safeName = body.filename.replace(/[^a-zA-Z0-9._-]/g, '_');
    var blobPath = 'uploads/' + timestamp + '-' + safeName;

    if (process.env.BLOB_READ_WRITE_TOKEN) {
      var result = await put(blobPath, imageBuffer, {
        access: 'public',
        contentType: mimeType
      });
      res.status(200).json({ success: true, url: result.url });
    } else {
      // No Blob token — return the data URL itself for local dev
      res.status(200).json({ success: true, url: body.image });
    }
  } catch (e) {
    console.error('Upload failed:', e.message);
    res.status(500).json({ error: 'Ошибка загрузки: ' + e.message });
  }
}
