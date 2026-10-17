import { scopeThreadRef, scopedThreadKey } from "@t3tools/client-runtime/environment";
import type { EnvironmentThreadShell } from "@t3tools/client-runtime/state/models";
import type { ScopedThreadRef } from "@t3tools/contracts";
import {
  ChevronRightIcon,
  CircleAlertIcon,
  CircleDashedIcon,
  ClockIcon,
  MessageCircleQuestionIcon,
  ShieldQuestionIcon,
} from "lucide-react";
import { memo, useEffect, useState } from "react";

import { cn } from "~/lib/utils";
import {
  firstValidTimestampMs,
  formatWorkingDurationLabel,
  resolveSidebarRowAccessibility,
  resolveSidebarThreadStatus,
  sidebarSubagentCountLabel,
  sidebarSubagentElapsedStartedAt,
  sidebarSubagentGroupIsLive,
  sidebarSubagentShowsElapsed,
  sidebarSubagentStatusLabel,
  type SidebarThreadStatus,
} from "../Sidebar.logic";

const SUBAGENT_ROW_WINDOW = 6;

function SubagentElapsed(props: { readonly startedAt: string | null }) {
  const startedMs = props.startedAt !== null ? Date.parse(props.startedAt) : Number.NaN;
  const [, setTick] = useState(0);
  useEffect(() => {
    if (Number.isNaN(startedMs)) return;
    const id = window.setInterval(() => setTick((tick) => tick + 1), 1_000);
    return () => window.clearInterval(id);
  }, [startedMs]);
  if (Number.isNaN(startedMs)) return null;
  return <span className="tabular-nums">{formatWorkingDurationLabel(Date.now() - startedMs)}</span>;
}

function statusClassName(status: SidebarThreadStatus): string {
  switch (status) {
    case "working":
      return "text-info";
    case "approval":
      return "text-warning-foreground";
    case "input":
      return "text-indigo-600 dark:text-indigo-300";
    case "failed":
    case "limited":
      return "text-error";
    case "waiting":
    case "ready":
      return "text-muted-foreground";
  }
}

function StatusIcon(props: { readonly status: SidebarThreadStatus }) {
  const className = "size-3.5 shrink-0";
  switch (props.status) {
    case "working":
      return <CircleDashedIcon aria-hidden className={className} />;
    case "waiting":
      return <ClockIcon aria-hidden className={className} />;
    case "approval":
      return <ShieldQuestionIcon aria-hidden className={className} />;
    case "input":
      return <MessageCircleQuestionIcon aria-hidden className={className} />;
    case "failed":
    case "limited":
      return <CircleAlertIcon aria-hidden className={className} />;
    case "ready":
      return null;
  }
}

const SidebarSubagentRow = memo(function SidebarSubagentRow(props: {
  readonly thread: EnvironmentThreadShell;
  readonly isActive: boolean;
  readonly onOpen: (threadRef: ScopedThreadRef) => void;
}) {
  const { thread } = props;
  const status = resolveSidebarThreadStatus(thread);
  const label = sidebarSubagentStatusLabel(status);
  const startedAt = sidebarSubagentShowsElapsed(status)
    ? sidebarSubagentElapsedStartedAt(thread, status)
    : null;
  const accessibility = resolveSidebarRowAccessibility({
    title: thread.title,
    statusLabel: label,
    projectDisplayName: null,
    isActive: props.isActive,
  });
  return (
    <li className="list-none">
      <button
        type="button"
        data-testid="sidebar-subagent-row"
        aria-current={accessibility.current}
        aria-label={accessibility.label}
        title={thread.title}
        onClick={() => props.onOpen(scopeThreadRef(thread.environmentId, thread.id))}
        className={cn(
          "flex w-full cursor-pointer flex-col gap-0.5 rounded-md px-2 py-1.5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/70",
          props.isActive
            ? "bg-sidebar-row-active text-sidebar-foreground"
            : "hover:bg-sidebar-row-hover",
        )}
      >
        {label === null ? null : (
          <span
            className={cn(
              "inline-flex h-4 items-center gap-1 text-xs font-medium",
              statusClassName(status),
            )}
          >
            <StatusIcon status={status} />
            <span role="status">{label}</span>
            <SubagentElapsed startedAt={startedAt} />
          </span>
        )}
        <span className={cn("truncate text-sm", props.isActive ? "font-medium" : "font-normal")}>
          {thread.title}
        </span>
      </button>
    </li>
  );
});

/** Collapsible subagent rows nested under one sidebar thread. */
export const SidebarSubagentGroup = memo(function SidebarSubagentGroup(props: {
  readonly parentKey: string;
  readonly threads: readonly EnvironmentThreadShell[];
  readonly expanded: boolean;
  readonly activeThreadKey: string | null;
  readonly onExpandedChange: (parentKey: string, expanded: boolean) => void;
  readonly onOpen: (threadRef: ScopedThreadRef) => void;
}) {
  const panelId = `sidebar-subagents-${props.parentKey}`;
  const live = sidebarSubagentGroupIsLive(props.threads);
  const countLabel = sidebarSubagentCountLabel(props.threads.length);
  const [visibleCount, setVisibleCount] = useState(SUBAGENT_ROW_WINDOW);
  const ordered = [...props.threads].sort((left, right) => {
    const rank = (thread: EnvironmentThreadShell) => (sidebarSubagentGroupIsLive([thread]) ? 0 : 1);
    const byLive = rank(left) - rank(right);
    if (byLive !== 0) return byLive;
    return firstValidTimestampMs(left.createdAt) - firstValidTimestampMs(right.createdAt);
  });
  const shown = ordered.slice(0, visibleCount);
  const activeThread = ordered.find(
    (thread) =>
      scopedThreadKey(scopeThreadRef(thread.environmentId, thread.id)) === props.activeThreadKey,
  );
  const visibleThreads =
    activeThread !== undefined && !shown.includes(activeThread) ? [...shown, activeThread] : shown;
  const hiddenCount = ordered.length - visibleThreads.length;
  return (
    <>
      <li className="list-none">
        <button
          type="button"
          data-testid="sidebar-subagent-toggle"
          aria-expanded={props.expanded}
          aria-controls={panelId}
          onClick={() => props.onExpandedChange(props.parentKey, !props.expanded)}
          className="ms-2 flex h-7 w-[calc(100%-0.5rem)] cursor-pointer items-center gap-1.5 rounded-md px-2 text-left text-xs text-sidebar-muted-foreground hover:bg-sidebar-row-hover hover:text-sidebar-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/70"
        >
          <ChevronRightIcon
            aria-hidden
            className={cn("size-3 shrink-0 transition-transform", props.expanded && "rotate-90")}
          />
          {live ? (
            <span
              aria-hidden
              className="size-1.5 shrink-0 rounded-full bg-foreground animate-status-pulse"
            />
          ) : null}
          <span>{countLabel}</span>
        </button>
      </li>
      {props.expanded ? (
        <li id={panelId} className="list-none">
          <ul className="m-0 list-none border-l border-sidebar-border/80 ms-4 ps-1">
            {visibleThreads.map((thread) => {
              const threadKey = scopedThreadKey(scopeThreadRef(thread.environmentId, thread.id));
              return (
                <SidebarSubagentRow
                  key={threadKey}
                  thread={thread}
                  isActive={props.activeThreadKey === threadKey}
                  onOpen={props.onOpen}
                />
              );
            })}
            {hiddenCount > 0 ? (
              <li className="list-none">
                <button
                  type="button"
                  onClick={() => setVisibleCount((count) => count + SUBAGENT_ROW_WINDOW)}
                  className="flex h-7 w-full cursor-pointer items-center rounded-md px-2 text-left text-xs text-sidebar-muted-foreground hover:bg-sidebar-row-hover hover:text-sidebar-foreground"
                >
                  Show {Math.min(hiddenCount, SUBAGENT_ROW_WINDOW)} more
                </button>
              </li>
            ) : null}
          </ul>
        </li>
      ) : null}
    </>
  );
});
