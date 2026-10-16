-- Migration: 02_dependency_handoffs.sql
-- Description: Adds handoff_notifications table to track downstream readiness notifications and prevent duplicate sends.

create table if not exists public.handoff_notifications (
  id uuid primary key default gen_random_uuid(),
  prerequisite_task_id bigint not null references public.tasks(id) on delete cascade,
  downstream_task_id bigint not null references public.tasks(id) on delete cascade,
  recipient_participant_id bigint not null references public.participants(id) on delete cascade,
  telegram_message_id bigint,
  status text not null default 'SENT' check (status in ('SENT', 'FAILED')),
  delivery_error text,
  created_at timestamptz not null default now(),
  constraint uq_prereq_downstream unique (prerequisite_task_id, downstream_task_id)
);

create index if not exists handoff_notifications_prereq_idx
  on public.handoff_notifications(prerequisite_task_id);

create index if not exists handoff_notifications_downstream_idx
  on public.handoff_notifications(downstream_task_id);

alter table public.handoff_notifications enable row level security;

revoke all on public.handoff_notifications from public, anon, authenticated;
grant all on public.handoff_notifications to service_role;

notify pgrst, 'reload schema';
