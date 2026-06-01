// One-time migration: transfer all data from Vercel Blob (single JSON files) to Supabase (PostgreSQL)
// Run via: POST /api/migrate — auth required (admin token)

import { getSupabase } from './_supabase.js';
import { setCors, requireAuth, ok, fail } from './_lib.js';
import { put, list } from '@vercel/blob';
import fs from 'fs';

function getBlobName(team) {
  return team === 'women' ? 'site-data-women.json' : 'site-data.json';
}

var cachedBlobUrl = {};

async function getBlobUrl(blobName) {
  if (cachedBlobUrl[blobName]) return cachedBlobUrl[blobName];
  try {
    var result = await list({ prefix: blobName, limit: 1 });
    if (result.blobs.length > 0) {
      cachedBlobUrl[blobName] = result.blobs[0].url;
      return cachedBlobUrl[blobName];
    }
  } catch (e) { console.error('Blob list error:', e.message); }
  return null;
}

async function readTeamData(team) {
  var data = null;
  var blobName = getBlobName(team);

  // Try Blob first
  if (process.env.BLOB_READ_WRITE_TOKEN) {
    try {
      var url = await getBlobUrl(blobName);
      if (url) {
        var res = await fetch(url, { cache: 'no-store' });
        if (res.ok) {
          data = await res.json();
          console.log('Migration: read ' + team + ' from Blob (' + (data.players || []).length + ' players)');
        }
      }
    } catch (e) { console.error('Blob read error for ' + team + ':', e.message); }
  }

  // Fallback: filesystem
  // IMPORTANT: data.json is men-only legacy data — never use it as fallback for women's team
  if (!data || !data.players || !data.players.length) {
    var paths = [
      '/tmp/data-' + team + '.json',
      '/tmp/data.json'
    ];
    // Only fall back to generic data.json for men's team (historical compatibility)
    if (team === 'men') {
      paths.push('./data.json');
    }
    for (var i = 0; i < paths.length; i++) {
      try {
        if (fs.existsSync(paths[i])) {
          data = JSON.parse(fs.readFileSync(paths[i], 'utf-8'));
          if (data.players && data.players.length > 0) {
            console.log('Migration: read ' + team + ' from filesystem (' + paths[i] + ', ' + data.players.length + ' players)');
            break;
          }
          data = null;
        }
      } catch (e) {}
    }
  }

  return data;
}

async function resetSequence(supabase, tableName, columnName) {
  var seqName = tableName + '_' + columnName + '_seq';
  try {
    await supabase.rpc('reset_sequence', { tbl: tableName, col: columnName });
  } catch (e) {
    // Fallback: raw query
    try {
      var { error } = await supabase.rpc('exec_sql', {
        sql: 'SELECT setval(\'' + seqName + '\', COALESCE((SELECT MAX(' + columnName + ') FROM ' + tableName + '), 0));'
      });
      if (error) console.warn('resetSequence fallback error:', error.message);
    } catch (e2) {
      console.warn('resetSequence failed for ' + tableName + ':', e2.message);
    }
  }
}

export default async function handler(req, res) {
  if (setCors(req, res, 'POST, OPTIONS')) return;
  if (req.method !== 'POST') return fail(res, 405, 'Method not allowed');
  if (!requireAuth(req, res)) return;

  var supabase = getSupabase();
  var log = [];
  function addLog(msg) { log.push(msg); console.log('Migration:', msg); }

  // Check if already migrated
  try {
    var { data: stateRow } = await supabase
      .from('migration_state')
      .select('value')
      .eq('key', 'migration_done')
      .single();

    if (stateRow && stateRow.value === 'true') {
      // Allow re-migration with ?force=true
      if (req.query.force !== 'true') {
        return ok(res, { message: 'Миграция уже выполнена. Используйте ?force=true для повторной.', already_migrated: true });
      }
      addLog('Force re-migration enabled');
    }
  } catch (e) {
    // migration_state table might not exist yet — proceed
    addLog('migration_state table check skipped (may not exist yet)');
  }

  try {
    // ---- MIGRATE MEN'S TEAM ----
    addLog('--- Migrating men ---');
    var menData = await readTeamData('men');
    if (menData) {
      await migrateTeam(supabase, 'men', menData, addLog);
    } else {
      addLog('WARNING: No men data found, skipping');
    }

    // ---- MIGRATE WOMEN'S TEAM ----
    addLog('--- Migrating women ---');
    var womenData = await readTeamData('women');
    if (womenData) {
      await migrateTeam(supabase, 'women', womenData, addLog);
    } else {
      addLog('WARNING: No women data found, skipping');
    }

    // Mark migration as done
    await supabase
      .from('migration_state')
      .upsert({ key: 'migration_done', value: 'true' }, { onConflict: 'key' });

    addLog('Migration completed successfully!');

    return ok(res, { success: true, log: log });
  } catch (e) {
    addLog('FATAL: ' + e.message);
    console.error('Migration fatal error:', e);
    return fail(res, 500, 'Migration error: ' + e.message + '\nLog:\n' + log.join('\n'));
  }
}

async function migrateTeam(supabase, team, data, log) {
  // -- Players --
  var players = data.players || [];
  if (players.length > 0) {
    var playerRows = players.map(function(p) {
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
    var { error: pe } = await supabase.from('players').upsert(playerRows, { onConflict: 'id' });
    if (pe) { log('Players error: ' + pe.message); throw new Error(pe.message); }
    log('Players: ' + players.length + ' migrated');
  } else {
    log('Players: 0 (empty)');
  }

  // -- Posts --
  var posts = data.posts || [];
  if (posts.length > 0) {
    // First insert posts without comments
    var postRows = posts.map(function(p) {
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
    var { error: postErr } = await supabase.from('posts').upsert(postRows, { onConflict: 'id' });
    if (postErr) { log('Posts error: ' + postErr.message); throw new Error(postErr.message); }
    log('Posts: ' + posts.length + ' migrated');

    // Then migrate comments from each post
    var totalComments = 0;
    for (var i = 0; i < posts.length; i++) {
      var post = posts[i];
      var comments = post.comments || [];
      if (comments.length > 0) {
        var commentRows = comments.map(function(c) {
          return {
            id: c.id,
            team: team,
            post_id: post.id,
            author: c.author || '',
            text: c.text || '',
            date: c.date || null,
            approved: c.approved !== undefined ? c.approved : true,
            yandex_user_id: c.yandexUserId || c.yandex_user_id || '',
            yandex_photo: c.yandexPhoto || c.yandex_photo || '',
            parent_comment_id: null // old replies are flat, we'll skip deep nesting for now
          };
        });
        var { error: ce } = await supabase.from('comments').upsert(commentRows, { onConflict: 'id' });
        if (ce) { log('Comments error for post ' + post.id + ': ' + ce.message); throw new Error(ce.message); }
        totalComments += comments.length;
      }
    }
    log('Comments: ' + totalComments + ' migrated');
  } else {
    log('Posts: 0 (empty)');
  }

  // -- Tournaments --
  var tournaments = data.tournaments || [];
  if (tournaments.length > 0) {
    var tournamentRows = tournaments.map(function(t) {
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
    var { error: te } = await supabase.from('tournaments').upsert(tournamentRows, { onConflict: 'id' });
    if (te) { log('Tournaments error: ' + te.message); throw new Error(te.message); }
    log('Tournaments: ' + tournaments.length + ' migrated');
  } else {
    log('Tournaments: 0 (empty)');
  }

  // -- Homepage --
  var homepage = data.homepage;
  if (homepage) {
    var { error: he } = await supabase.from('homepage').upsert({
      team: team,
      hero_title: homepage.hero_title || '',
      hero_subtitle: homepage.hero_subtitle || '',
      button_text: homepage.button_text || 'Подать заявку',
      button_link: homepage.button_link || '/about',
      hero_image: homepage.hero_image || '',
      footer_address: homepage.footer_address || '',
      footer_email: homepage.footer_email || '',
      footer_phone: homepage.footer_phone || '',
      vk_link: homepage.vk_link || '',
      tg_link: homepage.tg_link || ''
    }, { onConflict: 'team' });
    if (he) { log('Homepage error: ' + he.message); throw new Error(he.message); }
    log('Homepage: migrated');
  }

  // -- Settings --
  var settings = data.settings;
  if (settings) {
    var { error: se } = await supabase.from('settings').upsert({
      team: team,
      site_title: settings.site_title || 'РГСУ ВОЛЕЙБОЛ',
      yandex_app_id: settings.yandex_app_id || ''
    }, { onConflict: 'team' });
    if (se) { log('Settings error: ' + se.message); throw new Error(se.message); }
    log('Settings: migrated');
  }

  // Reset sequences for tables with explicit IDs
  var tables = ['players', 'posts', 'comments', 'tournaments'];
  for (var t = 0; t < tables.length; t++) {
    try {
      var { error: rpcErr } = await supabase.rpc('reset_sequence', { tbl: tables[t], col: 'id' });
      if (rpcErr) {
        // Try direct SQL
        var seqName = tables[t] + '_id_seq';
        var { error: sqlErr } = await supabase.rpc('exec_sql', {
          sql: 'SELECT setval(\'' + seqName + '\', COALESCE((SELECT MAX(id) FROM ' + tables[t] + ' WHERE team = \'' + team + '\'), 1));'
        });
        if (sqlErr) log('Warning: could not reset sequence for ' + tables[t] + ': ' + sqlErr.message);
      }
    } catch (e) {
      log('Warning: sequence reset skipped for ' + tables[t] + ' (may need manual SETVAL)');
    }
  }
}
