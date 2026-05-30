import { put } from '@vercel/blob';

function getAllowedOrigin(requestOrigin) {
  var env = process.env.ALLOWED_ORIGINS;
  var allowed = env ? env.split(',').map(function(s) { return s.trim(); }) : [];

  if (allowed.length === 0) {
    if (!requestOrigin) return '';
    if (requestOrigin.startsWith('http://localhost')) return requestOrigin;
    if (requestOrigin.endsWith('.vercel.app')) return requestOrigin;
    return '';
  }

  if (allowed.indexOf('*') !== -1) return '*';
  if (allowed.indexOf(requestOrigin) !== -1) return requestOrigin;

  for (var i = 0; i < allowed.length; i++) {
    if (allowed[i].startsWith('*.') && requestOrigin && requestOrigin.endsWith(allowed[i].slice(1))) {
      return requestOrigin;
    }
  }

  return allowed[0];
}

function verifyToken(authHeader) {
  if (!authHeader) return false;
  try {
    var token = authHeader.replace('Bearer ', '');
    var decoded = JSON.parse(Buffer.from(token, 'base64').toString('utf-8'));
    return decoded.user === 'admin' && decoded.exp > Date.now();
  } catch {
    return false;
  }
}

export default async function handler(req, res) {
  var origin = getAllowedOrigin(req.headers.origin);
  if (origin) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  }
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  // Auth check
  if (!req.headers.authorization) {
    res.status(401).json({ error: 'Неавторизован' });
    return;
  }
  if (!verifyToken(req.headers.authorization)) {
    res.status(401).json({ error: 'Токен истек или неверен' });
    return;
  }

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
