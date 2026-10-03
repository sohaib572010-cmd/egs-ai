import { NextRequest, NextResponse } from 'next/server';
import { verifySessionToken } from '@/lib/auth_helpers';

// Client telemetry endpoint. Requires some form of caller identification
// (logged-in token or device id) to prevent anonymous log-spam/DoS, and
// caps payload size logged to the server console.
const MAX_LOG_CHARS = 4000;

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get('Authorization');
    const deviceId = req.headers.get('x-device-id');

    let identified = false;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      identified = !!verifySessionToken(authHeader.substring(7));
    }
    if (!identified && deviceId) {
      identified = true;
    }

    if (!identified) {
      return NextResponse.json({ success: false }, { status: 401 });
    }

    const body = await req.json();
    const serialized = JSON.stringify(body).slice(0, MAX_LOG_CHARS);
    console.log('[BROWSER LOG]:', serialized);
    return NextResponse.json({ success: true });
  } catch (e) {
    return NextResponse.json({ success: false });
  }
}
