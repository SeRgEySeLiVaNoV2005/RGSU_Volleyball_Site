import fs from 'fs';
import path from 'path';
import { put, list } from '@vercel/blob';
import defaultData from './default-data.js';

const REPO_DATA = path.join(process.cwd(), 'data.json');
const TMP_DATA = '/tmp/data.json';
const DATA_VERSION = 2; // bump when default data changes — triggers auto-restore

function getBlobName(team) {
  return team === 'women' ? 'site-data-women.json' : 'site-data.json';
}

var cachedBlobUrl = {};

async function getBlobUrl(blobName) {
  if (cachedBlobUrl[blobName]) return cachedBlobUrl[blobName];
  try {
    const { blobs } = await list({ prefix: blobName, limit: 1 });
    if (blobs.length > 0) {
      cachedBlobUrl[blobName] = blobs[0].url;
      return cachedBlobUrl[blobName];
    }
  } catch {}
  return null;
}

async function readDataFromBlob(blobName) {
  var url = await getBlobUrl(blobName);
  if (!url) return null;
  try {
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) { cachedBlobUrl[blobName] = null; return null; }
    return await res.json();
  } catch {
    cachedBlobUrl[blobName] = null;
    return null;
  }
}

// Deep-clone the embedded default (so callers can mutate freely)
function getDefaultData() {
  return JSON.parse(JSON.stringify(defaultData));
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
    return getDefaultData();
  }
}

async function readData(team) {
  var blobName = getBlobName(team);
  if (process.env.BLOB_READ_WRITE_TOKEN) {
    try {
      var data = await readDataFromBlob(blobName);
      if (data) {
        // Auto-restore when version is outdated (e.g. corrupted Blob)
        if (data._data_version !== DATA_VERSION) {
          console.log('[auto-restore] ' + team + ' Blob version mismatch (' + data._data_version + ' → ' + DATA_VERSION + '), restoring from embedded default');
          var restored = getDefaultData();
          await writeData(restored, team);
          return restored;
        }
        if (team === 'women') {
          // Backup women's data to filesystem for disaster recovery
          try { fs.writeFileSync('/tmp/data-women.json', JSON.stringify(data), 'utf-8'); } catch {}
        }
        return data;
      }
      // Blob token is set but blob read returned null — try filesystem backup before falling back to empty
      console.warn('[data] Blob read returned null for ' + team + ', trying filesystem fallback');
      if (team === 'women') {
        try {
          if (fs.existsSync('/tmp/data-women.json')) {
            var backup = JSON.parse(fs.readFileSync('/tmp/data-women.json', 'utf-8'));
            console.log('[data] Restored women\'s data from filesystem backup');
            return backup;
          }
        } catch (e) { console.error('[data] Filesystem backup read failed:', e.message); }
      }
      var fsFallback = readDataFromFs();
      if (fsFallback && fsFallback.players && fsFallback.players.length > 0) {
        console.log('[data] Restored ' + team + ' data from filesystem');
        return fsFallback;
      }
    } catch (e) {
      console.error('[data] Blob read error for ' + team + ':', e.message);
    }
  }
  // No Blob available — return appropriate defaults
  if (team === 'women') {
    // Try women-specific filesystem backup first
    try {
      if (fs.existsSync('/tmp/data-women.json')) {
        var backup = JSON.parse(fs.readFileSync('/tmp/data-women.json', 'utf-8'));
        return backup;
      }
    } catch {}
    return {
      posts: [],
      settings: { site_title: 'РГСУ ВОЛЕЙБОЛ', yandex_app_id: '' },
      players: [],
      tournaments: [],
      homepage: getDefaultData().homepage
    };
  }
  // Men's team without Blob: try filesystem, fall back to embedded default
  return readDataFromFs();
}

async function writeData(data, team) {
  // Ensure version marker is present
  if (data._data_version !== DATA_VERSION) {
    data._data_version = DATA_VERSION;
  }
  var json = JSON.stringify(data, null, 2);
  var blobName = getBlobName(team);
  if (process.env.BLOB_READ_WRITE_TOKEN) {
    try {
      var result = await put(blobName, json, {
        access: 'public',
        addRandomSuffix: false,
        allowOverwrite: true
      });
      cachedBlobUrl[blobName] = result.url;
    } catch (e) { console.error('Blob write failed:', e.message); }
  }
  // Write to filesystem for disaster recovery (both teams)
  try { fs.writeFileSync('/tmp/data-' + team + '.json', json, 'utf-8'); } catch {}
  if (team !== 'women') {
    try { fs.writeFileSync(TMP_DATA, json, 'utf-8'); } catch {}
    try { fs.writeFileSync(REPO_DATA, json, 'utf-8'); } catch {}
  }
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

  // Extract and validate team parameter
  var team = (req.query && (req.query.team === 'women' || req.query.team === 'men')) ? req.query.team : 'men';

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method === 'GET') {
    var data;
    if (req.query.force_fs === 'true') {
      // Force read from filesystem / embedded default (bypasses Blob + auto-restore)
      data = readDataFromFs();
    } else {
      data = await readData(team);
    }
    res.status(200).json(data);
    return;
  }

  if (req.method === 'POST') {
    var body = req.body;

    // Public actions (no auth required)
    if (body && body.action) {
      var data = await readData(team);

      if (body.action === 'like') {
        var post = (data.posts || []).find(function(p) { return p.id === body.postId; });
        if (!post) {
          res.status(404).json({ error: 'Пост не найден' });
          return;
        }
        post.likes = (post.likes || 0) + 1;
        await writeData(data, team);
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
        await writeData(data, team);
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
        await writeData(data, team);
        res.status(200).json({ success: true, comment: newComment });
        return;
      }

      res.status(400).json({ error: 'Неизвестное действие' });
      return;
    }

    // Admin actions (auth required)
    if (!req.headers.authorization) {
      res.status(401).json({ error: 'Неавторизован: нет заголовка Authorization. Перезайдите в админку.' });
      return;
    }
    if (!verifyToken(req.headers.authorization)) {
      res.status(401).json({ error: 'Неавторизован: токен истек или неверен. Выйдите и зайдите заново.' });
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
    await writeData(body, team);
    var result = await readData(team);
    res.status(200).json({ success: true, data: result });
  } else {
    res.status(405).json({ error: 'Method not allowed' });
  }
}
