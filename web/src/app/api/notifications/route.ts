export const revalidate = 180;
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { verifySessionToken } from '@/lib/auth_helpers';

// GET active notifications for a target platform (public for broadcasts, authenticated for user-specific)
export async function GET(req: NextRequest) {
  try {
    const url = req.nextUrl || (req.url ? new URL(req.url) : null);
    const target = url?.searchParams?.get('target') === 'phone' ? 'phone' : 'web';
    
    // Extract userId if session token is provided in Authorization header
    let userId: string | null = null;
    const authHeader = req.headers.get('Authorization');
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7);
      userId = verifySessionToken(token);
    }

    const notifications = await db.getActiveNotifications(target, userId);

    const notifFingerprint = (notifications || []).map((n: any) => `${n.id || ''}_${n.created_at || ''}_${n.active}`).join('-');
    const etag = `"${target}_${userId || 'anon'}_${notifications?.length || 0}_${notifFingerprint.length}"`;

    const cacheHeaders: Record<string, string> = userId
      ? {
          'Cache-Control': 'private, no-cache, must-revalidate',
          'Vary': 'Authorization, If-None-Match',
          'ETag': etag
        }
      : {
          'Cache-Control': 'public, max-age=30, s-maxage=180, stale-while-revalidate=300',
          'CDN-Cache-Control': 'max-age=180',
          'Vary': 'Authorization, Accept-Encoding, If-None-Match',
          'ETag': etag
        };

    const ifNoneMatch = req.headers.get('If-None-Match');
    if (ifNoneMatch && ifNoneMatch === etag) {
      return new NextResponse(null, { status: 304, headers: cacheHeaders });
    }

    return NextResponse.json({ success: true, notifications }, { headers: cacheHeaders });
  } catch (error: any) {
    console.error('Notifications API Error:', error);
    return NextResponse.json({ success: false, notifications: [] });
  }
}
