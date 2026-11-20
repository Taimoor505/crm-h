import { after } from 'next/server';
import { withService } from '@/server/db';
import {
  backfill, emailFromIdToken, googleApi, redirectUri, saveConnection, verifyState,
} from '@/server/integrations/google';
import { originOf } from '@/server/integrations/calendar-hook';
import { ApiError } from '@/server/http';
import { logged } from '@/server/observability/request-log';

// GET /integrations/google/callback: Google sends the browser here after consent.
async function GET_handler(req: Request) {
  const url = new URL(req.url);
  const origin = originOf(req);
  const back = (status: string) => Response.redirect(`${origin}/settings/calendar?google=${status}`, 303);
  if (url.searchParams.get('error')) return back('denied');
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  if (!code || !state) return back('error');
  try {
    const userId = verifyState(state);
    const tokens = await googleApi().exchangeCode(code, redirectUri(origin));
    if (!tokens.refresh_token) return back('no_refresh');
    await withService((tx) => saveConnection(tx, userId, tokens.refresh_token!, emailFromIdToken(tokens.id_token)));
    try {
      after(() => backfill(userId, origin).then(() => undefined));
    } catch {
      void backfill(userId, origin).catch(() => undefined);
    }
    return back('connected');
  } catch (err) {
    if (!(err instanceof ApiError)) console.error('[calendar] connect failed', err);
    return back('error');
  }
}

export const GET = logged(GET_handler);
