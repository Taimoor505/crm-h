import { ApiError, authRoute, json } from '@/server/http';
import { authUrl, googleConfigured } from '@/server/integrations/google';
import { originOf } from '@/server/integrations/calendar-hook';

// POST /integrations/google/connect: the Google consent URL to send the browser to.
export const POST = authRoute(async ({ req, userId }) => {
  if (!googleConfigured()) throw new ApiError(503, 'google_not_configured', 'Google Calendar is not set up on this server yet');
  return json({ data: { url: authUrl(originOf(req), userId) } });
});
