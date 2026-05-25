import fs from 'fs';
import path from 'path';

const REPO_DATA = path.join(process.cwd(), 'data.json');
const TMP_DATA = '/tmp/data.json';

function readData() {
  // In Vercel prod, mutations go to /tmp/data.json
  // The repo data.json serves as initial seed
  if (fs.existsSync(TMP_DATA)) {
    try {
      return JSON.parse(fs.readFileSync(TMP_DATA, 'utf-8'));
    } catch {}
  }
  try {
    return JSON.parse(fs.readFileSync(REPO_DATA, 'utf-8'));
  } catch {
    return { posts: [], settings: { site_title: 'РГСУ ВОЛЕЙБОЛ' } };
  }
}

function writeData(data) {
  // Write to /tmp/data.json for Vercel (survives redeploys within same instance)
  // Also update repo file for local dev
  try { fs.writeFileSync(TMP_DATA, JSON.stringify(data, null, 2), 'utf-8'); } catch {}
  try { fs.writeFileSync(REPO_DATA, JSON.stringify(data, null, 2), 'utf-8'); } catch {}
}

function verifyToken(authHeader) {
  if (!authHeader) return false;
  try {
    const token = authHeader.replace('Bearer ', '');
    const decoded = JSON.parse(Buffer.from(token, 'base64').toString('utf-8'));
    return decoded.user === 'admin' && decoded.exp > Date.now();
  } catch {
    return false;
  }
}

export default function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (!verifyToken(req.headers.authorization)) {
    res.status(401).json({ error: 'Неавторизован' });
    return;
  }

  if (req.method === 'GET') {
    const data = readData();
    res.status(200).json(data);
  } else if (req.method === 'POST') {
    const newData = req.body;
    if (!newData) {
      res.status(400).json({ error: 'Нет данных' });
      return;
    }
    writeData(newData);
    res.status(200).json({ success: true, data: readData() });
  } else {
    res.status(405).json({ error: 'Method not allowed' });
  }
}