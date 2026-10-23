import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');
const envPath = path.join(projectRoot, '.env.local');
const statePath = path.join(projectRoot, 'monitor_state.json');

// Helper to send Windows Desktop Toast Notification
function sendDesktopNotification(title, message) {
  try {
    const scriptPath = path.join(__dirname, 'notify.ps1');
    const safeTitle = (title || 'Supabase Alert').replace(/"/g, '`"');
    const safeMsg = (message || '').replace(/"/g, '`"');
    execSync(`powershell -ExecutionPolicy Bypass -File "${scriptPath}" -Title "${safeTitle}" -Message "${safeMsg}"`, { stdio: 'ignore' });
  } catch (err) {
    console.warn("Could not trigger desktop notification:", err.message);
  }
}

// 1. Read Supabase Credentials
let supabaseUrl = '';
let supabaseServiceKey = '';

try {
  const envContent = fs.readFileSync(envPath, 'utf8');
  for (const line of envContent.split('\n')) {
    const trimmed = line.trim();
    if (trimmed.startsWith('NEXT_PUBLIC_SUPABASE_URL=')) {
      supabaseUrl = trimmed.split('=')[1].trim().replace(/^["']|["']$/g, '');
    } else if (trimmed.startsWith('SUPABASE_SERVICE_ROLE_KEY=')) {
      supabaseServiceKey = trimmed.split('=')[1].trim().replace(/^["']|["']$/g, '');
    }
  }
} catch (err) {
  console.error("Error reading .env.local:", err.message);
  process.exit(1);
}

if (!supabaseUrl || !supabaseServiceKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

// 2. Read State
let state = {
  last_checked_at: null,
  last_accounts_count: 0,
  last_messages_count: 0,
  alerted_accounts_100: false,
  alerted_messages_100: false,
  known_subscriber_ids: []
};

if (fs.existsSync(statePath)) {
  try {
    state = JSON.parse(fs.readFileSync(statePath, 'utf8'));
  } catch (err) {
    console.warn("Could not parse monitor_state.json, starting fresh.");
  }
}

const isFirstRun = !state.last_checked_at;
const currentCheckTime = new Date().toISOString();

async function runMonitor() {
  const alerts = [];
  const notifications = [];

  // 1. Check Accounts Count (profiles)
  const { count: accountsCount, error: accountsErr } = await supabase
    .from('profiles')
    .select('*', { count: 'exact', head: true });

  if (accountsErr) {
    alerts.push(`❌ خطأ في فحص عدد الحسابات: ${accountsErr.message}`);
  } else {
    if (accountsCount > 100) {
      alerts.push(`⚠️ تنبيه: إجمالي عدد الحسابات تجاوز 100! (العدد الحالي: ${accountsCount})`);
      // Send desktop toast if crossing 100 for the first time or if accounts increased
      if (!state.alerted_accounts_100) {
        sendDesktopNotification("⚠️ تنبيه الحسابات", `إجمالي عدد الحسابات تجاوز 100 (العدد الحالي: ${accountsCount})`);
        state.alerted_accounts_100 = true;
      }
    }
  }

  // 2. Check Messages Count (chat_history)
  const { count: messagesCount, error: messagesErr } = await supabase
    .from('chat_history')
    .select('*', { count: 'exact', head: true });

  if (messagesErr) {
    alerts.push(`❌ خطأ في فحص عدد الرسائل: ${messagesErr.message}`);
  } else {
    if (messagesCount > 100) {
      alerts.push(`⚠️ تنبيه: إجمالي عدد الرسائل تجاوز 100! (العدد الحالي: ${messagesCount})`);
      // Send desktop toast if crossing 100 for the first time
      if (!state.alerted_messages_100) {
        sendDesktopNotification("⚠️ تنبيه الرسائل", `إجمالي عدد الرسائل تجاوز 100 (العدد الحالي: ${messagesCount})`);
        state.alerted_messages_100 = true;
      }
    }
  }

  // 3. Check Subscriptions
  const { data: activeProfiles, error: profilesSubErr } = await supabase
    .from('profiles')
    .select('id, name, email, plan_type, subscription_status, subscription_plan_id, subscription_start_date')
    .eq('subscription_status', 'active');

  const { data: recentPayments, error: paymentsErr } = await supabase
    .from('payment_transactions')
    .select('id, user_id, plan_id, amount, currency, status, created_at')
    .eq('status', 'success');

  const knownSet = new Set(state.known_subscriber_ids || []);
  const currentSubscribers = [];
  const newSubscribers = [];

  if (activeProfiles && !profilesSubErr) {
    for (const p of activeProfiles) {
      const subKey = `profile_${p.id}_${p.subscription_plan_id || p.plan_type}`;
      currentSubscribers.push(subKey);
      if (!isFirstRun && !knownSet.has(subKey)) {
        newSubscribers.push({
          type: 'profile_active',
          name: p.name || 'بدون اسم',
          email: p.email || 'بدون بريد',
          plan: p.subscription_plan_id || p.plan_type,
          date: p.subscription_start_date
        });
      }
    }
  }

  if (recentPayments && !paymentsErr) {
    for (const pay of recentPayments) {
      const payKey = `payment_${pay.id}`;
      currentSubscribers.push(payKey);
      if (!isFirstRun && !knownSet.has(payKey)) {
        newSubscribers.push({
          type: 'payment_success',
          user_id: pay.user_id,
          plan: pay.plan_id,
          amount: `${pay.amount} ${pay.currency}`,
          date: pay.created_at
        });
      }
    }
  }

  if (isFirstRun) {
    notifications.push(`ℹ️ تم التشغيل الأول وتسجيل المشتركين الحاليين بنجاح (${activeProfiles?.length || 0} اشتراك نشط).`);
  } else if (newSubscribers.length > 0) {
    for (const sub of newSubscribers) {
      if (sub.type === 'profile_active') {
        const msgText = `المشترك "${sub.name}" اشترك في الخطة [${sub.plan}]`;
        notifications.push(`🎉 إشعار باشتراك جديد: ${msgText}!`);
        // Trigger Desktop Notification on Windows!
        sendDesktopNotification("🎉 اشتراك جديد في الموقع!", msgText);
      } else {
        const msgText = `عملية دفع ناجحة لخطة [${sub.plan}] بمبلغ ${sub.amount}`;
        notifications.push(`🎉 إشعار بعملية دفع: ${msgText}.`);
        // Trigger Desktop Notification on Windows!
        sendDesktopNotification("💳 عملية دفع اشتراك ناجحة", msgText);
      }
    }
  }

  // Update State
  const updatedKnown = Array.from(new Set([...knownSet, ...currentSubscribers]));
  fs.writeFileSync(statePath, JSON.stringify({
    last_checked_at: currentCheckTime,
    last_accounts_count: accountsCount,
    last_messages_count: messagesCount,
    alerted_accounts_100: state.alerted_accounts_100 || accountsCount > 100,
    alerted_messages_100: state.alerted_messages_100 || messagesCount > 100,
    known_subscriber_ids: updatedKnown
  }, null, 2), 'utf8');

  // Print Formatted Report
  console.log("=== SUPABASE MONITOR REPORT ===");
  console.log(`Timestamp: ${currentCheckTime}`);
  console.log(`Total Accounts: ${accountsCount}`);
  console.log(`Total Messages: ${messagesCount}`);
  console.log(`Active Subscriptions: ${activeProfiles?.length || 0}`);
  console.log("");
  
  if (alerts.length > 0) {
    console.log("--- ALERTS (تنبيهات تجاوز الحد) ---");
    alerts.forEach(a => console.log(a));
    console.log("");
  } else {
    console.log("✅ الأعداد ضمن الحدود الطبيعية.");
  }

  if (notifications.length > 0) {
    console.log("--- NOTIFICATIONS (إشعارات الاشتراكات) ---");
    notifications.forEach(n => console.log(n));
    console.log("");
  } else {
    console.log("ℹ️ لا توجد اشتراكات جديدة منذ آخر فحص.");
  }
  console.log("===============================");
}

runMonitor().catch(err => {
  console.error("Monitor execution failed:", err);
  process.exit(1);
});
