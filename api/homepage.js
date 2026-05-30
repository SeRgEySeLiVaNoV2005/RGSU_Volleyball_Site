import { getSupabase } from './_supabase.js';
import { setCors, requireAuth, getTeam, ok, fail } from './_lib.js';

export default async function handler(req, res) {
  if (setCors(req, res, 'GET, PUT, OPTIONS')) return;
  var team = getTeam(req);
  var supabase = getSupabase();

  // GET /api/homepage?team=X — get homepage config
  if (req.method === 'GET') {
    var { data, error } = await supabase
      .from('homepage')
      .select('*')
      .eq('team', team)
      .maybeSingle();
    if (error) return fail(res, 500, 'DB error: ' + error.message);
    return ok(res, data || {});
  }

  // PUT /api/homepage?team=X — upsert homepage (auth required)
  if (req.method === 'PUT') {
    if (!requireAuth(req, res)) return;
    var body = req.body;
    if (!body) return fail(res, 400, 'Нет данных');
    var row = {
      team: team,
      hero_title: body.hero_title !== undefined ? body.hero_title : '',
      hero_subtitle: body.hero_subtitle !== undefined ? body.hero_subtitle : '',
      button_text: body.button_text !== undefined ? body.button_text : 'Подать заявку',
      button_link: body.button_link !== undefined ? body.button_link : '/about',
      hero_image: body.hero_image !== undefined ? body.hero_image : '',
      footer_address: body.footer_address !== undefined ? body.footer_address : '',
      footer_email: body.footer_email !== undefined ? body.footer_email : '',
      footer_phone: body.footer_phone !== undefined ? body.footer_phone : '',
      vk_link: body.vk_link !== undefined ? body.vk_link : '',
      tg_link: body.tg_link !== undefined ? body.tg_link : '',
      updated_at: new Date().toISOString()
    };
    // Upsert: insert if not exists, update if exists (on conflict with team unique)
    var { data, error } = await supabase
      .from('homepage')
      .upsert(row, { onConflict: 'team' })
      .select()
      .single();
    if (error) return fail(res, 500, 'DB error: ' + error.message);
    return ok(res, data);
  }

  return fail(res, 405, 'Method not allowed');
}
