@AGENTS.md

# 行間 (gyokan) — 開発メモ

タスク・案件管理アプリ。ユーザーごとにデータを分離し、Google / メールでログインする。

## 技術構成

- Next.js 16 (App Router, Turbopack) / React 19 / TypeScript / Tailwind CSS 4
- Supabase (PostgreSQL + Auth)、ホスティングは Vercel
- ドラッグ&ドロップは `@dnd-kit`
- コマンド: `npm run dev` / `npm run typecheck` / `npm run lint`(既存の lint エラーあり。触っていない箇所のものは無視してよい)
- `middleware.ts` は Next.js 16 で非推奨(`proxy` への移行推奨)だが現状は動作している

### ローカルビルドのフォント取得エラー(このPC固有)
- このPC(Windows)で `npm run build` を実行すると、Turbopack 内蔵の HTTP クライアントの問題で Google Fonts の取得に失敗することがある(`Error while requesting resource` / `Can't resolve '@vercel/turbopack-next/internal/font/google/font'`)
- 環境変数 `NEXT_TURBOPACK_EXPERIMENTAL_USE_SYSTEM_TLS_CERTS=1` を付けて実行すると解消する(`npm run dev` も同様)
  - PowerShell: `$env:NEXT_TURBOPACK_EXPERIMENTAL_USE_SYSTEM_TLS_CERTS=1; npm run build`
  - Git Bash: `NEXT_TURBOPACK_EXPERIMENTAL_USE_SYSTEM_TLS_CERTS=1 npm run build`
- このPC固有の環境の問題で、Vercel 上の本番ビルドには影響しない(本番サイトがフォントを `/_next/static/media/` から自前配信できていることで確認済み)
- 設定ファイル(`next.config.ts` 等)には変更を加えていない

## ディレクトリ概要

- `app/page.tsx` — メイン画面。巨大な単一ファイル(タスク管理モードもプライベートモードもここ)
- `app/login`, `app/auth` — ログイン・OAuth コールバック / `app/diary` — 日記 / `app/api` — API
- `components/private/` — プライベートモード専用 UI(カレンダー、日別イベントポップアップ)
- `components/diary/` — 日記 UI
- `lib/gyokan/` — ドメインロジック
  - `use-gyokan-data.ts`(タスク・案件)、`use-gyokan-events.ts`(イベント)— データ取得と保存のフック
  - `repository.ts` — Supabase の読み書き / `mappers.ts` — DB 行とアプリ型の変換
  - `reorder.ts` — 並べ替えの共通ヘルパー(タスク・イベントで共用)
  - `schema-compat.ts` — DB に列が無い場合の互換処理
- `lib/supabase/` — client / server / middleware 用の Supabase クライアント
- `supabase/schema.sql` — 初期スキーマ / `supabase/migrations/` — 差分 SQL / `supabase/scripts/` — 運用用 SQL

## 重要な注意点

### 1. 認証: `getSession()` を使わない
`getSession()` を `onAuthStateChange` と併用すると認証がデッドロックする既知の問題がある。データ取得フック(`use-gyokan-data.ts`, `use-gyokan-events.ts`)は **`onAuthStateChange` のみ**で認証状態を管理している。新しいデータ取得コードでも `getSession()` を呼ばないこと。
(`app/login/page.tsx` には既存の `getSession()` 呼び出しがあるが、これはログイン画面限定。データ取得側に持ち込まない。)

### 2. マイグレーション SQL は手動実行が必須
`supabase/migrations/` に SQL ファイルを作っただけでは **実際の DB には反映されない**。必ず **Supabase の SQL Editor で手動実行**する。この手順の漏れが過去に何度か不具合の原因になった。
- マイグレーションを追加したら、ユーザーに「SQL Editor で実行してください」と必ず伝える
- 新しい列を使うコードは、未適用の DB でも落ちないよう `schema-compat.ts` / `repository.ts` の列欠落フォールバックを意識する(例: `scope`, `color`)

### 3. モード切り替えスイッチ
ヘッダーの `modeToggle`(`app/page.tsx`)は「タスク管理」「プライベート」を切り替える。現在のコードでは、白いノブに**現在のモード名**を表示している(`appMode === "tasks" ? "タスク管理" : "プライベート"`)。`aria-label` は「切り替え先」を示す。
※ 「タップすると切り替わる先を表示する仕様」と認識されていたが、コードと履歴(コミット 39799fe「Mode-toggle label shows current mode」)は現在のモード表示になっている。意図が異なる場合は要確認・要修正。

### 4. `scope` 列(work / private)
`tasks` と `events` の両方に `scope` 列(`work` | `private`)がある(`20260921_add_scope_columns.sql`)。
- `tasks` の既定値は `work`、`events` の既定値は `private`
- 画面ではモードに応じて絞り込む(タスク管理モード=`work`、プライベートモード=`private`)。判定は `lib/gyokan/task-case.ts` の `isWorkTaskInView` / `taskBelongsToPrivateProject` など
- 新規作成時は、作成元のモードに合った `scope` を付けること

### 5. プライベートモードの位置づけ
プライベートモードはタスク管理モードの画面(ヘッダー・フッターなどの共通シェル)を土台に作られている。ただし中身は独立しており、専用のカレンダーとデータ(`components/private/`)を持つ。タスク管理モード側の変更は、プライベートモードの表示にも影響しうるので両方を確認すること。

### 6. 並べ替え・ドラッグ
- 並べ替えは `lib/gyokan/reorder.ts` を使う。位置は **画面に表示されている順**(色順・完了順ソート後)で解決する。保存順で解決するとずれる
- 今日の一覧は上段(今日)と下段(期限切れ)が別コンテナ。下段→上段へのドラッグは `TodayAndOverdueTaskList` が途中で上段に組み込み、ドロップ時に期限変更と並び順を同時保存する。上段→下段は意図的に無効
- 保存は `replaceTasks` が全件に `sort_order` を振り直して行う

## 作業上の注意

- Next.js はバージョン固有の変更が多い。コードを書く前に `node_modules/next/dist/docs/` の該当ガイドを読む(AGENTS.md 参照)
- `.env*` に Supabase の接続情報がある。コミットしない
- 日本語 UI。ユーザー向け文言は日本語で統一する
