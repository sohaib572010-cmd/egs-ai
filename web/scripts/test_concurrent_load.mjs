import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const webRoot = path.resolve(__dirname, '..');

// Set NODE_ENV to test to enable dev fallbacks and logging
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'load_test_jwt_secret_key_32_bytes_long_min_len';

const stats = {
  passed: 0,
  failed: 0,
  timings: []
};

function assert(condition, testName, details = '') {
  if (condition) {
    stats.passed++;
    console.log(`[PASS] ${testName}`);
  } else {
    stats.failed++;
    console.error(`[FAIL] ${testName}: ${details}`);
  }
}

function computePercentiles(numbers) {
  if (numbers.length === 0) return { min: 0, avg: 0, p50: 0, p95: 0, p99: 0, max: 0 };
  const sorted = [...numbers].sort((a, b) => a - b);
  const sum = sorted.reduce((acc, v) => acc + v, 0);
  const avg = sum / sorted.length;
  const p50 = sorted[Math.floor(sorted.length * 0.5)];
  const p95 = sorted[Math.floor(sorted.length * 0.95)] || sorted[sorted.length - 1];
  const p99 = sorted[Math.floor(sorted.length * 0.99)] || sorted[sorted.length - 1];
  return {
    min: sorted[0],
    avg: Math.round(avg * 100) / 100,
    p50,
    p95,
    p99,
    max: sorted[sorted.length - 1]
  };
}

console.log('===============================================================');
console.log('   EGS AI — High Concurrent User Load & Stress Testing Suite   ');
console.log('===============================================================\n');

// Import application modules dynamically to use initialized environment
const { db, invalidateNotificationsCache, invalidateLeaderboardCache } = await import('../src/lib/db.ts');
const { hashPasswordSecure, verifyPassword, generateOtp, generateSessionToken, verifySessionToken, parseDeviceMetadata } = await import('../src/lib/auth_helpers.ts');
const { checkRateLimit } = await import('../src/lib/rate_limiter.ts');
const { getCurriculumStructure } = await import('../src/lib/curriculum_structure.ts');

// ─── SUITE 1: Simultaneous Registrations & Password Hashing Concurrency ───
console.log('--- Test Suite 1: Simultaneous Registrations (Concurrency = 50) ---');

const CONCURRENT_REGISTRATIONS = 50;
const registeredStudents = [];
const registrationTimings = [];

const regStart = Date.now();

const registrationPromises = Array.from({ length: CONCURRENT_REGISTRATIONS }, async (_, i) => {
  const itemStart = Date.now();
  const studentEmail = `concurrent_student_${Date.now()}_${i}@test.egsaiedu.com`;
  const studentPass = `Password_${i}_Test2026!`;
  const studentName = `طالب اختباري ${i + 1}`;
  const studentGrade = (['1_middle', '2_middle', '3_middle', '1_high', '2_high'])[i % 5];
  const simulatedIp = `192.168.1.${(i % 10) + 1}`; // 10 distinct IPs simulating classroom/NAT

  // 1. Rate Limit Checks (simulating register API route)
  const emailLimit = checkRateLimit(`register_email_${studentEmail}`, 5, 600);
  const ipLimit = checkRateLimit(`register_ip_${simulatedIp}`, 60, 600);

  if (!emailLimit.allowed || !ipLimit.allowed) {
    throw new Error(`Rate limit blocked student ${i}: email=${emailLimit.allowed}, ip=${ipLimit.allowed}`);
  }

  // 2. Password Hashing (PBKDF2 WebCrypto deriveBits)
  const passwordHash = await hashPasswordSecure(studentPass);
  const otpCode = generateOtp();

  // 3. Pending Registration Creation in DB
  const pending = await db.createPendingRegistration(
    studentEmail,
    studentName,
    studentGrade,
    passwordHash,
    otpCode,
    new Date().toISOString()
  );

  // 4. OTP Verification & Profile Creation (simulating OTP route)
  const retrievedPending = await db.getPendingRegistration(studentEmail);
  if (!retrievedPending || retrievedPending.otp !== otpCode) {
    throw new Error(`Pending OTP mismatch for ${studentEmail}`);
  }

  const userId = crypto.randomUUID();
  const trialResult = await db.checkAndRecordTrialGrant({
    userId,
    ipAddress: simulatedIp,
    userAgent: 'Mozilla/5.0 LoadTestRunner/1.0',
    browserFingerprint: `fp_${i}`,
    deviceId: `device_${i}_${Date.now()}`,
    platform: 'web',
    hasRegisteredBefore: false
  });

  const profile = await db.createProfile({
    id: userId,
    email: studentEmail,
    name: studentName,
    grade_level: studentGrade,
    plan_type: 'free',
    role: 'student',
    password_hash: passwordHash,
    coins: trialResult.coins,
    welcome_reward_claimed: true,
    free_plan_claimed: true,
    terms_accepted_at: new Date().toISOString()
  });

  await db.deletePendingRegistration(studentEmail);

  // 5. Generate Session Token & Register Device
  const token = generateSessionToken(userId);
  const deviceResult = await db.registerUserDevice({
    userId,
    deviceId: `dev_${userId.substring(0, 8)}`,
    sessionToken: token,
    userAgent: 'LoadTestRunner/1.0',
    ipAddress: simulatedIp,
    browserFingerprint: `fp_${i}`,
    platform: 'web',
    deviceName: 'متصفح الاختبار السريع'
  });

  const duration = Date.now() - itemStart;
  registrationTimings.push(duration);

  registeredStudents.push({
    email: studentEmail,
    password: studentPass,
    userId,
    token,
    profile,
    deviceResult
  });

  return { success: true, duration, studentEmail };
});

const regResults = await Promise.allSettled(registrationPromises);
const regTotalDuration = Date.now() - regStart;
const regSuccessful = regResults.filter(r => r.status === 'fulfilled').length;
const regRps = Math.round((regSuccessful / (regTotalDuration / 1000)) * 100) / 100;
const regPercentiles = computePercentiles(registrationTimings);

assert(regSuccessful === CONCURRENT_REGISTRATIONS, `All ${CONCURRENT_REGISTRATIONS} simultaneous registrations succeeded without failure`, `Completed: ${regSuccessful}/${CONCURRENT_REGISTRATIONS}`);
assert(registeredStudents.length === CONCURRENT_REGISTRATIONS, `All ${CONCURRENT_REGISTRATIONS} student profiles properly stored in memory & DB`);
assert(regPercentiles.p95 < 500, `P95 registration time is under 500ms (Actual: ${regPercentiles.p95}ms)`);

console.log(`   * Total Time: ${regTotalDuration}ms | Throughput: ${regRps} registrations/sec`);
console.log(`   * Latency: min=${regPercentiles.min}ms | avg=${regPercentiles.avg}ms | p50=${regPercentiles.p50}ms | p95=${regPercentiles.p95}ms | max=${regPercentiles.max}ms\n`);

// ─── SUITE 2: High Concurrent Logins & Authentication Verification ───
console.log(`--- Test Suite 2: High Concurrent Logins & Session Verification (Concurrency = ${CONCURRENT_REGISTRATIONS}) ---`);

const loginTimings = [];
const loginStart = Date.now();

const loginPromises = registeredStudents.map(async (student, idx) => {
  const itemStart = Date.now();
  const simulatedIp = `192.168.1.${(idx % 10) + 1}`;

  // 1. Rate Limit Checks (simulating login route)
  const emailLimit = checkRateLimit(`login_email_${student.email}`, 5, 60);
  const ipLimit = checkRateLimit(`login_ip_${simulatedIp}`, 60, 60);

  if (!emailLimit.allowed || !ipLimit.allowed) {
    throw new Error(`Login rate limit blocked for ${student.email}`);
  }

  // 2. Profile Retrieval
  const profile = await db.getProfileByEmail(student.email);
  if (!profile) {
    throw new Error(`Profile not found for email: ${student.email}`);
  }

  // 3. Password Verification
  const verifyRes = await verifyPassword(student.password, profile.password_hash);
  if (!verifyRes.valid) {
    throw new Error(`Password verification failed for ${student.email}`);
  }

  // 4. Token Generation & Device Update
  const newToken = generateSessionToken(profile.id);
  const verifiedUserId = verifySessionToken(newToken);
  if (verifiedUserId !== profile.id) {
    throw new Error(`Generated token mismatch for ${profile.id}`);
  }

  const deviceRes = await db.registerUserDevice({
    userId: profile.id,
    deviceId: `login_dev_${idx}`,
    sessionToken: newToken,
    userAgent: 'Mozilla/5.0 HighLoadTest/2.0',
    ipAddress: simulatedIp,
    platform: 'web',
    deviceName: 'متصفح تجريبي'
  });

  const duration = Date.now() - itemStart;
  loginTimings.push(duration);
  return { success: true, duration };
});

const loginResults = await Promise.allSettled(loginPromises);
const loginTotalDuration = Date.now() - loginStart;
const loginSuccessful = loginResults.filter(r => r.status === 'fulfilled').length;
const loginRps = Math.round((loginSuccessful / (loginTotalDuration / 1000)) * 100) / 100;
const loginPercentiles = computePercentiles(loginTimings);

assert(loginSuccessful === CONCURRENT_REGISTRATIONS, `All ${CONCURRENT_REGISTRATIONS} concurrent logins successfully authenticated`, `Completed: ${loginSuccessful}/${CONCURRENT_REGISTRATIONS}`);
assert(loginPercentiles.p95 < 400, `P95 login latency is under 400ms for 50 concurrent PBKDF2 operations (Actual: ${loginPercentiles.p95}ms)`);

console.log(`   * Total Time: ${loginTotalDuration}ms | Throughput: ${loginRps} logins/sec`);
console.log(`   * Latency: min=${loginPercentiles.min}ms | avg=${loginPercentiles.avg}ms | p50=${loginPercentiles.p50}ms | p95=${loginPercentiles.p95}ms | max=${loginPercentiles.max}ms\n`);

// ─── SUITE 3: High Volume Request Storm Across Core Endpoints ───
console.log('--- Test Suite 3: High Volume Request Storm (500 Parallel Operations) ---');

const TOTAL_STORM_REQUESTS = 500;
const stormTimings = [];
const stormStart = Date.now();

const stormPromises = Array.from({ length: TOTAL_STORM_REQUESTS }, async (_, i) => {
  const itemStart = Date.now();
  const requestType = i % 5;
  const randomStudent = registeredStudents[i % registeredStudents.length];

  if (requestType === 0) {
    // 1. System Config (cached)
    const config = await db.getPublicConfig();
    if (!config || !Array.isArray(config.activeGradeLevels)) throw new Error('Invalid config returned');
  } else if (requestType === 1) {
    // 2. Broadcast Notifications (cached)
    const notifs = await db.getActiveNotifications('web', null);
    if (!Array.isArray(notifs)) throw new Error('Invalid notifications array returned');
  } else if (requestType === 2) {
    // 3. Curriculum Structure (cached)
    const structure = await getCurriculumStructure('1_high', 'العلوم');
    if (structure === undefined) throw new Error('Failed to get curriculum structure');
  } else if (requestType === 3) {
    // 4. Leaderboard Ranking (cached)
    const leaderboard = await db.getLeaderboard('1_high', 10);
    if (!Array.isArray(leaderboard)) throw new Error('Failed to get leaderboard');
  } else {
    // 5. User Daily Quests & Profile Coins
    const quests = await db.getDailyQuests(randomStudent.userId);
    if (!quests || !Array.isArray(quests.quests)) throw new Error('Failed to get daily quests');
  }

  const duration = Date.now() - itemStart;
  stormTimings.push(duration);
  return { success: true, duration };
});

const stormResults = await Promise.allSettled(stormPromises);
const stormTotalDuration = Date.now() - stormStart;
const stormSuccessful = stormResults.filter(r => r.status === 'fulfilled').length;
const stormRps = Math.round((stormSuccessful / (stormTotalDuration / 1000)) * 100) / 100;
const stormPercentiles = computePercentiles(stormTimings);

assert(stormSuccessful === TOTAL_STORM_REQUESTS, `100% of ${TOTAL_STORM_REQUESTS} heavy usage storm requests succeeded without error`, `Passed: ${stormSuccessful}/${TOTAL_STORM_REQUESTS}`);
assert(stormPercentiles.p95 < 50, `P95 cached response latency under high volume is under 50ms (Actual: ${stormPercentiles.p95}ms)`);
assert(stormRps > 500, `Throughput exceeds 500 requests/sec under load (Actual: ${stormRps} RPS)`);

console.log(`   * Total Time: ${stormTotalDuration}ms | Throughput: ${stormRps} req/sec`);
console.log(`   * Latency: min=${stormPercentiles.min}ms | avg=${stormPercentiles.avg}ms | p50=${stormPercentiles.p50}ms | p95=${stormPercentiles.p95}ms | max=${stormPercentiles.max}ms\n`);

// ─── SUITE 4: Multi-Device Limit Enforcement Under Concurrency ───
console.log('--- Test Suite 4: Multi-Device Limit Enforcement Under Load ---');

const testStudent = registeredStudents[0];
const devicePromises = [1, 2, 3, 4, 5].map(async (devNum) => {
  return await db.registerUserDevice({
    userId: testStudent.userId,
    deviceId: `device_concurrency_test_${devNum}`,
    sessionToken: generateSessionToken(testStudent.userId),
    userAgent: `DeviceAgent_${devNum}`,
    platform: 'web',
    deviceName: `جهاز تجريبي ${devNum}`
  });
});

await Promise.all(devicePromises);
const activeDevices = await db.getUserActiveDevices(testStudent.userId);

assert(activeDevices.length <= 3, `Strict device limit preserved under concurrent device creation (Active: ${activeDevices.length}/3)`);

// ─── SUITE 5: Disk Serialization & Persistence Integrity Check ───
console.log('\n--- Test Suite 5: Atomic Disk Persistence & Zero-Corruption Verification ---');

// Wait 150ms for debounced atomic disk flush to settle
await new Promise(r => setTimeout(r, 200));

const dbFilePath = path.join(webRoot, 'db_data.json');
const fileExists = fs.existsSync(dbFilePath);
assert(fileExists, 'Database file db_data.json exists on disk');

const rawFileContent = fs.readFileSync(dbFilePath, 'utf8');
let parsedDiskData = null;
let jsonParseSuccess = false;

try {
  parsedDiskData = JSON.parse(rawFileContent);
  jsonParseSuccess = true;
} catch (e) {
  jsonParseSuccess = false;
}

assert(jsonParseSuccess === true, 'Database file is 100% valid JSON after high concurrent load');
assert(Array.isArray(parsedDiskData?.profiles), 'Profiles table exists and is an array');

// Verify that all registered students exist in the persisted database file
const allPersisted = registeredStudents.every(s => 
  parsedDiskData.profiles.some(p => p.id === s.userId && p.email === s.email)
);
assert(allPersisted === true, `All ${registeredStudents.length} concurrently registered students are persisted on disk`);

// Clean up test students from DB
console.log('\n--- Cleaning up test records ---');
const testUserIds = new Set(registeredStudents.map(s => s.userId));
parsedDiskData.profiles = parsedDiskData.profiles.filter(p => !testUserIds.has(p.id));
parsedDiskData.user_devices = (parsedDiskData.user_devices || []).filter(d => !testUserIds.has(d.user_id));
parsedDiskData.free_trial_grants = (parsedDiskData.free_trial_grants || []).filter(g => !testUserIds.has(g.user_id));
fs.writeFileSync(dbFilePath, JSON.stringify(parsedDiskData, null, 2), 'utf8');
console.log(`Cleaned up ${registeredStudents.length} test student records.`);

console.log('\n===============================================================');
console.log(`   Load Test Summary: ${stats.passed} PASSED | ${stats.failed} FAILED (Total: ${stats.passed + stats.failed})   `);
console.log('===============================================================');

if (stats.failed > 0) {
  process.exit(1);
} else {
  process.exit(0);
}
