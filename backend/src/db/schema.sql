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
