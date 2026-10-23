import { llmsFullTxt, textResponse } from '@/lib/ai_discovery';

export const dynamic = 'force-static';

export function GET() {
  return textResponse(llmsFullTxt());
}
