import { resend } from '@/server/identity/routes';
import { logged } from '@/server/observability/request-log';

export const POST = logged(resend);
export const dynamic = 'force-dynamic';
