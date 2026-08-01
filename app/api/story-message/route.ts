import { NextResponse, type NextRequest } from "next/server";

export const dynamic = "force-dynamic";

const ENDINGS = [
  "あなたの物語が、動いています",
  "物語は、もう始まっています",
  "あの日の続きが、始まっています",
  "あなたの日々が、静かに形を変えています",
  "記憶の中で、何かが動き出しました",
];

export async function POST(request: NextRequest) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "not configured" }, { status: 500 });
  }

  let taskTitle: string;
  try {
    const body = await request.json();
    taskTitle = String(body?.taskTitle ?? "").trim();
  } catch {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }

  if (!taskTitle) {
    return NextResponse.json({ error: "taskTitle required" }, { status: 400 });
  }

  const ending = ENDINGS[Math.floor(Math.random() * ENDINGS.length)];

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 120,
        messages: [
          {
            role: "user",
            content: `以下のタスク名を使って、詩的な2〜3行の日本語の文章を書いてください。

タスク名：${taskTitle}

必ず守ること：
・タスク名をそのまま文の一部として使う
・「が、」で即フィクション的な世界へ繋ぐ
・「静かに」「何かが」「しようとしている」のうち少なくとも1つを使う
・断言しない。説明しない。余白を残す。
・特定の作家のスタイルを真似ない
・2〜3行以内
・文章のみ出力。前置き・説明・タイトル不要。`,
          },
        ],
      }),
    });

    if (!res.ok) {
      return NextResponse.json({ error: "upstream error" }, { status: 502 });
    }

    const data = await res.json() as { content?: { text?: string }[] };
    const body = data.content?.[0]?.text?.trim() ?? "";
    if (!body) {
      return NextResponse.json({ error: "empty response" }, { status: 502 });
    }

    return NextResponse.json({ text: `${body}\n\n${ending}` });
  } catch {
    return NextResponse.json({ error: "fetch failed" }, { status: 502 });
  }
}
