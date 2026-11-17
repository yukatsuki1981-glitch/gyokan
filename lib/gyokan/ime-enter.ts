"use client";

import { useCallback, useMemo, useRef } from "react";
import type { KeyboardEvent } from "react";

/**
 * Enter presses that arrive this soon after compositionend are treated as the
 * IME's own "確定" Enter. Safari fires compositionend *before* the keydown of
 * the confirming Enter (with isComposing already false), so without this
 * window that Enter would look like a normal one.
 */
const POST_COMPOSITION_GRACE_MS = 50;

/** keyCode browsers report for keys that the IME is processing. */
const IME_PROCESS_KEY_CODE = 229;

type ImeState = { composing: boolean; endedAt: number };

/**
 * True when this keydown belongs to IME composition (変換中 or the Enter
 * that confirms the conversion) rather than a deliberate key press.
 */
export function isImeComposingKeyEvent(
  e: Pick<KeyboardEvent, "nativeEvent" | "keyCode">,
  state?: ImeState,
  now: number = Date.now(),
): boolean {
  if (e.nativeEvent.isComposing) return true;
  if (e.keyCode === IME_PROCESS_KEY_CODE) return true;
  if (!state) return false;
  if (state.composing) return true;
  return now - state.endedAt < POST_COMPOSITION_GRACE_MS;
}

/**
 * Tracks IME composition on an input so an Enter that only confirms a
 * Japanese conversion is not mistaken for "submit". Spread `compositionProps`
 * onto the input and check `isSubmitEnter(e)` in onKeyDown.
 *
 *   const ime = useImeEnterGuard();
 *   <input {...ime.compositionProps}
 *     onKeyDown={(e) => ime.isSubmitEnter(e) && submit()} />
 */
export function useImeEnterGuard() {
  const stateRef = useRef<ImeState>({ composing: false, endedAt: 0 });

  const onCompositionStart = useCallback(() => {
    stateRef.current.composing = true;
  }, []);

  const onCompositionEnd = useCallback(() => {
    stateRef.current = { composing: false, endedAt: Date.now() };
  }, []);

  const isSubmitEnter = useCallback((e: KeyboardEvent) => {
    if (e.key !== "Enter") return false;
    return !isImeComposingKeyEvent(e, stateRef.current);
  }, []);

  const compositionProps = useMemo(
    () => ({ onCompositionStart, onCompositionEnd }),
    [onCompositionStart, onCompositionEnd],
  );

  return { compositionProps, isSubmitEnter };
}
