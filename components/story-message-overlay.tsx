"use client";

import { useEffect, useRef, useState } from "react";
import {
  getDisplayableText,
  recordShown,
  recordTaskCompleted,
  shouldGenerateOnOpen,
  storePendingText,
} from "@/lib/gyokan/story-message";

interface Task {
  id: string;
  title: string;
  done: boolean;
}

interface Props {
  tasks: Task[];
  dataReady: boolean;
  isAuthenticated: boolean;
}

export function StoryMessageOverlay({ tasks, dataReady, isAuthenticated }: Props) {
  const [text, setText] = useState<string | null>(null);
  const [show, setShow] = useState(false);
  const prevDoneIdsRef = useRef<Set<string> | null>(null);
  const initializedRef = useRef(false);
  const generatingRef = useRef(false);

  function showText(t: string) {
    recordShown();
    setText(t);
    setShow(true);
  }

  async function generateAndHandle(taskTitle: string, showImmediately: boolean) {
    if (generatingRef.current) return;
    generatingRef.current = true;
    try {
      const res = await fetch("/api/story-message", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ taskTitle }),
      });
      if (!res.ok) return;
      const data = (await res.json()) as { text?: string };
      if (!data.text) return;

      if (showImmediately) {
        showText(data.text);
      } else {
        storePendingText(data.text);
      }
    } catch {
      // silent
    } finally {
      generatingRef.current = false;
    }
  }

  // アプリ起動時：pending チェック + 3日経過チェック
  useEffect(() => {
    if (!dataReady || !isAuthenticated || initializedRef.current) return;
    initializedRef.current = true;

    const doneIds = new Set(tasks.filter((t) => t.done).map((t) => t.id));
    prevDoneIdsRef.current = doneIds;

    // 21時以降なら pending を表示
    const pending = getDisplayableText();
    if (pending) {
      showText(pending);
      return;
    }

    // 3日経過していたら生成（21時以降なら即表示、それ以外は予約）
    if (shouldGenerateOnOpen()) {
      const recent = tasks.filter((t) => t.done).at(-1);
      if (recent) {
        const isAfter21 = new Date().getHours() >= 21;
        void generateAndHandle(recent.title, isAfter21);
      }
    }
  }, [dataReady, isAuthenticated, tasks]);

  // タスク完了監視（5件で生成予約）
  useEffect(() => {
    if (!dataReady || !isAuthenticated || !initializedRef.current || prevDoneIdsRef.current === null) return;

    const currentDoneIds = new Set(tasks.filter((t) => t.done).map((t) => t.id));
    const newlyDone = tasks.filter((t) => t.done && !prevDoneIdsRef.current!.has(t.id));
    prevDoneIdsRef.current = currentDoneIds;

    if (newlyDone.length === 0) return;

    let triggerTask: Task | undefined;
    for (const task of newlyDone) {
      const count = recordTaskCompleted();
      if (count >= 5) {
        triggerTask = task;
        break;
      }
    }

    if (triggerTask) {
      // 21時以降なら即表示、それ以外は予約
      const isAfter21 = new Date().getHours() >= 21;
      void generateAndHandle(triggerTask.title, isAfter21);
    }
  }, [tasks, dataReady, isAuthenticated]);

  function dismiss() {
    setShow(false);
    setTimeout(() => setText(null), 400);
  }

  if (!text) return null;

  return (
    <div
      className="fixed inset-0 z-[300] flex items-center justify-center cursor-pointer select-none"
      style={{
        background: "rgba(0,0,0,0.5)",
        opacity: show ? 1 : 0,
        transition: "opacity 0.4s ease",
        backdropFilter: "blur(2px)",
        WebkitBackdropFilter: "blur(2px)",
      }}
      onClick={dismiss}
    >
      <p
        className="max-w-[280px] mx-8 text-center text-white/90 text-[15px] leading-[2] tracking-wider whitespace-pre-line"
        style={{ fontWeight: 300 }}
      >
        {text}
      </p>
    </div>
  );
}
