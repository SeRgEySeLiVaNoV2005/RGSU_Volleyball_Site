// Supabase-backed data endpoint — drop-in replacement for the old Blob-based API
// Maintains backward compatibility with admin.html while storing data in PostgreSQL

import { getSupabase } from './_supabase.js';
import { setCors, requireAuth, getTeam, ok, fail } from './_lib.js';
import { defaultTeams } from './_default-data.js';

// Re-export _lib helpers used by other endpoints
export { setCors, requireAuth, getTeam, ok, fail, verifyToken } from './_lib.js';

// ---- READ: Build old-format JSON from Supabase tables ----
async function readData(team) {
  var supabase = getSupabase();
  var result = {
    players: [],
    posts: [],
    tournaments: [],
    homepage: {},
    settings: { site_title: 'РГСУ ВОЛЕЙБОЛ', yandex_app_id: '' },
    _data_version: 3
  };

  try {
    // Players
    var { data: players } = await supabase
      .from('players').select('*').eq('team', team).order('id');
    result.players = (players || []).map(function(p) {
      p.desc = p.description; // frontend compat
      return p;
    });

    // Posts with comments
    var { data: posts } = await supabase
      .from('posts').select('*').eq('team', team).order('pinned', { ascending: false }).order('id', { ascending: false });
    if (posts && posts.length > 0) {
      var postIds = posts.map(function(p) { return p.id; });
      var { data: comments } = await supabase
        .from('comments').select('*').eq('team', team).in('post_id', postIds).order('id');
      posts.forEach(function(post) {
        post.comments = (comments || []).filter(function(c) { return c.post_id === post.id; });
      });
    }
    result.posts = posts || [];

    // Tournaments
    var { data: tournaments } = await supabase
      .from('tournaments').select('*').eq('team', team).order('id');
    result.tournaments = (tournaments || []).map(function(t) {
      t.endDate = t.end_date; // frontend compat
      return t;
    });

    // Homepage
    var { data: homepage } = await supabase
      .from('homepage').select('*').eq('team', team).maybeSingle();
    result.homepage = homepage || result.homepage;

    // Settings
    var { data: settings } = await supabase
      .from('settings').select('*').eq('team', team).maybeSingle();
    result.settings = settings || result.settings;

  } catch (e) {
    console.error('[data] Read error for ' + team + ':', e.message);
  }

  return result;
}

// ---- WRITE: Persist old-format JSON to Supabase tables ----
async function writeData(data, team) {
  var supabase = getSupabase();

  try {
    // Players — DELETE all for this team, then INSERT fresh
    // Using delete+insert (not upsert) to avoid cross-team ID conflicts:
    // upsert with onConflict:'id' would overwrite a player with same ID
    // in the OTHER team because PK is on id alone, not (id, team).
    var players = (data.players || []).map(function(p) {
      return {
        id: p.id,
        team: team,
        name: p.name || '',
        number: p.number || '',
        position: p.position || '',
        height: p.height || '',
        age: p.age || 0,
        status: p.status || 'Активен',
        description: p.desc || p.description || '',
        image: p.image || ''
      };
    });
    await supabase.from('players').delete().eq('team', team);
    if (players.length > 0) {
      var { error: playersErr } = await supabase.from('players').insert(players);
      if (playersErr) throw new Error('Players insert: ' + playersErr.message);
    }

    // Posts — DELETE all for this team (comments cascade), then INSERT fresh
    var posts = (data.posts || []).map(function(p) {
      return {
        id: p.id,
        team: team,
        title: p.title || '',
        content: p.content || '',
        image: p.image || '',
        category: p.category || 'personal',
        date: p.date || null,
        author: p.author || 'admin',
        published: p.published !== undefined ? p.published : false,
        pinned: p.pinned || false,
        likes: p.likes || 0
      };
    });
    // Comments must be deleted first due to FK referencing posts
    await supabase.from('comments').delete().eq('team', team);
    await supabase.from('posts').delete().eq('team', team);
    if (posts.length > 0) {
      var { error: postsErr } = await supabase.from('posts').insert(posts);
      if (postsErr) throw new Error('Posts insert: ' + postsErr.message);

      // Re-insert comments
      var allComments = [];
      (data.posts || []).forEach(function(post) {
        (post.comments || []).forEach(function(c) {
          allComments.push({
            id: c.id,
            team: team,
            post_id: post.id,
            author: c.author || '',
            text: c.text || '',
            date: c.date || null,
            approved: c.approved !== undefined ? c.approved : true,
            yandex_user_id: c.yandexUserId || c.yandex_user_id || '',
            yandex_photo: c.yandexPhoto || c.yandex_photo || '',
            parent_comment_id: null
          });
        });
      });
      if (allComments.length > 0) {
        var { error: commentsErr } = await supabase.from('comments').insert(allComments);
        if (commentsErr) throw new Error('Comments insert: ' + commentsErr.message);
      }
    }

    // Tournaments — DELETE all for this team, then INSERT fresh
    var tournaments = (data.tournaments || []).map(function(t) {
      return {
        id: t.id,
        team: team,
        title: t.title || '',
        subtitle: t.subtitle || '',
        date: t.date || null,
        end_date: t.endDate || t.end_date || null,
        status: t.status || 'upcoming',
        participants: t.participants || '',
        location: t.location || '',
        description: t.description || '',
        image: t.image || ''
      };
    });
    await supabase.from('tournaments').delete().eq('team', team);
    if (tournaments.length > 0) {
      var { error: tournErr } = await supabase.from('tournaments').insert(tournaments);
      if (tournErr) throw new Error('Tournaments insert: ' + tournErr.message);
    }

    // Homepage (upsert)
    if (data.homepage) {
      await supabase.from('homepage').upsert({
        team: team,
        hero_title: data.homepage.hero_title || '',
        hero_subtitle: data.homepage.hero_subtitle || '',
        button_text: data.homepage.button_text || 'Подать заявку',
        button_link: data.homepage.button_link || '/about',
        hero_image: data.homepage.hero_image || '',
        footer_address: data.homepage.footer_address || '',
        footer_email: data.homepage.footer_email || '',
        footer_phone: data.homepage.footer_phone || '',
        vk_link: data.homepage.vk_link || '',
        tg_link: data.homepage.tg_link || ''
      }, { onConflict: 'team' });
    }

    // Settings (upsert)
    if (data.settings) {
      await supabase.from('settings').upsert({
        team: team,
        site_title: data.settings.site_title || 'РГСУ ВОЛЕЙБОЛ',
        yandex_app_id: data.settings.yandex_app_id || ''
      }, { onConflict: 'team' });
    }

  } catch (e) {
    console.error('[data] Write error for ' + team + ':', e.message);
    throw e;
  }
}

// ---- MAIN HANDLER ----
export default async function handler(req, res) {
  if (setCors(req, res, 'GET, POST, OPTIONS')) return;

  var team = getTeam(req);

  if (req.method === 'GET') {
    var data = await readData(team);
    return ok(res, data);
  }

  if (req.method === 'POST') {
    var body = req.body;

    // Public actions (no auth required) — like, unlike, comment
    if (body && body.action) {
      var data = await readData(team);

      if (body.action === 'like') {
        var post = (data.posts || []).find(function(p) { return p.id === body.postId; });
        if (!post) return fail(res, 404, 'Пост не найден');
        post.likes = (post.likes || 0) + 1;
        await writeData(data, team);
        return ok(res, { success: true, likes: post.likes });
      }

      if (body.action === 'unlike') {
        var post = (data.posts || []).find(function(p) { return p.id === body.postId; });
        if (!post) return fail(res, 404, 'Пост не найден');
        post.likes = Math.max(0, (post.likes || 0) - 1);
        await writeData(data, team);
        return ok(res, { success: true, likes: post.likes });
      }

      if (body.action === 'comment') {
        if (!body.text || !body.yandexUser || !body.yandexUser.id) {
          return fail(res, 400, 'Требуется текст комментария и Яндекс авторизация');
        }
        var post = (data.posts || []).find(function(p) { return p.id === body.postId; });
        if (!post) return fail(res, 404, 'Пост не найден');
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
        return ok(res, { success: true, comment: newComment });
      }

      if (body.action === 'restore') {
        if (!requireAuth(req, res)) return;
        var defaultData = (defaultTeams && defaultTeams[team]) || (defaultTeams && defaultTeams.men);
        if (!defaultData) return fail(res, 500, 'Нет данных по умолчанию для команды ' + team);
        await writeData(defaultData, team);
        var restored = await readData(team);
        return ok(res, { success: true, message: 'Данные восстановлены из резерва для команды: ' + team, data: restored });
      }

      if (body.action === 'reset') {
        if (!requireAuth(req, res)) return;
        // Delete ALL data for this team — clean slate
        var supabase = getSupabase();
        var tables = ['players', 'posts', 'comments', 'tournaments', 'homepage', 'settings'];
        var errors = [];
        for (var i = 0; i < tables.length; i++) {
          try {
            var { error } = await supabase.from(tables[i]).delete().eq('team', team);
            if (error) errors.push(tables[i] + ': ' + error.message);
          } catch (e) {
            errors.push(tables[i] + ': ' + e.message);
          }
        }
        if (errors.length) return fail(res, 500, 'Ошибки при очистке: ' + errors.join('; '));
        return ok(res, { success: true, message: 'Все данные для команды ' + team + ' удалены. Можно вводить новые.' });
      }

      return fail(res, 400, 'Неизвестное действие');
    }

    // Admin actions (auth required) — full data save
    if (!requireAuth(req, res)) return;

    if (!body) return fail(res, 400, 'Нет данных');

    await writeData(body, team);
    var result = await readData(team);
    return ok(res, { success: true, data: result });
  }

  return fail(res, 405, 'Method not allowed');
}
