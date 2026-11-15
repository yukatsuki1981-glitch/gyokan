import type { ReactNode } from "react";

export function AuthCard({ subtitle, children }: { subtitle: string; children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[#fafafa] px-6 py-8">
      <div className="w-full max-w-sm rounded-2xl border border-black/[0.06] bg-white p-8 shadow-sm">
        <div className="mb-6 flex flex-col items-center text-center">
          <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-[#007AFF] text-lg font-bold text-white shadow-sm">
            行
          </div>
          <h1 className="text-xl font-semibold text-gray-900">行間</h1>
          <p className="mt-2 text-[13px] leading-relaxed text-gray-500">{subtitle}</p>
        </div>
        {children}
      </div>
    </div>
  );
}

export function AuthNotice({ tone, children }: { tone: "error" | "success"; children: ReactNode }) {
  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      className={
        tone === "error"
          ? "mb-4 rounded-xl bg-red-50 px-3 py-2 text-center text-[13px] leading-relaxed text-red-600"
          : "mb-4 rounded-xl bg-emerald-50 px-3 py-2 text-center text-[13px] leading-relaxed text-emerald-700"
      }
    >
      {children}
    </div>
  );
}

export const authPrimaryButtonClass =
  "w-full rounded-xl bg-[#007AFF] px-4 py-3 text-[14px] font-medium text-white transition-colors hover:bg-[#0066d6] disabled:opacity-60";

export const authTextLinkClass =
  "w-full text-center text-[12px] text-gray-500 transition-colors hover:text-[#007AFF]";
