/** Shared navigation event used by Mel tools and the Wonder shell. */
export const MEL_NAVIGATE_EVENT = "wonder-mel-navigate";

/**
 * Mel never edits workspace storage directly. It requests one of these bounded
 * actions and the mounted Wonder shell applies it to the live React workspace.
 */
export const MEL_WORKSPACE_ACTION_EVENT = "wonder-mel-workspace-action";
export const MEL_SIDEBAR_ACTION_EVENT = "wonder-mel-sidebar-action";
export const MEL_PROMPT_EVENT = "wonder-mel-prompt";
/** Open Mel panel in Science mode (Math Empire + metrics). */
export const MEL_OPEN_SCIENCE_EVENT = "wonder-mel-open-science";

export type MelPromptRequest = {
  text: string;
};

export type MelPageReference = {
  id?: string;
  title?: string;
  current?: boolean;
};

export type MelWorkspaceAction =
  | {
      kind: "create-page";
      title?: string;
      parent?: MelPageReference | null;
      asAgent?: boolean;
      content?: string;
    }
  | { kind: "open-page"; target: MelPageReference }
  | { kind: "list-pages" }
  | { kind: "rename-page"; target: MelPageReference; title: string }
  | { kind: "trash-page"; target: MelPageReference }
  | { kind: "restore-page"; target: MelPageReference }
  | { kind: "duplicate-page"; target: MelPageReference }
  | {
      kind: "move-page";
      target: MelPageReference;
      destination: MelPageReference;
      position: "inside" | "before" | "after";
    }
  /**
   * Put a page at the top of a sidebar section (parent = null),
   * e.g. Bookshelf back under Learn when it got nested under Work.
   */
  | {
      kind: "make-section-root";
      target: MelPageReference;
      section: "health" | "learn" | "work";
    }
  | {
      kind: "write-page";
      target: MelPageReference;
      content: string;
      mode: "append" | "replace";
      blockType?: "paragraph" | "heading1" | "heading2" | "heading3" | "bullet" | "numbered" | "todo" | "quote" | "callout";
    }
  | { kind: "clear-page"; target: MelPageReference }
  | { kind: "favorite-page"; target: MelPageReference; favorite: boolean }
  | { kind: "undo-workspace" };

export type MelWorkspaceActionResult = {
  ok: boolean;
  summary: string;
  pageId?: string;
  pageTitle?: string;
  data?: unknown;
};

export type MelWorkspaceActionRequest = {
  action: MelWorkspaceAction;
  result?: MelWorkspaceActionResult;
};

export type MelSidebarAction =
  | { kind: "collapse-all" }
  | { kind: "set-section"; target: string; collapsed: boolean };

export type MelSidebarActionRequest = {
  action: MelSidebarAction;
  result?: MelWorkspaceActionResult;
};

export function requestMelWorkspaceAction(
  action: MelWorkspaceAction
): MelWorkspaceActionResult {
  if (typeof window === "undefined") {
    return { ok: false, summary: "The Wonder workspace is not open." };
  }
  const request: MelWorkspaceActionRequest = { action };
  window.dispatchEvent(
    new CustomEvent<MelWorkspaceActionRequest>(MEL_WORKSPACE_ACTION_EVENT, {
      detail: request,
    })
  );
  return (
    request.result || {
      ok: false,
      summary: "The workspace action handler is not ready yet.",
    }
  );
}

export function requestMelSidebarAction(
  action: MelSidebarAction
): MelWorkspaceActionResult {
  if (typeof window === "undefined") {
    return { ok: false, summary: "The Wonder sidebar is not open." };
  }
  const request: MelSidebarActionRequest = { action };
  window.dispatchEvent(
    new CustomEvent<MelSidebarActionRequest>(MEL_SIDEBAR_ACTION_EVENT, {
      detail: request,
    })
  );
  return (
    request.result || {
      ok: false,
      summary: "The sidebar action handler is not ready yet.",
    }
  );
}

/** Open Mel and ask a contextual question from anywhere in Wonder. */
export function requestMelPrompt(text: string): void {
  if (typeof window === "undefined" || !text.trim()) return;
  window.dispatchEvent(
    new CustomEvent<MelPromptRequest>(MEL_PROMPT_EVENT, {
      detail: { text: text.trim() },
    })
  );
}
