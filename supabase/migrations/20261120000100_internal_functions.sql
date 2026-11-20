-- enqueue_job() and create_notification() are internal: only the API server
-- (switching to service_role) and other SECURITY DEFINER code may call them.
-- Signed-in users could otherwise call them through /rest/v1/rpc and queue
-- jobs or notify anyone. Fix the advisor's search_path warnings while here.
revoke execute on function public.enqueue_job(text, jsonb, uuid, timestamptz, text, text) from public, anon, authenticated;
revoke execute on function public.create_notification(uuid, uuid, text, text, text, jsonb, text, text) from public, anon, authenticated;
grant execute on function public.enqueue_job(text, jsonb, uuid, timestamptz, text, text) to service_role;
grant execute on function public.create_notification(uuid, uuid, text, text, text, jsonb, text, text) to service_role;

do $$ begin
  if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'rls_auto_enable') then
    revoke execute on function public.rls_auto_enable() from public, anon, authenticated;
  end if;
end $$;

alter function app.current_user_id() set search_path = '';
alter function app.is_workspace_member(uuid) set search_path = '';
alter function app.is_manager_or_owner(uuid) set search_path = '';
