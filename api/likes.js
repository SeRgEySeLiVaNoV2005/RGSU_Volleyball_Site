import { getSupabase } from './_supabase.js';
import { setCors, getTeam, ok, fail } from './_lib.js';

export default async function handler(req, res) {
  if (setCors(req, res, 'POST, OPTIONS')) return;
  var team = getTeam(req);
  var supabase = getSupabase();

  if (req.method !== 'POST') return fail(res, 405, 'Method not allowed');

  // POST /api/likes?team=X — like or unlike a post
  // Body: { postId: number, action: "like" | "unlike" }
  var body = req.body;
  if (!body || !body.postId || !body.action) {
    return fail(res, 400, 'postId и action обязательны');
  }

  var postId = body.postId;

  // Read current post
  var { data: post, error: readError } = await supabase
    .from('posts')
    .select('likes')
    .eq('id', postId)
    .eq('team', team)
    .single();

  if (readError) {
    if (readError.code === 'PGRST116') return fail(res, 404, 'Пост не найден');
    return fail(res, 500, 'DB error: ' + readError.message);
  }

  var newLikes;
  if (body.action === 'like') {
    newLikes = (post.likes || 0) + 1;
  } else if (body.action === 'unlike') {
    newLikes = Math.max(0, (post.likes || 0) - 1);
  } else {
    return fail(res, 400, 'action должен быть "like" или "unlike"');
  }

  var { error: updateError } = await supabase
    .from('posts')
    .update({ likes: newLikes, updated_at: new Date().toISOString() })
    .eq('id', postId)
    .eq('team', team);

  if (updateError) return fail(res, 500, 'DB error: ' + updateError.message);

  return ok(res, { success: true, likes: newLikes });
}
