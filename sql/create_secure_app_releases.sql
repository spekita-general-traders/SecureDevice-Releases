create table if not exists public.secure_app_releases (
  id uuid primary key default gen_random_uuid(),
  app_id text not null,
  channel text not null default 'stable',
  tag text not null,
  version_name text not null,
  release_repo text not null default 'spekita-general-traders/SecureDevice-Releases',
  apk_name text not null default 'app-release.apk',
  apk_url text not null,
  sha256 text not null,
  signature_checksum_base64 text,
  component_name text not null default 'com.spekita.spekitasecure/.MyDeviceAdminReceiver',
  package_name text not null default 'com.spekita.spekitasecure',
  certificate_sha256_hex text,
  is_latest boolean not null default false,
  is_active boolean not null default true,
  released_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint secure_app_releases_unique_tag unique (app_id, channel, tag)
);

create index if not exists secure_app_releases_latest_idx
  on public.secure_app_releases (app_id, channel, is_latest, is_active, released_at desc);

alter table public.secure_app_releases enable row level security;

drop policy if exists "Read active secure app releases" on public.secure_app_releases;
create policy "Read active secure app releases"
  on public.secure_app_releases
  for select
  using (is_active = true);

-- Writes should be done by GitHub Actions using SUPABASE_SERVICE_ROLE_KEY.
-- Do not expose the service role key inside any Android app.
