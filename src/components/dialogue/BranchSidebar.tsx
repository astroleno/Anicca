"use client";

import { DialogueBreadcrumbItem, DialogueSidebarItem } from "@/features/dialectic/viewModel";
import styles from "./DialogueShell.module.css";

type BranchSidebarProps = {
  breadcrumb: DialogueBreadcrumbItem[];
  items: DialogueSidebarItem[];
  onSelect: (nodeId: string) => void;
};

export function BranchSidebar({ breadcrumb, items, onSelect }: BranchSidebarProps) {
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
        {items.map((item) => (
          <button
            key={item.id}
            type="button"
            aria-current={item.isFocused ? "true" : undefined}
            className={[
              styles.sidebarItem,
              item.isFocused ? styles.sidebarItemFocused : "",
              item.isOnFocusedPath ? styles.sidebarItemPath : ""
            ].join(" ")}
            style={{ paddingInlineStart: `${16 + item.depth * 18}px` }}
            onClick={() => onSelect(item.id)}
          >
            <span className={styles.sidebarItemMain}>
              <span className={styles.sidebarItemLabel}>{item.label}</span>
              {item.branchType ? <small>{item.branchType}</small> : null}
            </span>
            {item.summary ? <span className={styles.sidebarItemSummary}>{item.summary}</span> : null}
            {item.sourceLabels.length ? (
              <span className={styles.sourceBadgeRow} aria-label="合的来源">
                {item.sourceLabels.map((label) => (
                  <span key={`${item.id}-${label}`} className={styles.sourceBadge}>
                    {label}
                  </span>
                ))}
              </span>
            ) : null}
          </button>
        ))}
      </nav>
    </aside>
  );
}
