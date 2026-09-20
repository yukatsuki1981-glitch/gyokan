"use client";

import { useState, type FormEvent } from "react";
import type { AppEvent } from "@/lib/gyokan/types";
import { readDraft, type EventDraftFields } from "@/lib/gyokan/drafts";
import { eventFieldsFromItem } from "@/lib/gyokan/events";
import { useAutosaveForm } from "@/lib/gyokan/use-autosave-form";
import { XIcon, TrashIcon } from "./icons";

const inputClass =
  "w-full rounded-lg border border-black/[0.08] bg-white px-3 py-2 text-[13px] text-gray-900 outline-none transition-colors focus:border-blue-300 focus:ring-2 focus:ring-blue-50";
const labelClass = "mb-1 block text-[11px] font-medium text-gray-500";

type FormValues = EventDraftFields;

const EMPTY_VALUES: FormValues = { title: "", startTime: "09:00", endTime: "", memo: "" };

function FormFields({
  title,
  startTime,
  endTime,
  memo,
  onTitleChange,
  onStartTimeChange,
  onEndTimeChange,
  onMemoChange,
  autoFocus,
}: {
  title: string;
  startTime: string;
  endTime: string;
  memo: string;
  onTitleChange: (v: string) => void;
  onStartTimeChange: (v: string) => void;
  onEndTimeChange: (v: string) => void;
  onMemoChange: (v: string) => void;
  autoFocus?: boolean;
}) {
  return (
    <>
      <div>
        <span className={labelClass}>タイトル</span>
        <input
          type="text"
          value={title}
          onChange={(e) => onTitleChange(e.target.value)}
          className={inputClass}
          placeholder="予定のタイトル"
          autoFocus={autoFocus}
        />
      </div>

      <div className="flex gap-2">
        <div className="flex-1">
          <span className={labelClass}>開始時刻</span>
          <input
            type="time"
            value={startTime}
            onChange={(e) => onStartTimeChange(e.target.value)}
            className={inputClass}
          />
        </div>
        <div className="flex-1">
          <span className={labelClass}>終了時刻（任意）</span>
          <input
            type="time"
            value={endTime}
            onChange={(e) => onEndTimeChange(e.target.value)}
            className={inputClass}
          />
        </div>
      </div>

      <div>
        <span className={labelClass}>メモ（任意）</span>
        <textarea
          value={memo}
          onChange={(e) => onMemoChange(e.target.value)}
          rows={3}
          className={`${inputClass} resize-none`}
          placeholder="メモ"
        />
      </div>
    </>
  );
}

function FormHeader({ title, onClose }: { title: string; onClose: () => void }) {
  return (
    <div className="flex items-center justify-between">
      <h3 className="text-[13px] font-semibold text-gray-900">{title}</h3>
      <button
        type="button"
        onClick={onClose}
        aria-label="閉じる"
        className="flex h-7 w-7 items-center justify-center rounded-full bg-black/[0.04] text-gray-500 transition-colors hover:bg-black/[0.08]"
      >
        <XIcon className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

export function AddEventForm({
  onAdd,
  onClose,
}: {
  onAdd: (values: FormValues) => void;
  onClose: () => void;
}) {
  const [title, setTitle] = useState(EMPTY_VALUES.title);
  const [startTime, setStartTime] = useState(EMPTY_VALUES.startTime);
  const [endTime, setEndTime] = useState(EMPTY_VALUES.endTime);
  const [memo, setMemo] = useState(EMPTY_VALUES.memo);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    onAdd({ title: title.trim(), startTime, endTime, memo });
    onClose();
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      <FormHeader title="予定を追加" onClose={onClose} />
      <FormFields
        title={title}
        startTime={startTime}
        endTime={endTime}
        memo={memo}
        onTitleChange={setTitle}
        onStartTimeChange={setStartTime}
        onEndTimeChange={setEndTime}
        onMemoChange={setMemo}
        autoFocus
      />
      <button
        type="submit"
        disabled={!title.trim()}
        className="rounded-lg bg-[#007AFF] px-4 py-2 text-[13px] font-medium text-white transition-colors hover:bg-[#0066d6] disabled:opacity-50"
      >
        追加する
      </button>
    </form>
  );
}

export function EditEventForm({
  item,
  onSave,
  onDelete,
  onClose,
}: {
  item: AppEvent;
  onSave: (id: string, values: FormValues) => void | Promise<void | boolean>;
  onDelete: (id: string) => void;
  onClose: () => void;
}) {
  const initialDraft = readDraft<EventDraftFields>("event", item.id);
  const initial = initialDraft ?? eventFieldsFromItem(item);

  const [title, setTitle] = useState(initial.title);
  const [startTime, setStartTime] = useState(initial.startTime);
  const [endTime, setEndTime] = useState(initial.endTime);
  const [memo, setMemo] = useState(initial.memo);

  const values: FormValues = { title, startTime, endTime, memo };
  const baseline: FormValues = eventFieldsFromItem(item);

  useAutosaveForm({
    kind: "event",
    entityId: item.id,
    values,
    baseline,
    onPersist: async (v) => {
      if (!v.title.trim()) return false;
      const result = await onSave(item.id, v);
      return result !== false;
    },
  });

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    void onSave(item.id, values);
    onClose();
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      <FormHeader title="予定を編集" onClose={onClose} />
      <FormFields
        title={title}
        startTime={startTime}
        endTime={endTime}
        memo={memo}
        onTitleChange={setTitle}
        onStartTimeChange={setStartTime}
        onEndTimeChange={setEndTime}
        onMemoChange={setMemo}
      />
      <div className="flex items-center gap-2 pt-1">
        <button
          type="submit"
          disabled={!title.trim()}
          className="flex-1 rounded-lg bg-[#007AFF] px-4 py-2 text-[13px] font-medium text-white transition-colors hover:bg-[#0066d6] disabled:opacity-50"
        >
          保存する
        </button>
        <button
          type="button"
          onClick={() => {
            onDelete(item.id);
            onClose();
          }}
          aria-label="削除"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-black/[0.08] text-gray-400 transition-colors hover:bg-rose-50 hover:text-rose-500"
        >
          <TrashIcon className="h-4 w-4" />
        </button>
      </div>
    </form>
  );
}
