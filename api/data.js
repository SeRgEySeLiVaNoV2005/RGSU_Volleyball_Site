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
        hero_image: 'https://lh3.googleusercontent.com/aida-public/AB6AXuCCd00tUo0QcB3oXHn02WSNsadAAiNZv6JZA2SdcuhQ3mHk18E9LwbSEdGO5e2Mw6VfoZrA-r-Rpr-XoFPmX2r4Uzh74SpP18EuWMLPUET-qoJ50DK31jO6dWnKyn7IUZkoYdRNq6C9SBajTJHmEfDkVHb9YEbJqqi-WSvXNyAf1OigoLBaHnMDrmR32P84wuL7caFpzkxe63wehs73PXHCN5uYaRpsKTfWS5YMrCwxCeZ-ocn7cHVFc_b4UaxduzIxy0eOWxG6molYxQ',
        footer_address: 'Москва, ул. Вильгельма Пика, д. 4, стр. 1',
        footer_email: 'volleyball@rgsu.net',
        footer_phone: '+7 (495) 123-45-67',
        vk_link: 'https://vk.com/rgsu_volleyball',
        tg_link: 'https://t.me/rgsu_sport'
      }
    };
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

  if (req.method === 'GET') {
    const data = readData();
    res.status(200).json(data);
    return;
  }

  if (req.method === 'POST') {
    const body = req.body;

    // Public actions (no auth required)
    if (body && body.action) {
      const data = readData();

      if (body.action === 'like') {
        const post = (data.posts || []).find(function(p) { return p.id === body.postId; });
        if (!post) {
          res.status(404).json({ error: 'Пост не найден' });
          return;
        }
        post.likes = (post.likes || 0) + 1;
        writeData(data);
        res.status(200).json({ success: true, likes: post.likes });
        return;
      }

      if (body.action === 'unlike') {
        const post = (data.posts || []).find(function(p) { return p.id === body.postId; });
        if (!post) {
          res.status(404).json({ error: 'Пост не найден' });
          return;
        }
        post.likes = Math.max(0, (post.likes || 0) - 1);
        writeData(data);
        res.status(200).json({ success: true, likes: post.likes });
        return;
      }

      if (body.action === 'comment') {
        if (!body.text || !body.yandexUser || !body.yandexUser.id) {
          res.status(400).json({ error: 'Требуется текст комментария и Яндекс авторизация' });
          return;
        }
        const post = (data.posts || []).find(function(p) { return p.id === body.postId; });
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
        writeData(data);
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
    writeData(body);
    res.status(200).json({ success: true, data: readData() });
  } else {
    res.status(405).json({ error: 'Method not allowed' });
  }
}