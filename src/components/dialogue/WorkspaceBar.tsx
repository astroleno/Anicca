"use client";

import { FormEvent, useEffect, useId, useRef, useState } from "react";
import { WorkspaceRegistryEntry } from "@/types/workspace";
import styles from "./DialogueShell.module.css";

type WorkspaceBarProps = {
  currentWorkspaceId: string | null;
  currentTitle: string;
  items: WorkspaceRegistryEntry[];
  statusMessage: string | null;
  onCreate: () => void;
  onSelect: (workspaceId: string) => void;
  onRename: (title: string) => void;
  onExport: () => void;
  onImport: () => void;
};

export function WorkspaceBar({
  currentWorkspaceId,
  currentTitle,
  items,
  statusMessage,
  onCreate,
  onSelect,
  onRename,
  onExport,
  onImport
}: WorkspaceBarProps) {
  const [renaming, setRenaming] = useState(false);
  const [actionsOpen, setActionsOpen] = useState(false);
  const [draftTitle, setDraftTitle] = useState(currentTitle);
  const overflowActionsId = useId();
  const overflowButtonRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (!renaming) {
      setDraftTitle(currentTitle);
    }
  }, [currentTitle, renaming]);

  const handleSubmitRename = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    onRename(draftTitle);
    setRenaming(false);
  };

  const closeOverflowActions = () => {
    setActionsOpen(false);
    overflowButtonRef.current?.focus();
  };

  return (
    <section
      className={styles.workspaceBar}
      aria-label="工作区管理"
      data-testid="dialogue-workspace-bar"
    >
      <div className={styles.workspaceBarHeader}>
        <div className={styles.workspaceBarCurrent}>
          <p className={styles.eyebrow}>工作区</p>
          <strong>{currentTitle || "未命名工作区"}</strong>
        </div>
        <div className={styles.workspaceBarActions}>
          <button
            type="button"
            className={styles.workspaceBarButton}
            onClick={onCreate}
          >
            新建工作区
          </button>
          <div className={styles.workspaceOverflow}>
            <button
              type="button"
              ref={overflowButtonRef}
              className={styles.workspaceBarGhostButton}
              aria-controls={actionsOpen ? overflowActionsId : undefined}
              aria-expanded={actionsOpen}
              onClick={() => setActionsOpen((value) => !value)}
            >
              更多
            </button>
            {actionsOpen ? (
              <div
                id={overflowActionsId}
                className={styles.workspaceOverflowMenu}
                aria-label="更多工作区操作"
                onKeyDown={(event) => {
                  if (event.key === "Escape") {
                    event.preventDefault();
                    closeOverflowActions();
                  }
                }}
              >
                <button
                  type="button"
                  className={styles.workspaceOverflowItem}
                  onClick={() => {
                    setRenaming((value) => !value);
                    setActionsOpen(false);
                  }}
                >
                  重命名工作区
                </button>
                <button
                  type="button"
                  className={styles.workspaceOverflowItem}
                  onClick={() => {
                    onExport();
                    setActionsOpen(false);
                  }}
                >
                  导出工作区
                </button>
                <button
                  type="button"
                  className={styles.workspaceOverflowItem}
                  onClick={() => {
                    onImport();
                    setActionsOpen(false);
                  }}
                >
                  导入工作区
                </button>
              </div>
            ) : null}
          </div>
        </div>
      </div>

      <p className={styles.workspaceStatus} role="status" aria-live="polite">
        {statusMessage || "工作区变更会保存在本地。"}
      </p>

      {renaming ? (
        <form className={styles.workspaceRenameForm} onSubmit={handleSubmitRename}>
          <label className={styles.workspaceRenameField}>
            <span>工作区名称</span>
            <input
              aria-label="工作区名称"
              value={draftTitle}
              onChange={(event) => setDraftTitle(event.target.value)}
            />
          </label>
          <div className={styles.workspaceRenameActions}>
            <button
              type="submit"
              className={styles.workspaceBarButton}
            >
              保存工作区名称
            </button>
            <button
              type="button"
              className={styles.workspaceBarGhostButton}
              onClick={() => {
                setDraftTitle(currentTitle);
                setRenaming(false);
              }}
            >
              取消
            </button>
          </div>
        </form>
      ) : null}

      <div className={styles.workspaceRecent}>
        <p className={styles.workspaceRecentLabel}>最近工作区</p>
        <div className={styles.workspaceRecentList}>
          {items.map((item) => (
            <button
              key={item.id}
              type="button"
              className={
                item.id === currentWorkspaceId
                  ? `${styles.workspaceRecentItem} ${styles.workspaceRecentItemActive}`
                  : styles.workspaceRecentItem
              }
              aria-current={item.id === currentWorkspaceId ? "true" : undefined}
              onClick={() => onSelect(item.id)}
            >
              {item.title}
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}
