import type { ReactNode } from "react";

export function LegalPage({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="min-h-screen bg-[#fafafa] px-4 py-8 text-gray-800">
      <main className="mx-auto w-full max-w-2xl rounded-2xl border border-black/[0.06] bg-white p-6 shadow-sm sm:p-8">
        <p
          role="note"
          className="mb-6 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-center text-[14px] font-bold leading-relaxed text-amber-900"
        >
          ドラフト（公開前に内容の確認が必要です）
        </p>
        <h1 className="mb-6 text-xl font-semibold text-gray-900">{title}</h1>
        <div className="space-y-6 text-[14px] leading-relaxed">{children}</div>
      </main>
    </div>
  );
}

export function LegalSection({ heading, children }: { heading: string; children: ReactNode }) {
  return (
    <section>
      <h2 className="mb-2 text-[15px] font-semibold text-gray-900">{heading}</h2>
      <div className="space-y-2">{children}</div>
    </section>
  );
}

export function LegalList({ items }: { items: string[] }) {
  return (
    <ul className="list-disc space-y-1 pl-5">
      {items.map((item) => (
        <li key={item}>{item}</li>
      ))}
    </ul>
  );
}
