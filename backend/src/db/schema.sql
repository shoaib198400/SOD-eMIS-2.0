-- Phase 1 schema: core identity + auth + Section 1 submissions.
-- Detail tables, M&I tables, revision requests, etc. are added in later phases.

create table if not exists zones (
  id bigserial primary key,
  name text not null unique
);

create table if not exists locations (
  code text primary key,
  name text not null,
  loc_type text not null check (loc_type in ('HPCL', 'TOP', 'HMEL')),
  zone_id bigint references zones(id),
  active boolean not null default true,
  is_excluded boolean not null default false
);

create table if not exists users (
  id bigserial primary key,
  login_code text not null unique,
  location_code text references locations(code),
  zone_id bigint references zones(id),
  role text not null check (role in ('Maker', 'Checker', 'Zone', 'Admin', 'Viewer')),
  password_hash text not null,
  email text,
  mobile text,
  active boolean not null default true,
  is_first_login boolean not null default true,
  last_login_at timestamptz,
  last_password_change_at timestamptz,
  current_session_jti text,
  current_session_started_at timestamptz
);

create table if not exists monthly_submissions (
  id bigserial primary key,
  location_code text not null references locations(code),
  month_year date not null,
  status text not null default 'NOT_STARTED'
    check (status in ('NOT_STARTED', 'IN_PROGRESS', 'PENDING_REVIEW', 'SUBMITTED', 'REJECTED')),
  completion_pct numeric not null default 0,
  submitted_at timestamptz,
  locked_by bigint references users(id),
  locked_at timestamptz,
  checker_notes text,
  created_at timestamptz not null default now(),
  last_updated_at timestamptz not null default now(),
  unique (location_code, month_year)
);

create table if not exists field_values (
  submission_id bigint not null references monthly_submissions(id) on delete cascade,
  field_key text not null,
  value text,
  updated_at timestamptz not null default now(),
  primary key (submission_id, field_key)
);

create index if not exists idx_monthly_submissions_location_month
  on monthly_submissions (location_code, month_year);

-- Phase 2 additions: detail tables (Railway Claims / IRR Details / Legal Cases) and the
-- frozen-at-approval snapshot of a submission's field values.

create table if not exists detail_rows (
  id bigserial primary key,
  submission_id bigint not null references monthly_submissions(id) on delete cascade,
  table_type text not null check (table_type in ('RAILWAY_CLAIM', 'IRR_DETAIL', 'LEGAL_CASE')),
  row_data jsonb not null,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_detail_rows_submission_table
  on detail_rows (submission_id, table_type);

create table if not exists approved_snapshots (
  id bigserial primary key,
  submission_id bigint not null unique references monthly_submissions(id) on delete cascade,
  location_code text not null references locations(code),
  month_year date not null,
  snapshot jsonb not null,
  approved_by bigint references users(id),
  approved_at timestamptz not null default now()
);

-- Phase 3 additions: the M&I ("Section 5A") sub-module — 10 tabs, each either multi-row
-- (repeatable rows) or a singleton (one record per submission) — plus the reference Tank
-- Master data that feeds the tank-number dropdowns in several tabs.

create table if not exists mi_submodule_status (
  submission_id bigint not null references monthly_submissions(id) on delete cascade,
  tab_key text not null,
  is_not_applicable boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (submission_id, tab_key)
);

create table if not exists mi_rows (
  id bigserial primary key,
  submission_id bigint not null references monthly_submissions(id) on delete cascade,
  tab_key text not null,
  row_data jsonb not null,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists idx_mi_rows_submission_tab
  on mi_rows (submission_id, tab_key);

create table if not exists mi_singletons (
  submission_id bigint not null references monthly_submissions(id) on delete cascade,
  tab_key text not null,
  data jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (submission_id, tab_key)
);

create table if not exists tank_master (
  id bigserial primary key,
  location_code text not null references locations(code),
  tank_no text not null,
  unique (location_code, tank_no)
);

-- Zone requesting a re-open of an already-SUBMITTED month; Admin approves (unlocks it, reusing
-- the REJECTED status so the Maker can edit and resubmit) or rejects.
create table if not exists revision_requests (
  id bigserial primary key,
  location_code text not null references locations(code),
  month_year date not null,
  requested_by bigint not null references users(id),
  reason text not null,
  status text not null default 'PENDING' check (status in ('PENDING', 'APPROVED', 'REJECTED')),
  actioned_by bigint references users(id),
  actioned_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_revision_requests_location_month
  on revision_requests (location_code, month_year);
