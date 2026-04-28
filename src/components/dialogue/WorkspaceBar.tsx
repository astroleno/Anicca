"use client";

import { FormEvent, useEffect, useState } from "react";
import { WorkspaceRegistryEntry } from "@/types/workspace";
import styles from "./DialogueShell.module.css";

type WorkspaceBarProps = {
  currentWorkspaceId: string | null;
  currentTitle: string;
  items: WorkspaceRegistryEntry[];
  onCreate: () => void;
  onSelect: (workspaceId: string) => void;
  onRename: (title: string) => void;
};

export function WorkspaceBar({
  currentWorkspaceId,
  currentTitle,
  items,
  onCreate,
  onSelect,
  onRename
}: WorkspaceBarProps) {
  const [renaming, setRenaming] = useState(false);
  const [draftTitle, setDraftTitle] = useState(currentTitle);

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

  return (
    <section className={styles.workspaceBar} aria-label="工作区管理">
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
          <button
            type="button"
            className={styles.workspaceBarButton}
            onClick={() => setRenaming((value) => !value)}
          >
            重命名工作区
          </button>
        </div>
      </div>

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
