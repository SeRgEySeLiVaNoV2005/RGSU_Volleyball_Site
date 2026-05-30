import { getSupabase } from './_supabase.js';
import { setCors, requireAuth, getTeam, getPathId, ok, created, fail } from './_lib.js';

export default async function handler(req, res) {
  if (setCors(req, res, 'GET, POST, PUT, DELETE, OPTIONS')) return;
  var team = getTeam(req);
  var id = getPathId(req);
  var supabase = getSupabase();

  // GET /api/tournaments?team=X — list tournaments
  if (req.method === 'GET' && !id) {
    var { data, error } = await supabase
      .from('tournaments')
      .select('*')
      .eq('team', team)
      .order('id', { ascending: true });
    if (error) return fail(res, 500, 'DB error: ' + error.message);
    // Map DB fields to frontend-expected names (end_date → endDate)
    var tournaments = (data || []).map(function(t) {
      t.endDate = t.end_date;
      return t;
    });
    return ok(res, tournaments);
  }

  // GET /api/tournaments/ID?team=X — get single tournament
  if (req.method === 'GET' && id) {
    var { data, error } = await supabase
      .from('tournaments')
      .select('*')
      .eq('id', id)
      .eq('team', team)
      .single();
    if (error) {
      if (error.code === 'PGRST116') return fail(res, 404, 'Турнир не найден');
      return fail(res, 500, 'DB error: ' + error.message);
    }
    data.endDate = data.end_date;
    return ok(res, data);
  }

  // POST /api/tournaments?team=X — create tournament (auth required)
  if (req.method === 'POST' && !id) {
    if (!requireAuth(req, res)) return;
    var body = req.body;
    if (!body || !body.title) return fail(res, 400, 'Название турнира обязательно');
    var insert = {
      team: team,
      title: body.title || '',
      subtitle: body.subtitle || '',
      date: body.date || null,
      end_date: body.endDate || body.end_date || null,
      status: body.status || 'upcoming',
      participants: body.participants || '',
      location: body.location || '',
      description: body.description || '',
      image: body.image || ''
    };
    var { data, error } = await supabase
      .from('tournaments')
      .insert(insert)
      .select()
      .single();
    if (error) return fail(res, 500, 'DB error: ' + error.message);
    data.endDate = data.end_date;
    return created(res, data);
  }

  // PUT /api/tournaments/ID?team=X — update tournament (auth required)
  if (req.method === 'PUT' && id) {
    if (!requireAuth(req, res)) return;
    var body = req.body;
    if (!body) return fail(res, 400, 'Нет данных');
    var update = {};
    var fields = ['title', 'subtitle', 'date', 'status', 'participants', 'location', 'description', 'image'];
    for (var i = 0; i < fields.length; i++) {
      var f = fields[i];
      if (body[f] !== undefined) update[f] = body[f];
    }
    if (body.endDate !== undefined) update.end_date = body.endDate;
    if (body.end_date !== undefined) update.end_date = body.end_date;
    update.updated_at = new Date().toISOString();
    var { data, error } = await supabase
      .from('tournaments')
      .update(update)
      .eq('id', id)
      .eq('team', team)
      .select()
      .single();
    if (error) {
      if (error.code === 'PGRST116') return fail(res, 404, 'Турнир не найден');
      return fail(res, 500, 'DB error: ' + error.message);
    }
    data.endDate = data.end_date;
    return ok(res, data);
  }

  // DELETE /api/tournaments/ID?team=X — delete tournament (auth required)
  if (req.method === 'DELETE' && id) {
    if (!requireAuth(req, res)) return;
    var { error } = await supabase
      .from('tournaments')
      .delete()
      .eq('id', id)
      .eq('team', team);
    if (error) return fail(res, 500, 'DB error: ' + error.message);
    return ok(res, { success: true });
  }

  return fail(res, 405, 'Method not allowed');
}
