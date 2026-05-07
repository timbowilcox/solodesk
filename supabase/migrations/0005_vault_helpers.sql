-- SoloDesk — Vault helpers
-- Migration: 0005
-- Date: 2026-05-06
-- Sprint: 1.3 (companion to 0004)
--
-- public.vault_put / vault_get / vault_rotate / vault_delete bridge the
-- service-role client to Supabase Vault without exposing the `vault` schema
-- via PostgREST. Each runs with `security definer` so the caller (service
-- role) doesn't need direct grants on vault.* tables.
--
-- All four are restricted to service_role to keep them off the anon API.
-- Direct queries against vault.secrets / vault.decrypted_secrets from
-- application code are an anti-pattern — go through these helpers.

set search_path = public;

create or replace function vault_put(p_payload text, p_name text default null)
returns uuid
language plpgsql
security definer
set search_path = public, vault, extensions
as $$
declare
  v_id uuid;
begin
  if p_payload is null or length(p_payload) = 0 then
    raise exception 'vault_put: payload is required';
  end if;
  insert into vault.secrets (secret, name)
    values (p_payload, p_name)
    returning id into v_id;
  return v_id;
end;
$$;

create or replace function vault_get(p_id uuid)
returns text
language plpgsql
security definer
set search_path = public, vault, extensions
as $$
declare
  v_payload text;
begin
  select decrypted_secret into v_payload
  from vault.decrypted_secrets
  where id = p_id;
  if v_payload is null then
    raise exception 'vault_get: secret % not found', p_id;
  end if;
  return v_payload;
end;
$$;

create or replace function vault_rotate(p_id uuid, p_payload text)
returns void
language plpgsql
security definer
set search_path = public, vault, extensions
as $$
begin
  if p_payload is null or length(p_payload) = 0 then
    raise exception 'vault_rotate: payload is required';
  end if;
  update vault.secrets set secret = p_payload where id = p_id;
  if not found then
    raise exception 'vault_rotate: secret % not found', p_id;
  end if;
end;
$$;

create or replace function vault_delete(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public, vault, extensions
as $$
begin
  delete from vault.secrets where id = p_id;
end;
$$;

revoke execute on function vault_put(text, text) from public, anon, authenticated;
revoke execute on function vault_get(uuid) from public, anon, authenticated;
revoke execute on function vault_rotate(uuid, text) from public, anon, authenticated;
revoke execute on function vault_delete(uuid) from public, anon, authenticated;

grant execute on function vault_put(text, text) to service_role;
grant execute on function vault_get(uuid) to service_role;
grant execute on function vault_rotate(uuid, text) to service_role;
grant execute on function vault_delete(uuid) to service_role;
