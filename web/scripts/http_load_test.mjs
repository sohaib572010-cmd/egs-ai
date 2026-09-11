import http from 'http';
import https from 'https';
import { URL } from 'url';
import { sha256 } from 'js-sha256';
import fs from 'fs';

// Parse command line arguments
const args = process.argv.slice(2);
const TARGET_BASE = args[0] || 'http://localhost:3000';
const JWT_SECRET = process.env.JWT_SECRET || 'super-secret-jwt-key-for-egs-ai-2026';

// Generate a valid student session token for authenticated tests
function generateTestToken(userId) {
  const expiry = Date.now() + 30 * 24 * 60 * 60 * 1000;
  const payload = `${userId}:${expiry}`;
  const signature = sha256.hmac(JWT_SECRET, payload);
  return Buffer.from(`${payload}:${signature}`).toString('base64');
}

const TEST_STUDENT_ID = '4b38f8a5-508c-45fd-b32d-02a8c5d8524f';
const AUTH_TOKEN = generateTestToken(TEST_STUDENT_ID);

console.log('================================================================');
console.log('   EGS AI — Live Production HTTP Load & Stress Benchmark Suite   ');
console.log(`   Target Server: ${TARGET_BASE}`);
console.log(`   Authenticated Student ID: ${TEST_STUDENT_ID}`);
console.log('================================================================\n');

// Configure persistent HTTP keep-alive agent to maximize throughput and test true connection pooling
const httpAgent = new http.Agent({
  keepAlive: true,
  maxSockets: 500,
  maxFreeSockets: 200,
  timeout: 30000,
});

const httpsAgent = new https.Agent({
  keepAlive: true,
  maxSockets: 500,
  maxFreeSockets: 200,
  timeout: 30000,
});

function getAgent(targetUrl) {
  return targetUrl.startsWith('https') ? httpsAgent : httpAgent;
}

function makeRequest(urlStr, options = {}) {
  return new Promise((resolve) => {
    const startTime = performance.now();
    const parsedUrl = new URL(urlStr, TARGET_BASE);
    const isHttps = parsedUrl.protocol === 'https:';
    const client = isHttps ? https : http;

    const headers = {
      'Accept': options.accept || '*/*',
      'User-Agent': 'EgsHighLoadTester/2.0 (HighConcurrency)',
      'Connection': 'keep-alive',
      ...(options.headers || {}),
    };

    if (options.body && !headers['Content-Type']) {
      headers['Content-Type'] = 'application/json';
    }

    const reqOptions = {
      protocol: parsedUrl.protocol,
      hostname: parsedUrl.hostname,
      port: parsedUrl.port || (isHttps ? 443 : 80),
      path: parsedUrl.pathname + parsedUrl.search,
      method: options.method || 'GET',
      headers,
      agent: getAgent(urlStr),
      timeout: options.timeout || 20000,
    };

    let bodyBytes = 0;
    const req = client.request(reqOptions, (res) => {
      res.on('data', (chunk) => {
        bodyBytes += chunk.length;
      });
      res.on('end', () => {
        const duration = performance.now() - startTime;
        const isExpected = options.expectedStatus 
          ? (Array.isArray(options.expectedStatus) ? options.expectedStatus.includes(res.statusCode) : res.statusCode === options.expectedStatus)
          : (res.statusCode >= 200 && res.statusCode < 400);

        resolve({
          success: isExpected,
          statusCode: res.statusCode,
          duration,
          bytes: bodyBytes,
          error: null,
        });
      });
    });

    req.on('error', (err) => {
      const duration = performance.now() - startTime;
      resolve({
        success: false,
        statusCode: 0,
        duration,
        bytes: 0,
        error: err.message || 'Request Failed',
      });
    });

    req.on('timeout', () => {
      req.destroy();
      const duration = performance.now() - startTime;
      resolve({
        success: false,
        statusCode: 408,
        duration,
        bytes: 0,
        error: 'Request Timeout',
      });
    });

    if (options.body) {
      req.write(typeof options.body === 'string' ? options.body : JSON.stringify(options.body));
    }
    req.end();
  });
}

function computeStats(results, totalTimeMs) {
  const durations = results.map(r => r.duration).sort((a, b) => a - b);
  const totalRequests = results.length;
  const successful = results.filter(r => r.success).length;
  const failed = totalRequests - successful;
  
  const statusCodes = {};
  let totalBytes = 0;
  for (const r of results) {
    statusCodes[r.statusCode] = (statusCodes[r.statusCode] || 0) + 1;
    totalBytes += r.bytes;
  }

  const sum = durations.reduce((a, b) => a + b, 0);
  const avg = sum / totalRequests;
  const p50 = durations[Math.floor(totalRequests * 0.50)] || 0;
  const p90 = durations[Math.floor(totalRequests * 0.90)] || 0;
  const p95 = durations[Math.floor(totalRequests * 0.95)] || 0;
  const p99 = durations[Math.floor(totalRequests * 0.99)] || 0;
  const min = durations[0] || 0;
  const max = durations[totalRequests - 1] || 0;

  const rps = (totalRequests / (totalTimeMs / 1000));
  const throughputKBps = (totalBytes / 1024) / (totalTimeMs / 1000);

  return {
    totalRequests,
    successful,
    failed,
    statusCodes,
    totalBytes,
    totalTimeMs: Math.round(totalTimeMs),
    rps: Math.round(rps * 100) / 100,
    throughputKBps: Math.round(throughputKBps * 100) / 100,
    latency: {
      min: Math.round(min * 100) / 100,
      avg: Math.round(avg * 100) / 100,
      p50: Math.round(p50 * 100) / 100,
      p90: Math.round(p90 * 100) / 100,
      p95: Math.round(p95 * 100) / 100,
      p99: Math.round(p99 * 100) / 100,
      max: Math.round(max * 100) / 100,
    }
  };
}

async function runScenario({ name, endpoint, totalRequests, concurrency, method = 'GET', body = null, headers = {}, expectedStatus = null }) {
  console.log(`\n================================================================`);
  console.log(`[SCENARIO] ${name}`);
  console.log(`Target: ${endpoint} | Total: ${totalRequests} reqs | Concurrency: ${concurrency} workers`);
  console.log(`================================================================`);

  let completed = 0;
  const results = [];
  const startWall = performance.now();

  let queueIndex = 0;

  async function worker() {
    while (queueIndex < totalRequests) {
      const currentIdx = queueIndex++;
      const res = await makeRequest(endpoint, { method, body, headers, expectedStatus });
      results.push(res);
      completed++;
      if (completed % Math.max(1, Math.floor(totalRequests / 10)) === 0 || completed === totalRequests) {
        process.stdout.write(`\rProgress: ${completed}/${totalRequests} (${Math.round((completed / totalRequests) * 100)}%)`);
      }
    }
  }

  const workers = Array.from({ length: concurrency }, () => worker());
  await Promise.all(workers);
  const totalTimeMs = performance.now() - startWall;
  process.stdout.write('\n');

  const stats = computeStats(results, totalTimeMs);

  console.log(`- Status: ${stats.successful}/${stats.totalRequests} succeeded (${((stats.successful / stats.totalRequests) * 100).toFixed(1)}%)`);
  console.log(`- HTTP Codes: ${JSON.stringify(stats.statusCodes)}`);
  console.log(`- Throughput: ${stats.rps} req/sec | Bandwidth: ${stats.throughputKBps} KB/sec`);
  console.log(`- Latency (ms): min=${stats.latency.min} | avg=${stats.latency.avg} | p50=${stats.latency.p50} | p95=${stats.latency.p95} | p99=${stats.latency.p99} | max=${stats.latency.max}`);
  
  return { name, endpoint, ...stats };
}

async function main() {
  // 1. Connectivity & Health Check
  try {
    const probe = await makeRequest('/api/config');
    if (probe.statusCode === 0) {
      console.error(`ERROR: Target server at ${TARGET_BASE} is not reachable! (${probe.error})`);
      process.exit(1);
    }
    console.log(`Target server is ACTIVE and healthy (probe /api/config returned HTTP ${probe.statusCode}).\n`);
  } catch (err) {
    console.error(`ERROR connecting to ${TARGET_BASE}:`, err.message);
    process.exit(1);
  }

  const overallResults = [];

  // Scenario 1: Main Application Entry Point (Landing Page HTML / SSR Stream)
  overallResults.push(await runScenario({
    name: '1. Root Web Page (SSR / HTML Stream / Core Assets)',
    endpoint: '/',
    totalRequests: 500,
    concurrency: 40,
  }));

  // Scenario 2: High-Volume Public Config API
  overallResults.push(await runScenario({
    name: '2. Public System Configuration API (/api/config)',
    endpoint: '/api/config',
    totalRequests: 1000,
    concurrency: 50,
  }));

  // Scenario 3: Broadcast Platform Notifications API
  overallResults.push(await runScenario({
    name: '3. Platform Notifications Broadcast API (/api/notifications?platform=web)',
    endpoint: '/api/notifications?platform=web',
    totalRequests: 1000,
    concurrency: 50,
  }));

  // Scenario 4: Curriculum Structure Query API
  overallResults.push(await runScenario({
    name: '4. Curriculum Structure Hierarchy (/api/curriculum/structure)',
    endpoint: '/api/curriculum/structure?grade_level=1_high&subject_name=%D8%A7%D9%84%D8%B9%D9%84%D9%88%D9%85',
    totalRequests: 500,
    concurrency: 40,
  }));

  // Scenario 5: Authenticated Leaderboard Ranking API
  overallResults.push(await runScenario({
    name: '5. Student Leaderboard Ranking (Authenticated Session)',
    endpoint: '/api/leaderboard?grade_level=1_high',
    totalRequests: 500,
    concurrency: 40,
    headers: {
      'Authorization': `Bearer ${AUTH_TOKEN}`
    }
  }));

  // Scenario 6: Authenticated Daily Quests & Coin Status API
  overallResults.push(await runScenario({
    name: '6. Student Daily Quests & Progress (Authenticated Session)',
    endpoint: '/api/user/daily-quests',
    totalRequests: 500,
    concurrency: 40,
    headers: {
      'Authorization': `Bearer ${AUTH_TOKEN}`
    }
  }));

  // Scenario 7: Rate Limiter Resilience Under Rapid Repeated Login Attempts
  overallResults.push(await runScenario({
    name: '7. Rate Limiter Resilience Under Rapid Login Attempts (/api/auth/login)',
    endpoint: '/api/auth/login',
    totalRequests: 50,
    concurrency: 10,
    method: 'POST',
    body: {
      email: 'stress_test_victim@egsaiedu.com',
      password: 'SampleTestPassword123!',
      platform: 'web',
      device_id: 'test_dev_rate_limit',
      browser_fingerprint: 'fp_test_123'
    },
    // We expect both 400/401 (for invalid user) and 429 (when per-email / per-IP rate limit kicks in)
    expectedStatus: [200, 400, 401, 404, 429]
  }));

  // Scenario 8: Extreme High-Traffic Multi-Endpoint Request Storm (2,000 requests, 80 workers)
  console.log('\n================================================================');
  console.log('[SCENARIO] 8. Extreme Storm Test: Mixed Multi-Endpoint Burst');
  console.log('Target: Mixed 5 Endpoints | Total: 2000 requests | Concurrency: 80 workers');
  console.log('================================================================');
  {
    const stormEndpoints = [
      { path: '/', headers: {} },
      { path: '/api/config', headers: {} },
      { path: '/api/notifications?platform=web', headers: {} },
      { path: '/api/curriculum/structure?grade_level=1_high&subject_name=%D8%A7%D9%84%D8%B9%D9%84%D9%88%D9%85', headers: {} },
      { path: '/api/leaderboard?grade_level=1_high', headers: { 'Authorization': `Bearer ${AUTH_TOKEN}` } },
      { path: '/api/user/daily-quests', headers: { 'Authorization': `Bearer ${AUTH_TOKEN}` } },
    ];
    const totalRequests = 2000;
    const concurrency = 80;
    let queueIdx = 0;
    let completed = 0;
    const results = [];
    const startWall = performance.now();

    async function stormWorker() {
      while (queueIdx < totalRequests) {
        const cur = queueIdx++;
        const targetConfig = stormEndpoints[cur % stormEndpoints.length];
        const res = await makeRequest(targetConfig.path, { headers: targetConfig.headers });
        results.push(res);
        completed++;
        if (completed % 200 === 0 || completed === totalRequests) {
          process.stdout.write(`\rProgress: ${completed}/${totalRequests} (${Math.round((completed / totalRequests) * 100)}%)`);
        }
      }
    }

    const workers = Array.from({ length: concurrency }, () => stormWorker());
    await Promise.all(workers);
    const totalTimeMs = performance.now() - startWall;
    process.stdout.write('\n');

    const stats = computeStats(results, totalTimeMs);
    console.log(`- Status: ${stats.successful}/${stats.totalRequests} succeeded (${((stats.successful / stats.totalRequests) * 100).toFixed(1)}%)`);
    console.log(`- HTTP Codes: ${JSON.stringify(stats.statusCodes)}`);
    console.log(`- Throughput: ${stats.rps} req/sec | Bandwidth: ${stats.throughputKBps} KB/sec`);
    console.log(`- Latency (ms): min=${stats.latency.min} | avg=${stats.latency.avg} | p50=${stats.latency.p50} | p95=${stats.latency.p95} | p99=${stats.latency.p99} | max=${stats.latency.max}`);
    
    overallResults.push({ name: '8. Extreme Storm Test: Mixed Multi-Endpoint Burst', endpoint: 'Mixed Endpoints', ...stats });
  }

  // Aggregate results
  const summaryReport = {
    timestamp: new Date().toISOString(),
    target: TARGET_BASE,
    scenarios: overallResults,
    aggregate: {
      totalRequests: overallResults.reduce((acc, s) => acc + s.totalRequests, 0),
      totalSuccessful: overallResults.reduce((acc, s) => acc + s.successful, 0),
      totalFailed: overallResults.reduce((acc, s) => acc + s.failed, 0),
      successRate: ((overallResults.reduce((acc, s) => acc + s.successful, 0) / overallResults.reduce((acc, s) => acc + s.totalRequests, 0)) * 100).toFixed(2) + '%',
      avgScenarioRps: Math.round((overallResults.reduce((acc, s) => acc + s.rps, 0) / overallResults.length) * 100) / 100,
      maxScenarioRps: Math.max(...overallResults.map(s => s.rps)),
      overallDurationSeconds: Math.round((overallResults.reduce((acc, s) => acc + s.totalTimeMs, 0) / 1000) * 100) / 100,
    }
  };

  console.log('\n================================================================');
  console.log('   OVERALL LOAD & TRAFFIC TEST SUMMARY');
  console.log(`   Total Requests Processed: ${summaryReport.aggregate.totalRequests}`);
  console.log(`   Successful Requests:      ${summaryReport.aggregate.totalSuccessful} (${summaryReport.aggregate.successRate})`);
  console.log(`   Failed Requests:          ${summaryReport.aggregate.totalFailed}`);
  console.log(`   Average Scenario RPS:     ${summaryReport.aggregate.avgScenarioRps} req/sec`);
  console.log(`   Peak Throughput (RPS):    ${summaryReport.aggregate.maxScenarioRps} req/sec`);
  console.log(`   Total Execution Time:     ${summaryReport.aggregate.overallDurationSeconds}s`);
  console.log('================================================================\n');

  fs.writeFileSync('http_load_test_results.json', JSON.stringify(summaryReport, null, 2), 'utf8');
  console.log('Detailed benchmark data saved to http_load_test_results.json');
}

main().catch(console.error);
