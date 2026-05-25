export default function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
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