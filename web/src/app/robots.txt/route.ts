import { robotsTxt, textResponse } from '@/lib/ai_discovery';

// A route handler instead of robots.ts, which cannot emit Content-Signal lines.
export const dynamic = 'force-static';

export function GET() {
  return textResponse(robotsTxt());
}
