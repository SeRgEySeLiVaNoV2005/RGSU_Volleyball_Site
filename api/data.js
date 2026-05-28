import fs from 'fs';
import path from 'path';
import { put, list } from '@vercel/blob';

const REPO_DATA = path.join(process.cwd(), 'data.json');
const TMP_DATA = '/tmp/data.json';
const BLOB_NAME = 'site-data.json';

async function readDataFromBlob() {
  const { blobs } = await list();
  const dataBlob = blobs.find(function(b) { return b.pathname === BLOB_NAME; });
  if (!dataBlob) return null;
  const res = await fetch(dataBlob.url, { cache: 'no-store' });
  if (!res.ok) return null;
  return await res.json();
}

function readDataFromFs() {
  if (fs.existsSync(TMP_DATA)) {
    try {
      return JSON.parse(fs.readFileSync(TMP_DATA, 'utf-8'));
    } catch {}
  }
  try {
    return JSON.parse(fs.readFileSync(REPO_DATA, 'utf-8'));
  } catch {
    return {
      posts: [],
      settings: { site_title: 'РГСУ ВОЛЕЙБОЛ', yandex_app_id: '' },
      players: [],
      tournaments: [],
      homepage: {
        hero_title: 'Добро пожаловать, будущие чемпионы',
        hero_subtitle: 'Присоединяйтесь к волейбольной семье РГСУ и достигайте новых высот вместе с нами.',
        button_text: 'Подать заявку',
        button_link: '/about',
        hero_image: '',
        footer_address: 'Москва, ул. Вильгельма Пика, д. 4, стр. 1',
        footer_email: 'volleyball@rgsu.net',
        footer_phone: '+7 (495) 123-45-67',
        vk_link: 'https://vk.com/rgsu_volleyball',
        tg_link: 'https://t.me/rgsu_sport'
      }
    };
  }
}

async function readData() {
  if (process.env.BLOB_READ_WRITE_TOKEN) {
    try {
      var data = await readDataFromBlob();
      if (data) return data;
    } catch {}
  }
  return readDataFromFs();
}

async function writeData(data) {
  var json = JSON.stringify(data, null, 2);
  if (process.env.BLOB_READ_WRITE_TOKEN) {
    try {
      await put(BLOB_NAME, json, {
        access: 'public',
        addRandomSuffix: false,
        allowOverwrite: true
      });
    } catch (e) { console.error('Blob write failed:', e.message); }
  }
  // Keep filesystem writes for local development
  try { fs.writeFileSync(TMP_DATA, json, 'utf-8'); } catch {}
  try { fs.writeFileSync(REPO_DATA, json, 'utf-8'); } catch {}
}

function validateData(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    return 'Данные должны быть объектом';
  }

  var arrays = ['posts', 'players', 'tournaments'];
  for (var i = 0; i < arrays.length; i++) {
    var key = arrays[i];
    if (data[key] !== undefined && !Array.isArray(data[key])) {
      return 'Поле "' + key + '" должно быть массивом';
    }
    if (Array.isArray(data[key])) {
      for (var j = 0; j < data[key].length; j++) {
        if (data[key][j] === null || typeof data[key][j] !== 'object' || typeof data[key][j].id === 'undefined') {
          return 'Каждый элемент в "' + key + '" должен иметь поле id';
        }
      }
    }
  }

  var objects = ['settings', 'homepage'];
  for (var i = 0; i < objects.length; i++) {
    var key = objects[i];
    if (data[key] !== undefined && (typeof data[key] !== 'object' || Array.isArray(data[key]) || data[key] === null)) {
      return 'Поле "' + key + '" должно быть объектом';
    }
  }

  return null;
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

export default async function handler(req, res) {
  var origin = getAllowedOrigin(req.headers.origin);
  if (origin) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method === 'GET') {
    var data = await readData();
    res.status(200).json(data);
    return;
  }

  if (req.method === 'POST') {
    var body = req.body;

    // Public actions (no auth required)
    if (body && body.action) {
      var data = await readData();

      if (body.action === 'like') {
        var post = (data.posts || []).find(function(p) { return p.id === body.postId; });
        if (!post) {
          res.status(404).json({ error: 'Пост не найден' });
          return;
        }
        post.likes = (post.likes || 0) + 1;
        await writeData(data);
        res.status(200).json({ success: true, likes: post.likes });
        return;
      }

      if (body.action === 'unlike') {
        var post = (data.posts || []).find(function(p) { return p.id === body.postId; });
        if (!post) {
          res.status(404).json({ error: 'Пост не найден' });
          return;
        }
        post.likes = Math.max(0, (post.likes || 0) - 1);
        await writeData(data);
        res.status(200).json({ success: true, likes: post.likes });
        return;
      }

      if (body.action === 'comment') {
        if (!body.text || !body.yandexUser || !body.yandexUser.id) {
          res.status(400).json({ error: 'Требуется текст комментария и Яндекс авторизация' });
          return;
        }
        var post = (data.posts || []).find(function(p) { return p.id === body.postId; });
        if (!post) {
          res.status(404).json({ error: 'Пост не найден' });
          return;
        }
        if (!post.comments) post.comments = [];
        var newComment = {
          id: post.comments.length > 0
            ? Math.max.apply(null, post.comments.map(function(c) { return c.id; })) + 1
            : 1,
          author: body.yandexUser.first_name + ' ' + body.yandexUser.last_name,
          text: body.text,
          date: new Date().toISOString().split('T')[0],
          approved: true,
          yandexUserId: body.yandexUser.id,
          yandexPhoto: body.yandexUser.photo || '',
          replies: []
        };
        post.comments.push(newComment);
        await writeData(data);
        res.status(200).json({ success: true, comment: newComment });
        return;
      }

      res.status(400).json({ error: 'Неизвестное действие' });
      return;
    }

    // Admin actions (auth required)
    if (!verifyToken(req.headers.authorization)) {
      res.status(401).json({ error: 'Неавторизован' });
      return;
    }

    if (!body) {
      res.status(400).json({ error: 'Нет данных' });
      return;
    }
    var validationError = validateData(body);
    if (validationError) {
      res.status(400).json({ error: validationError });
      return;
    }
    await writeData(body);
    var result = await readData();
    res.status(200).json({ success: true, data: result });
  } else {
    res.status(405).json({ error: 'Method not allowed' });
  }
}