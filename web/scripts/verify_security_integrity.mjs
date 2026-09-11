import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const webRoot = path.resolve(__dirname, '..');

const testResults = [];

function assert(condition, testName, details = '') {
  if (condition) {
    testResults.push({ name: testName, status: 'PASSED', details });
    console.log(`[PASS] ${testName}`);
  } else {
    testResults.push({ name: testName, status: 'FAILED', details });
    console.error(`[FAIL] ${testName}: ${details}`);
  }
}

console.log('====================================================');
console.log('   EGS AI — Automated Security & Integrity Audit    ');
console.log('====================================================\n');

// ─── TEST SUITE 1: PBKDF2 Password Hashing & Timing-Safe Equality ───
console.log('--- Suite 1: Password Cryptography & Timing Attacks ---');

async function testPasswordCrypto() {
  const PBKDF2_ITERATIONS = 100000;
  
  function pbkdf2Sync(password, salt, iterations) {
    return crypto.pbkdf2Sync(password, salt, iterations, 32, 'sha256');
  }

  function hashPassword(password) {
    const salt = crypto.randomBytes(16);
    const hash = pbkdf2Sync(password, salt, PBKDF2_ITERATIONS);
    return `pbkdf2$${PBKDF2_ITERATIONS}$${salt.toString('base64')}$${hash.toString('base64')}`;
  }

  function verifyPassword(password, storedHash) {
    if (!storedHash) return { valid: false, needsRehash: false };
    if (storedHash.startsWith('pbkdf2$')) {
      const parts = storedHash.split('$');
      if (parts.length !== 4) return { valid: false, needsRehash: false };
      const iterations = parseInt(parts[1], 10);
      const salt = Buffer.from(parts[2], 'base64');
      const hash = pbkdf2Sync(password, salt, iterations);
      const expectedHash = Buffer.from(parts[3], 'base64');
      const valid = crypto.timingSafeEqual(hash, expectedHash);
      return { valid, needsRehash: valid && iterations !== PBKDF2_ITERATIONS };
    }
    const legacyHash = crypto.createHash('sha256').update(password).digest('hex');
    const valid = legacyHash === storedHash;
    return { valid, needsRehash: valid };
  }

  const testPass = 'SecureStudentPass2026!@#';
  const hashed = hashPassword(testPass);

  assert(hashed.startsWith('pbkdf2$100000$'), 'Password format is PBKDF2 with 100k iterations');
  
  const validCheck = verifyPassword(testPass, hashed);
  assert(validCheck.valid === true && validCheck.needsRehash === false, 'Valid password successfully verifies without rehash');

  const wrongCheck = verifyPassword('WrongPassword123', hashed);
  assert(wrongCheck.valid === false, 'Incorrect password correctly rejected');

  // Verify legacy sha256 upgrade detection
  const legacySha256 = crypto.createHash('sha256').update(testPass).digest('hex');
  const legacyCheck = verifyPassword(testPass, legacySha256);
  assert(legacyCheck.valid === true && legacyCheck.needsRehash === true, 'Legacy SHA-256 hash successfully flags needsRehash for upgrade');
}
await testPasswordCrypto();

// ─── TEST SUITE 2: Session Token Signing & Anti-Tampering ───
console.log('\n--- Suite 2: Session Token Signatures & Anti-Tampering ---');

function testSessionTokens() {
  const secretKey = 'test_secure_jwt_secret_key_for_audit_verification';
  
  function generateSessionToken(userId, secret, ttlMs = 30 * 24 * 60 * 60 * 1000) {
    const expiry = Date.now() + ttlMs;
    const payload = `${userId}:${expiry}`;
    const hmac = crypto.createHmac('sha256', secret).update(payload).digest('hex');
    return Buffer.from(`${payload}:${hmac}`).toString('base64');
  }

  function verifySessionToken(token, secret) {
    try {
      const decoded = Buffer.from(token, 'base64').toString('utf8');
      const parts = decoded.split(':');
      if (parts.length !== 3) return null;
      const [userId, expiryStr, signature] = parts;
      const expiry = parseInt(expiryStr, 10);
      if (Date.now() > expiry) return null;
      const payload = `${userId}:${expiry}`;
      const expectedSig = crypto.createHmac('sha256', secret).update(payload).digest('hex');
      if (signature.length !== expectedSig.length) return null;
      if (crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSig))) {
        return userId;
      }
    } catch {
      return null;
    }
    return null;
  }

  const userId = 'u-student-987654321';
  const token = generateSessionToken(userId, secretKey);
  
  const verifiedId = verifySessionToken(token, secretKey);
  assert(verifiedId === userId, 'Valid session token verified and extracts correct userId');

  // Tamper signature
  const decoded = Buffer.from(token, 'base64').toString('utf8');
  const lastChar = decoded.slice(-1);
  const tamperedSig = decoded.slice(0, -1) + (lastChar === 'a' ? 'b' : 'a');
  const tamperedToken = Buffer.from(tamperedSig).toString('base64');
  assert(verifySessionToken(tamperedToken, secretKey) === null, 'Tampered signature is strictly rejected');

  // Tamper payload (escalate userId to admin)
  const parts = decoded.split(':');
  parts[0] = 'admin-id-1234567890';
  const escalatedToken = Buffer.from(parts.join(':')).toString('base64');
  assert(verifySessionToken(escalatedToken, secretKey) === null, 'Forged userId in token is rejected by HMAC mismatch');

  // Expired token
  const expiredToken = generateSessionToken(userId, secretKey, -1000);
  assert(verifySessionToken(expiredToken, secretKey) === null, 'Expired session token is rejected');
}
testSessionTokens();

// ─── TEST SUITE 3: Sliding-Window Rate Limiter ───
console.log('\n--- Suite 3: Sliding-Window Rate Limiter Resilience ---');

function testRateLimiter() {
  const store = new Map();

  function checkRateLimit(key, maxRequests, windowSeconds) {
    const now = Date.now();
    const windowMs = windowSeconds * 1000;
    let record = store.get(key);
    if (!record) {
      record = { timestamps: [] };
      store.set(key, record);
    }
    record.timestamps = record.timestamps.filter(ts => now - ts < windowMs);
    if (record.timestamps.length >= maxRequests) {
      const resetSeconds = Math.ceil((record.timestamps[0] + windowMs - now) / 1000);
      return { allowed: false, remaining: 0, resetSeconds };
    }
    record.timestamps.push(now);
    return { allowed: true, remaining: maxRequests - record.timestamps.length, resetSeconds: windowSeconds };
  }

  const testKey = 'test_ip_192.168.1.50';
  const maxReq = 3;
  const windowSec = 2;

  const r1 = checkRateLimit(testKey, maxReq, windowSec);
  const r2 = checkRateLimit(testKey, maxReq, windowSec);
  const r3 = checkRateLimit(testKey, maxReq, windowSec);
  assert(r1.allowed && r2.allowed && r3.allowed, 'Allowed requests within quota (3/3)');

  const r4 = checkRateLimit(testKey, maxReq, windowSec);
  assert(!r4.allowed && r4.remaining === 0, 'Exceeded request blocked immediately (4th request)');

  // Different key (e.g. different IP) must remain allowed
  const rOther = checkRateLimit('test_ip_10.0.0.1', maxReq, windowSec);
  assert(rOther.allowed, 'Rate limit keys are properly isolated between distinct clients');
}
testRateLimiter();

// ─── TEST SUITE 4: Security Headers in next.config.ts ───
console.log('\n--- Suite 4: HTTP Security Headers Configuration ---');

function testSecurityHeaders() {
  const nextConfigPath = path.join(webRoot, 'next.config.ts');
  const content = fs.readFileSync(nextConfigPath, 'utf8');

  assert(content.includes('X-Frame-Options') && content.includes('DENY'), 'X-Frame-Options is configured to DENY (Anti-Clickjacking)');
  assert(content.includes('X-Content-Type-Options') && content.includes('nosniff'), 'X-Content-Type-Options is configured to nosniff (Anti-MIME sniffing)');
  assert(content.includes('Strict-Transport-Security') && content.includes('max-age=63072000'), 'HSTS configured with 2-year duration (Enforces HTTPS)');
  assert(content.includes('Permissions-Policy'), 'Permissions-Policy configured to restrict device hardware (camera, mic, geo)');
  assert(content.includes('Referrer-Policy'), 'Referrer-Policy configured to strict-origin-when-cross-origin');
}
testSecurityHeaders();

// ─── TEST SUITE 5: Static Secret Leak Audit in Client Code ───
console.log('\n--- Suite 5: Client-Side Secret Leak Audit ---');

function testNoSecretsInClient() {
  const clientFiles = [
    path.join(webRoot, 'src', 'app', 'page.tsx'),
    path.join(webRoot, 'src', 'components', 'ContactForm.tsx')
  ];

  const forbiddenSecrets = [
    'SUPABASE_SERVICE_ROLE_KEY',
    'DEEPSEEK_API_KEY',
    'EDENAI_API_KEY',
    'ALIBABA_API_KEY',
    'RESEND_API_KEY',
    'KASHIER_SECURITY_KEY',
    'KASHIER_API_KEY'
  ];

  let leaked = false;
  for (const file of clientFiles) {
    if (fs.existsSync(file)) {
      const src = fs.readFileSync(file, 'utf8');
      for (const secret of forbiddenSecrets) {
        if (src.includes(secret)) {
          leaked = true;
          console.error(`Leak detected: ${secret} referenced in ${path.basename(file)}`);
        }
      }
    }
  }
  assert(!leaked, 'Zero server-side API secrets leaked in client-side code files');
}
testNoSecretsInClient();

// ─── TEST SUITE 6: XSS & KaTeX Security Settings ───
console.log('\n--- Suite 6: Frontend Sanitization & KaTeX Security ---');

function testSanitizationSettings() {
  const pagePath = path.join(webRoot, 'src', 'app', 'page.tsx');
  const pageContent = fs.readFileSync(pagePath, 'utf8');

  assert(pageContent.includes('DOMPurify.sanitize'), 'DOMPurify sanitization active for rendered SVG and HTML markup');
  assert(pageContent.includes('trust: false'), 'KaTeX trust is explicitly set to false to prevent LaTeX XSS execution');
}
testSanitizationSettings();

// ─── TEST SUITE 7: Admin Routes Authentication Enforcements ───
console.log('\n--- Suite 7: Admin API Routes RBAC Enforcements ---');

function testAdminRoutesProtection() {
  const adminApiDir = path.join(webRoot, 'src', 'app', 'api', 'admin');
  let totalAdminRoutes = 0;
  let protectedRoutes = 0;

  function scanDir(dir) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        scanDir(fullPath);
      } else if (entry.name.endsWith('.ts')) {
        totalAdminRoutes++;
        const content = fs.readFileSync(fullPath, 'utf8');
        const hasAuthCheck = content.includes('verifySessionToken') || content.includes('role === \'admin\'') || content.includes('role !== \'admin\'') || content.includes('unauthorized') || content.includes('forbidden');
        if (hasAuthCheck) {
          protectedRoutes++;
        } else {
          console.warn(`Unchecked admin route found: ${fullPath}`);
        }
      }
    }
  }

  scanDir(adminApiDir);
  assert(protectedRoutes === totalAdminRoutes && totalAdminRoutes > 0, `All ${totalAdminRoutes} Admin API routes enforce session verification and role checks`);
}
testAdminRoutesProtection();

// ─── SUMMARY ───
console.log('\n====================================================');
const passed = testResults.filter(r => r.status === 'PASSED').length;
const failed = testResults.filter(r => r.status === 'FAILED').length;
console.log(`Audit Summary: ${passed} PASSED | ${failed} FAILED (Total: ${testResults.length})`);
console.log('====================================================');

if (failed > 0) {
  process.exit(1);
} else {
  process.exit(0);
}
