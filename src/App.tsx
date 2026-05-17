import "./App.css";
import WhiteboardCanvas from "./canvas/WhiteboardCanvas";
import type { ActiveTool, DrawnLine } from "./canvas/WhiteboardCanvas";
import type { ReactNode } from "react";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

const recentBoards = [
  { name: "Product sketch", meta: "Edited today" },
  { name: "Sprint planning", meta: "2 days ago" },
  { name: "Workshop ideas", meta: "Last week" },
];

type IconName =
  | "select"
  | "sticky"
  | "pen"
  | "shape"
  | "arrow"
  | "text"
  | "undo"
  | "redo"
  | "plus"
  | "users"
  | "join"
  | "save"
  | "load"
  | "menu"
  | "trash"
  | "eraser";

const toolbarTools = [
  { label: "Select", icon: "select", tool: "select", disabled: false },
  { label: "Sticky note", icon: "sticky", disabled: true },
  { label: "Pen", icon: "pen", tool: "pen", disabled: false },
  { label: "Eraser", icon: "eraser", tool: "eraser", disabled: false },
  { label: "Shape", icon: "shape", disabled: true },
  { label: "Text", icon: "text", disabled: true },
] satisfies Array<{ label: string; icon: IconName; tool?: ActiveTool; disabled: boolean }>;

const historyTools = [
  { label: "Undo", icon: "undo" },
  { label: "Redo", icon: "redo" },
] satisfies Array<{ label: string; icon: IconName }>;

const menuActions = [
  { label: "Save Board", detail: "Store locally", icon: "save" },
  { label: "Load Board", detail: "Open file", icon: "load" },
] satisfies Array<{ label: string; detail: string; icon: IconName }>;

const icons: Record<IconName, ReactNode> = {
  select: (
    <path d="m9.448 3.487 10.887 8.989a1.82 1.82 0 0 1 -1.168 3.224h-3.91a3.67 3.67 0 0 0 -2.927 1.454l-2.356 3.117a1.83 1.83 0 0 1 -3.288-1.007l-.686-14.064a2.1 2.1 0 0 1 3.448-1.713z" />
  ),
  sticky: (
    <>
      <path d="m22 21h7.07a6.836 6.836 0 0 1 -1.12 1.46l-5.49 5.49a6.836 6.836 0 0 1 -1.46 1.12v-7.07a1 1 0 0 1 1-1z" />
      <path d="m30 5v12.51a6.734 6.734 0 0 1 -.16 1.49h-7.84a3.009 3.009 0 0 0 -3 3v7.84a6.734 6.734 0 0 1 -1.49.16h-12.51a3.009 3.009 0 0 1 -3-3v-22a3.009 3.009 0 0 1 3-3h22a3.009 3.009 0 0 1 3 3z" />
    </>
  ),
  pen: (
    <>
      <path d="m110.5 51.2c11.2 11.2 22.1 22.2 33.3 33.4-.7.8-1.6 1.8-2.6 2.8-23.7 23.7-47.3 47.5-71.2 71-3 2.9-7.1 5.1-11 6.5-9.3 3.1-18.8 5.6-28.2 8.2-5.8 1.6-10.5-2.8-8.9-8.7 2.9-10.7 6.1-21.4 9.4-32.1.7-2.2 2.2-4.3 3.8-6 24.7-24.8 49.4-49.5 74.2-74.3.3-.1.7-.4 1.2-.8z" />
      <path d="m151.5 76.9c-11.2-11.3-22.2-22.3-32.9-33.2 5.5-5.7 11.1-12.2 17.4-17.8 6.8-6.1 17.1-5.7 24.1.4 3.1 2.7 6 5.6 8.7 8.7 6.2 7.1 6.3 17.8 0 24.8-5.5 5.9-11.5 11.3-17.3 17.1z" />
    </>
  ),
  shape: (
    <path d="m18.75 17.45v1.55c0 2.07-1.68 3.75-3.75 3.75h-10c-2.07 0-3.75-1.68-3.75-3.75v-10c0-2.07 1.68-3.75 3.75-3.75h1.55c-.51 1.15-.8 2.41-.8 3.75 0 5.1 4.15 9.25 9.25 9.25 1.34 0 2.6-.29 3.75-.8zm-3.75-16.2c-4.27 0-7.75 3.48-7.75 7.75s3.48 7.75 7.75 7.75 7.75-3.48 7.75-7.75-3.48-7.75-7.75-7.75z" />
  ),
  arrow: (
    <>
      <path d="M5 12h13" />
      <path d="M13 7l5 5-5 5" />
    </>
  ),
  text: (
    <path d="m460.643 6h-409.286c-9.862 0-17.857 7.995-17.857 17.857v107.143c0 9.862 7.995 17.857 17.857 17.857h35.714c9.862 0 17.857-7.995 17.857-17.857v-35.714h106.429v339.286h-44.643c-9.862 0-17.857 7.995-17.857 17.857v35.714c0 9.862 7.995 17.857 17.857 17.857h178.571c9.862 0 17.857-7.995 17.857-17.857v-35.714c0-9.862-7.995-17.857-17.857-17.857h-44.643v-339.286h106.429v35.714c0 9.862 7.995 17.857 17.857 17.857h35.714c9.862 0 17.857-7.995 17.857-17.857v-107.143c.001-9.862-7.994-17.857-17.856-17.857z" />
  ),
  undo: (
    <path d="m8.0865067 2c-.18989146-.01681362-.39099893.02170898-.58201043.13085938l-6.9997496 4c-.32495272.18527247-.51935064.53640686-.50388823.91015625.01468018.34373316.20500507.65578858.50388823.82617188l6.9997496 4c.76500772.43781606 1.6811886-.25635914 1.4667444-1.1113281l-.31660159-1.270692a.3907077.3907077 128.00462 0 1 .37911724-.48516735h6.4665477c2.5088809 0 4.499839 1.9910294 4.499839 4.5s-1.9909581 4.5-4.499839 4.5h-7.4997317c-1.10453 0-1.9999285.8954305-1.9999285 2s.89539847 2 1.9999285 2h7.4997317c4.670564 0 8.499696-3.8292689 8.499696-8.5s-3.8291319-8.5-8.499696-8.5h-6.4685007a.39049669.39049669 52.010399 0 1 -.37886295-.48510392l.31830036-1.2746617c.1590673-.64055607-.31505961-1.1897935-.88473398-1.2402344z" />
  ),
  redo: (
    <path d="m15.913493 2c.18989146-.01681362.39099894.02170898.58201043.13085938l6.9997496 4c.32495272.18527247.51935064.53640686.50388822.91015625-.0146802.34373316-.20500506.65578858-.50388822.82617188l-6.9997496 4c-.76500771.43781606-1.6811886-.25635914-1.4667444-1.1113281l.3166016-1.270692a.3907077.3907077 0 0 0 -.37911725-.48516735h-6.4665477c-2.5088809 0-4.499839 1.9910294-4.499839 4.5s1.9909581 4.5 4.499839 4.5h7.4997317c1.10453 0 1.9999285.8954305 1.9999285 2s-.89539847 2-1.9999285 2h-7.4997317c-4.670564 0-8.499696-3.8292689-8.499696-8.5s3.8291319-8.5 8.499696-8.5h6.4685007a.39049669.39049669 0 0 0 .37886295-.48510392l-.31830036-1.2746617c-.1590673-.64055607.31505962-1.1897935.88473398-1.2402344z" />
  ),
  plus: (
    <>
      <path d="M12 5v14" />
      <path d="M5 12h14" />
    </>
  ),
  users: (
    <>
      <path d="M8 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6z" />
      <path d="M3.5 19a4.5 4.5 0 0 1 9 0" />
      <path d="M17 11.5a2.5 2.5 0 1 0 0-5" />
      <path d="M15.5 15.5a4 4 0 0 1 5 3.5" />
    </>
  ),
  join: (
    <>
      <path d="M10 7H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h4" />
      <path d="M14 16l4-4-4-4" />
      <path d="M18 12H9" />
    </>
  ),
  save: (
    <>
      <path d="M6 4h10l2 2v14H6V4z" />
      <path d="M9 4v5h6V4" />
      <path d="M8.5 16.5h7" />
    </>
  ),
  load: (
    <>
      <path d="M5 19h14" />
      <path d="M12 5v10" />
      <path d="M8 11l4 4 4-4" />
    </>
  ),
  menu: (
    <>
      <path d="M6 8h12" />
      <path d="M6 12h12" />
      <path d="M6 16h12" />
    </>
  ),
  trash: (
    <>
      <path d="m39 6h-9v-1a3 3 0 0 0 -3-3h-7a3 3 0 0 0 -3 3v1h-8a3 3 0 0 0 -3 3v1a3 3 0 0 0 3 3h30a3 3 0 0 0 3-3v-1a3 3 0 0 0 -3-3zm-20 0v-1a1 1 0 0 1 1-1h7a1 1 0 0 1 1 1v1z" />
      <path d="m39 15h-30a5.029 5.029 0 0 1 -.941-.1l.82 26.251a4.977 4.977 0 0 0 5 4.844h20.244a4.977 4.977 0 0 0 5-4.844l.82-26.251a5.029 5.029 0 0 1 -.943.1zm-21.472 25h-.028a1 1 0 0 1 -1-.972l-.5-18a1 1 0 0 1 2-.056l.5 18a1 1 0 0 1 -.972 1.028zm7.472-1a1 1 0 0 1 -2 0v-18a1 1 0 0 1 2 0zm6.5.028a1 1 0 0 1 -1 .972h-.028a1 1 0 0 1 -.972-1.028l.5-18a.972.972 0 0 1 1.028-.972 1 1 0 0 1 .972 1.028z" />
    </>
  ),
  eraser: (
    <path d="M456.833,172.237L318.167,33.439c-8.061-8.068-19.109-12.103-30.159-12.105c-11.055-0.002-22.11,4.033-30.175,12.105L12.5,279.006C4.437,287.076,0,297.794,0,309.201c0,11.407,4.406,22.094,12.594,30.289l95.51,93.318c10.021,9.791,23.25,15.192,37.271,15.192h71.771c14.115,0,27.417-5.464,37.479-15.4l202.208-199.972c8.063-8.07,12.5-18.789,12.5-30.195S464.896,180.308,456.833,172.237z M224.656,402.25c-2.052,2.021-4.646,3.083-7.51,3.083h-71.771c-2.844,0-5.417-1.042-7.458-3.042l-95.25-92.958l110.708-110.708l137.844,137.854L224.656,402.25z" />
  ),
};

function ToolIcon({ name }: { name: IconName }) {
  return (
    <svg
      className={
        name === "select" ||
        name === "pen" ||
        name === "sticky" ||
        name === "shape" ||
        name === "text" ||
        name === "undo" ||
        name === "redo" ||
        name === "trash" ||
        name === "eraser"
          ? "tool-icon tool-icon-filled"
          : "tool-icon"
      }
      viewBox={
        name === "pen"
          ? "0 0 195 195"
          : name === "sticky"
            ? "0 0 32 32"
            : name === "text"
              ? "0 0 512 512"
              : name === "trash"
                ? "0 0 48 48"
                : name === "eraser"
                  ? "0 0 469.333 469.333"
                  : "0 0 24 24"
      }
      aria-hidden="true"
    >
      {icons[name]}
    </svg>
  );
}

const collaborationActions = [
  { label: "Create", detail: "Start room", icon: "users" },
  { label: "Join", detail: "Use code", icon: "join" },
] satisfies Array<{ label: string; detail: string; icon: IconName }>;

const TITLE_INPUT_MAX_WIDTH = 360;
const TITLE_INPUT_HORIZONTAL_CHROME = 18;

function App() {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isClearModalOpen, setIsClearModalOpen] = useState(false);
  const [activeTool, setActiveTool] = useState<ActiveTool>("select");
  const [lines, setLines] = useState<DrawnLine[]>([]);
  const [undoHistory, setUndoHistory] = useState<DrawnLine[][]>([]);
  const [redoHistory, setRedoHistory] = useState<DrawnLine[][]>([]);
  const [boardTitle, setBoardTitle] = useState("Untitled Board");
  const [draftTitle, setDraftTitle] = useState("Untitled Board");
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [titleInputWidth, setTitleInputWidth] = useState(TITLE_INPUT_HORIZONTAL_CHROME);
  const menuRef = useRef<HTMLDivElement>(null);
  const titleButtonRef = useRef<HTMLButtonElement>(null);
  const titleInputRef = useRef<HTMLInputElement>(null);
  const titleMeasureRef = useRef<HTMLSpanElement>(null);
  const skipTitleBlurSaveRef = useRef(false);
  const hasEditedTitleRef = useRef(false);
  const canUndo = undoHistory.length > 0;
  const canRedo = redoHistory.length > 0;
  const canClearBoard = lines.length > 0;

  const handleLinesChange = useCallback(
    (updater: (currentLines: DrawnLine[]) => DrawnLine[]) => {
      setLines(updater);
    },
    [],
  );

  const handleDrawingCommit = useCallback((previousLines: DrawnLine[]) => {
    setUndoHistory((currentHistory) => [...currentHistory, previousLines]);
    setRedoHistory([]);
  }, []);

  const handleEraseLine = useCallback((lineId: string) => {
    setLines((currentLines) => {
      if (!currentLines.some((line) => line.id === lineId)) {
        return currentLines;
      }

      return currentLines.filter((line) => line.id !== lineId);
    });
  }, []);

  const handleEraseCommit = useCallback((previousLines: DrawnLine[]) => {
    setUndoHistory((currentHistory) => [...currentHistory, previousLines]);
    setRedoHistory([]);
  }, []);

  const undo = useCallback(() => {
    if (!canUndo) {
      return;
    }

    const previousLines = undoHistory[undoHistory.length - 1];

    setUndoHistory((currentHistory) => currentHistory.slice(0, -1));
    setRedoHistory((currentHistory) => [...currentHistory, lines]);
    setLines(previousLines);
  }, [canUndo, lines, undoHistory]);

  const redo = useCallback(() => {
    if (!canRedo) {
      return;
    }

    const nextLines = redoHistory[redoHistory.length - 1];

    setRedoHistory((currentHistory) => currentHistory.slice(0, -1));
    setUndoHistory((currentHistory) => [...currentHistory, lines]);
    setLines(nextLines);
  }, [canRedo, lines, redoHistory]);

  const clearBoard = useCallback(() => {
    if (!canClearBoard) {
      return;
    }

    setUndoHistory((currentHistory) => [...currentHistory, lines]);
    setRedoHistory([]);
    setLines([]);
    setIsClearModalOpen(false);
  }, [canClearBoard, lines]);

  const saveTitle = () => {
    if (skipTitleBlurSaveRef.current) {
      skipTitleBlurSaveRef.current = false;
      return;
    }

    const nextTitle = draftTitle.trim() || "Untitled Board";

    hasEditedTitleRef.current = false;
    setBoardTitle(nextTitle);
    setDraftTitle(nextTitle);
    setIsEditingTitle(false);
  };

  const cancelTitleEdit = () => {
    skipTitleBlurSaveRef.current = true;
    hasEditedTitleRef.current = false;
    setDraftTitle(boardTitle);
    setIsEditingTitle(false);
    window.setTimeout(() => {
      skipTitleBlurSaveRef.current = false;
    }, 0);
  };

  const startTitleEdit = () => {
    const nextTitle = boardTitle.trim() || "Untitled Board";
    const displayedTitleWidth = titleButtonRef.current?.offsetWidth;

    hasEditedTitleRef.current = false;
    setBoardTitle(nextTitle);
    setDraftTitle(nextTitle);
    setTitleInputWidth(displayedTitleWidth ?? TITLE_INPUT_HORIZONTAL_CHROME);
    setIsEditingTitle(true);
  };

  useEffect(() => {
    const handlePointerDown = (event: PointerEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) {
        setIsMenuOpen(false);
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsMenuOpen(false);
      }
    };

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleEscape);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleEscape);
    };
  }, []);

  useEffect(() => {
    const handleKeyboardShortcut = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const isEditableTarget =
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target?.isContentEditable;

      if (isEditableTarget || !(event.metaKey || event.ctrlKey)) {
        return;
      }

      const key = event.key.toLowerCase();

      if (key === "z" && event.shiftKey) {
        event.preventDefault();
        redo();
        return;
      }

      if (key === "z") {
        event.preventDefault();
        undo();
        return;
      }

      if (key === "y") {
        event.preventDefault();
        redo();
      }
    };

    document.addEventListener("keydown", handleKeyboardShortcut);

    return () => document.removeEventListener("keydown", handleKeyboardShortcut);
  }, [redo, undo]);

  useEffect(() => {
    if (!isClearModalOpen) {
      return;
    }

    const handleModalKeyboard = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsClearModalOpen(false);
      }

      if (event.key === "Enter") {
        clearBoard();
      }
    };

    document.addEventListener("keydown", handleModalKeyboard);

    return () => document.removeEventListener("keydown", handleModalKeyboard);
  }, [clearBoard, isClearModalOpen]);

  useEffect(() => {
    if (isEditingTitle) {
      titleInputRef.current?.focus();
      titleInputRef.current?.select();
    }
  }, [isEditingTitle]);

  useLayoutEffect(() => {
    if (!isEditingTitle || !titleMeasureRef.current) {
      return;
    }

    const measureText =
      !hasEditedTitleRef.current && draftTitle.trim() === ""
        ? "Untitled Board"
        : draftTitle;

    titleMeasureRef.current.textContent = measureText;

    const measuredWidth =
      Math.ceil(titleMeasureRef.current.scrollWidth) + TITLE_INPUT_HORIZONTAL_CHROME;
    const clampedWidth = Math.min(measuredWidth, TITLE_INPUT_MAX_WIDTH);

    setTitleInputWidth((currentWidth) =>
      currentWidth === clampedWidth ? currentWidth : clampedWidth,
    );
  }, [draftTitle, isEditingTitle]);

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="window-spacer" aria-hidden="true" />

        <div className={isMenuOpen ? "app-menu open" : "app-menu"} ref={menuRef}>
          <button
            className="menu-trigger"
            type="button"
            aria-label="Board menu"
            aria-expanded={isMenuOpen}
            title="Board menu"
            onClick={() => setIsMenuOpen((open) => !open)}
          >
            <ToolIcon name="menu" />
          </button>

          {isMenuOpen && (
            <div className="menu-panel" aria-label="Board menu actions">
              <div className="menu-section">
                <button className="menu-action primary" type="button">
                  <ToolIcon name="plus" />
                  <span>
                    <strong>New Board</strong>
                    <small>Start fresh</small>
                  </span>
                </button>

                {collaborationActions.map((action) => (
                  <button className="menu-action" type="button" key={action.label}>
                    <ToolIcon name={action.icon} />
                    <span>
                      <strong>{action.label} Room</strong>
                      <small>{action.detail}</small>
                    </span>
                  </button>
                ))}

                {menuActions.map((action) => (
                  <button className="menu-action" type="button" key={action.label}>
                    <ToolIcon name={action.icon} />
                    <span>
                      <strong>{action.label}</strong>
                      <small>{action.detail}</small>
                    </span>
                  </button>
                ))}
              </div>

              <div className="menu-section">
                <div className="menu-heading">
                  <span>Recent Boards</span>
                  <small>3 files</small>
                </div>

                {recentBoards.map((board) => (
                  <button className="recent-board" type="button" key={board.name}>
                    <span className="board-dot" aria-hidden="true" />
                    <span>
                      <strong>{board.name}</strong>
                      <small>{board.meta}</small>
                    </span>
                  </button>
                ))}
              </div>

              <div className="menu-status">
                <span className="status-dot" aria-hidden="true" />
                <span>
                  <strong>Local mode</strong>
                  <small>Changes are not synced</small>
                </span>
              </div>
            </div>
          )}
        </div>

        <div className={isEditingTitle ? "board-title editing" : "board-title"} aria-label="Current board">
          {isEditingTitle ? (
            <>
              <input
                ref={titleInputRef}
                value={draftTitle}
                aria-label="Board title"
                style={{ width: titleInputWidth }}
                onChange={(event) => {
                  hasEditedTitleRef.current = true;
                  setDraftTitle(event.target.value);
                }}
                onBlur={saveTitle}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    saveTitle();
                  }

                  if (event.key === "Escape") {
                    event.preventDefault();
                    cancelTitleEdit();
                  }
                }}
              />
              <span className="title-measure" ref={titleMeasureRef} />
            </>
          ) : (
            <button
              className="board-title-button"
              type="button"
              ref={titleButtonRef}
              onClick={startTitleEdit}
              title={boardTitle}
            >
              {boardTitle}
            </button>
          )}
        </div>

        <div className="topbar-right">
          <div className="session-pill" aria-label="Session status">
            <span className="session-state">
              <span className="status-dot" aria-hidden="true" />
              Local mode
            </span>
            <span>Room: Not connected</span>
            <span>Users: 1</span>
          </div>

          <div className="zoom-indicator" aria-label="Zoom level">
            100%
          </div>
        </div>
      </header>

      <section className="workspace" aria-label="Whiteboard workspace">
        <div className="canvas-shell">
          <WhiteboardCanvas
            activeTool={activeTool}
            lines={lines}
            onLinesChange={handleLinesChange}
            onDrawingCommit={handleDrawingCommit}
            onEraseLine={handleEraseLine}
            onEraseCommit={handleEraseCommit}
          />
        </div>

        <nav className="bottom-toolbar" aria-label="Whiteboard tools">
          <div className="tool-group">
            {toolbarTools.map((tool) => (
              <button
                className={tool.tool === activeTool ? "tool-button active" : "tool-button"}
                type="button"
                key={tool.label}
                aria-label={tool.label}
                title={tool.label}
                disabled={tool.disabled}
                onClick={() => {
                  if (tool.tool) {
                    setActiveTool(tool.tool);
                  }
                }}
              >
                <ToolIcon name={tool.icon} />
              </button>
            ))}
          </div>

          <div className="toolbar-divider" />

          <div className="tool-group">
            {historyTools.map((tool) => (
              <button
                className="tool-button"
                type="button"
                aria-label={tool.label}
                title={tool.label}
                key={tool.label}
                disabled={tool.label === "Undo" ? !canUndo : !canRedo}
                onClick={tool.label === "Undo" ? undo : redo}
              >
                <ToolIcon name={tool.icon} />
              </button>
            ))}
          </div>

          <div className="toolbar-divider" />

          <button
            className="tool-button clear-board-button"
            type="button"
            aria-label="Clear Board"
            title="Clear Board"
            disabled={!canClearBoard}
            onClick={() => setIsClearModalOpen(true)}
          >
            <ToolIcon name="trash" />
          </button>
        </nav>
      </section>

      {isClearModalOpen && (
        <div className="modal-overlay" role="presentation">
          <section
            className="confirmation-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="clear-board-title"
          >
            <h2 id="clear-board-title">Clear board</h2>
            <p>You can undo this action if you change your mind.</p>

            <div className="modal-actions">
              <button type="button" className="modal-button" onClick={() => setIsClearModalOpen(false)}>
                Cancel
              </button>
              <button type="button" className="modal-button danger" onClick={clearBoard}>
                Clear Board
              </button>
            </div>
          </section>
        </div>
      )}
    </main>
  );
}

export default App;
