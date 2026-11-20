import { refresh } from '@/server/identity/routes';
import { logged } from '@/server/observability/request-log';

export const POST = logged(refresh);
export const dynamic = 'force-dynamic';
