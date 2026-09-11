import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Read .env.local
const envContent = fs.readFileSync(path.join(__dirname, '..', '.env.local'), 'utf8');
let supabaseUrl = '';
let supabaseServiceKey = '';

for (const line of envContent.split('\n')) {
  if (line.startsWith('NEXT_PUBLIC_SUPABASE_URL=')) {
    supabaseUrl = line.split('=')[1].trim();
  } else if (line.startsWith('SUPABASE_SERVICE_ROLE_KEY=')) {
    supabaseServiceKey = line.split('=')[1].trim();
  }
}

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing Supabase credentials in .env.local');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

// PBKDF2 hashing matching auth_helpers.ts
const PBKDF2_ITERATIONS = 100000;

async function pbkdf2(password, salt, iterations) {
  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']
  );
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt: salt, iterations },
    key, 256
  );
  return new Uint8Array(bits);
}

async function hashPasswordSecure(password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await pbkdf2(password, salt, PBKDF2_ITERATIONS);
  return `pbkdf2$${PBKDF2_ITERATIONS}$${Buffer.from(salt).toString('base64')}$${Buffer.from(hash).toString('base64')}`;
}

async function timingSafeEqualStr(a, b) {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}

async function verifyPassword(password, storedHash) {
  if (!storedHash) return false;
  if (storedHash.startsWith('pbkdf2$')) {
    const parts = storedHash.split('$');
    if (parts.length !== 4) return false;
    const iterations = parseInt(parts[1], 10);
    const salt = new Uint8Array(Buffer.from(parts[2], 'base64'));
    const hash = await pbkdf2(password, salt, iterations);
    return timingSafeEqualStr(Buffer.from(hash).toString('base64'), parts[3]);
  }
  return false;
}

async function main() {
  const email = 'creator@egsaiedu.com';
  const password = 'EgsCreator2026';
  const passwordHash = await hashPasswordSecure(password);

  console.log('Password hash generated successfully.');

  // Check verification
  const isValid = await verifyPassword(password, passwordHash);
  console.log('Password verification check:', isValid ? 'PASSED' : 'FAILED');

  const profileData = {
    id: 'c0000000-0000-4000-a000-000000000002',
    email: email.toLowerCase(),
    phone: '01000000088',
    name: 'صانع محتوى (حساب تجريبي)',
    grade_level: '1_high',
    track_id: null,
    elective_subject: null,
    plan_type: 'pro_3m',
    subscription_status: 'active',
    subscription_start_date: new Date().toISOString(),
    subscription_end_date: '2027-09-11T00:00:00.000Z',
    subscription_plan_id: 'pro_3m',
    role: 'student',
    password_hash: passwordHash,
    coins: 10000,
    points: 50,
    study_streak: 5,
    last_active_date: new Date().toISOString().split('T')[0],
    unlimited_credit: true,
    welcome_reward_claimed: true,
    free_plan_claimed: true,
    apology_compensation_claimed: true,
    apology_dismissed: true,
    terms_accepted_at: new Date().toISOString(),
    created_at: new Date().toISOString()
  };

  // 1. Upsert into Supabase
  console.log('Upserting into Supabase profiles...');
  const { data, error } = await supabase.from('profiles').upsert(profileData, { onConflict: 'email' }).select().single();
  if (error) {
    console.error('Error inserting into Supabase:', error);
  } else {
    console.log('Successfully upserted into Supabase:', data.email, data.name, 'Plan:', data.plan_type, 'Status:', data.subscription_status);
  }

  // 2. Also update db_data.json local fallback
  const dbDataPath = path.join(__dirname, '..', 'db_data.json');
  if (fs.existsSync(dbDataPath)) {
    try {
      const localData = JSON.parse(fs.readFileSync(dbDataPath, 'utf8'));
      if (Array.isArray(localData.profiles)) {
        const existingIndex = localData.profiles.findIndex(p => p.email?.toLowerCase() === email.toLowerCase());
        if (existingIndex >= 0) {
          localData.profiles[existingIndex] = { ...localData.profiles[existingIndex], ...profileData };
        } else {
          localData.profiles.push(profileData);
        }
        fs.writeFileSync(dbDataPath, JSON.stringify(localData, null, 2), 'utf8');
        console.log('Successfully synced into db_data.json');
      }
    } catch (e) {
      console.warn('Could not update db_data.json:', e.message);
    }
  }
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
