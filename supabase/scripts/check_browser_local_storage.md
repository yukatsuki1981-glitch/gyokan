# ブラウザの localStorage に残っているデータを確認する

PC の Chrome で `https://www.gyokan.app` を開き、開発者ツール（F12）→ Console に以下を貼り付けて実行してください。

```javascript
const keys = [
  "gyokan-tasks-v5",
  "gyokan-cases-v6",
  "gyokan-project-memos-v1",
  "gyokan-project-colors-v2",
  "gyokan-pending-daily-memos-v1",
];

for (const key of keys) {
  const raw = localStorage.getItem(key);
  if (!raw) {
    console.log(key, "なし");
    continue;
  }
  try {
    const data = JSON.parse(raw);
    const count = Array.isArray(data) ? data.length : Object.keys(data).length;
    console.log(key, count, "件");
  } catch {
    console.log(key, "（解析できず）");
  }
}

const drafts = Object.keys(localStorage).filter((k) =>
  k.startsWith("gyokan-draft-v1:"),
);
console.log("未同期ドラフト", drafts.length, "件");
```

- 件数が多いキーがあれば、ブラウザ内に古いバックアップが残っている可能性があります。
- ただし **直近に Supabase へ保存できていたデータ** は、別アカウント（多くは Google ログイン側）に残っていることが多いです。
