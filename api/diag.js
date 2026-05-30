// Diagnostic endpoint — test Supabase connectivity
import { getSupabase } from './_supabase.js';
import { setCors, ok } from './_lib.js';

export default async function handler(req, res) {
  if (setCors(req, res, 'GET, OPTIONS')) return;

  var results = {};
  var supabase;

  // 1. Check env vars
  var key = process.env.SUPABASE_SERVICE_KEY || '';
  results.env = {
    SUPABASE_URL: process.env.SUPABASE_URL || 'MISSING',
    SUPABASE_SERVICE_KEY: key
      ? 'len=' + key.length + ' starts=' + key.substring(0, 20) + '... ends=...' + key.slice(-10)
      : 'MISSING',
    BLOB_READ_WRITE_TOKEN: process.env.BLOB_READ_WRITE_TOKEN ? 'present' : 'MISSING',
  };

  // 2. Test Supabase client creation
  try {
    supabase = getSupabase();
    results.client = 'created';
  } catch (e) {
    results.client = 'ERROR: ' + e.message;
    return ok(res, results);
  }

  // 3. Test raw HTTP reachability (bypass SDK)
  try {
    var url = process.env.SUPABASE_URL + '/rest/v1/players?team=eq.men&limit=1';
    var httpRes = await fetch(url, {
      headers: {
        'apikey': process.env.SUPABASE_SERVICE_KEY,
        'Authorization': 'Bearer ' + process.env.SUPABASE_SERVICE_KEY
      }
    });
    results.raw_http = 'status=' + httpRes.status + ' (' + httpRes.statusText + ')';
    if (!httpRes.ok) {
      var txt = await httpRes.text();
      results.raw_http += ' body=' + txt.substring(0, 200);
    } else {
      results.raw_http += ' OK';
    }
  } catch (e) {
    results.raw_http = 'THROW: ' + e.message;
  }

  // 4. Test SELECT via SDK (count query)
  try {
    var { count, error: selErr } = await supabase
      .from('players')
      .select('*', { count: 'exact', head: true })
      .eq('team', 'men');
    if (selErr) {
      results.select = 'FAIL: ' + selErr.message + ' | code=' + selErr.code + ' | hint=' + (selErr.hint || '') + ' | details=' + (selErr.details || '');
    } else {
      results.select = 'OK (count=' + count + ')';
    }
  } catch (e) {
    results.select = 'THROW: ' + e.message;
  }

  // 5. Test INSERT a test row then delete
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
      results.insert = 'FAIL: ' + insErr.message + ' | code=' + insErr.code + ' | hint=' + (insErr.hint || '') + ' | details=' + (insErr.details || '');
    } else {
      results.insert = 'OK';
      await supabase.from('players').delete().eq('name', 'DIAG_TEST').eq('team', 'men');
      results.cleanup = 'deleted test row';
    }
  } catch (e) {
    results.insert = 'THROW: ' + e.message;
  }

  // 6. Test RPC
  try {
    var { data: rlsData, error: rlsErr } = await supabase.rpc('exec_sql', { sql: 'SELECT 1 as test' });
    results.rpc = rlsErr
      ? 'FAIL: ' + rlsErr.message + ' | code=' + rlsErr.code + ' | details=' + (rlsErr.details || '')
      : 'OK (result=' + JSON.stringify(rlsData) + ')';
  } catch (e) {
    results.rpc = 'THROW: ' + e.message;
  }

  return ok(res, results);
}
