// Diagnostic endpoint — test Supabase connectivity
import { getSupabase } from './_supabase.js';
import { setCors, ok, fail } from './_lib.js';

export default async function handler(req, res) {
  if (setCors(req, res, 'GET, OPTIONS')) return;

  var results = {};
  var supabase;

  // 1. Check env vars (masked)
  var key = process.env.SUPABASE_SERVICE_KEY || '';
  results.env = {
    SUPABASE_URL: process.env.SUPABASE_URL || 'MISSING',
    SUPABASE_SERVICE_KEY: key
      ? 'len=' + key.length + ' starts=' + key.substring(0, 20) + '... ends=...' + key.slice(-10)
      : 'MISSING',
    BLOB_READ_WRITE_TOKEN: process.env.BLOB_READ_WRITE_TOKEN ? 'present' : 'MISSING',
  };

  // 2. Test Supabase connection
  try {
    supabase = getSupabase();
    results.client = 'created';
  } catch (e) {
    results.client = 'ERROR: ' + e.message;
    return ok(res, results);
  }

  // 3. Test SELECT (should work)
  try {
    var { data: sel, error: selErr } = await supabase.from('players').select('count', { count: 'exact', head: true }).eq('team', 'men');
    results.select = selErr ? 'FAIL: ' + selErr.message : 'OK (count query succeeded)';
  } catch (e) {
    results.select = 'THROW: ' + e.message;
  }

  // 4. Test INSERT a test row then delete
  try {
    var { error: insErr } = await supabase.from('players').insert({
      team: 'men',
      name: 'DIAG_TEST',
      number: '99',
      position: 'Тест',
      height: '0',
      age: 99,
      status: 'Активен',
      description: 'diagnostic test row'
    });
    if (insErr) {
      results.insert = 'FAIL: ' + insErr.message + ' (code: ' + insErr.code + ')';
    } else {
      results.insert = 'OK';
      // Cleanup
      await supabase.from('players').delete().eq('name', 'DIAG_TEST').eq('team', 'men');
      results.cleanup = 'deleted test row';
    }
  } catch (e) {
    results.insert = 'THROW: ' + e.message;
  }

  // 5. Check table permissions via raw SQL
  try {
    var { data: rlsData, error: rlsErr } = await supabase.rpc('exec_sql', { sql: 'SELECT 1 as test;' });
    results.rpc_exec_sql = rlsErr ? 'FAIL: ' + rlsErr.message : 'OK';
  } catch (e) {
    results.rpc_exec_sql = 'THROW: ' + e.message + ' (function may not exist)';
  }

  return ok(res, results);
}
