import { resetPassword } from '@/server/identity/routes';
import { logged } from '@/server/observability/request-log';

export const POST = logged(resetPassword);
export const dynamic = 'force-dynamic';
