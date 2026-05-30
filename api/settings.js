import { getSupabase } from './_supabase.js';
import { setCors, requireAuth, getTeam, ok, fail } from './_lib.js';

export default async function handler(req, res) {
  if (setCors(req, res, 'GET, PUT, OPTIONS')) return;
  var team = getTeam(req);
  var supabase = getSupabase();

  // GET /api/settings?team=X — get settings
  if (req.method === 'GET') {
    var { data, error } = await supabase
      .from('settings')
      .select('*')
      .eq('team', team)
      .maybeSingle();
    if (error) return fail(res, 500, 'DB error: ' + error.message);
    return ok(res, data || { site_title: 'РГСУ ВОЛЕЙБОЛ', yandex_app_id: '' });
  }

  // PUT /api/settings?team=X — upsert settings (auth required)
  if (req.method === 'PUT') {
    if (!requireAuth(req, res)) return;
    var body = req.body;
    if (!body) return fail(res, 400, 'Нет данных');
    var row = {
      team: team,
      site_title: body.site_title !== undefined ? body.site_title : 'РГСУ ВОЛЕЙБОЛ',
      yandex_app_id: body.yandex_app_id !== undefined ? body.yandex_app_id : '',
      updated_at: new Date().toISOString()
    };
    var { data, error } = await supabase
      .from('settings')
      .upsert(row, { onConflict: 'team' })
      .select()
      .single();
    if (error) return fail(res, 500, 'DB error: ' + error.message);
    return ok(res, data);
  }

  return fail(res, 405, 'Method not allowed');
}
