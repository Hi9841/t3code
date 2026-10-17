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
import { memo, useEffect, useLayoutEffect, useRef, useState } from "react";

import { cn } from "~/lib/utils";
import type { ProviderInstanceEntry } from "../../providerInstances";
import { ProviderInstanceIcon } from "../chat/ProviderInstanceIcon";
import {
  firstValidTimestampMs,
  formatWorkingDurationLabel,
  resolveSidebarThreadStatus,
  sidebarSubagentCountLabel,
  sidebarSubagentElapsedStartedAt,
  sidebarSubagentGroupIsLive,
  sidebarSubagentShowsElapsed,
  sidebarSubagentStatusLabel,
  type SidebarThreadStatus,
} from "../Sidebar.logic";

const SUBAGENT_ROW_WINDOW = 6;
const CLUSTER_CAP = 3;
const MOVE_EASE = "cubic-bezier(0.77, 0, 0.175, 1)";
const OUT_EASE = "cubic-bezier(0.23, 1, 0.32, 1)";

function prefersReducedMotion() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

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

function ProviderMark(props: { readonly provider: ProviderInstanceEntry | null }) {
  if (!props.provider) {
    return <span aria-hidden className="size-3.5 shrink-0 rounded-full bg-muted-foreground/30" />;
  }
  return (
    <ProviderInstanceIcon
      driverKind={props.provider.driverKind}
      displayName={props.provider.displayName}
      accentColor={props.provider.accentColor}
      acpRegistryAgentId={props.provider.acpRegistryAgentId}
      acpRegistryIconUrl={props.provider.acpRegistryIconUrl}
      className="size-3.5 shrink-0"
      iconClassName="size-3.5"
    />
  );
}

/** Collapsible subagent rows inside one sidebar thread card. */
export const SidebarSubagentGroup = memo(function SidebarSubagentGroup(props: {
  readonly parentKey: string;
  readonly threads: readonly EnvironmentThreadShell[];
  readonly providerEntryByInstanceId: ReadonlyMap<string, ProviderInstanceEntry>;
  readonly expanded: boolean;
  readonly activeThreadKey: string | null;
  readonly onExpandedChange: (parentKey: string, expanded: boolean) => void;
  readonly onOpen: (threadRef: ScopedThreadRef) => void;
}) {
  const panelId = `sidebar-subagents-${props.parentKey}`;
  const countLabel = sidebarSubagentCountLabel(props.threads.length);
  const [visibleCount, setVisibleCount] = useState(SUBAGENT_ROW_WINDOW);
  const rootRef = useRef<HTMLDivElement>(null);
  const clusterRefs = useRef<Array<HTMLSpanElement | null>>([]);
  const rowRefs = useRef<Array<HTMLSpanElement | null>>([]);
  const iconRefs = useRef<Array<HTMLSpanElement | null>>([]);
  const pointsRef = useRef<Array<{ x: number; y: number }>>([]);
  const visibleRef = useRef<readonly EnvironmentThreadShell[]>([]);
  const expandedRef = useRef(props.expanded);
  const ordered = [...props.threads].sort((left, right) => {
    const rank = (thread: EnvironmentThreadShell) => (sidebarSubagentGroupIsLive([thread]) ? 0 : 1);
    const byLive = rank(left) - rank(right);
    return byLive !== 0
      ? byLive
      : firstValidTimestampMs(left.createdAt) - firstValidTimestampMs(right.createdAt);
  });
  const shown = ordered.slice(0, visibleCount);
  const activeThread = ordered.find(
    (thread) =>
      scopedThreadKey(scopeThreadRef(thread.environmentId, thread.id)) === props.activeThreadKey,
  );
  const visibleThreads =
    activeThread !== undefined && !shown.includes(activeThread) ? [...shown, activeThread] : shown;
  const hiddenCount = ordered.length - visibleThreads.length;
  const clusterCount = Math.min(visibleThreads.length, CLUSTER_CAP);
  const flightKey = `${props.expanded}:${visibleThreads.map((thread) => thread.id).join("|")}`;
  visibleRef.current = visibleThreads;
  expandedRef.current = props.expanded;

  useLayoutEffect(() => {
    const root = rootRef.current?.getBoundingClientRect();
    if (!root) return;
    const reduced = prefersReducedMotion();
    const expanded = expandedRef.current;
    const threads = visibleRef.current;
    const previous = pointsRef.current;
    const next = threads.map((_, index) => {
      const slot = (expanded ? rowRefs : clusterRefs).current[
        expanded ? index : Math.min(index, CLUSTER_CAP - 1)
      ]?.getBoundingClientRect();
      if (!slot) return previous[index] ?? { x: 0, y: 0 };
      return { x: slot.left - root.left, y: slot.top - root.top };
    });
    const duration = reduced ? 0 : expanded ? 220 : 140;
    threads.forEach((_, index) => {
      const node = iconRefs.current[index];
      const from = previous[index];
      const to = next[index];
      if (!node || !to) return;
      if (!from || duration === 0) {
        node.style.transition = "none";
        node.style.transform = `translate3d(${to.x}px, ${to.y}px, 0)`;
        return;
      }
      node.style.transition = "none";
      node.style.transform = `translate3d(${from.x}px, ${from.y}px, 0)`;
      requestAnimationFrame(() => {
        node.style.transition = `transform ${duration}ms ${MOVE_EASE}`;
        node.style.transform = `translate3d(${to.x}px, ${to.y}px, 0)`;
      });
    });
    pointsRef.current = next;
  }, [flightKey]);

  return (
    <div ref={rootRef} className="relative px-(--sidebar-row-content-inset) pb-1">
      <button
        type="button"
        data-testid="sidebar-subagent-toggle"
        aria-expanded={props.expanded}
        aria-controls={panelId}
        aria-label={countLabel}
        onClick={(event) => {
          event.stopPropagation();
          props.onExpandedChange(props.parentKey, !props.expanded);
        }}
        className="group inline-flex h-6 cursor-pointer items-center gap-1.5 rounded-md text-xs text-sidebar-muted-foreground hover:text-sidebar-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/70"
      >
        <span className="inline-flex items-center gap-1">
          {Array.from({ length: clusterCount }, (_, index) => (
            <span
              key={index}
              ref={(node) => {
                clusterRefs.current[index] = node;
              }}
              className="size-3.5"
            />
          ))}
        </span>
        <span className="inline-flex items-center gap-1 transition-transform duration-150 ease-out group-active:scale-[0.97] motion-reduce:transition-none">
          <span className="tabular-nums">{props.threads.length}</span>
          <ChevronRightIcon
            aria-hidden
            className="size-3"
            style={{
              transform: props.expanded ? "rotate(90deg)" : "rotate(0deg)",
              transition: prefersReducedMotion() ? "none" : `transform 160ms ${OUT_EASE}`,
            }}
          />
        </span>
      </button>
      <div
        id={panelId}
        inert={props.expanded ? undefined : true}
        className={cn("grid", props.expanded ? "grid-rows-[1fr]" : "grid-rows-[0fr]")}
        style={{
          transition: prefersReducedMotion() ? "none" : `grid-template-rows 200ms ${MOVE_EASE}`,
        }}
      >
        <div className="min-h-0 overflow-hidden">
          <ul className="m-0 list-none pt-0.5">
            {visibleThreads.map((thread, index) => {
              const threadKey = scopedThreadKey(scopeThreadRef(thread.environmentId, thread.id));
              const status = resolveSidebarThreadStatus(thread);
              const label = sidebarSubagentStatusLabel(status);
              const provider =
                props.providerEntryByInstanceId.get(thread.providerInstanceId) ?? null;
              const startedAt = sidebarSubagentShowsElapsed(status)
                ? sidebarSubagentElapsedStartedAt(thread, status)
                : null;
              const accessible = [thread.title, provider?.displayName, label]
                .filter(Boolean)
                .join(", ");
              return (
                <li key={threadKey} className="list-none">
                  <button
                    type="button"
                    data-testid="sidebar-subagent-row"
                    aria-current={props.activeThreadKey === threadKey ? "page" : undefined}
                    aria-label={accessible}
                    title={
                      provider === null ? thread.title : `${thread.title}, ${provider.displayName}`
                    }
                    onClick={(event) => {
                      event.stopPropagation();
                      props.onOpen(scopeThreadRef(thread.environmentId, thread.id));
                    }}
                    className={cn(
                      "flex h-5 w-full cursor-pointer items-center gap-1.5 rounded-md text-left hover:bg-sidebar-row-hover active:bg-sidebar-row-active focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/70",
                      props.activeThreadKey === threadKey && "bg-sidebar-row-active",
                    )}
                  >
                    <span
                      ref={(node) => {
                        rowRefs.current[index] = node;
                      }}
                      className="size-3.5 shrink-0"
                    />
                    <span className="min-w-0 flex-1 truncate text-[13px]">{thread.title}</span>
                    {label === null ? null : (
                      <span
                        className={cn(
                          "inline-flex shrink-0 items-center gap-1 text-[11px]",
                          statusClassName(status),
                        )}
                      >
                        <StatusIcon status={status} />
                        <span className="sr-only">{label}</span>
                        <SubagentElapsed startedAt={startedAt} />
                      </span>
                    )}
                  </button>
                </li>
              );
            })}
            {hiddenCount > 0 ? (
              <li className="list-none">
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    setVisibleCount((count) => count + SUBAGENT_ROW_WINDOW);
                  }}
                  className="flex h-6 w-full cursor-pointer items-center rounded-md text-left text-xs text-sidebar-muted-foreground hover:text-sidebar-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/70"
                >
                  Show {Math.min(hiddenCount, SUBAGENT_ROW_WINDOW)} more
                </button>
              </li>
            ) : null}
          </ul>
        </div>
      </div>
      {visibleThreads.map((thread, index) => (
        <span
          key={thread.id}
          ref={(node) => {
            iconRefs.current[index] = node;
          }}
          aria-hidden
          className="pointer-events-none absolute top-0 left-0"
        >
          <ProviderMark
            provider={props.providerEntryByInstanceId.get(thread.providerInstanceId) ?? null}
          />
        </span>
      ))}
    </div>
  );
});
