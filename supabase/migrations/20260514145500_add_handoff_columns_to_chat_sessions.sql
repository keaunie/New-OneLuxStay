alter table if exists public.chat_sessions
  add column if not exists conversation_mode text not null default 'ai'
  check (conversation_mode in ('ai', 'human', 'paused', 'closed'));

alter table if exists public.chat_sessions
  add column if not exists assigned_admin_id text;

alter table if exists public.chat_sessions
  add column if not exists assigned_admin_name text;

alter table if exists public.chat_sessions
  add column if not exists human_taken_over_at timestamptz;

create index if not exists chat_sessions_conversation_mode_idx
  on public.chat_sessions (conversation_mode, last_seen_at desc);

create index if not exists chat_sessions_assigned_admin_idx
  on public.chat_sessions (assigned_admin_id, last_seen_at desc);
