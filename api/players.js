import { getSupabase } from './_supabase.js';
import { setCors, requireAuth, getTeam, getPathId, ok, created, fail } from './_lib.js';

export default async function handler(req, res) {
  if (setCors(req, res, 'GET, POST, PUT, DELETE, OPTIONS')) return;
  var team = getTeam(req);
  var id = getPathId(req);
  var supabase = getSupabase();

  // GET /api/players?team=X — list all players for team
  if (req.method === 'GET' && !id) {
    var { data, error } = await supabase
      .from('players')
      .select('*')
      .eq('team', team)
      .order('id', { ascending: true });
    if (error) return fail(res, 500, 'DB error: ' + error.message);
    // Map DB fields to frontend-expected names
    var players = (data || []).map(function(p) {
      p.desc = p.description;
      return p;
    });
    return ok(res, players);
  }

  // GET /api/players/ID?team=X — get single player
  if (req.method === 'GET' && id) {
    var { data, error } = await supabase
      .from('players')
      .select('*')
      .eq('id', id)
      .eq('team', team)
      .single();
    if (error) {
      if (error.code === 'PGRST116') return fail(res, 404, 'Игрок не найден');
      return fail(res, 500, 'DB error: ' + error.message);
    }
    data.desc = data.description;
    return ok(res, data);
  }

  // POST /api/players?team=X — create new player (auth required)
  if (req.method === 'POST' && !id) {
    if (!requireAuth(req, res)) return;
    var body = req.body;
    if (!body || !body.name) return fail(res, 400, 'Имя игрока обязательно');
    var insert = {
      team: team,
      name: body.name || '',
      number: body.number || '',
      position: body.position || '',
      height: body.height || '',
      age: body.age || 0,
      status: body.status || 'Активен',
      description: body.desc || body.description || '',
      image: body.image || ''
    };
    var { data, error } = await supabase
      .from('players')
      .insert(insert)
      .select()
      .single();
    if (error) return fail(res, 500, 'DB error: ' + error.message);
    data.desc = data.description;
    return created(res, data);
  }

  // PUT /api/players/ID?team=X — update player (auth required)
  if (req.method === 'PUT' && id) {
    if (!requireAuth(req, res)) return;
    var body = req.body;
    if (!body) return fail(res, 400, 'Нет данных');
    var update = {};
    if (body.name !== undefined) update.name = body.name;
    if (body.number !== undefined) update.number = body.number;
    if (body.position !== undefined) update.position = body.position;
    if (body.height !== undefined) update.height = body.height;
    if (body.age !== undefined) update.age = body.age;
    if (body.status !== undefined) update.status = body.status;
    if (body.desc !== undefined) update.description = body.desc;
    if (body.description !== undefined) update.description = body.description;
    if (body.image !== undefined) update.image = body.image;
    update.updated_at = new Date().toISOString();
    var { data, error } = await supabase
      .from('players')
      .update(update)
      .eq('id', id)
      .eq('team', team)
      .select()
      .single();
    if (error) {
      if (error.code === 'PGRST116') return fail(res, 404, 'Игрок не найден');
      return fail(res, 500, 'DB error: ' + error.message);
    }
    data.desc = data.description;
    return ok(res, data);
  }

  // DELETE /api/players/ID?team=X — delete player (auth required)
  if (req.method === 'DELETE' && id) {
    if (!requireAuth(req, res)) return;
    var { error } = await supabase
      .from('players')
      .delete()
      .eq('id', id)
      .eq('team', team);
    if (error) return fail(res, 500, 'DB error: ' + error.message);
    return ok(res, { success: true });
  }

  return fail(res, 405, 'Method not allowed');
}
