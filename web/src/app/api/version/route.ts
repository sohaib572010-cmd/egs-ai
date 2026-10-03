export const revalidate = 3600;
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

// GET latest active app version for a platform (public, no auth required)
export async function GET(req: NextRequest) {
  try {
    const platform = req.nextUrl.searchParams.get('platform') || 'android';
    const version = await db.getLatestVersion(platform);
    return NextResponse.json(
      { success: true, version },
      {
        headers: {
          'Cache-Control': 'public, max-age=300, s-maxage=3600, stale-while-revalidate=86400',
          'CDN-Cache-Control': 'max-age=3600',
          'Vary': 'Accept-Encoding'
        }
      }
    );
  } catch (error: any) {
    console.error('Version API Error:', error);
    return NextResponse.json({ success: false, version: null });
  }
}
