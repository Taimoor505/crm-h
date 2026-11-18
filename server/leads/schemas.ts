import { z } from 'zod';

const pathOrPaths = z.union([z.string().min(1).max(200), z.array(z.string().min(1).max(200)).max(10)]);

export const mappingSchema = z
  .object({
    name: pathOrPaths.optional(),
    first_name: pathOrPaths.optional(),
    last_name: pathOrPaths.optional(),
    phone: pathOrPaths.optional(),
    email: pathOrPaths.optional(),
    notes: pathOrPaths.optional(),
    custom: z.record(z.string().regex(/^[a-z0-9_]{1,64}$/), pathOrPaths).optional(),
    tags: z.array(z.string().trim().min(1).max(40)).max(20).optional(),
  })
  .strict();

export const leadSourceSettingsSchema = z
  .object({
    allowed_origins: z
      .array(z.url().transform((u) => new URL(u).origin))
      .max(20)
      .optional(),
    redirect_url: z.url().optional(),
    default_tags: z.array(z.string().trim().min(1).max(40)).max(20).optional(),
  })
  .strict();

/** Facebook page connection for Meta lead ads. */
export const metaConnectionSchema = z.object({
  page_id: z.string().regex(/^\d{5,30}$/, 'Facebook page id'),
  page_access_token: z.string().min(20).max(1000),
  /** Only these lead forms; empty = every form on the page. */
  form_ids: z.array(z.string().regex(/^\d{5,30}$/)).max(50).optional(),
});
