-- Mode settings (設定 → モードの表示 / 起動時に表示するモード), one row per user.
--   default_mode      : the mode the app opens in when both modes are shown
--   show_work_mode    : show タスク管理モード
--   show_private_mode : show プライベートモード
-- Until this runs the app keeps working: it reads the settings from the
-- device's own copy and shows an error when saving them to the server.

alter table user_preferences
  add column if not exists default_mode text not null default 'work' check (default_mode in ('work', 'private')),
  add column if not exists show_work_mode boolean not null default true,
  add column if not exists show_private_mode boolean not null default true;
