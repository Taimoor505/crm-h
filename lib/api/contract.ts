/**
 * Compile-time contract between lib/api/types.ts and the generated specs
 * (npm run gen:api). If a backend schema drops or renames a field the
 * frontend reads, `npm run typecheck` fails here.
 */
import type { components as H, paths as HPaths } from './schema/huzaifa';
import type { paths as CPaths } from './schema/core';
import type { AppNotification, Automation, LeadSource, Task } from './types';

type Schemas = H['schemas'];
type KeysExist<Ours, Theirs> = Exclude<keyof Ours, keyof Theirs> extends never ? true : Exclude<keyof Ours, keyof Theirs>;
type Assert<T extends true> = T;

// Fields the frontend reads must exist in Huzaifa's schemas.
export type _Task = Assert<KeysExist<Omit<Task, 'is_overdue' | 'contact'>, Schemas['Task']>>;
export type _Notification = Assert<KeysExist<AppNotification, Schemas['Notification']>>;
export type _Automation = Assert<KeysExist<Automation, Schemas['Automation']>>;
export type _LeadSource = Assert<KeysExist<Omit<LeadSource, 'secret'>, Schemas['LeadSource']>>;

// Every path the frontend calls must exist in one of the specs.
type AllPaths = keyof HPaths | keyof CPaths;
type Used =
  | '/contacts' | '/contacts/{id}' | '/contacts/{id}/timeline' | '/contacts/{id}/notes' | '/contacts/{id}/calls'
  | '/contacts/{id}/merge' | '/contacts/{id}/assign' | '/leads/quick-add' | '/pipelines' | '/deals' | '/deals/{id}/move'
  | '/tasks' | '/tasks/{id}' | '/tasks/{id}/complete' | '/home/summary' | '/notifications' | '/notifications/read'
  | '/notification-settings' | '/push-subscriptions' | '/lead-sources' | '/lead-sources/{id}' | '/assignment-rules'
  | '/availability' | '/automations' | '/automations/{key}' | '/reports/sources' | '/reports/funnel' | '/billing/subscription';
export type _Paths = Assert<Exclude<Used, AllPaths> extends never ? true : false>;
