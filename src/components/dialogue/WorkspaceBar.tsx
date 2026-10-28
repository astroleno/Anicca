"use client";

import { FormEvent, useEffect, useId, useRef, useState, type ReactNode } from "react";
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
  extraActions?: ReactNode;
  onOpenEvolution?: () => void;
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
  onImport,
  extraActions,
  onOpenEvolution
}: WorkspaceBarProps) {
  const [renameOwner, setRenameOwner] = useState<string | null>(null);
  const renaming = Boolean(currentWorkspaceId && renameOwner === currentWorkspaceId);
  const [actionsOpen, setActionsOpen] = useState(false);
  const [draftTitle, setDraftTitle] = useState(currentTitle);
  const overflowActionsId = useId();
  const overflowButtonRef = useRef<HTMLButtonElement | null>(null);
  const overflowRef = useRef<HTMLDivElement | null>(null);
  const firstOverflowItemRef = useRef<HTMLButtonElement | null>(null);
  const renameInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => { setRenameOwner(null); }, [currentWorkspaceId]);

  useEffect(() => {
    if (!renaming) {
      setDraftTitle(currentTitle);
    }
  }, [currentTitle, renaming]);

  const closeRename = () => {
    setRenameOwner(null);
    window.requestAnimationFrame(() => {
      overflowButtonRef.current?.focus();
    });
  };

  const handleSubmitRename = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!renaming) return;
    onRename(draftTitle);
    closeRename();
  };

  useEffect(() => {
    if (!actionsOpen) {
      return;
    }

    const frame = window.requestAnimationFrame(() => {
      firstOverflowItemRef.current?.focus();
    });

    return () => window.cancelAnimationFrame(frame);
  }, [actionsOpen]);

  useEffect(() => {
    if (!renaming) {
      return;
    }

    const frame = window.requestAnimationFrame(() => {
      renameInputRef.current?.focus();
      renameInputRef.current?.select();
    });

    return () => window.cancelAnimationFrame(frame);
  }, [renaming]);

  const closeOverflowActions = () => {
    setActionsOpen(false);
    window.requestAnimationFrame(() => {
      overflowButtonRef.current?.focus();
    });
  };

  useEffect(() => {
    if (!actionsOpen) return;
    const outside = (event: PointerEvent) => {
      if (event.target instanceof Node && !overflowRef.current?.contains(event.target)) setActionsOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      event.preventDefault();
      setActionsOpen(false);
      overflowButtonRef.current?.focus();
    };
    document.addEventListener("pointerdown",outside);
    document.addEventListener("keydown",escape);
    return () => { document.removeEventListener("pointerdown",outside); document.removeEventListener("keydown",escape); };
  },[actionsOpen]);

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
          {onOpenEvolution ? <button type="button" className={styles.workspaceBarGhostButton} aria-haspopup="dialog" aria-label="演化全景"
            onClick={onOpenEvolution}><span className={styles.evolutionLabelFull}>演化全景</span><span className={styles.evolutionLabelShort} aria-hidden="true">全景</span></button> : null}
          <div
            ref={overflowRef}
            className={styles.workspaceOverflow}
            onKeyDown={(event) => {
              if (event.key === "Escape" && actionsOpen) {
                event.preventDefault();
                closeOverflowActions();
              }
            }}
          >
            <button
              type="button"
              ref={overflowButtonRef}
              data-testid="dialogue-more-button"
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
                onClick={(event) => {
                  if ((event.target as HTMLElement).closest("button") && !renaming) setActionsOpen(false);
                }}
                onKeyDown={(event) => {
                  if (event.key === "Escape") {
                    event.preventDefault();
                    closeOverflowActions();
                  }
                }}
              >
                <div className={styles.workspaceOverflowIdentity}>
                  <span>当前工作区</span>
                  <h2>{currentTitle || "未命名工作区"}</h2>
                </div>
                <div className={styles.workspaceOverflowGroup} role="group" aria-label="工作区操作">
                <h3>工作区</h3>
                <button type="button" className={styles.workspaceOverflowItem} onClick={() => { onCreate(); setActionsOpen(false); }}>新建工作区</button>
                <button
                  type="button"
                  ref={firstOverflowItemRef}
                  className={styles.workspaceOverflowItem}
                  onClick={() => {
                    setRenameOwner(renaming ? null : currentWorkspaceId);
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
                {extraActions}
                {items.length ? (
                  <div className={`${styles.workspaceOverflowRecent} ${styles.workspaceOverflowGroup}`} role="group" aria-label="最近工作区">
                    <h3>最近工作区</h3>
                    {items.map((item) => (
                      <button
                        key={`overflow-${item.id}`}
                        type="button"
                        className={styles.workspaceOverflowItem}
                        aria-current={item.id === currentWorkspaceId ? "true" : undefined}
                        onClick={() => {
                          onSelect(item.id);
                          setActionsOpen(false);
                        }}
                      >
                        {item.title}
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>
      </div>

      <p className={styles.workspaceStatus} role="status" aria-live="polite" aria-atomic="true">
        {statusMessage || "已就绪。"}
      </p>

      {renaming ? (
        <form className={styles.workspaceRenameForm} onSubmit={handleSubmitRename}>
          <label className={styles.workspaceRenameField}>
            <span>工作区名称</span>
            <input
              ref={renameInputRef}
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
                closeRename();
              }}
            >
              取消
            </button>
          </div>
        </form>
      ) : null}

      <div className={styles.workspaceRecent} hidden>
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
