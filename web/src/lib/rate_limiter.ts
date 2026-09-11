import { NextRequest } from 'next/server';

interface RateLimitRecord {
  timestamps: number[];
}

const rateLimitStore = new Map<string, RateLimitRecord>();

// Periodically prune stale entries to prevent memory growth
let lastCleanup = Date.now();
function cleanupStaleEntries(windowMs: number) {
  const now = Date.now();
  if (now - lastCleanup < 60000) return; // run at most once per minute
  lastCleanup = now;
  for (const [key, record] of rateLimitStore.entries()) {
    record.timestamps = record.timestamps.filter(ts => now - ts < windowMs);
    if (record.timestamps.length === 0) {
      rateLimitStore.delete(key);
    }
  }
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetSeconds: number;
}

// In-memory sliding-window rate limiter (Fast local execution & graceful fallback)
export function checkRateLimit(
  key: string,
  maxRequests: number,
  windowSeconds: number
): RateLimitResult {
  const now = Date.now();
  const windowMs = windowSeconds * 1000;
  cleanupStaleEntries(windowMs);

  let record = rateLimitStore.get(key);
  if (!record) {
    record = { timestamps: [] };
    rateLimitStore.set(key, record);
  }

  // Remove timestamps outside the sliding window
  record.timestamps = record.timestamps.filter(ts => now - ts < windowMs);

  if (record.timestamps.length >= maxRequests) {
    const oldestTimestamp = record.timestamps[0];
    const resetSeconds = Math.ceil((oldestTimestamp + windowMs - now) / 1000);
    return {
      allowed: false,
      remaining: 0,
      resetSeconds: Math.max(1, resetSeconds)
    };
  }

  record.timestamps.push(now);
  const resetSeconds = Math.ceil(windowSeconds);
  return {
    allowed: true,
    remaining: maxRequests - record.timestamps.length,
    resetSeconds
  };
}

/**
 * Distributed Multi-Tier Rate Limiter
 * - Tier 1: Upstash Redis REST (Zero TCP, edge/serverless native)
 * - Tier 2: High-performance local in-memory sliding window fallback (Zero database contention)
 * 
 * PostgreSQL is intentionally excluded from the rate-limiting hot path to prevent
 * connection pool exhaustion and transaction queue contention under brute-force attacks.
 */
export async function checkRateLimitAsync(
  key: string,
  maxRequests: number,
  windowSeconds: number
): Promise<RateLimitResult> {
  // 1. Tier 1: Upstash Redis REST
  const redisUrl = process.env.UPSTASH_REDIS_REST_URL;
  const redisToken = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (redisUrl && redisToken) {
    try {
      const response = await fetch(`${redisUrl}/pipeline`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${redisToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify([
          ['INCR', `rl:${key}`],
          ['EXPIRE', `rl:${key}`, windowSeconds, 'NX'],
          ['TTL', `rl:${key}`]
        ])
      });

      if (response.ok) {
        const results = await response.json();
        const currentCount = typeof results[0]?.result === 'number' ? results[0].result : 1;
        const ttl = typeof results[2]?.result === 'number' && results[2].result > 0 ? results[2].result : windowSeconds;

        const allowed = currentCount <= maxRequests;
        return {
          allowed,
          remaining: Math.max(0, maxRequests - currentCount),
          resetSeconds: ttl
        };
      }
    } catch (redisErr) {
      // Fall through to in-memory tier on Redis network/availability error
    }
  }

  // 2. Tier 2: High-performance local in-memory sliding-window fallback
  return checkRateLimit(key, maxRequests, windowSeconds);
}

export function getClientIp(req: NextRequest): string {
  const forwarded = req.headers.get('x-forwarded-for');
  if (forwarded) {
    return forwarded.split(',')[0].trim();
  }
  const cfIp = req.headers.get('cf-connecting-ip');
  if (cfIp) return cfIp.trim();
  const realIp = req.headers.get('x-real-ip');
  if (realIp) return realIp.trim();
  return 'unknown-ip';
}
