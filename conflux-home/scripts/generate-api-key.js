const { createClient } = require('@supabase/supabase-js');
const crypto = require('crypto');

const SUPABASE_URL = 'https://zcvhozqrssotirabdlzr.supabase.co';
const SERVICE_ROLE_KEY = 'sb_service_role_KEY_PLACEHOLDER'; // Will be passed as env var

async function main() {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) {
    console.error('Error: SUPABASE_SERVICE_ROLE_KEY environment variable required');
    process.exit(1);
  }

  const supabase = createClient(SUPABASE_URL, serviceKey);

  // Get user
  const { data: user, error: userError } = await supabase
    .from('auth.users')
    .select('id, email')
    .eq('email', 'theconflux303@gmail.com')
    .single();

  if (userError || !user) {
    console.error('User not found:', userError?.message);
    process.exit(1);
  }

  console.log('User found:', user.email, user.id);

  // Generate API key
  const randomBytes = crypto.randomBytes(32);
  const rawKey = 'cf_live_' + randomBytes.toString('hex');
  const keyHash = crypto.createHash('sha256').update(rawKey).digest('hex');
  const keyPrefix = rawKey.substring(0, 16);

  console.log('Generated key:', rawKey);
  console.log('Key prefix:', keyPrefix);

  // Insert into database
  const { error: insertError } = await supabase
    .from('api_keys')
    .insert({
      user_id: user.id,
      key_hash: keyHash,
      key_prefix: keyPrefix,
      name: 'Don - OpenClaw Test',
      is_active: true,
    });

  if (insertError) {
    console.error('Failed to insert key:', insertError);
    process.exit(1);
  }

  console.log('✅ API key created and stored successfully');
  console.log('\nIMPORTANT: Save this key now — it will never be shown again:');
  console.log(rawKey);
}

main().catch(console.error);
