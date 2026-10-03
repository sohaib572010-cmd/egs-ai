import { NextResponse } from 'next/server';
import { getUsdEgpRate } from '@/lib/metering';
import { buildPricingSnapshot } from '@/lib/points_pricing';

export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json(
    { success: true, pricing: buildPricingSnapshot(getUsdEgpRate()) },
    { headers: { 'Cache-Control': 'public, max-age=300, stale-while-revalidate=600' } }
  );
}
