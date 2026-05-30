import { getSupabase } from './_supabase.js';
import { setCors, requireAuth, getTeam, getPathId, ok, created, fail } from './_lib.js';

// Attach comments to a list of posts
async function attachComments(supabase, posts, team) {
  if (!posts || !posts.length) return posts;
  var postIds = posts.map(function(p) { return p.id; });
  var { data: comments } = await supabase
    .from('comments')
    .select('*')
    .eq('team', team)
    .in('post_id', postIds)
    .order('id', { ascending: true });
  posts.forEach(function(post) {
    post.comments = (comments || []).filter(function(c) { return c.post_id === post.id; });
  });
  return posts;
}

export default async function handler(req, res) {
  if (setCors(req, res, 'GET, POST, PUT, DELETE, OPTIONS')) return;
  var team = getTeam(req);
  var id = getPathId(req);
  var supabase = getSupabase();

  // GET /api/posts?team=X — list all posts (published only for public, all for admin)
  // Use header X-Admin: true to get all posts including unpublished
  if (req.method === 'GET' && !id) {
    var query = supabase.from('posts').select('*').eq('team', team);
    if (!req.headers['x-admin']) {
      query = query.eq('published', true);
    }
    var { data, error } = await query.order('pinned', { ascending: false }).order('id', { ascending: false });
    if (error) return fail(res, 500, 'DB error: ' + error.message);
    await attachComments(supabase, data || [], team);
    return ok(res, data || []);
  }

  // GET /api/posts/ID?team=X — get single post with comments
  if (req.method === 'GET' && id) {
    var { data, error } = await supabase
      .from('posts')
      .select('*')
      .eq('id', id)
      .eq('team', team)
      .single();
    if (error) {
      if (error.code === 'PGRST116') return fail(res, 404, 'Пост не найден');
      return fail(res, 500, 'DB error: ' + error.message);
    }
    await attachComments(supabase, [data], team);
    return ok(res, data);
  }

  // POST /api/posts?team=X — create post (auth required)
  if (req.method === 'POST' && !id) {
    if (!requireAuth(req, res)) return;
    var body = req.body;
    if (!body || !body.title) return fail(res, 400, 'Заголовок обязателен');
    var insert = {
      team: team,
      title: body.title || '',
      content: body.content || '',
      image: body.image || '',
      category: body.category || 'personal',
      date: body.date || new Date().toISOString().split('T')[0],
      author: body.author || 'admin',
      published: body.published !== undefined ? body.published : false,
      pinned: body.pinned || false,
      likes: body.likes || 0
    };
    var { data, error } = await supabase
      .from('posts')
      .insert(insert)
      .select()
      .single();
    if (error) return fail(res, 500, 'DB error: ' + error.message);
    data.comments = [];
    return created(res, data);
  }

  // PUT /api/posts/ID?team=X — update post (auth required)
  if (req.method === 'PUT' && id) {
    if (!requireAuth(req, res)) return;
    var body = req.body;
    if (!body) return fail(res, 400, 'Нет данных');
    var update = {};
    var fields = ['title', 'content', 'image', 'category', 'date', 'author', 'published', 'pinned', 'likes'];
    for (var i = 0; i < fields.length; i++) {
      var f = fields[i];
      if (body[f] !== undefined) update[f] = body[f];
    }
    update.updated_at = new Date().toISOString();
    var { data, error } = await supabase
      .from('posts')
      .update(update)
      .eq('id', id)
      .eq('team', team)
      .select()
      .single();
    if (error) {
      if (error.code === 'PGRST116') return fail(res, 404, 'Пост не найден');
      return fail(res, 500, 'DB error: ' + error.message);
    }
    await attachComments(supabase, [data], team);
    return ok(res, data);
  }

  // DELETE /api/posts/ID?team=X — delete post (auth required)
  if (req.method === 'DELETE' && id) {
    if (!requireAuth(req, res)) return;
    var { error } = await supabase
      .from('posts')
      .delete()
      .eq('id', id)
      .eq('team', team);
    if (error) return fail(res, 500, 'DB error: ' + error.message);
    return ok(res, { success: true });
  }

  return fail(res, 405, 'Method not allowed');
}
