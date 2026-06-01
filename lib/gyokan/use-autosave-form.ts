"use client";

import { useCallback, useEffect, useRef } from "react";
import { type DraftKind, writeDraft } from "./drafts";

type UseAutosaveFormOptions<T> = {
  kind: DraftKind;
  entityId: string;
  values: T;
  baseline: T;
  enabled?: boolean;
  debounceMs?: number;
  isEqual?: (a: T, b: T) => boolean;
  /** Return false when persistence failed (draft is kept). */
  onPersist: (values: T) => void | boolean | Promise<void | boolean>;
};

function defaultIsEqual<T>(a: T, b: T) {
  return JSON.stringify(a) === JSON.stringify(b);
}

export function useAutosaveForm<T>({
  kind,
  entityId,
  values,
  baseline,
  enabled = true,
  debounceMs = 400,
  isEqual = defaultIsEqual,
  onPersist,
}: UseAutosaveFormOptions<T>) {
  const valuesRef = useRef(values);
  const baselineRef = useRef(baseline);
  const onPersistRef = useRef(onPersist);
  valuesRef.current = values;
  baselineRef.current = baseline;
  onPersistRef.current = onPersist;

  useEffect(() => {
    writeDraft(kind, entityId, values);
  }, [kind, entityId, values]);

  const flush = useCallback(async () => {
    const current = valuesRef.current;
    const base = baselineRef.current;
    if (!enabled || isEqual(current, base)) return;
    const result = await onPersistRef.current(current);
    if (result === false) return;
  }, [enabled, isEqual]);

  useEffect(() => {
    if (!enabled) return;
    if (isEqual(values, baselineRef.current)) return;

    const timer = setTimeout(() => {
      void flush();
    }, debounceMs);
    return () => clearTimeout(timer);
  }, [values, enabled, debounceMs, flush, isEqual]);

  useEffect(() => {
    return () => {
      void flush();
    };
  }, [entityId, flush]);

  useEffect(() => {
    const onPageHide = () => {
      void flush();
    };
    window.addEventListener("pagehide", onPageHide);
    return () => window.removeEventListener("pagehide", onPageHide);
  }, [flush]);
}
