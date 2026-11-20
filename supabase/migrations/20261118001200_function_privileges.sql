-- =============================================================================
-- Function privileges (security fix).
--
-- Postgres grants EXECUTE on new functions to PUBLIC, which on Supabase
-- includes `anon` (anyone with the public API key) via /rest/v1/rpc/*.
-- create_notification() and enqueue_job() are SECURITY DEFINER and skip their
-- membership check when there is no signed-in user, so `anon` could create
-- notifications for anyone or queue arbitrary jobs. Revoke PUBLIC/anon on all
-- of them and grant back only what each role needs.
-- =============================================================================

revoke execute on function
  public.create_notification(uuid, uuid, text, text, text, jsonb, text, text),
  public.enqueue_job(text, jsonb, uuid, timestamptz, text, text),
  public.is_workspace_member(uuid),
  public.is_workspace_manager(uuid),
  public.workspace_role(uuid),
  public.subscription_workspaces(uuid),
  public.quiet_hours_release(text, timestamptz),
  public.track_first_response(),
  public.domain_event_to_job()
from public, anon;

-- Trigger functions run as triggers only; nobody calls them directly.
revoke execute on function public.track_first_response(), public.domain_event_to_job() from authenticated;

-- Signed-in users: RLS helpers, and the two calls that check membership themselves.
grant execute on function
  public.create_notification(uuid, uuid, text, text, text, jsonb, text, text),
  public.enqueue_job(text, jsonb, uuid, timestamptz, text, text),
  public.is_workspace_member(uuid),
  public.is_workspace_manager(uuid),
  public.workspace_role(uuid),
  public.quiet_hours_release(text, timestamptz)
to authenticated;

grant execute on function
  public.create_notification(uuid, uuid, text, text, text, jsonb, text, text),
  public.enqueue_job(text, jsonb, uuid, timestamptz, text, text),
  public.is_workspace_member(uuid),
  public.is_workspace_manager(uuid),
  public.workspace_role(uuid),
  public.subscription_workspaces(uuid),
  public.quiet_hours_release(text, timestamptz)
to service_role;

-- Same for functions created later in this schema by these migrations' owner.
alter default privileges in schema public revoke execute on functions from public, anon;
