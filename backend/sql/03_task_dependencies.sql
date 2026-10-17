-- Migration: 03_task_dependencies.sql
-- Description: Adds task_dependencies table to store AI-inferred and manager-confirmed task dependencies with confidence and provenance.

create table if not exists public.task_dependencies (
  id uuid primary key default gen_random_uuid(),
  project_id bigint not null references public.projects(id) on delete cascade,
  prerequisite_task_id bigint not null references public.tasks(id) on delete cascade,
  dependent_task_id bigint not null references public.tasks(id) on delete cascade,
  confidence numeric(3,2) not null default 0.85 check (confidence >= 0 and confidence <= 1),
  explanation text not null default '',
  evidence text default '',
  status text not null default 'PROPOSED' check (status in ('PROPOSED', 'CONFIRMED', 'REJECTED')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint uq_project_prereq_dependent unique (project_id, prerequisite_task_id, dependent_task_id),
  constraint chk_no_self_dependency check (prerequisite_task_id <> dependent_task_id)
);

create index if not exists task_dependencies_project_idx
  on public.task_dependencies(project_id);

create index if not exists task_dependencies_prereq_idx
  on public.task_dependencies(prerequisite_task_id);

create index if not exists task_dependencies_dependent_idx
  on public.task_dependencies(dependent_task_id);

alter table public.task_dependencies enable row level security;

revoke all on public.task_dependencies from public, anon, authenticated;
grant all on public.task_dependencies to service_role;

notify pgrst, 'reload schema';
