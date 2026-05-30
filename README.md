# 行間 (gyokan)

タスク・案件管理の Next.js アプリです。データは Supabase に保存され、Google ログインでユーザーごとに分離されます。

## 技術スタック

- Next.js 16 (App Router)
- React 19
- TypeScript
- Tailwind CSS 4
- Supabase (PostgreSQL + Auth)

## セットアップ

### 1. 依存関係

```bash
npm install
```

### 2. Supabase プロジェクト

1. [Supabase](https://supabase.com) でプロジェクトを作成
2. SQL Editor で `supabase/schema.sql` を実行
3. Authentication → Providers → **Google** を有効化
4. Authentication → URL Configuration:
   - **Site URL**: 本番 URL（例 `https://your-app.vercel.app`）
   - **Redirect URLs**:  
     `http://localhost:3000/auth/callback`  
     `https://your-app.vercel.app/auth/callback`

Google Cloud Console で OAuth クライアントを作成し、Supabase の Google プロバイダに Client ID / Secret を設定してください。

### 3. 環境変数

```bash
cp .env.example .env.local
```

`.env.local` に Supabase の URL と anon key を設定:

```
NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
```

Settings → API から取得できます。

### 4. 開発サーバー

```bash
npm run dev
```

http://localhost:3000 で起動します。未ログイン時は `/login` へ誘導されます。

## ビルド

```bash
npm run typecheck
npm run lint
npm run build
```

## Vercel へのデプロイ

1. [Vercel](https://vercel.com) に GitHub リポジトリを接続
2. Framework Preset: **Next.js**
3. **Environment Variables** に以下を設定:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
4. Supabase の Redirect URLs に `https://<your-vercel-domain>/auth/callback` を追加

CLI からデプロイ:

```bash
npx vercel
npx vercel --prod
```

## データ保存

| データ | テーブル | 説明 |
|--------|----------|------|
| プロジェクト | `projects` | 名称・カラー・並び順 |
| タスク | `tasks` | カレンダー上の日付タスク |
| 案件 | `cases` | 案件（ステータス・期限など） |
| メモ | `project_memos` | プロジェクト詳細のメモ |
| カレンダー表示日 | `user_preferences` | 最後に表示した日付 |

すべて Row Level Security (RLS) により `auth.uid()` 単位で分離されています。

初回ログイン時、デフォルトの 6 プロジェクトが自動作成されます。ブラウザに旧 `localStorage` データがある場合は、DB が空のときのみ自動インポートされます。

## ディレクトリ

```
app/              # ページ・認証コールバック
lib/gyokan/       # データ層・フック
lib/supabase/     # Supabase クライアント
supabase/         # SQL スキーマ
```
