/**
 * Global Undo for Wonder — one stack for every feature.
 *
 * Shortcut: press **U** (when not typing in a field), same idea as ⌘C for copy.
 * Topbar shows a **U** button that does the same thing.
 *
 * Any feature that mutates saved state should call pushUndo() *before*
 * applying the change, with a restore function that puts the old value back.
 */

export type UndoEntry = {
  id: string;
  label: string;
  undo: () => void;
};

const MAX = 50;
let stack: UndoEntry[] = [];

export const UNDO_STACK_EVENT = "wonder-undo-stack-changed";
/** Features listen so React state reloads after a restore from outside the component */
export const UNDO_RESTORE_EVENT = "wonder-undo-restore";

function notify() {
  try {
    window.dispatchEvent(
      new CustomEvent(UNDO_STACK_EVENT, {
        detail: { depth: stack.length, label: peekUndoLabel() },
      })
    );
  } catch {
    /* ignore */
  }
}

export function pushUndo(label: string, undo: () => void): void {
  const entry: UndoEntry = {
    id: `u-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
    label: label || "Change",
    undo,
  };
  stack = [...stack.slice(-(MAX - 1)), entry];
  notify();
}

export function performUndo(): { ok: boolean; label?: string } {
  const entry = stack.pop();
  if (!entry) return { ok: false };
  try {
    entry.undo();
  } catch (err) {
    console.warn("Undo failed", err);
    notify();
    return { ok: false, label: entry.label };
  }
  notify();
  return { ok: true, label: entry.label };
}

export function canUndo(): boolean {
  return stack.length > 0;
}

export function peekUndoLabel(): string | null {
  return stack.length ? stack[stack.length - 1]!.label : null;
}

export function undoDepth(): number {
  return stack.length;
}

/** Clear stack (e.g. after full reimport). Rarely needed. */
export function clearUndoStack(): void {
  stack = [];
  notify();
}
