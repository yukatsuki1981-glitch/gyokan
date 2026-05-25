# 行間 (gyokan)

タスク・案件管理の Next.js アプリです。

## 技術スタック

- Next.js 16 (App Router)
- React 19
- TypeScript
- Tailwind CSS 4

## 開発

```bash
npm install
npm run dev
```

http://localhost:3000 で起動します。

## ビルド

```bash
npm run typecheck
npm run lint
npm run build
```

## Vercel へのデプロイ

1. [Vercel](https://vercel.com) に GitHub リポジトリを接続
2. Framework Preset: **Next.js**（自動検出）
3. Build Command: `npm run build`
4. Output Directory: デフォルト（`.next`）
5. 環境変数: 不要

CLI からデプロイする場合:

```bash
npx vercel
```

本番反映:

```bash
npx vercel --prod
```

## データ保存

タスク・案件データはブラウザの `localStorage` に保存されます。サーバー側のデータベースは使用していません。
