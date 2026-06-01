// Quick script to clear all data from Supabase for both teams
// Usage: set SUPABASE_URL + SUPABASE_SERVICE_KEY env vars, then run:
//   node reset-data.js
// Or clear just one team:
//   node reset-data.js men
//   node reset-data.js women

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('ERROR: Set SUPABASE_URL and SUPABASE_SERVICE_KEY environment variables');
  console.error('Get them from: Vercel dashboard → your project → Settings → Environment Variables');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false }
});

const TABLES = ['players', 'posts', 'comments', 'tournaments', 'homepage', 'settings'];

async function resetTeam(team) {
  console.log(`\n--- Clearing team: ${team} ---`);
  for (const table of TABLES) {
    try {
      const { error } = await supabase.from(table).delete().eq('team', team);
      if (error) {
        console.log(`  ${table}: ERROR — ${error.message}`);
      } else {
        console.log(`  ${table}: ✓ cleared`);
      }
    } catch (e) {
      console.log(`  ${table}: THROW — ${e.message}`);
    }
  }
}

const target = process.argv[2]; // 'men', 'women', or omitted = both

if (target === 'men' || target === 'women') {
  await resetTeam(target);
} else {
  await resetTeam('men');
  await resetTeam('women');
}

console.log('\n✅ Done. Both teams have a clean slate. Go to admin panel and enter new data.');
