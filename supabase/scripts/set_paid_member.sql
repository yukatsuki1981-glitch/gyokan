-- 指定ユーザーを有料会員にする（Supabase SQL Editor で実行）
-- メールアドレスを自分のアカウントに書き換えてください。

UPDATE auth.users
SET raw_app_meta_data = COALESCE(raw_app_meta_data, '{}'::jsonb) || '{"paid_member": true}'::jsonb
WHERE email = 'your-email@example.com';

-- 確認:
-- SELECT email, raw_app_meta_data->>'paid_member' AS paid_member FROM auth.users WHERE email = 'your-email@example.com';
