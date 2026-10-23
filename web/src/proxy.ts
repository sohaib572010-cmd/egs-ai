import { NextResponse, type NextRequest } from 'next/server';
import { markdownForPath } from '@/lib/ai_discovery';

// Markdown for Agents: only requests that ask for text/markdown reach this proxy; browsers get HTML untouched.
export function proxy(request: NextRequest) {
  const body = markdownForPath(request.nextUrl.pathname);
  if (body === null) return NextResponse.next();
  return new NextResponse(body, {
    headers: {
      'Content-Type': 'text/markdown; charset=utf-8',
      'Cache-Control': 'private, max-age=3600',
      Vary: 'Accept',
      'x-markdown-tokens': String(Math.ceil(body.length / 3))
    }
  });
}

export const config = {
  matcher: [
    {
      source: '/:path*',
      has: [{ type: 'header', key: 'accept', value: '.*text/markdown.*' }]
    }
  ]
};
