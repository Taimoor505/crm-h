import { json } from '@/server/http';
import { TEMPLATES } from '@/server/core/templates';
import { logged } from '@/server/observability/request-log';

// GET /templates (public): industry templates for onboarding.
function GET_handler() {
  return json({ data: TEMPLATES }, 200, { 'cache-control': 'public, max-age=3600' });
}

export const GET = logged(GET_handler);
