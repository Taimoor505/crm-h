-- =============================================================================
-- Private Storage buckets (Huzaifa): quick-add voice notes and payment proofs.
-- Files are written and read only by the server (service role); clients get
-- short-lived signed URLs. Skipped where Supabase Storage isn't installed
-- (local test database).
-- =============================================================================
do $$
begin
  if exists (select 1 from information_schema.tables where table_schema = 'storage' and table_name = 'buckets') then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values
      ('voice-notes', 'voice-notes', false, 10485760, array['audio/*']),
      ('payment-proofs', 'payment-proofs', false, 5242880,
       array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'application/pdf'])
    on conflict (id) do nothing;
  end if;
end $$;
