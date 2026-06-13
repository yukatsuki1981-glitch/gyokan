"use client";

import { useEffect } from "react";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-[#fafafa] px-6 text-center">
      <p className="text-[17px] font-semibold text-gray-900">画面の読み込みに失敗しました</p>
      <p className="max-w-sm text-[13px] leading-relaxed text-gray-500">
        通信状況や一時的な不具合の可能性があります。再読み込みをお試しください。
      </p>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => reset()}
          className="rounded-xl bg-[#007AFF] px-5 py-2.5 text-[13px] font-medium text-white"
        >
          再試行
        </button>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="rounded-xl border border-black/[0.08] px-5 py-2.5 text-[13px] font-medium text-gray-600"
        >
          再読み込み
        </button>
      </div>
    </div>
  );
}
