import { setCors, fail, ok } from './_lib.js';

export default function handler(req, res) {
  if (setCors(req, res, 'POST, OPTIONS')) return;

  if (req.method !== 'POST') return fail(res, 405, 'Method not allowed');

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