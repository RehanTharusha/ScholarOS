/**
 * View-state reducer (Plan 03).
 *
 * Replaces the 10+ mutually-exclusive boolean flags that drive view
 * switching in App.tsx (`isGraphOpen`, `isBrowserOpen`,
 * `isArtifactsOpen`, `isCanvasesOpen`, `isCanvasOpen`,
 * `isCalendarOpen`, `isSuggestedTopicsOpen`, `isRightPaneMaximized`,
 * `isReviewOpen`, `isFocusMode`, plus the `selectedPath` and
 * `expandedFrom` state). The flags all describe a single piece of
 * state — "what view is the user looking at right now?" — and the
 * reducer handles their mutual exclusion in one place.
 *
 * Migration plan: the reducer and types are introduced here.
 * App.tsx is NOT rewritten in this change. The point of this module
 * is to be a drop-in target for follow-up work: components can call
 * `useViewState()` and dispatch actions without App.tsx needing
 * to know.
 */
import { useReducer } from "react";

export type ViewState =
  | { type: "chat"; runId: string | null }
  | { type: "file"; path: string }
  | { type: "graph" }
  | { type: "suggested-topics" }
  | { type: "artifacts" }

/**
 * Layout modifiers (orthogonal to the main view: you can have a
 * calendar open with the right sidebar maximized at the same time).
 */
export interface LayoutState {
  rightPaneOpen: boolean;
  rightPaneMaximized: boolean;
  leftPaneOpen: boolean;
  searchOpen: boolean;
  focusMode: boolean;
  reviewOpen: boolean;
  rightPaneTarget?: "left" | "right";
}

export interface ViewStoreState {
  mainView: ViewState;
  layout: LayoutState;
  /** Navigation history for back/forward. */
  backStack: ViewState[];
  forwardStack: ViewState[];
  /** What view was active when right pane was expanded (for restore). */
  expandedFrom?: ViewState;
}

export type ViewAction =
  | { type: "NAVIGATE_TO"; view: ViewState; recordHistory?: boolean }
  | { type: "NAVIGATE_BACK" }
  | { type: "NAVIGATE_FORWARD" }
  | { type: "TOGGLE_RIGHT_PANEL" }
  | { type: "TOGGLE_LEFT_PANEL" }
  | { type: "TOGGLE_MAXIMIZED" }
  | { type: "TOGGLE_SEARCH" }
  | { type: "TOGGLE_FOCUS_MODE" }
  | { type: "TOGGLE_REVIEW" }
  | { type: "RESET_LAYOUT" };

export const initialViewState: ViewStoreState = {
  mainView: { type: "chat", runId: null },
  layout: {
    rightPaneOpen: true,
    rightPaneMaximized: false,
    leftPaneOpen: true,
    searchOpen: false,
    focusMode: false,
    reviewOpen: false,
  },
  backStack: [],
  forwardStack: [],
};

function toggleLayout(
  state: ViewStoreState,
  key: keyof LayoutState,
): ViewStoreState {
  return { ...state, layout: { ...state.layout, [key]: !state.layout[key] } };
}

export function viewReducer(
  state: ViewStoreState,
  action: ViewAction,
): ViewStoreState {
  switch (action.type) {
    case "NAVIGATE_TO": {
      if (
        action.recordHistory !== false &&
        state.mainView.type !== action.view.type
      ) {
        return {
          ...state,
          backStack: [...state.backStack, state.mainView],
          forwardStack: [],
          mainView: action.view,
          // If a non-chat view is selected, close the right pane.
          layout:
            action.view.type === "chat"
              ? state.layout
              : { ...state.layout, rightPaneOpen: false },
        };
      }
      return { ...state, mainView: action.view };
    }
    case "NAVIGATE_BACK": {
      if (state.backStack.length === 0) return state;
      const previous = state.backStack[state.backStack.length - 1];
      return {
        ...state,
        forwardStack: [...state.forwardStack, state.mainView],
        backStack: state.backStack.slice(0, -1),
        mainView: previous,
      };
    }
    case "NAVIGATE_FORWARD": {
      if (state.forwardStack.length === 0) return state;
      const next = state.forwardStack[state.forwardStack.length - 1];
      return {
        ...state,
        backStack: [...state.backStack, state.mainView],
        forwardStack: state.forwardStack.slice(0, -1),
        mainView: next,
      };
    }
    case "TOGGLE_RIGHT_PANEL":
      return toggleLayout(state, "rightPaneOpen");
    case "TOGGLE_LEFT_PANEL":
      return toggleLayout(state, "leftPaneOpen");
    case "TOGGLE_MAXIMIZED":
      return toggleLayout(state, "rightPaneMaximized");
    case "TOGGLE_SEARCH":
      return toggleLayout(state, "searchOpen");
    case "TOGGLE_FOCUS_MODE":
      return toggleLayout(state, "focusMode");
    case "TOGGLE_REVIEW":
      return toggleLayout(state, "reviewOpen");
    case "RESET_LAYOUT":
      return { ...state, layout: initialViewState.layout };
  }
}

/**
 * Helpers for deriving a view's "active" state from a ViewState.
 * These let the existing `isXOpen` checks be replaced
 * incrementally.
 */
export const isFileView = (v: ViewState) => v.type === "file";
export const isGraphView = (v: ViewState) => v.type === "graph";
export const isBrowserView = (v: ViewState) => v.type === "browser";
export const isArtifactsView = (v: ViewState) => v.type === "artifacts";
export const isCanvasesView = (v: ViewState) => v.type === "canvases";
export const isCanvasView = (v: ViewState) => v.type === "canvas";
export const isCalendarView = (v: ViewState) => v.type === "calendar";
export const isSuggestedTopicsView = (v: ViewState) =>
  v.type === "suggested-topics";
export const isChatView = (v: ViewState) => v.type === "chat";
export const isIngestView = (v: ViewState) => v.type === "ingest";

/**
 * Hook wrapper: returns the current state plus a stable dispatch.
 * Same API as `useReducer`.
 */
export function useViewState(initial: ViewStoreState = initialViewState) {
  return useReducer(viewReducer, initial);
}

  | { type: "canvases" }
  | { type: "canvas"; path: string }
  | { type: "calendar" }
  | { type: "browser" }
  | { type: "ingest"; path?: string };
