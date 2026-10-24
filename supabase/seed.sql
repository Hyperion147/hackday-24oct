-- StackPulse comprehensive seed (idempotent)
-- Creates/refreshes a larger multi-env-like topology with incidents and telemetry.

begin;

-- enums
do $$ begin create type service_type as enum ('api','database','cache','external'); exception when duplicate_object then null; end $$;
do $$ begin create type service_status as enum ('healthy','degraded','down'); exception when duplicate_object then null; end $$;
do $$ begin create type service_relation as enum ('sync','async','fallback'); exception when duplicate_object then null; end $$;
do $$ begin create type incident_severity as enum ('info','warning','critical'); exception when duplicate_object then null; end $$;
do $$ begin create type incident_status as enum ('active','resolved'); exception when duplicate_object then null; end $$;

-- tables
create table if not exists projects (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null,
  description text,
  created_at timestamptz not null default now()
);
create table if not exists services (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  name text not null,
  type service_type not null,
  endpoint_url text,
  status service_status not null default 'healthy',
  latency_ms integer not null default 0,
  uptime_pct double precision not null default 100,
  position jsonb not null default '{"x":0,"y":0}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists service_edges (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  source_id uuid not null references services(id) on delete cascade,
  target_id uuid not null references services(id) on delete cascade,
  relation service_relation not null default 'sync'
);
create table if not exists incidents (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  root_service_id uuid not null references services(id) on delete cascade,
  impacted_service_ids text[] not null default '{}',
  severity incident_severity not null,
  status incident_status not null default 'active',
  title text not null,
  description text,
  ai_diagnosis text,
  started_at timestamptz not null default now(),
  resolved_at timestamptz
);
create table if not exists telemetry_logs (
  id serial primary key,
  service_id uuid not null references services(id) on delete cascade,
  timestamp timestamptz not null default now(),
  latency_ms integer not null,
  status_code integer not null default 200,
  is_error boolean not null default false
);

-- indexes
create index if not exists services_project_id_idx on services(project_id);
create index if not exists service_edges_project_idx on service_edges(project_id);
create index if not exists service_edges_source_idx on service_edges(source_id);
create index if not exists service_edges_target_idx on service_edges(target_id);
create index if not exists incidents_project_status_idx on incidents(project_id, status);
create index if not exists telemetry_logs_service_ts_idx on telemetry_logs(service_id, timestamp desc);

-- rls (permissive for demo)
alter table projects enable row level security;
alter table services enable row level security;
alter table service_edges enable row level security;
alter table incidents enable row level security;
alter table telemetry_logs enable row level security;
drop policy if exists "stackpulse_full_access" on projects;
drop policy if exists "stackpulse_full_access" on services;
drop policy if exists "stackpulse_full_access" on service_edges;
drop policy if exists "stackpulse_full_access" on incidents;
drop policy if exists "stackpulse_full_access" on telemetry_logs;
create policy "stackpulse_full_access" on projects for all to anon, authenticated using (true) with check (true);
create policy "stackpulse_full_access" on services for all to anon, authenticated using (true) with check (true);
create policy "stackpulse_full_access" on service_edges for all to anon, authenticated using (true) with check (true);
create policy "stackpulse_full_access" on incidents for all to anon, authenticated using (true) with check (true);
create policy "stackpulse_full_access" on telemetry_logs for all to anon, authenticated using (true) with check (true);
grant usage on schema public to anon, authenticated;
grant all on all tables in schema public to anon, authenticated;

-- 1) larger project
insert into projects (id, name, slug, description, created_at)
values (
  'd8b9a402-8f62-4c7e-b5d1-2a906743e812',
  'Global Commerce Mesh',
  'global-commerce-mesh',
  'Large multi-region e-commerce platform: web, api gateway, auth, catalog, cart, checkout, payments, search, recommendations, messaging, caching, and data stores.',
  now() - interval '14 days'
)
on conflict (id) do update set
  name = excluded.name,
  slug = excluded.slug,
  description = excluded.description;

-- 2) services (13 services)
insert into services (id, project_id, name, type, endpoint_url, status, latency_ms, uptime_pct, position, created_at)
values
  -- frontend & edge
  ('1a7f902b-4d63-4c81-8b52-7e3ad9568241', 'd8b9a402-8f62-4c7e-b5d1-2a906743e812', 'Web Storefront', 'api', 'https://store.globalcommerce.dev', 'healthy', 38, 99.99, '{"x": 60, "y": 200}', now() - interval '14 days'),
  ('3c84db62-7a91-4f25-8e07-2ab7569f0314', 'd8b9a402-8f62-4c7e-b5d1-2a906743e812', 'API Gateway', 'api', 'https://api.globalcommerce.dev', 'healthy', 42, 99.98, '{"x": 280, "y": 200}', now() - interval '14 days'),
  -- core
  ('7b2e561a-8d94-4c37-a906-1fd832ac7495', 'd8b9a402-8f62-4c7e-b5d1-2a906743e812', 'Auth Service', 'api', 'https://auth.globalcommerce.dev', 'healthy', 36, 99.97, '{"x": 520, "y": 60}', now() - interval '14 days'),
  ('9f61a827-3c54-4d92-b78e-205ad9368742', 'd8b9a402-8f62-4c7e-b5d1-2a906743e812', 'User Profile Service', 'api', 'https://profiles.globalcommerce.dev', 'healthy', 44, 99.96, '{"x": 520, "y": 140}', now() - interval '14 days'),
  ('a46d832f-7b95-4e21-c874-913fa6527803', 'd8b9a402-8f62-4c7e-b5d1-2a906743e812', 'Catalog Service', 'api', 'https://catalog.globalcommerce.dev', 'healthy', 41, 99.98, '{"x": 520, "y": 260}', now() - interval '14 days'),
  ('b87592a6-1c43-4d7e-8f61-2dab76348051', 'd8b9a402-8f62-4c7e-b5d1-2a906743e812', 'Cart Service', 'api', 'https://cart.globalcommerce.dev', 'healthy', 39, 99.97, '{"x": 520, "y": 340}', now() - interval '14 days'),
  ('c32a761b-8d54-4f92-a873-9e615c842d07', 'd8b9a402-8f62-4c7e-b5d1-2a906743e812', 'Checkout Service', 'api', 'https://checkout.globalcommerce.dev', 'healthy', 48, 99.95, '{"x": 740, "y": 340}', now() - interval '14 days'),
  ('d9617ab4-2c85-4e32-b708-643fd892c175', 'd8b9a402-8f62-4c7e-b5d1-2a906743e812', 'Payment Service', 'external', 'https://payments.globalcommerce.dev', 'healthy', 55, 99.84, '{"x": 960, "y": 380}', now() - interval '14 days'),
  ('e87492c6-1a53-4d67-b821-9f63d785a241', 'd8b9a402-8f62-4c7e-b5d1-2a906743e812', 'Order Service', 'api', 'https://orders.globalcommerce.dev', 'healthy', 46, 99.96, '{"x": 960, "y": 300}', now() - interval '14 days'),
  ('fa6328b9-4d71-4c85-a902-7e641d753892', 'd8b9a402-8f62-4c7e-b5d1-2a906743e812', 'Search Service', 'api', 'https://search.globalcommerce.dev', 'healthy', 52, 99.94, '{"x": 520, "y": 440}', now() - interval '14 days'),
  ('ab872c93-6d41-4f25-a765-892fd143c760', 'd8b9a402-8f62-4c7e-b5d1-2a906743e812', 'Recommendation Service', 'api', 'https://recommendations.globalcommerce.dev', 'healthy', 62, 99.93, '{"x": 740, "y": 440}', now() - interval '14 days'),
  -- infra
  ('bc961a74-8d32-4f25-b873-9c7425ad8613', 'd8b9a402-8f62-4c7e-b5d1-2a906743e812', 'Redis Session Cache', 'cache', 'redis://cache.globalcommerce.internal:6379', 'healthy', 5, 99.99, '{"x": 740, "y": 60}', now() - interval '14 days'),
  ('cd842763-9b51-4a27-8e92-15ac6739df42', 'd8b9a402-8f62-4c7e-b5d1-2a906743e812', 'Postgres Primary DB', 'database', 'postgres://db.globalcommerce.internal:5432', 'healthy', 14, 99.98, '{"x": 960, "y": 200}', now() - interval '14 days')
on conflict (id) do update set
  name = excluded.name,
  type = excluded.type,
  endpoint_url = excluded.endpoint_url,
  status = excluded.status,
  latency_ms = excluded.latency_ms,
  uptime_pct = excluded.uptime_pct,
  position = excluded.position,
  updated_at = now();

-- 3) edges
insert into service_edges (id, project_id, source_id, target_id, relation)
values
  ('f1000001-0000-4000-8000-000000000001', 'd8b9a402-8f62-4c7e-b5d1-2a906743e812', '1a7f902b-4d63-4c81-8b52-7e3ad9568241', '3c84db62-7a91-4f25-8e07-2ab7569f0314', 'sync'),
  ('f1000001-0000-4000-8000-000000000002', 'd8b9a402-8f62-4c7e-b5d1-2a906743e812', '3c84db62-7a91-4f25-8e07-2ab7569f0314', '7b2e561a-8d94-4c37-a906-1fd832ac7495', 'sync'),
  ('f1000001-0000-4000-8000-000000000003', 'd8b9a402-8f62-4c7e-b5d1-2a906743e812', '3c84db62-7a91-4f25-8e07-2ab7569f0314', '9f61a827-3c54-4d92-b78e-205ad9368742', 'sync'),
  ('f1000001-0000-4000-8000-000000000004', 'd8b9a402-8f62-4c7e-b5d1-2a906743e812', '3c84db62-7a91-4f25-8e07-2ab7569f0314', 'a46d832f-7b95-4e21-c874-913fa6527803', 'sync'),
  ('f1000001-0000-4000-8000-000000000005', 'd8b9a402-8f62-4c7e-b5d1-2a906743e812', '3c84db62-7a91-4f25-8e07-2ab7569f0314', 'b87592a6-1c43-4d7e-8f61-2dab76348051', 'sync'),
  ('f1000001-0000-4000-8000-000000000006', 'd8b9a402-8f62-4c7e-b5d1-2a906743e812', '3c84db62-7a91-4f25-8e07-2ab7569f0314', 'fa6328b9-4d71-4c85-a902-7e641d753892', 'sync'),
  ('f1000001-0000-4000-8000-000000000007', 'd8b9a402-8f62-4c7e-b5d1-2a906743e812', 'b87592a6-1c43-4d7e-8f61-2dab76348051', 'c32a761b-8d54-4f92-a873-9e615c842d07', 'sync'),
  ('f1000001-0000-4000-8000-000000000008', 'd8b9a402-8f62-4c7e-b5d1-2a906743e812', 'c32a761b-8d54-4f92-a873-9e615c842d07', 'd9617ab4-2c85-4e32-b708-643fd892c175', 'sync'),
  ('f1000001-0000-4000-8000-000000000009', 'd8b9a402-8f62-4c7e-b5d1-2a906743e812', 'c32a761b-8d54-4f92-a873-9e615c842d07', 'e87492c6-1a53-4d67-b821-9f63d785a241', 'sync'),
  ('f1000001-0000-4000-8000-000000000010', 'd8b9a402-8f62-4c7e-b5d1-2a906743e812', 'fa6328b9-4d71-4c85-a902-7e641d753892', 'ab872c93-6d41-4f25-a765-892fd143c760', 'sync'),
  ('f1000001-0000-4000-8000-000000000011', 'd8b9a402-8f62-4c7e-b5d1-2a906743e812', '7b2e561a-8d94-4c37-a906-1fd832ac7495', 'bc961a74-8d32-4f25-b873-9c7425ad8613', 'sync'),
  ('f1000001-0000-4000-8000-000000000012', 'd8b9a402-8f62-4c7e-b5d1-2a906743e812', '9f61a827-3c54-4d92-b78e-205ad9368742', 'cd842763-9b51-4a27-8e92-15ac6739df42', 'sync'),
  ('f1000001-0000-4000-8000-000000000013', 'd8b9a402-8f62-4c7e-b5d1-2a906743e812', 'a46d832f-7b95-4e21-c874-913fa6527803', 'cd842763-9b51-4a27-8e92-15ac6739df42', 'sync'),
  ('f1000001-0000-4000-8000-000000000014', 'd8b9a402-8f62-4c7e-b5d1-2a906743e812', 'b87592a6-1c43-4d7e-8f61-2dab76348051', 'cd842763-9b51-4a27-8e92-15ac6739df42', 'sync'),
  ('f1000001-0000-4000-8000-000000000015', 'd8b9a402-8f62-4c7e-b5d1-2a906743e812', 'e87492c6-1a53-4d67-b821-9f63d785a241', 'cd842763-9b51-4a27-8e92-15ac6739df42', 'sync')
on conflict (id) do update set source_id=excluded.source_id, target_id=excluded.target_id, relation=excluded.relation;

-- 4) incidents
insert into incidents (id, project_id, root_service_id, impacted_service_ids, severity, status, title, description, ai_diagnosis, started_at, resolved_at)
values
  ('1f902a7b-6d43-4e81-8c52-7ab936d82451', 'd8b9a402-8f62-4c7e-b5d1-2a906743e812', 'd9617ab4-2c85-4e32-b708-643fd892c175',
   ARRAY['c32a761b-8d54-4f92-a873-9e615c842d07'::uuid,'e87492c6-1a53-4d67-b821-9f63d785a241'::uuid,'3c84db62-7a91-4f25-8e07-2ab7569f0314'::uuid,'1a7f902b-4d63-4c81-8b52-7e3ad9568241'::uuid],
   'critical','active','Payment Service degraded - checkout flow failing','Increased 5xx from PSP; checkout timeouts spreading.',
   E'Root cause: Payment Service (external) returning 5xx/latency spikes.\nBlast radius: Checkout, Order, API Gateway, Web Storefront.\nRecommended remediation:\n• Enable PSP failover / circuit breaker\n• Queue checkout jobs\n• Surface retry UI','2026-10-24T09:40:00+00:00',null),
  ('2b8736ad-9f41-4c52-8e72-165dc794a823', 'd8b9a402-8f62-4c7e-b5d1-2a906743e812', 'cd842763-9b51-4a27-8e92-15ac6739df42',
   ARRAY['9f61a827-3c54-4d92-b78e-205ad9368742'::uuid,'a46d832f-7b95-4e21-c874-913fa6527803'::uuid,'b87592a6-1c43-4d7e-8f61-2dab76348051'::uuid,'e87492c6-1a53-4d67-b821-9f63d785a241'::uuid],
   'warning','resolved','Postgres Primary DB slow queries - read latency elevated','Replication lag / long running queries caused elevated latency.',
   E'Root cause: Postgres Primary DB (database) high CPU due to blocking queries.\nBlast radius: Profiles, Catalog, Cart, Orders.\nRecommended remediation:\n• Kill long queries / add indexes\n• Scale read replicas\n• Tune autovacuum','2026-10-24T07:20:00+00:00','2026-10-24T08:15:00+00:00')
on conflict (id) do update set severity=excluded.severity, status=excluded.status, title=excluded.title, description=excluded.description, ai_diagnosis=excluded.ai_diagnosis, started_at=excluded.started_at, resolved_at=excluded.resolved_at;

-- 5) telemetry (more samples)
insert into telemetry_logs (service_id, timestamp, latency_ms, status_code, is_error)
values
  ('1a7f902b-4d63-4c81-8b52-7e3ad9568241',now()-interval '40 min',36,200,false),
  ('1a7f902b-4d63-4c81-8b52-7e3ad9568241',now()-interval '30 min',39,200,false),
  ('1a7f902b-4d63-4c81-8b52-7e3ad9568241',now()-interval '20 min',37,200,false),
  ('1a7f902b-4d63-4c81-8b52-7e3ad9568241',now()-interval '10 min',41,200,false),
  ('3c84db62-7a91-4f25-8e07-2ab7569f0314',now()-interval '38 min',40,200,false),
  ('3c84db62-7a91-4f25-8e07-2ab7569f0314',now()-interval '28 min',43,200,false),
  ('3c84db62-7a91-4f25-8e07-2ab7569f0314',now()-interval '18 min',42,200,false),
  ('3c84db62-7a91-4f25-8e07-2ab7569f0314',now()-interval '8 min',46,200,false),
  ('7b2e561a-8d94-4c37-a906-1fd832ac7495',now()-interval '37 min',34,200,false),
  ('7b2e561a-8d94-4c37-a906-1fd832ac7495',now()-interval '27 min',35,200,false),
  ('7b2e561a-8d94-4c37-a906-1fd832ac7495',now()-interval '17 min',38,200,false),
  ('7b2e561a-8d94-4c37-a906-1fd832ac7495',now()-interval '7 min',36,200,false),
  ('9f61a827-3c54-4d92-b78e-205ad9368742',now()-interval '36 min',42,200,false),
  ('9f61a827-3c54-4d92-b78e-205ad9368742',now()-interval '26 min',45,200,false),
  ('9f61a827-3c54-4d92-b78e-205ad9368742',now()-interval '16 min',44,200,false),
  ('9f61a827-3c54-4d92-b78e-205ad9368742',now()-interval '6 min',48,200,false),
  ('a46d832f-7b95-4e21-c874-913fa6527803',now()-interval '35 min',39,200,false),
  ('a46d832f-7b95-4e21-c874-913fa6527803',now()-interval '25 min',41,200,false),
  ('a46d832f-7b95-4e21-c874-913fa6527803',now()-interval '15 min',43,200,false),
  ('a46d832f-7b95-4e21-c874-913fa6527803',now()-interval '5 min',42,200,false),
  ('b87592a6-1c43-4d7e-8f61-2dab76348051',now()-interval '34 min',37,200,false),
  ('b87592a6-1c43-4d7e-8f61-2dab76348051',now()-interval '24 min',38,200,false),
  ('b87592a6-1c43-4d7e-8f61-2dab76348051',now()-interval '14 min',40,200,false),
  ('b87592a6-1c43-4d7e-8f61-2dab76348051',now()-interval '4 min',39,200,false),
  ('c32a761b-8d54-4f92-a873-9e615c842d07',now()-interval '33 min',46,200,false),
  ('c32a761b-8d54-4f92-a873-9e615c842d07',now()-interval '23 min',49,200,false),
  ('c32a761b-8d54-4f92-a873-9e615c842d07',now()-interval '13 min',52,200,false),
  ('c32a761b-8d54-4f92-a873-9e615c842d07',now()-interval '3 min',61,200,false),
  ('d9617ab4-2c85-4e32-b708-643fd892c175',now()-interval '32 min',58,200,false),
  ('d9617ab4-2c85-4e32-b708-643fd892c175',now()-interval '22 min',67,200,false),
  ('d9617ab4-2c85-4e32-b708-643fd892c175',now()-interval '12 min',74,200,false),
  ('d9617ab4-2c85-4e32-b708-643fd892c175',now()-interval '2 min',142,503,true),
  ('e87492c6-1a53-4d67-b821-9f63d785a241',now()-interval '31 min',44,200,false),
  ('e87492c6-1a53-4d67-b821-9f63d785a241',now()-interval '21 min',47,200,false),
  ('e87492c6-1a53-4d67-b821-9f63d785a241',now()-interval '11 min',50,200,false),
  ('e87492c6-1a53-4d67-b821-9f63d785a241',now()-interval '1 min',58,200,false),
  ('fa6328b9-4d71-4c85-a902-7e641d753892',now()-interval '30 min',49,200,false),
  ('fa6328b9-4d71-4c85-a902-7e641d753892',now()-interval '20 min',53,200,false),
  ('fa6328b9-4d71-4c85-a902-7e641d753892',now()-interval '10 min',55,200,false),
  ('fa6328b9-4d71-4c85-a902-7e641d753892',now()-interval '0 min',51,200,false),
  ('ab872c93-6d41-4f25-a765-892fd143c760',now()-interval '29 min',59,200,false),
  ('ab872c93-6d41-4f25-a765-892fd143c760',now()-interval '19 min',64,200,false),
  ('ab872c93-6d41-4f25-a765-892fd143c760',now()-interval '9 min',66,200,false),
  ('ab872c93-6d41-4f25-a765-892fd143c760',now()-interval '1 min',63,200,false),
  ('bc961a74-8d32-4f25-b873-9c7425ad8613',now()-interval '28 min',5,200,false),
  ('bc961a74-8d32-4f25-b873-9c7425ad8613',now()-interval '18 min',6,200,false),
  ('bc961a74-8d32-4f25-b873-9c7425ad8613',now()-interval '8 min',5,200,false),
  ('bc961a74-8d32-4f25-b873-9c7425ad8613',now()-interval '2 min',7,200,false),
  ('cd842763-9b51-4a27-8e92-15ac6739df42',now()-interval '27 min',13,200,false),
  ('cd842763-9b51-4a27-8e92-15ac6739df42',now()-interval '17 min',16,200,false),
  ('cd842763-9b51-4a27-8e92-15ac6739df42',now()-interval '7 min',15,200,false),
  ('cd842763-9b51-4a27-8e92-15ac6739df42',now()-interval '3 min',18,200,false);

commit;
