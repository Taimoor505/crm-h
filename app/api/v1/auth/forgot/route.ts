import { forgot } from '@/server/identity/routes';
import { logged } from '@/server/observability/request-log';

export const POST = logged(forgot);
export const dynamic = 'force-dynamic';
