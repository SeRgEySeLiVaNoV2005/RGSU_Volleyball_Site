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

export default function handler(req, res) {
  var origin = getAllowedOrigin(req.headers.origin);
  if (origin) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  }
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const { login, password } = req.body || {};

  if (login === 'admin' && password === 'admin') {
    // Simple token: base64 encoded payload
    const payload = Buffer.from(JSON.stringify({
      user: 'admin',
      role: 'admin',
      exp: Date.now() + 86400000 // 24 hours
    })).toString('base64');

    res.status(200).json({ token: payload, user: 'admin' });
  } else {
    res.status(401).json({ error: 'Неверный логин или пароль' });
  }
}