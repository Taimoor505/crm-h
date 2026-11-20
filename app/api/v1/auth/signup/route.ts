import { signUp } from '@/server/identity/routes';
import { logged } from '@/server/observability/request-log';

export const POST = logged(signUp);
export const dynamic = 'force-dynamic';
