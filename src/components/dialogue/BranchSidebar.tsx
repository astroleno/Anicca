"use client";

import { DialogueBreadcrumbItem, DialogueSidebarItem } from "@/features/dialectic/viewModel";
import styles from "./DialogueShell.module.css";

type BranchSidebarProps = {
  breadcrumb: DialogueBreadcrumbItem[];
  items: DialogueSidebarItem[];
  pendingRoot?: {
    label: string;
    summary: string;
  } | null;
  onSelect: (nodeId: string) => void;
};

export function BranchSidebar({ breadcrumb, items, pendingRoot = null, onSelect }: BranchSidebarProps) {
  return (
    <aside className={styles.sidebar} aria-label="对话谱系" data-testid="dialogue-sidebar">
      <div className={styles.sidebarHeader}>
        <p className={styles.eyebrow}>谱系</p>
        <nav className={styles.breadcrumb} aria-label="当前路径">
          {breadcrumb.map((item) => (
            <button
              key={item.id}
              type="button"
              className={styles.breadcrumbButton}
              onClick={() => onSelect(item.id)}
            >
              <span>{item.label}</span>
              {item.branchType ? <small>{item.branchType}</small> : null}
            </button>
          ))}
        </nav>
      </div>

      <nav className={styles.sidebarTree} aria-label="分支列表">
        {pendingRoot ? (
          <div className={[styles.sidebarItem, styles.sidebarPendingItem].join(" ")} role="status" aria-live="polite">
            <span className={styles.sidebarItemMain}>
              <span className={styles.sidebarItemLabelGroup}>
                <span className={styles.sidebarItemLabel}>{pendingRoot.label}</span>
              </span>
              <small>生成中</small>
            </span>
            <span className={styles.sidebarItemSummary}>{pendingRoot.summary}</span>
          </div>
        ) : null}
        {items.map((item) => {
          const isSynthesisEvent = item.displayRole === "synthesis-event";

          if (isSynthesisEvent) {
            const sourceDescription = item.sourceLabels.length
              ? `，来源：${item.sourceLabels.join(" / ")}`
              : "";
            return (
              <button
                key={item.id}
                type="button"
                aria-label={`合流记录：${item.label}${sourceDescription}`}
                aria-current={item.isFocused ? "true" : undefined}
                className={[
                  styles.sidebarSynthesisEvent,
                  item.isFocused ? styles.sidebarItemFocused : "",
                  item.isOnFocusedPath ? styles.sidebarItemPath : ""
                ].join(" ")}
                style={{ paddingInlineStart: `${16 + item.depth * 18}px` }}
                onClick={() => onSelect(item.id)}
              >
                <span className={styles.sidebarSynthesisRail} aria-hidden="true" />
                <span className={styles.sidebarSynthesisBody}>
                  <span className={styles.sidebarSynthesisMeta}>
                    <span className={styles.sidebarItemEventMarker}>已合流</span>
                    <span className={styles.sidebarSynthesisTitle}>{item.label}</span>
                  </span>
                  {item.sourceLabels.length ? (
                    <span className={styles.sourceBadgeRow} aria-label="合流来源">
                      {item.sourceLabels.map((label) => (
                        <span key={`${item.id}-${label}`} className={styles.sourceBadge}>
                          {label}
                        </span>
                      ))}
                    </span>
                  ) : null}
                </span>
              </button>
            );
          }

          return (
            <button
              key={item.id}
              type="button"
              aria-current={item.isFocused ? "true" : undefined}
              className={[
                styles.sidebarItem,
                isSynthesisEvent ? styles.sidebarItemSynthesis : "",
                item.isFocused ? styles.sidebarItemFocused : "",
                item.isOnFocusedPath ? styles.sidebarItemPath : ""
              ].join(" ")}
              style={{ paddingInlineStart: `${16 + item.depth * 18}px` }}
              onClick={() => onSelect(item.id)}
            >
              <span className={styles.sidebarItemMain}>
                <span className={styles.sidebarItemLabelGroup}>
                  <span className={styles.sidebarItemLabel}>{item.label}</span>
                </span>
                {item.branchType ? <small>{item.branchType}</small> : null}
              </span>
              {item.summary ? <span className={styles.sidebarItemSummary}>{item.summary}</span> : null}
              {item.sourceLabels.length ? (
                <span className={styles.sourceBadgeRow} aria-label="合流来源">
                  {item.sourceLabels.map((label) => (
                    <span key={`${item.id}-${label}`} className={styles.sourceBadge}>
                      {label}
                    </span>
                  ))}
                </span>
              ) : null}
            </button>
          );
        })}
      </nav>
    </aside>
  );
}
