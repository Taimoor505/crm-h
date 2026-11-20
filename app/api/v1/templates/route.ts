import { json } from '@/server/http';
import { TEMPLATES } from '@/server/core/templates';

// GET /templates (public): industry templates for onboarding.
export function GET() {
  return json({ data: TEMPLATES }, 200, { 'cache-control': 'public, max-age=3600' });
}
