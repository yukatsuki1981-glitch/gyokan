"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import type { AuthChangeEvent, Session } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";
import {
  DISPLAY_NAME_MAX,
  acceptHouseholdInvite,
  checkHouseholdInvite,
  clearPendingInvite,
  fetchMyDisplayName,
  householdErrorMessage,
  saveMyDisplayName,
  savePendingInvite,
  type InviteCheckStatus,
} from "@/lib/gyokan/household";

type AuthState = "checking" | "signedOut" | "signedIn";

// How long a "no session" first callback is trusted to be real: on a fresh
// tab GoTrue can report no session for a moment while it refreshes a stored
// token (same reasoning as lib/gyokan/use-gyokan-data.ts).
const INITIAL_NULL_GRACE_MS = 2500;

const STATUS_MESSAGES: Partial<Record<InviteCheckStatus, string>> = {
  invalid: "この招待リンクは無効か、すでに使われています。招待した人に、新しいリンクを作ってもらってください。",
  already_member: "すでにこの家族の予定の共有に参加しています。",
  full: "この家族の予定の共有は、すでに上限の人数に達しています。",
  in_other_shared_household: "すでに別の家族と予定を共有しているため、この招待には参加できません。",
};

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--gyokan-bg)] px-5 py-10">
      <div className="w-full max-w-sm rounded-2xl border border-black/[0.06] bg-white p-6 shadow-[0_8px_24px_rgba(0,0,0,0.06)]">
        {children}
      </div>
    </div>
  );
}

export default function InvitePage() {
  const router = useRouter();
  const params = useParams<{ token: string }>();
  const token = typeof params.token === "string" ? params.token : "";

  const [authState, setAuthState] = useState<AuthState>("checking");
  const [userId, setUserId] = useState<string | null>(null);
  const [status, setStatus] = useState<InviteCheckStatus | null>(null);
  const [myEventCount, setMyEventCount] = useState(0);
  const [displayName, setDisplayName] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Session from onAuthStateChange only — never getSession() (see CLAUDE.md).
  useEffect(() => {
    const supabase = createClient();
    let graceTimer: ReturnType<typeof setTimeout> | null = null;
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event: AuthChangeEvent, session: Session | null) => {
      if (session?.user) {
        if (graceTimer) clearTimeout(graceTimer);
        setUserId(session.user.id);
        setAuthState("signedIn");
        return;
      }
      if (event === "INITIAL_SESSION") {
        graceTimer = setTimeout(() => setAuthState((s) => (s === "checking" ? "signedOut" : s)), INITIAL_NULL_GRACE_MS);
        return;
      }
      setUserId(null);
      setAuthState("signedOut");
    });
    return () => {
      if (graceTimer) clearTimeout(graceTimer);
      subscription.unsubscribe();
    };
  }, []);

  // Signed in: is this invite usable by me? (Says nothing about the household.)
  useEffect(() => {
    if (authState !== "signedIn" || !userId) return;
    let cancelled = false;
    (async () => {
      const supabase = createClient();
      try {
        const result = await checkHouseholdInvite(supabase, token);
        if (cancelled) return;
        // The invite is on screen now — no need to bring the user back to it.
        clearPendingInvite();
        setStatus(result.status);
        setMyEventCount(result.myEventCount);
        if (result.status === "ok") {
          const name = await fetchMyDisplayName(supabase, userId);
          if (!cancelled) setDisplayName(name ?? "");
        }
      } catch (err) {
        if (!cancelled) setError(householdErrorMessage(err));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [authState, userId, token]);

  const goToLogin = useCallback(() => {
    savePendingInvite(token);
    router.push(`/login?next=${encodeURIComponent(`/invite/${token}`)}`);
  }, [router, token]);

  const join = async () => {
    if (!userId || !confirmed) return;
    setJoining(true);
    setError(null);
    const supabase = createClient();
    try {
      if (displayName.trim()) await saveMyDisplayName(supabase, userId, displayName);
      await acceptHouseholdInvite(supabase, token);
      clearPendingInvite();
      window.location.href = "/?mode=private";
    } catch (err) {
      setError(householdErrorMessage(err));
      setJoining(false);
    }
  };

  if (authState === "checking" || (authState === "signedIn" && status === null && !error)) {
    return (
      <Card>
        <p className="text-center text-[13px] text-gray-400">確認しています…</p>
      </Card>
    );
  }

  if (authState === "signedOut") {
    return (
      <Card>
        <h1 className="mb-2 text-[17px] font-semibold text-gray-900">家族の予定の共有に招待されています</h1>
        <p className="mb-5 text-[13px] leading-relaxed text-gray-500">
          参加すると、行間のプライベートモードの予定を、家族と一緒に見て、追加・編集できるようになります。まずログイン(または新規登録)してください。
        </p>
        <button
          type="button"
          onClick={goToLogin}
          className="w-full rounded-xl bg-[var(--gyokan-accent2)] py-3 text-[14px] font-semibold text-white"
        >
          ログインして参加する
        </button>
      </Card>
    );
  }

  if (status && status !== "ok") {
    return (
      <Card>
        <h1 className="mb-2 text-[17px] font-semibold text-gray-900">招待に参加できません</h1>
        <p className="mb-5 text-[13px] leading-relaxed text-gray-500">
          {STATUS_MESSAGES[status] ?? "この招待には参加できません。"}
        </p>
        <Link href="/" className="block w-full rounded-xl border border-black/[0.08] py-3 text-center text-[14px] font-medium text-gray-700">
          行間を開く
        </Link>
      </Card>
    );
  }

  return (
    <Card>
      <h1 className="mb-2 text-[17px] font-semibold text-gray-900">家族の予定の共有に参加</h1>
      <div className="mb-4 rounded-xl bg-amber-50 px-4 py-3 text-[13px] leading-relaxed text-amber-800">
        参加すると、<span className="font-semibold">あなたの既存の予定({myEventCount}件)が、家族と共有されます。</span>
        家族も、その予定を見て、編集・削除できるようになります。タスクは共有されません。
      </div>
      <label className="mb-4 flex flex-col gap-1">
        <span className="text-[12px] font-medium text-gray-500">表示名(家族に表示されます)</span>
        <input
          type="text"
          value={displayName}
          maxLength={DISPLAY_NAME_MAX}
          onChange={(e) => setDisplayName(e.target.value)}
          placeholder="例: ゆう"
          className="rounded-xl border border-black/[0.08] bg-white px-3 py-2.5 text-[14px] text-gray-900 outline-none focus:border-[var(--gyokan-accent2)]"
        />
        <span className="text-[11px] text-gray-400">あとから設定画面で変更できます。未設定の間は「家族」と表示されます。</span>
      </label>
      <label className="mb-5 flex items-start gap-2 text-[13px] text-gray-700">
        <input
          type="checkbox"
          checked={confirmed}
          onChange={(e) => setConfirmed(e.target.checked)}
          className="mt-0.5 rounded border-gray-300"
        />
        あなたの既存の予定が、家族と共有されることを確認しました
      </label>
      {error && (
        <p role="alert" className="mb-3 rounded-xl bg-red-50 px-3 py-2 text-[13px] text-red-600">
          {error}
        </p>
      )}
      <button
        type="button"
        disabled={!confirmed || joining}
        onClick={() => void join()}
        className="w-full rounded-xl bg-[var(--gyokan-accent2)] py-3 text-[14px] font-semibold text-white disabled:opacity-40"
      >
        {joining ? "参加しています…" : "共有して参加する"}
      </button>
      <Link href="/" className="mt-3 block text-center text-[12px] text-gray-400">
        参加しないで行間を開く
      </Link>
    </Card>
  );
}
