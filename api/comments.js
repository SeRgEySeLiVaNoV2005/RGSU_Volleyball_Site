import { getSupabase } from './_supabase.js';
import { setCors, requireAuth, getTeam, getPathId, ok, created, fail } from './_lib.js';

export default async function handler(req, res) {
  if (setCors(req, res, 'GET, POST, PUT, DELETE, OPTIONS')) return;
  var team = getTeam(req);
  var id = getPathId(req);
  var supabase = getSupabase();

  // Check if this is an "approve" action: PUT /api/comments/ID/approve?team=X
  var isApprove = (req.url || '').indexOf('/approve') !== -1;

  // GET /api/comments?post_id=X&team=X — list comments for a post
  if (req.method === 'GET' && !id) {
    var postId = req.query.post_id;
    if (!postId) return fail(res, 400, 'post_id обязателен');
    var { data, error } = await supabase
      .from('comments')
      .select('*')
      .eq('team', team)
      .eq('post_id', parseInt(postId, 10))
      .order('id', { ascending: true });
    if (error) return fail(res, 500, 'DB error: ' + error.message);
    return ok(res, data || []);
  }

  // POST /api/comments?team=X — create comment (public, no auth required)
  // Body: { post_id, text, yandexUser: { id, first_name, last_name, photo } }
  if (req.method === 'POST' && !id) {
    var body = req.body;
    if (!body || !body.text) return fail(res, 400, 'Текст комментария обязателен');
    if (!body.post_id) return fail(res, 400, 'post_id обязателен');
    var author = 'Аноним';
    var yandexUserId = '';
    var yandexPhoto = '';
    if (body.yandexUser) {
      author = (body.yandexUser.first_name || '') + ' ' + (body.yandexUser.last_name || '');
      yandexUserId = body.yandexUser.id || '';
      yandexPhoto = body.yandexUser.photo || '';
    } else if (body.author) {
      author = body.author;
    }
    var insert = {
      team: team,
      post_id: parseInt(body.post_id, 10),
      author: author.trim() || 'Аноним',
      text: body.text,
      date: new Date().toISOString().split('T')[0],
      approved: true,
      yandex_user_id: yandexUserId,
      yandex_photo: yandexPhoto,
      parent_comment_id: body.parent_comment_id || null
    };
    var { data, error } = await supabase
      .from('comments')
      .insert(insert)
      .select()
      .single();
    if (error) return fail(res, 500, 'DB error: ' + error.message);
    return created(res, data);
  }

  // PUT /api/comments/ID/approve?team=X — approve comment (auth required)
  if (req.method === 'PUT' && id && isApprove) {
    if (!requireAuth(req, res)) return;
    var { data, error } = await supabase
      .from('comments')
      .update({ approved: true })
      .eq('id', id)
      .eq('team', team)
      .select()
      .single();
    if (error) {
      if (error.code === 'PGRST116') return fail(res, 404, 'Комментарий не найден');
      return fail(res, 500, 'DB error: ' + error.message);
    }
    return ok(res, data);
  }

  // DELETE /api/comments/ID?team=X — delete comment (auth required)
  if (req.method === 'DELETE' && id) {
    if (!requireAuth(req, res)) return;
    var { error } = await supabase
      .from('comments')
      .delete()
      .eq('id', id)
      .eq('team', team);
    if (error) return fail(res, 500, 'DB error: ' + error.message);
    return ok(res, { success: true });
  }

  return fail(res, 405, 'Method not allowed');
}
