import crypto from 'crypto';

export { KASHIER_PLANS, type KashierPlan } from './plans';

export function getKashierCredentials() {
  const merchantId = (process.env.KASHIER_MERCHANT_ID || process.env.NEXT_PUBLIC_KASHIER_MERCHANT_ID || 'MID-47766-857').trim();
  const securityKey = (process.env.KASHIER_SECURITY_KEY || '').trim();
  let apiKey = (process.env.KASHIER_API_KEY || '').trim();

  // If apiKey was duplicated (72-char double UUID), sanitize to single 36-char UUID
  if (apiKey.length === 72 && apiKey.slice(0, 36) === apiKey.slice(36)) {
    apiKey = apiKey.slice(0, 36);
  }

  const mode = (process.env.KASHIER_MODE || process.env.NEXT_PUBLIC_KASHIER_MODE || 'live').trim() as 'live' | 'test';

  return { merchantId, securityKey, apiKey, mode };
}

/**
 * Generates the Kashier order hash for checkout.
 * Path string format: /?payment={mid}.{orderId}.{amount}.{currency}
 */
export function generateKashierOrderHash(
  orderId: string,
  amount: number | string,
  currency: string = 'EGP'
): string {
  const { merchantId, apiKey, securityKey } = getKashierCredentials();
  const keyToUse = apiKey || securityKey;
  if (!keyToUse) {
    throw new Error('Kashier API key or security key is not configured.');
  }

  const path = `/?payment=${merchantId}.${orderId}.${amount}.${currency}`;
  return crypto.createHmac('sha256', keyToUse).update(path).digest('hex');
}

function safeTimingCompare(calculatedHex: string, providedHex: string): boolean {
  try {
    const calcBuf = Buffer.from(calculatedHex.toLowerCase(), 'hex');
    const provBuf = Buffer.from(providedHex.toLowerCase(), 'hex');
    if (calcBuf.length !== provBuf.length || calcBuf.length === 0) return false;
    return crypto.timingSafeEqual(calcBuf, provBuf);
  } catch {
    return false;
  }
}

export function isKashierSuccessStatus(status?: string | null): boolean {
  if (!status) return false;
  const s = String(status).trim().toUpperCase();
  return s === 'SUCCESS' || s === 'CAPTURED' || s === 'APPROVED' || s === 'PAID';
}

/**
 * Validates the callback redirect signature from Kashier.
 * Kashier passes query params and a signature header/param.
 * Tests arrival order, raw query sequence, sorted order, and signatureKeys.
 */
export function verifyKashierCallbackSignature(
  params: Record<string, any>,
  rawSearchString?: string
): boolean {
  const signature = params.signature || params.hash;
  if (!signature || typeof signature !== 'string') return false;

  const { apiKey, securityKey } = getKashierCredentials();
  const validKeys: string[] = [];
  if (apiKey) {
    validKeys.push(apiKey);
    if (apiKey.length === 72 && apiKey.slice(0, 36) === apiKey.slice(36)) {
      validKeys.push(apiKey.slice(0, 36));
    }
  }
  if (securityKey) {
    validKeys.push(securityKey);
    if (securityKey.includes('$')) {
      validKeys.push(securityKey.split('$')[0]);
      validKeys.push(securityKey.split('$')[1]);
    }
  }

  if (validKeys.length === 0) {
    console.error('Cannot verify Kashier signature: No Kashier keys configured.');
    return false;
  }

  const ignoredKeys = new Set(['signature', 'hash', 'mode']);
  const candidates: string[] = [];

  // 1. Raw search string as directly received from the request URL
  if (rawSearchString) {
    const cleanSearch = rawSearchString.startsWith('?') ? rawSearchString.slice(1) : rawSearchString;
    const parts = cleanSearch.split('&').filter(part => {
      const key = decodeURIComponent(part.split('=')[0] || '');
      return key && !ignoredKeys.has(key);
    });
    if (parts.length > 0) {
      candidates.push(parts.join('&'));
      // Also test decoded version
      const decodedParts = parts.map(p => {
        const [k, ...v] = p.split('=');
        return `${decodeURIComponent(k)}=${decodeURIComponent(v.join('='))}`;
      });
      candidates.push(decodedParts.join('&'));
    }
  }

  // 2. Exact arrival order from params
  const arrivalKeys = Object.keys(params).filter(k => !ignoredKeys.has(k));
  if (arrivalKeys.length > 0) {
    candidates.push(arrivalKeys.map(k => `${k}=${params[k]}`).join('&'));
  }

  // 3. Alphabetical sorted order
  const sortedKeys = [...arrivalKeys].sort();
  if (sortedKeys.length > 0) {
    candidates.push(sortedKeys.map(k => `${k}=${params[k]}`).join('&'));
  }

  // 4. signatureKeys array (if provided by Kashier gateway)
  if (params.signatureKeys) {
    try {
      const keys = typeof params.signatureKeys === 'string' ? JSON.parse(params.signatureKeys) : params.signatureKeys;
      if (Array.isArray(keys) && keys.length > 0) {
        candidates.push(keys.filter((k: string) => params[k] !== undefined).map((k: string) => `${k}=${params[k]}`).join('&'));
        const sortedSigKeys = [...keys].sort();
        candidates.push(sortedSigKeys.filter((k: string) => params[k] !== undefined).map((k: string) => `${k}=${params[k]}`).join('&'));
      }
    } catch (e) {
      console.warn('Error parsing Kashier signatureKeys:', e);
    }
  }

  // Check all candidates against all valid keys
  for (const candidate of candidates) {
    if (!candidate) continue;
    for (const key of validKeys) {
      try {
        const calculated = crypto.createHmac('sha256', key).update(candidate).digest('hex');
        if (safeTimingCompare(calculated, signature)) {
          return true;
        }
      } catch {
        continue;
      }
    }
  }

  return false;
}

/**
 * Validates a Kashier Webhook HMAC signature against the raw payload strictly.
 */
export function verifyKashierWebhookSignature(rawBody: string, signature: string): boolean {
  if (!signature || typeof signature !== 'string' || !rawBody) return false;
  const { securityKey, apiKey } = getKashierCredentials();
  const validKeys = [securityKey, apiKey].filter(Boolean);
  if (validKeys.length === 0) {
    console.error('Cannot verify Kashier webhook: No Kashier keys configured.');
    return false;
  }

  for (const key of validKeys) {
    try {
      const calculated = crypto.createHmac('sha256', key).update(rawBody).digest('hex');
      if (safeTimingCompare(calculated, signature)) {
        return true;
      }
    } catch {
      continue;
    }
  }

  return false;
}
