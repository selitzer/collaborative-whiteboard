import "./App.css";
import { socket } from "./lib/socket";
import WhiteboardCanvas from "./canvas/WhiteboardCanvas";
import type {
  ActiveTool,
  DrawnLine,
  StickyNote,
  TextBox,
  Shape,
  WhiteboardCanvasHandle,
  RemoteCursor,
} from "./canvas/WhiteboardCanvas";
import type { ReactNode } from "react";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";

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

type RoomUser = {
  socketId: string;
  name: string;
};

type RoomSuccessResponse = {
  ok: true;
  roomCode: string;
  users: RoomUser[];
  count: number;
  title?: string;
  boardData?: BoardFileData;
};

type RoomErrorResponse = {
  ok: false;
  error: string;
};

type RoomResponse = RoomSuccessResponse | RoomErrorResponse;

type RoomConnectionStatus =
  | "local"
  | "connected"
  | "disconnected"
  | "reconnecting";

type BoardFileData = {
  version: number;
  title: string;
  lines: DrawnLine[];
  notes: StickyNote[];
  shapes: Shape[];
  textBoxes: TextBox[];
  savedAt: string;
  filePath?: string;
};

type BoardSnapshot = {
  lines: DrawnLine[];
  notes: StickyNote[];
  shapes: Shape[];
  textBoxes: TextBox[];
};

type SelectedObjectIds = {
  lineIds: string[];
  noteIds: string[];
  textBoxIds: string[];
  shapeIds: string[];
};

type RecentBoard = {
  name: string;
  path: string;
  savedAt: string;
};

type LayerAction = "front" | "forward" | "backward" | "back";

declare global {
  interface Window {
    whiteboardAPI?: {
      exportBoardAsPng: (payload: {
        title: string;
        dataUrl: string;
      }) => Promise<{ canceled: boolean; filePath?: string }>;
      saveBoard: (
        boardData: BoardFileData,
      ) => Promise<{ canceled: boolean; filePath?: string }>;
      saveBoardAs: (
        boardData: BoardFileData,
      ) => Promise<{ canceled: boolean; filePath?: string }>;
      loadBoard: () => Promise<{
        canceled: boolean;
        filePath?: string;
        data?: BoardFileData;
      }>;
      loadBoardFromPath: (filePath: string) => Promise<{
        canceled: boolean;
        filePath?: string;
        data?: BoardFileData;
      }>;
      newBoard: (payload: {
        isDirty: boolean;
        boardData: BoardFileData;
        isCollaborative: boolean;
      }) => Promise<{ canceled: boolean }>;
      onRequestCloseState: (callback: () => void) => void;
      respondToCloseRequest: (payload: {
        isDirty: boolean;
        boardData: BoardFileData;
      }) => Promise<void>;
    };
  }
}

const RECENT_BOARDS_STORAGE_KEY = "collab-whiteboard:recentBoards";
const DEFAULT_TEXT_STYLE = {
  textColor: "#1f2937",
  fontSize: null,
  fontWeight: "bold",
  textAlign: "center",
} satisfies Pick<
  TextBox,
  "textColor" | "fontSize" | "fontWeight" | "textAlign"
>;

function isFontWeight(value: unknown): value is TextBox["fontWeight"] {
  return value === "normal" || value === "bold";
}

function isTextAlign(value: unknown): value is TextBox["textAlign"] {
  return value === "left" || value === "center" || value === "right";
}

function isRecentBoard(value: unknown): value is RecentBoard {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Record<string, unknown>;

  return (
    typeof candidate.name === "string" &&
    typeof candidate.path === "string" &&
    typeof candidate.savedAt === "string"
  );
}

function isStickyNote(value: unknown): value is StickyNote {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Record<string, unknown>;

  return (
    typeof candidate.id === "string" &&
    typeof candidate.x === "number" &&
    typeof candidate.y === "number" &&
    typeof candidate.width === "number" &&
    typeof candidate.height === "number" &&
    typeof candidate.text === "string" &&
    typeof candidate.color === "string"
  );
}

function getBoardNotes(boardData: BoardFileData): StickyNote[] {
  if (!Array.isArray(boardData.notes) || !boardData.notes.every(isStickyNote)) {
    return [];
  }

  return boardData.notes;
}

function isShape(value: unknown): value is Shape {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Record<string, unknown>;
  const validTypes = ["rectangle", "ellipse", "triangle", "line", "arrow"];

  return (
    typeof candidate.id === "string" &&
    typeof candidate.type === "string" &&
    validTypes.includes(candidate.type) &&
    typeof candidate.x === "number" &&
    typeof candidate.y === "number" &&
    typeof candidate.width === "number" &&
    typeof candidate.height === "number" &&
    typeof candidate.text === "string" &&
    typeof candidate.fill === "string" &&
    typeof candidate.stroke === "string" &&
    typeof candidate.strokeWidth === "number" &&
    (candidate.lineStyle === undefined ||
      candidate.lineStyle === "solid" ||
      candidate.lineStyle === "dashed" ||
      candidate.lineStyle === "dotted") &&
    (candidate.textColor === undefined ||
      typeof candidate.textColor === "string") &&
    (candidate.fontSize === undefined ||
      candidate.fontSize === null ||
      typeof candidate.fontSize === "number") &&
    (candidate.fontWeight === undefined ||
      isFontWeight(candidate.fontWeight)) &&
    (candidate.textAlign === undefined || isTextAlign(candidate.textAlign)) &&
    typeof candidate.zIndex === "number"
  );
}

function getBoardShapes(boardData: BoardFileData): Shape[] {
  if (!Array.isArray(boardData.shapes) || !boardData.shapes.every(isShape)) {
    return [];
  }

  return boardData.shapes.map((shape) => ({
    ...shape,
    lineStyle: shape.lineStyle ?? "solid",
    textColor: shape.textColor ?? DEFAULT_TEXT_STYLE.textColor,
    fontSize: typeof shape.fontSize === "number" ? shape.fontSize : null,
    fontWeight: isFontWeight(shape.fontWeight)
      ? shape.fontWeight
      : DEFAULT_TEXT_STYLE.fontWeight,
    textAlign: isTextAlign(shape.textAlign)
      ? shape.textAlign
      : DEFAULT_TEXT_STYLE.textAlign,
  }));
}

function isTextBox(value: unknown): value is TextBox {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Record<string, unknown>;

  return (
    typeof candidate.id === "string" &&
    typeof candidate.x === "number" &&
    typeof candidate.y === "number" &&
    typeof candidate.width === "number" &&
    typeof candidate.height === "number" &&
    typeof candidate.text === "string" &&
    (candidate.textColor === undefined ||
      typeof candidate.textColor === "string") &&
    (candidate.fontSize === undefined ||
      candidate.fontSize === null ||
      typeof candidate.fontSize === "number") &&
    (candidate.fontWeight === undefined ||
      isFontWeight(candidate.fontWeight)) &&
    (candidate.textAlign === undefined || isTextAlign(candidate.textAlign))
  );
}

function getBoardTextBoxes(boardData: BoardFileData): TextBox[] {
  if (
    !Array.isArray(boardData.textBoxes) ||
    !boardData.textBoxes.every(isTextBox)
  ) {
    return [];
  }

  return boardData.textBoxes.map((textBox) => ({
    ...textBox,
    textColor: textBox.textColor ?? DEFAULT_TEXT_STYLE.textColor,
    fontSize: typeof textBox.fontSize === "number" ? textBox.fontSize : null,
    fontWeight: isFontWeight(textBox.fontWeight)
      ? textBox.fontWeight
      : DEFAULT_TEXT_STYLE.fontWeight,
    textAlign: isTextAlign(textBox.textAlign)
      ? textBox.textAlign
      : DEFAULT_TEXT_STYLE.textAlign,
  }));
}

function upsertRecentBoard(
  currentBoards: RecentBoard[],
  nextBoard: RecentBoard,
): RecentBoard[] {
  return [
    nextBoard,
    ...currentBoards.filter((board) => board.path !== nextBoard.path),
  ].slice(0, 8);
}

const toolbarTools = [
  { label: "Select", icon: "select", tool: "select", disabled: false },
  { label: "Sticky note", icon: "sticky", tool: "sticky", disabled: false },
  { label: "Pen", icon: "pen", tool: "pen", disabled: false },
  { label: "Eraser", icon: "eraser", tool: "eraser", disabled: false },
  { label: "Shape", icon: "shape", tool: "shape", disabled: false },
  { label: "Text", icon: "text", tool: "text", disabled: false },
] satisfies Array<{
  label: string;
  icon: IconName;
  tool?: ActiveTool;
  disabled: boolean;
}>;

const historyTools = [
  { label: "Undo", icon: "undo" },
  { label: "Redo", icon: "redo" },
] satisfies Array<{ label: string; icon: IconName }>;

const menuActions = [
  { label: "Save As", icon: "save", action: "saveAs" },
  { label: "Save", icon: "save", action: "save" },
  { label: "Upload", icon: "load", action: "upload" },
  { label: "Export PNG", icon: "save", action: "exportPng" },
] satisfies Array<{
  label: string;
  icon: IconName;
  action: "saveAs" | "save" | "upload" | "exportPng";
}>;

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

function ShapeOptionIcon({ type }: { type: Shape["type"] }) {
  return (
    <svg className="shape-picker-icon" viewBox="0 0 24 24" aria-hidden="true">
      {type === "rectangle" && (
        <rect x="4" y="6" width="16" height="12" rx="2" />
      )}
      {type === "ellipse" && <ellipse cx="12" cy="12" rx="8" ry="6" />}
      {type === "triangle" && <path d="M12 4 21 20H3z" />}
      {type === "line" && <path d="M4 18 20 6" />}
      {type === "arrow" && (
        <>
          <path d="M4 18 19 3" />
          <path d="M10 3h9v9" />
        </>
      )}
    </svg>
  );
}

const collaborationActions = [
  { label: "Create", detail: "Start room", icon: "users" },
  { label: "Join", detail: "Use code", icon: "join" },
] satisfies Array<{ label: string; detail: string; icon: IconName }>;

const TITLE_INPUT_MAX_WIDTH = 360;
const TITLE_INPUT_HORIZONTAL_CHROME = 18;
const STICKY_NOTE_COLORS = [
  { name: "Yellow", value: "#fff2a8" },
  { name: "Orange", value: "#ffd6a5" },
  { name: "Pink", value: "#ffb8c8" },
  { name: "Purple", value: "#d8c7ff" },
  { name: "Blue", value: "#b9d8ff" },
  { name: "Cyan", value: "#b8f3ff" },
  { name: "Green", value: "#c8f7c5" },
  { name: "Light gray", value: "#e5e7eb" },
  { name: "Dark", value: "#2f3542" },
];
const PEN_COLORS = [
  { name: "Graphite", value: "#1f2937" },
  { name: "Black", value: "#111827" },
  { name: "Red", value: "#dc2626" },
  { name: "Orange", value: "#ea580c" },
  { name: "Blue", value: "#2563eb" },
  { name: "Green", value: "#16a34a" },
  { name: "Purple", value: "#7c3aed" },
];
const SHAPE_OPTIONS = [
  { label: "Rectangle", type: "rectangle" },
  { label: "Ellipse", type: "ellipse" },
  { label: "Triangle", type: "triangle" },
  { label: "Line", type: "line" },
  { label: "Arrow", type: "arrow" },
] satisfies Array<{ label: string; type: Shape["type"] }>;
const USER_COLORS = [
  "#60a5fa",
  "#a78bfa",
  "#f472b6",
  "#fb7185",
  "#f59e0b",
  "#34d399",
  "#22d3ee",
  "#c084fc",
  "#4ade80",
  "#f97316",
];

function getDisplayName(name: string) {
  return name.trim() || "Guest";
}

function getUserInitial(name: string) {
  return getDisplayName(name).charAt(0).toUpperCase() || "G";
}

function getStableColorFromKey(key: string, fallbackIndex = 0) {
  const colorIndex = Array.from(key || String(fallbackIndex)).reduce(
    (total, character) => total + character.charCodeAt(0),
    fallbackIndex,
  );

  return USER_COLORS[colorIndex % USER_COLORS.length];
}

function getStableUserColor(user: RoomUser, index: number) {
  return getStableColorFromKey(user.socketId, index);
}

function App() {
  const [roomError, setRoomError] = useState("");
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isClearModalOpen, setIsClearModalOpen] = useState(false);
  const [isCreateRoomModalOpen, setIsCreateRoomModalOpen] = useState(false);
  const [isJoinRoomModalOpen, setIsJoinRoomModalOpen] = useState(false);
  const [isJoinReplaceConfirmOpen, setIsJoinReplaceConfirmOpen] =
    useState(false);
  const [isStickyColorPickerOpen, setIsStickyColorPickerOpen] = useState(false);
  const [isPenSettingsOpen, setIsPenSettingsOpen] = useState(false);
  const [isShapePickerOpen, setIsShapePickerOpen] = useState(false);
  const [selectedStickyColor, setSelectedStickyColor] = useState<string | null>(
    null,
  );
  const [selectedShapeType, setSelectedShapeType] = useState<
    Shape["type"] | null
  >(null);
  const [selectedPenColor, setSelectedPenColor] = useState("#1f2937");
  const [remoteCursors, setRemoteCursors] = useState<
    Record<string, RemoteCursor>
  >({});
  const [selectedPenStrokeWidth, setSelectedPenStrokeWidth] = useState(3);
  const [activeTool, setActiveTool] = useState<ActiveTool>("select");
  const [canvasZoom, setCanvasZoom] = useState(1);
  const [lines, setLines] = useState<DrawnLine[]>([]);
  const [notes, setNotes] = useState<StickyNote[]>([]);
  const [shapes, setShapes] = useState<Shape[]>([]);
  const [textBoxes, setTextBoxes] = useState<TextBox[]>([]);
  const [undoHistory, setUndoHistory] = useState<BoardSnapshot[]>([]);
  const [redoHistory, setRedoHistory] = useState<BoardSnapshot[]>([]);
  const [boardTitle, setBoardTitle] = useState("Untitled Board");
  const [draftTitle, setDraftTitle] = useState("Untitled Board");
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [titleInputWidth, setTitleInputWidth] = useState(
    TITLE_INPUT_HORIZONTAL_CHROME,
  );
  const [isSuccessToastVisible, setIsSuccessToastVisible] = useState(false);
  const [successToastMessage, setSuccessToastMessage] = useState("");
  const [successToastKey, setSuccessToastKey] = useState(0);
  const [isRoomErrorToastVisible, setIsRoomErrorToastVisible] = useState(false);
  const [roomErrorToastKey, setRoomErrorToastKey] = useState(0);
  const [roomDisplayName, setRoomDisplayName] = useState("");
  const [joinRoomCode, setJoinRoomCode] = useState("");
  const [activeRoomCode, setActiveRoomCode] = useState<string | null>(null);
  const [connectedUsersCount, setConnectedUsersCount] = useState(1);
  const [roomUsers, setRoomUsers] = useState<RoomUser[]>([]);
  const [roomConnectionStatus, setRoomConnectionStatus] =
    useState<RoomConnectionStatus>("local");
  const menuRef = useRef<HTMLDivElement>(null);
  const lastCursorEmitRef = useRef(0);
  const stickyColorPickerRef = useRef<HTMLDivElement>(null);
  const penSettingsRef = useRef<HTMLDivElement>(null);
  const shapePickerRef = useRef<HTMLDivElement>(null);
  const titleButtonRef = useRef<HTMLButtonElement>(null);
  const titleInputRef = useRef<HTMLInputElement>(null);
  const titleMeasureRef = useRef<HTMLSpanElement>(null);
  const successToastTimeoutRef = useRef<number | null>(null);
  const roomErrorToastTimeoutRef = useRef<number | null>(null);
  const activeRoomCodeRef = useRef<string | null>(null);
  const roomConnectionStatusRef = useRef<RoomConnectionStatus>("local");
  const isEditingTitleRef = useRef(false);
  const hasShownDisconnectToastRef = useRef(false);
  const hasShownReconnectingToastRef = useRef(false);
  const hasShownReconnectFailedToastRef = useRef(false);
  const hasShownConnectErrorToastRef = useRef(false);
  const skipTitleBlurSaveRef = useRef(false);
  const hasEditedTitleRef = useRef(false);
  const whiteboardCanvasRef = useRef<WhiteboardCanvasHandle>(null);
  const canUndo = undoHistory.length > 0;
  const canRedo = redoHistory.length > 0;
  const canClearBoard =
    lines.length > 0 ||
    notes.length > 0 ||
    shapes.length > 0 ||
    textBoxes.length > 0;
  const [isDirty, setIsDirty] = useState(false);
  const [hasLoadedRecentBoards, setHasLoadedRecentBoards] = useState(false);
  const [recentBoards, setRecentBoards] = useState<RecentBoard[]>([]);

  const getBoardFileData = useCallback(
    (): BoardFileData => ({
      version: 1,
      title: boardTitle.trim() || "Untitled Board",
      lines,
      notes,
      shapes,
      textBoxes,
      savedAt: new Date().toISOString(),
    }),
    [boardTitle, lines, notes, shapes, textBoxes],
  );

  const applyBoardData = useCallback((boardData: BoardFileData) => {
    const nextTitle = boardData.title?.trim() || "Untitled Board";

    setBoardTitle(nextTitle);
    setDraftTitle(nextTitle);
    setLines(Array.isArray(boardData.lines) ? boardData.lines : []);
    setNotes(getBoardNotes(boardData));
    setShapes(getBoardShapes(boardData));
    setTextBoxes(getBoardTextBoxes(boardData));
    setUndoHistory([]);
    setRedoHistory([]);
  }, []);

  const showSuccessToast = useCallback((message: string) => {
    if (successToastTimeoutRef.current !== null) {
      window.clearTimeout(successToastTimeoutRef.current);
    }

    setSuccessToastMessage(message);
    setSuccessToastKey((currentKey) => currentKey + 1);
    setIsSuccessToastVisible(true);
    successToastTimeoutRef.current = window.setTimeout(() => {
      setIsSuccessToastVisible(false);
      successToastTimeoutRef.current = null;
    }, 2000);
  }, []);

  const showRoomErrorToast = useCallback((message: string) => {
    if (roomErrorToastTimeoutRef.current !== null) {
      window.clearTimeout(roomErrorToastTimeoutRef.current);
    }

    setRoomError(message);
    setRoomErrorToastKey((currentKey) => currentKey + 1);
    setIsRoomErrorToastVisible(true);
    roomErrorToastTimeoutRef.current = window.setTimeout(() => {
      setIsRoomErrorToastVisible(false);
      roomErrorToastTimeoutRef.current = null;
    }, 2000);
  }, []);

  const canEmitCursorEvents = useCallback(() => {
    return (
      Boolean(activeRoomCodeRef.current) &&
      roomConnectionStatusRef.current === "connected"
    );
  }, []);

  const handleCursorMove = useCallback(
    (point: { x: number; y: number }) => {
      if (!canEmitCursorEvents() || !activeRoomCodeRef.current) {
        return;
      }

      const now = performance.now();

      if (now - lastCursorEmitRef.current < 40) {
        return;
      }

      lastCursorEmitRef.current = now;

      socket.emit("board:cursor:update", {
        roomCode: activeRoomCodeRef.current,
        x: point.x,
        y: point.y,
      });
    },
    [canEmitCursorEvents],
  );

  const handleCursorLeave = useCallback(() => {
    if (!canEmitCursorEvents() || !activeRoomCodeRef.current) {
      return;
    }

    socket.emit("board:cursor:leave", {
      roomCode: activeRoomCodeRef.current,
    });
  }, [canEmitCursorEvents]);

  const canEmitBoardLineEvents = useCallback(() => {
    return (
      Boolean(activeRoomCodeRef.current) &&
      roomConnectionStatusRef.current === "connected"
    );
  }, []);

  const emitLineCreate = useCallback(
    (line: DrawnLine) => {
      if (!canEmitBoardLineEvents() || !activeRoomCodeRef.current) {
        return;
      }

      socket.emit("board:line:create", {
        roomCode: activeRoomCodeRef.current,
        line,
      });
    },
    [canEmitBoardLineEvents],
  );

  const emitLineUpdate = useCallback(
    (line: DrawnLine) => {
      if (!canEmitBoardLineEvents() || !activeRoomCodeRef.current) {
        return;
      }

      socket.emit("board:line:update", {
        roomCode: activeRoomCodeRef.current,
        line,
      });
    },
    [canEmitBoardLineEvents],
  );

  const emitLineDelete = useCallback(
    (lineId: string) => {
      if (!canEmitBoardLineEvents() || !activeRoomCodeRef.current) {
        return;
      }

      socket.emit("board:line:delete", {
        roomCode: activeRoomCodeRef.current,
        lineId,
      });
    },
    [canEmitBoardLineEvents],
  );

  const emitLinesDelete = useCallback(
    (lineIds: string[]) => {
      if (
        lineIds.length === 0 ||
        !canEmitBoardLineEvents() ||
        !activeRoomCodeRef.current
      ) {
        return;
      }

      socket.emit("board:lines:delete", {
        roomCode: activeRoomCodeRef.current,
        lineIds,
      });
    },
    [canEmitBoardLineEvents],
  );

  const resetConnectionToastGuards = useCallback(() => {
    hasShownDisconnectToastRef.current = false;
    hasShownReconnectingToastRef.current = false;
    hasShownReconnectFailedToastRef.current = false;
    hasShownConnectErrorToastRef.current = false;
  }, []);

  const copyRoomCodeToClipboard = useCallback(async () => {
    if (!activeRoomCode) {
      return;
    }

    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(activeRoomCode);
      } else {
        const textArea = document.createElement("textarea");
        textArea.value = activeRoomCode;
        textArea.setAttribute("readonly", "");
        textArea.style.position = "fixed";
        textArea.style.opacity = "0";
        document.body.appendChild(textArea);
        textArea.select();
        document.execCommand("copy");
        document.body.removeChild(textArea);
      }

      showSuccessToast("Saved to Clipboard");
    } catch {
      showRoomErrorToast("Could not copy the room code.");
    }
  }, [activeRoomCode, showRoomErrorToast, showSuccessToast]);

  const closeRoomModals = useCallback(() => {
    setIsCreateRoomModalOpen(false);
    setIsJoinRoomModalOpen(false);
    setIsJoinReplaceConfirmOpen(false);
    setRoomDisplayName("");
    setJoinRoomCode("");
  }, []);

  const openCreateRoomModal = useCallback(() => {
    setRoomDisplayName("");
    setJoinRoomCode("");
    setIsMenuOpen(false);
    setIsJoinRoomModalOpen(false);
    setIsCreateRoomModalOpen(true);
  }, []);

  const openJoinRoomModal = useCallback(() => {
    setRoomDisplayName("");
    setJoinRoomCode("");
    setIsMenuOpen(false);
    setIsCreateRoomModalOpen(false);
    setIsJoinReplaceConfirmOpen(false);
    setIsJoinRoomModalOpen(true);
  }, []);

  const createRoom = useCallback(() => {
    const displayName = roomDisplayName.trim() || "Guest";

    hasShownConnectErrorToastRef.current = false;

    if (!socket.connected) {
      socket.connect();
    }

    socket.timeout(3000).emit(
      "room:create",
      {
        name: displayName,
        title: boardTitle.trim() || "Untitled Board",
        boardData: getBoardFileData(),
      },
      (error: Error | null, response?: RoomResponse) => {
        if (error || !response) {
          if (!hasShownConnectErrorToastRef.current) {
            hasShownConnectErrorToastRef.current = true;
            showRoomErrorToast("Could not connect to the room server.");
          }

          return;
        }

        if (!response.ok) {
          showRoomErrorToast(response.error);
          return;
        }

        setActiveRoomCode(response.roomCode);
        setRoomConnectionStatus("connected");
        setConnectedUsersCount(response.count);
        setRoomUsers(response.users);
        if (response.boardData) {
          applyBoardData(response.boardData);
        } else if (response.title) {
          setBoardTitle(response.title);
          setDraftTitle(response.title);
        }
        resetConnectionToastGuards();
        setRoomDisplayName(displayName);
        setIsMenuOpen(false);
        setIsCreateRoomModalOpen(false);
        setIsJoinRoomModalOpen(false);
        setJoinRoomCode("");
        showSuccessToast("Room created");
      },
    );
  }, [
    applyBoardData,
    boardTitle,
    getBoardFileData,
    resetConnectionToastGuards,
    roomDisplayName,
    showRoomErrorToast,
    showSuccessToast,
  ]);

  const joinRoom = useCallback(() => {
    const displayName = roomDisplayName.trim() || "Guest";
    const normalizedRoomCode = joinRoomCode.trim().toUpperCase();

    if (!normalizedRoomCode) {
      return;
    }

    hasShownConnectErrorToastRef.current = false;

    if (!socket.connected) {
      socket.connect();
    }

    socket.timeout(3000).emit(
      "room:join",
      {
        roomCode: normalizedRoomCode,
        name: displayName,
      },
      (error: Error | null, response?: RoomResponse) => {
        if (error || !response) {
          if (!hasShownConnectErrorToastRef.current) {
            hasShownConnectErrorToastRef.current = true;
            showRoomErrorToast("Could not connect to the room server.");
          }

          return;
        }

        if (!response.ok) {
          showRoomErrorToast(response.error);
          return;
        }

        setActiveRoomCode(response.roomCode);
        setRoomConnectionStatus("connected");
        setConnectedUsersCount(response.count);
        setRoomUsers(response.users);
        if (response.boardData) {
          applyBoardData(response.boardData);
          setIsDirty(false);
        } else if (response.title) {
          setBoardTitle(response.title);
          setDraftTitle(response.title);
        }
        resetConnectionToastGuards();
        setRoomDisplayName(displayName);
        setJoinRoomCode("");
        setIsMenuOpen(false);
        setIsCreateRoomModalOpen(false);
        setIsJoinRoomModalOpen(false);
        setIsJoinReplaceConfirmOpen(false);
        showSuccessToast("Connected");
      },
    );
  }, [
    applyBoardData,
    joinRoomCode,
    resetConnectionToastGuards,
    roomDisplayName,
    showRoomErrorToast,
    showSuccessToast,
  ]);

  const requestJoinRoom = useCallback(() => {
    const hasLocalBoardToReplace =
      isDirty ||
      lines.length > 0 ||
      notes.length > 0 ||
      shapes.length > 0 ||
      textBoxes.length > 0;

    if (!hasLocalBoardToReplace) {
      joinRoom();
      return;
    }

    setIsJoinRoomModalOpen(false);
    setIsJoinReplaceConfirmOpen(true);
  }, [
    isDirty,
    joinRoom,
    lines.length,
    notes.length,
    shapes.length,
    textBoxes.length,
  ]);

  const saveBoard = useCallback(async () => {
    const result = await window.whiteboardAPI?.saveBoard(getBoardFileData());

    if (!result || result.canceled || !result.filePath) {
      return;
    }

    const filePath = result.filePath;

    setIsDirty(false);
    setIsMenuOpen(false);
    showSuccessToast("Saved");

    setRecentBoards((currentBoards) =>
      upsertRecentBoard(currentBoards, {
        name: boardTitle.trim() || "Untitled Board",
        path: filePath,
        savedAt: new Date().toISOString(),
      }),
    );
  }, [boardTitle, getBoardFileData, showSuccessToast]);

  const saveBoardAs = useCallback(async () => {
    const result = await window.whiteboardAPI?.saveBoardAs(getBoardFileData());

    if (!result || result.canceled || !result.filePath) {
      return;
    }

    const filePath = result.filePath;

    setIsDirty(false);
    setIsMenuOpen(false);
    showSuccessToast("Saved");

    setRecentBoards((currentBoards) =>
      upsertRecentBoard(currentBoards, {
        name: boardTitle.trim() || "Untitled Board",
        path: filePath,
        savedAt: new Date().toISOString(),
      }),
    );
  }, [boardTitle, getBoardFileData, showSuccessToast]);

  const loadBoard = useCallback(async () => {
    const result = await window.whiteboardAPI?.loadBoard();

    if (!result || result.canceled || !result.data) {
      return;
    }

    applyBoardData(result.data);
    setIsDirty(false);
    setIsMenuOpen(false);

    const filePath = result.filePath;

    if (filePath) {
      setRecentBoards((currentBoards) =>
        upsertRecentBoard(currentBoards, {
          name: result.data?.title?.trim() || "Untitled Board",
          path: filePath,
          savedAt: result.data?.savedAt || new Date().toISOString(),
        }),
      );
    }
  }, [applyBoardData]);

  const resetBoardState = useCallback(() => {
    setBoardTitle("Untitled Board");
    setDraftTitle("Untitled Board");
    setLines([]);
    setNotes([]);
    setShapes([]);
    setTextBoxes([]);
    setUndoHistory([]);
    setRedoHistory([]);
    setIsDirty(false);
    setIsMenuOpen(false);
    setIsClearModalOpen(false);
    setIsStickyColorPickerOpen(false);
    setIsPenSettingsOpen(false);
    setIsShapePickerOpen(false);
    setSelectedStickyColor(null);
    setSelectedShapeType(null);
    setActiveRoomCode(null);
    setRoomConnectionStatus("local");
    setConnectedUsersCount(1);
    setRoomUsers([]);
    resetConnectionToastGuards();
    setActiveTool("select");
  }, [resetConnectionToastGuards]);

  const createNewBoard = useCallback(async () => {
    const result = await window.whiteboardAPI?.newBoard({
      isDirty,
      boardData: getBoardFileData(),
      isCollaborative: Boolean(activeRoomCode),
    });

    if (!result || result.canceled) {
      return;
    }

    resetBoardState();
  }, [activeRoomCode, getBoardFileData, isDirty, resetBoardState]);

  const exportBoardAsPng = useCallback(async () => {
    const dataUrl = await whiteboardCanvasRef.current?.getPngDataUrl();

    if (!dataUrl) {
      return;
    }

    const result = await window.whiteboardAPI?.exportBoardAsPng({
      title: boardTitle.trim() || "Untitled Board",
      dataUrl,
    });

    if (!result || result.canceled) {
      return;
    }

    setIsMenuOpen(false);
    showSuccessToast("Saved");
  }, [boardTitle, showSuccessToast]);

  const handleLinesChange = useCallback(
    (updater: (currentLines: DrawnLine[]) => DrawnLine[]) => {
      setLines(updater);
    },
    [],
  );

  const handleDrawingCommit = useCallback(
    (previousLines: DrawnLine[]) => {
      const previousLineIds = new Set(previousLines.map((line) => line.id));
      const createdLine = lines.find((line) => !previousLineIds.has(line.id));

      setIsDirty(true);
      setUndoHistory((currentHistory) => [
        ...currentHistory,
        { lines: previousLines, notes, shapes, textBoxes },
      ]);
      setRedoHistory([]);

      if (createdLine) {
        emitLineCreate(createdLine);
      }
    },
    [emitLineCreate, lines, notes, shapes, textBoxes],
  );

  const handleEraseLine = useCallback(
    (lineId: string) => {
      setLines((currentLines) => {
        if (!currentLines.some((line) => line.id === lineId)) {
          return currentLines;
        }

        emitLineDelete(lineId);
        return currentLines.filter((line) => line.id !== lineId);
      });
    },
    [emitLineDelete],
  );

  const handleEraseCommit = useCallback(
    (previousLines: DrawnLine[]) => {
      setIsDirty(true);
      setUndoHistory((currentHistory) => [
        ...currentHistory,
        { lines: previousLines, notes, shapes, textBoxes },
      ]);
      setRedoHistory([]);
    },
    [notes, shapes, textBoxes],
  );

  const handleCreateNote = useCallback(
    (note: StickyNote) => {
      setIsDirty(true);
      setUndoHistory((currentHistory) => [
        ...currentHistory,
        { lines, notes, shapes, textBoxes },
      ]);
      setRedoHistory([]);
      setNotes((currentNotes) => [...currentNotes, note]);
    },
    [lines, notes, shapes, textBoxes],
  );

  const handleStickyNotePlaced = useCallback(() => {
    setSelectedStickyColor(null);
    setIsStickyColorPickerOpen(false);
    setActiveTool("select");
  }, []);

  const handleMoveNote = useCallback(
    (noteId: string, x: number, y: number) => {
      const note = notes.find((currentNote) => currentNote.id === noteId);

      if (!note || (note.x === x && note.y === y)) {
        return;
      }

      setIsDirty(true);
      setUndoHistory((currentHistory) => [
        ...currentHistory,
        { lines, notes, shapes, textBoxes },
      ]);
      setRedoHistory([]);
      setNotes((currentNotes) =>
        currentNotes.map((currentNote) =>
          currentNote.id === noteId ? { ...currentNote, x, y } : currentNote,
        ),
      );
    },
    [lines, notes, shapes, textBoxes],
  );

  const handleResizeNote = useCallback(
    (
      noteId: string,
      bounds: Pick<StickyNote, "x" | "y" | "width" | "height">,
    ) => {
      const note = notes.find((currentNote) => currentNote.id === noteId);

      if (
        !note ||
        (note.x === bounds.x &&
          note.y === bounds.y &&
          note.width === bounds.width &&
          note.height === bounds.height)
      ) {
        return;
      }

      setIsDirty(true);
      setUndoHistory((currentHistory) => [
        ...currentHistory,
        { lines, notes, shapes, textBoxes },
      ]);
      setRedoHistory([]);
      setNotes((currentNotes) =>
        currentNotes.map((currentNote) =>
          currentNote.id === noteId
            ? { ...currentNote, ...bounds }
            : currentNote,
        ),
      );
    },
    [lines, notes, shapes, textBoxes],
  );

  const handleEditNote = useCallback(
    (noteId: string, text: string) => {
      const nextText = text.trim() || "New note";
      const note = notes.find((currentNote) => currentNote.id === noteId);

      if (!note || note.text === nextText) {
        return;
      }

      setIsDirty(true);
      setUndoHistory((currentHistory) => [
        ...currentHistory,
        { lines, notes, shapes, textBoxes },
      ]);
      setRedoHistory([]);
      setNotes((currentNotes) =>
        currentNotes.map((currentNote) =>
          currentNote.id === noteId
            ? { ...currentNote, text: nextText }
            : currentNote,
        ),
      );
    },
    [lines, notes, shapes, textBoxes],
  );

  const handleDeleteNote = useCallback(
    (noteId: string) => {
      if (!notes.some((note) => note.id === noteId)) {
        return;
      }

      setIsDirty(true);
      setUndoHistory((currentHistory) => [
        ...currentHistory,
        { lines, notes, shapes, textBoxes },
      ]);
      setRedoHistory([]);
      setNotes((currentNotes) =>
        currentNotes.filter((note) => note.id !== noteId),
      );
    },
    [lines, notes, shapes, textBoxes],
  );

  const handleCreateTextBox = useCallback(
    (textBox: TextBox) => {
      if (textBox.text.trim()) {
        setIsDirty(true);
        setUndoHistory((currentHistory) => [
          ...currentHistory,
          { lines, notes, shapes, textBoxes },
        ]);
        setRedoHistory([]);
      }

      setTextBoxes((currentTextBoxes) => [...currentTextBoxes, textBox]);
    },
    [lines, notes, shapes, textBoxes],
  );

  const handleMoveTextBox = useCallback(
    (textBoxId: string, x: number, y: number) => {
      const textBox = textBoxes.find(
        (currentTextBox) => currentTextBox.id === textBoxId,
      );

      if (!textBox || (textBox.x === x && textBox.y === y)) {
        return;
      }

      setIsDirty(true);
      setUndoHistory((currentHistory) => [
        ...currentHistory,
        { lines, notes, shapes, textBoxes },
      ]);
      setRedoHistory([]);
      setTextBoxes((currentTextBoxes) =>
        currentTextBoxes.map((currentTextBox) =>
          currentTextBox.id === textBoxId
            ? { ...currentTextBox, x, y }
            : currentTextBox,
        ),
      );
    },
    [lines, notes, shapes, textBoxes],
  );

  const handleResizeTextBox = useCallback(
    (
      textBoxId: string,
      bounds: Pick<TextBox, "x" | "y" | "width" | "height">,
    ) => {
      const textBox = textBoxes.find(
        (currentTextBox) => currentTextBox.id === textBoxId,
      );

      if (
        !textBox ||
        (textBox.x === bounds.x &&
          textBox.y === bounds.y &&
          textBox.width === bounds.width &&
          textBox.height === bounds.height)
      ) {
        return;
      }

      setIsDirty(true);
      setUndoHistory((currentHistory) => [
        ...currentHistory,
        { lines, notes, shapes, textBoxes },
      ]);
      setRedoHistory([]);
      setTextBoxes((currentTextBoxes) =>
        currentTextBoxes.map((currentTextBox) =>
          currentTextBox.id === textBoxId
            ? { ...currentTextBox, ...bounds }
            : currentTextBox,
        ),
      );
    },
    [lines, notes, shapes, textBoxes],
  );

  const handleEditTextBox = useCallback(
    (textBoxId: string, text: string) => {
      const nextText = text.trim();

      setTextBoxes((currentTextBoxes) => {
        const currentTextBox = currentTextBoxes.find(
          (textBox) => textBox.id === textBoxId,
        );

        if (!currentTextBox || currentTextBox.text === nextText) {
          return currentTextBoxes;
        }

        const previousTextBoxes =
          currentTextBox.text.trim() === ""
            ? currentTextBoxes.filter((textBox) => textBox.id !== textBoxId)
            : currentTextBoxes;

        setIsDirty(true);
        setUndoHistory((currentHistory) => [
          ...currentHistory,
          { lines, notes, shapes, textBoxes: previousTextBoxes },
        ]);
        setRedoHistory([]);

        return currentTextBoxes.map((textBox) =>
          textBox.id === textBoxId ? { ...textBox, text: nextText } : textBox,
        );
      });
    },
    [lines, notes, shapes],
  );

  const handleUpdateTextBoxStyle = useCallback(
    (
      textBoxId: string,
      style: Partial<
        Pick<TextBox, "textColor" | "fontSize" | "fontWeight" | "textAlign">
      >,
    ) => {
      const textBox = textBoxes.find(
        (currentTextBox) => currentTextBox.id === textBoxId,
      );

      if (!textBox) {
        return;
      }

      const hasChanges = Object.entries(style).some(
        ([key, value]) => textBox[key as keyof typeof style] !== value,
      );

      if (!hasChanges) {
        return;
      }

      setIsDirty(true);
      setUndoHistory((currentHistory) => [
        ...currentHistory,
        { lines, notes, shapes, textBoxes },
      ]);
      setRedoHistory([]);
      setTextBoxes((currentTextBoxes) =>
        currentTextBoxes.map((currentTextBox) =>
          currentTextBox.id === textBoxId
            ? { ...currentTextBox, ...style }
            : currentTextBox,
        ),
      );
    },
    [lines, notes, shapes, textBoxes],
  );

  const handleDeleteTextBox = useCallback(
    (textBoxId: string) => {
      setTextBoxes((currentTextBoxes) => {
        const currentTextBox = currentTextBoxes.find(
          (textBox) => textBox.id === textBoxId,
        );

        if (!currentTextBox) {
          return currentTextBoxes;
        }

        if (currentTextBox.text.trim() === "") {
          return currentTextBoxes.filter((textBox) => textBox.id !== textBoxId);
        }

        setIsDirty(true);
        setUndoHistory((currentHistory) => [
          ...currentHistory,
          { lines, notes, shapes, textBoxes: currentTextBoxes },
        ]);
        setRedoHistory([]);

        return currentTextBoxes.filter((textBox) => textBox.id !== textBoxId);
      });
    },
    [lines, notes, shapes],
  );

  const handleTextBoxPlaced = useCallback(() => {
    setActiveTool("select");
  }, []);

  const handleCreateShape = useCallback(
    (shape: Shape) => {
      setIsDirty(true);
      setUndoHistory((currentHistory) => [
        ...currentHistory,
        { lines, notes, shapes, textBoxes },
      ]);
      setRedoHistory([]);
      setShapes((currentShapes) => [...currentShapes, shape]);
    },
    [lines, notes, shapes, textBoxes],
  );

  const handleMoveShape = useCallback(
    (shapeId: string, x: number, y: number) => {
      const shape = shapes.find((currentShape) => currentShape.id === shapeId);

      if (!shape || (shape.x === x && shape.y === y)) {
        return;
      }

      setIsDirty(true);
      setUndoHistory((currentHistory) => [
        ...currentHistory,
        { lines, notes, shapes, textBoxes },
      ]);
      setRedoHistory([]);
      setShapes((currentShapes) =>
        currentShapes.map((currentShape) =>
          currentShape.id === shapeId
            ? { ...currentShape, x, y }
            : currentShape,
        ),
      );
    },
    [lines, notes, shapes, textBoxes],
  );

  const handleResizeShape = useCallback(
    (shapeId: string, bounds: Pick<Shape, "x" | "y" | "width" | "height">) => {
      const shape = shapes.find((currentShape) => currentShape.id === shapeId);

      if (
        !shape ||
        (shape.x === bounds.x &&
          shape.y === bounds.y &&
          shape.width === bounds.width &&
          shape.height === bounds.height)
      ) {
        return;
      }

      setIsDirty(true);
      setUndoHistory((currentHistory) => [
        ...currentHistory,
        { lines, notes, shapes, textBoxes },
      ]);
      setRedoHistory([]);
      setShapes((currentShapes) =>
        currentShapes.map((currentShape) =>
          currentShape.id === shapeId
            ? { ...currentShape, ...bounds }
            : currentShape,
        ),
      );
    },
    [lines, notes, shapes, textBoxes],
  );

  const handleEditShape = useCallback(
    (shapeId: string, text: string) => {
      const nextText = text.trim() || "Shape";
      const shape = shapes.find((currentShape) => currentShape.id === shapeId);

      if (!shape || shape.text === nextText) {
        return;
      }

      setIsDirty(true);
      setUndoHistory((currentHistory) => [
        ...currentHistory,
        { lines, notes, shapes, textBoxes },
      ]);
      setRedoHistory([]);
      setShapes((currentShapes) =>
        currentShapes.map((currentShape) =>
          currentShape.id === shapeId
            ? { ...currentShape, text: nextText }
            : currentShape,
        ),
      );
    },
    [lines, notes, shapes, textBoxes],
  );

  const handleUpdateShapeStyle = useCallback(
    (
      shapeId: string,
      style: Partial<
        Pick<
          Shape,
          | "fill"
          | "stroke"
          | "strokeWidth"
          | "lineStyle"
          | "textColor"
          | "fontSize"
          | "fontWeight"
          | "textAlign"
        >
      >,
    ) => {
      const shape = shapes.find((currentShape) => currentShape.id === shapeId);

      if (!shape) {
        return;
      }

      const hasChanges = Object.entries(style).some(
        ([key, value]) => shape[key as keyof typeof style] !== value,
      );

      if (!hasChanges) {
        return;
      }

      setIsDirty(true);
      setUndoHistory((currentHistory) => [
        ...currentHistory,
        { lines, notes, shapes, textBoxes },
      ]);
      setRedoHistory([]);
      setShapes((currentShapes) =>
        currentShapes.map((currentShape) =>
          currentShape.id === shapeId
            ? { ...currentShape, ...style }
            : currentShape,
        ),
      );
    },
    [lines, notes, shapes, textBoxes],
  );

  const handleDeleteShape = useCallback(
    (shapeId: string) => {
      if (!shapes.some((shape) => shape.id === shapeId)) {
        return;
      }

      setIsDirty(true);
      setUndoHistory((currentHistory) => [
        ...currentHistory,
        { lines, notes, shapes, textBoxes },
      ]);
      setRedoHistory([]);
      setShapes((currentShapes) =>
        currentShapes.filter((shape) => shape.id !== shapeId),
      );
    },
    [lines, notes, shapes, textBoxes],
  );

  const handleMoveSelectedObjects = useCallback(
    (deltaX: number, deltaY: number, selectedIds: SelectedObjectIds) => {
      if (deltaX === 0 && deltaY === 0) {
        return;
      }

      const hasSelection =
        selectedIds.lineIds.length > 0 ||
        selectedIds.noteIds.length > 0 ||
        selectedIds.textBoxIds.length > 0 ||
        selectedIds.shapeIds.length > 0;

      if (!hasSelection) {
        return;
      }

      setIsDirty(true);
      setUndoHistory((currentHistory) => [
        ...currentHistory,
        { lines, notes, shapes, textBoxes },
      ]);
      setRedoHistory([]);
      lines
        .filter((line) => selectedIds.lineIds.includes(line.id))
        .map((line) => ({
          ...line,
          points: line.points.map((point, index) =>
            index % 2 === 0 ? point + deltaX : point + deltaY,
          ),
        }))
        .forEach(emitLineUpdate);
      setLines((currentLines) =>
        currentLines.map((line) =>
          selectedIds.lineIds.includes(line.id)
            ? {
                ...line,
                points: line.points.map((point, index) =>
                  index % 2 === 0 ? point + deltaX : point + deltaY,
                ),
              }
            : line,
        ),
      );
      setNotes((currentNotes) =>
        currentNotes.map((note) =>
          selectedIds.noteIds.includes(note.id)
            ? { ...note, x: note.x + deltaX, y: note.y + deltaY }
            : note,
        ),
      );
      setTextBoxes((currentTextBoxes) =>
        currentTextBoxes.map((textBox) =>
          selectedIds.textBoxIds.includes(textBox.id)
            ? { ...textBox, x: textBox.x + deltaX, y: textBox.y + deltaY }
            : textBox,
        ),
      );
      setShapes((currentShapes) =>
        currentShapes.map((shape) =>
          selectedIds.shapeIds.includes(shape.id)
            ? { ...shape, x: shape.x + deltaX, y: shape.y + deltaY }
            : shape,
        ),
      );
    },
    [emitLineUpdate, lines, notes, shapes, textBoxes],
  );

  const handleDeleteSelectedObjects = useCallback(
    (selectedIds: SelectedObjectIds) => {
      const hasSelection =
        selectedIds.lineIds.length > 0 ||
        selectedIds.noteIds.length > 0 ||
        selectedIds.textBoxIds.length > 0 ||
        selectedIds.shapeIds.length > 0;

      if (!hasSelection) {
        return;
      }

      setIsDirty(true);
      setUndoHistory((currentHistory) => [
        ...currentHistory,
        { lines, notes, shapes, textBoxes },
      ]);
      setRedoHistory([]);
      emitLinesDelete(selectedIds.lineIds);
      setLines((currentLines) =>
        currentLines.filter((line) => !selectedIds.lineIds.includes(line.id)),
      );
      setNotes((currentNotes) =>
        currentNotes.filter((note) => !selectedIds.noteIds.includes(note.id)),
      );
      setTextBoxes((currentTextBoxes) =>
        currentTextBoxes.filter(
          (textBox) => !selectedIds.textBoxIds.includes(textBox.id),
        ),
      );
      setShapes((currentShapes) =>
        currentShapes.filter(
          (shape) => !selectedIds.shapeIds.includes(shape.id),
        ),
      );
    },
    [emitLinesDelete, lines, notes, shapes, textBoxes],
  );

  const handleCreateObjectsBatch = useCallback(
    (objects: {
      lines: DrawnLine[];
      notes: StickyNote[];
      textBoxes: TextBox[];
      shapes: Shape[];
    }) => {
      if (
        objects.lines.length === 0 &&
        objects.notes.length === 0 &&
        objects.textBoxes.length === 0 &&
        objects.shapes.length === 0
      ) {
        return;
      }

      setIsDirty(true);
      setUndoHistory((currentHistory) => [
        ...currentHistory,
        { lines, notes, shapes, textBoxes },
      ]);
      setRedoHistory([]);
      objects.lines.forEach(emitLineCreate);
      setLines((currentLines) => [...currentLines, ...objects.lines]);
      setNotes((currentNotes) => [...currentNotes, ...objects.notes]);
      setTextBoxes((currentTextBoxes) => [
        ...currentTextBoxes,
        ...objects.textBoxes,
      ]);
      setShapes((currentShapes) => [...currentShapes, ...objects.shapes]);
    },
    [emitLineCreate, lines, notes, shapes, textBoxes],
  );

  const getAllZIndexes = (): number[] => [
    ...lines.map((line) => line.zIndex ?? 0),
    ...notes.map((note) => note.zIndex ?? 0),
    ...textBoxes.map((textBox) => textBox.zIndex ?? 0),
    ...shapes.map((shape) => shape.zIndex ?? 0),
  ];

  const handleLayerObject = useCallback(
    (
      target:
        | { type: "line"; id: string }
        | { type: "note"; id: string }
        | { type: "textBox"; id: string }
        | { type: "shape"; id: string },
      action: LayerAction,
    ) => {
      const allObjects = [
        ...lines.map((line) => ({
          type: "line" as const,
          id: line.id,
          zIndex: line.zIndex ?? 0,
        })),
        ...notes.map((note) => ({
          type: "note" as const,
          id: note.id,
          zIndex: note.zIndex ?? 0,
        })),
        ...textBoxes.map((textBox) => ({
          type: "textBox" as const,
          id: textBox.id,
          zIndex: textBox.zIndex ?? 0,
        })),
        ...shapes.map((shape) => ({
          type: "shape" as const,
          id: shape.id,
          zIndex: shape.zIndex ?? 0,
        })),
      ];

      const currentObject = allObjects.find(
        (object) => object.type === target.type && object.id === target.id,
      );

      if (!currentObject) {
        return;
      }

      let nextZIndex = currentObject.zIndex;
      let swapObject: {
        type: "line" | "note" | "textBox" | "shape";
        id: string;
        zIndex: number;
      } | null = null;

      if (action === "front") {
        nextZIndex = Math.max(...allObjects.map((object) => object.zIndex)) + 1;
      }

      if (action === "back") {
        nextZIndex = Math.min(...allObjects.map((object) => object.zIndex)) - 1;
      }

      if (action === "forward") {
        swapObject =
          allObjects
            .filter((object) => object.zIndex > currentObject.zIndex)
            .sort((a, b) => a.zIndex - b.zIndex)[0] ?? null;

        if (!swapObject) {
          return;
        }

        nextZIndex = swapObject.zIndex;
      }

      if (action === "backward") {
        swapObject =
          allObjects
            .filter((object) => object.zIndex < currentObject.zIndex)
            .sort((a, b) => b.zIndex - a.zIndex)[0] ?? null;

        if (!swapObject) {
          return;
        }

        nextZIndex = swapObject.zIndex;
      }

      if (nextZIndex === currentObject.zIndex && !swapObject) {
        return;
      }

      setIsDirty(true);
      setUndoHistory((currentHistory) => [
        ...currentHistory,
        { lines, notes, shapes, textBoxes },
      ]);
      setRedoHistory([]);

      const getNextObjectZIndex = (object: {
        type: "line" | "note" | "textBox" | "shape";
        id: string;
        zIndex: number;
      }) => {
        if (object.type === target.type && object.id === target.id) {
          return nextZIndex;
        }

        if (
          swapObject &&
          object.type === swapObject.type &&
          object.id === swapObject.id
        ) {
          return currentObject.zIndex;
        }

        return object.zIndex;
      };

      setLines((currentLines) =>
        currentLines.map((line) => ({
          ...line,
          zIndex: getNextObjectZIndex({
            type: "line",
            id: line.id,
            zIndex: line.zIndex ?? 0,
          }),
        })),
      );

      setNotes((currentNotes) =>
        currentNotes.map((note) => ({
          ...note,
          zIndex: getNextObjectZIndex({
            type: "note",
            id: note.id,
            zIndex: note.zIndex ?? 0,
          }),
        })),
      );

      setTextBoxes((currentTextBoxes) =>
        currentTextBoxes.map((textBox) => ({
          ...textBox,
          zIndex: getNextObjectZIndex({
            type: "textBox",
            id: textBox.id,
            zIndex: textBox.zIndex ?? 0,
          }),
        })),
      );

      setShapes((currentShapes) =>
        currentShapes.map((shape) => ({
          ...shape,
          zIndex: getNextObjectZIndex({
            type: "shape",
            id: shape.id,
            zIndex: shape.zIndex ?? 0,
          }),
        })),
      );
    },
    [lines, notes, shapes, textBoxes],
  );

  const handleLayerSelectedObjects = useCallback(
    (selectedIds: SelectedObjectIds, action: LayerAction) => {
      const selectedLineIds = new Set(selectedIds.lineIds);
      const selectedNoteIds = new Set(selectedIds.noteIds);
      const selectedTextBoxIds = new Set(selectedIds.textBoxIds);
      const selectedShapeIds = new Set(selectedIds.shapeIds);

      const selectedZIndexes = [
        ...lines
          .filter((line) => selectedLineIds.has(line.id))
          .map((line) => line.zIndex ?? 0),
        ...notes
          .filter((note) => selectedNoteIds.has(note.id))
          .map((note) => note.zIndex ?? 0),
        ...textBoxes
          .filter((textBox) => selectedTextBoxIds.has(textBox.id))
          .map((textBox) => textBox.zIndex ?? 0),
        ...shapes
          .filter((shape) => selectedShapeIds.has(shape.id))
          .map((shape) => shape.zIndex ?? 0),
      ];

      if (selectedZIndexes.length === 0) {
        return;
      }

      const allZIndexes = getAllZIndexes();
      const selectedMin = Math.min(...selectedZIndexes);
      const selectedMax = Math.max(...selectedZIndexes);

      let offset = 0;

      if (action === "front") {
        offset = Math.max(...allZIndexes) - selectedMax + 1;
      }

      if (action === "back") {
        offset = Math.min(...allZIndexes) - selectedMin - 1;
      }

      if (action === "forward") {
        offset = 1;
      }

      if (action === "backward") {
        offset = -1;
      }

      if (offset === 0) {
        return;
      }

      setIsDirty(true);
      setUndoHistory((currentHistory) => [
        ...currentHistory,
        { lines, notes, shapes, textBoxes },
      ]);
      setRedoHistory([]);

      setLines((currentLines) =>
        currentLines.map((line) =>
          selectedLineIds.has(line.id)
            ? { ...line, zIndex: line.zIndex + offset }
            : line,
        ),
      );

      setNotes((currentNotes) =>
        currentNotes.map((note) =>
          selectedNoteIds.has(note.id)
            ? { ...note, zIndex: note.zIndex + offset }
            : note,
        ),
      );

      setTextBoxes((currentTextBoxes) =>
        currentTextBoxes.map((textBox) =>
          selectedTextBoxIds.has(textBox.id)
            ? { ...textBox, zIndex: textBox.zIndex + offset }
            : textBox,
        ),
      );

      setShapes((currentShapes) =>
        currentShapes.map((shape) =>
          selectedShapeIds.has(shape.id)
            ? { ...shape, zIndex: shape.zIndex + offset }
            : shape,
        ),
      );
    },
    [lines, notes, shapes, textBoxes],
  );

  const handleShapePlaced = useCallback(() => {
    setSelectedShapeType(null);
    setIsShapePickerOpen(false);
    setActiveTool("select");
  }, []);

  const handleZoomChange = useCallback((zoom: number) => {
    setCanvasZoom(zoom);
  }, []);

  const undo = useCallback(() => {
    if (!canUndo) {
      return;
    }

    const previousSnapshot = undoHistory[undoHistory.length - 1];

    setUndoHistory((currentHistory) => currentHistory.slice(0, -1));
    setRedoHistory((currentHistory) => [
      ...currentHistory,
      { lines, notes, shapes, textBoxes },
    ]);
    setLines(previousSnapshot.lines);
    setNotes(previousSnapshot.notes);
    setShapes(previousSnapshot.shapes);
    setTextBoxes(previousSnapshot.textBoxes);
  }, [canUndo, lines, notes, shapes, textBoxes, undoHistory]);

  const redo = useCallback(() => {
    if (!canRedo) {
      return;
    }

    const nextSnapshot = redoHistory[redoHistory.length - 1];

    setRedoHistory((currentHistory) => currentHistory.slice(0, -1));
    setUndoHistory((currentHistory) => [
      ...currentHistory,
      { lines, notes, shapes, textBoxes },
    ]);
    setLines(nextSnapshot.lines);
    setNotes(nextSnapshot.notes);
    setShapes(nextSnapshot.shapes);
    setTextBoxes(nextSnapshot.textBoxes);
  }, [canRedo, lines, notes, shapes, textBoxes, redoHistory]);

  const clearBoard = useCallback(() => {
    if (!canClearBoard) {
      return;
    }

    setIsDirty(true);
    setUndoHistory((currentHistory) => [
      ...currentHistory,
      { lines, notes, shapes, textBoxes },
    ]);
    setRedoHistory([]);
    setLines([]);
    setNotes([]);
    setShapes([]);
    setTextBoxes([]);
    setIsClearModalOpen(false);
  }, [canClearBoard, lines, notes, shapes, textBoxes]);

  const saveTitle = () => {
    if (skipTitleBlurSaveRef.current) {
      skipTitleBlurSaveRef.current = false;
      return;
    }

    const nextTitle = draftTitle.trim() || "Untitled Board";
    const titleChanged = nextTitle !== boardTitle;

    hasEditedTitleRef.current = false;
    setBoardTitle(nextTitle);
    setDraftTitle(nextTitle);
    setIsEditingTitle(false);
    if (titleChanged) {
      setIsDirty(true);

      if (activeRoomCode && roomConnectionStatus === "connected") {
        socket.emit("board:title:update", {
          roomCode: activeRoomCode,
          title: nextTitle,
        });
      }
    }
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

  const openRecentBoard = useCallback(
    async (board: RecentBoard) => {
      setIsMenuOpen(false);

      const result = await window.whiteboardAPI?.loadBoardFromPath(board.path);

      if (!result || result.canceled || !result.data) {
        setRecentBoards((currentBoards) =>
          currentBoards.filter(
            (recentBoard) => recentBoard.path !== board.path,
          ),
        );
        return;
      }

      const title = result.data.title || "Untitled Board";

      applyBoardData(result.data);
      setIsDirty(false);

      setRecentBoards((currentBoards) =>
        upsertRecentBoard(currentBoards, {
          name: title,
          path: board.path,
          savedAt: result.data?.savedAt || new Date().toISOString(),
        }),
      );
    },
    [applyBoardData],
  );

  useEffect(() => {
    const storedBoards = localStorage.getItem(RECENT_BOARDS_STORAGE_KEY);

    if (!storedBoards) {
      setHasLoadedRecentBoards(true);
      return;
    }

    try {
      const parsedBoards: unknown = JSON.parse(storedBoards);

      if (!Array.isArray(parsedBoards) || !parsedBoards.every(isRecentBoard)) {
        localStorage.removeItem(RECENT_BOARDS_STORAGE_KEY);
        return;
      }

      setRecentBoards(parsedBoards.slice(0, 8));
    } catch {
      localStorage.removeItem(RECENT_BOARDS_STORAGE_KEY);
    } finally {
      setHasLoadedRecentBoards(true);
    }
  }, []);

  useEffect(() => {
    if (!hasLoadedRecentBoards) {
      return;
    }

    localStorage.setItem(
      RECENT_BOARDS_STORAGE_KEY,
      JSON.stringify(recentBoards),
    );
  }, [hasLoadedRecentBoards, recentBoards]);

  useEffect(() => {
    window.whiteboardAPI?.onRequestCloseState(() => {
      window.whiteboardAPI?.respondToCloseRequest({
        isDirty,
        boardData: getBoardFileData(),
      });
    });
  }, [getBoardFileData, isDirty]);

  useEffect(() => {
    const handleRemoteCursorUpdate = (payload: {
      roomCode: string;
      socketId: string;
      name: string;
      x: number;
      y: number;
    }) => {
      if (payload.roomCode !== activeRoomCodeRef.current) {
        return;
      }

      if (payload.socketId === socket.id) {
        return;
      }

      setRemoteCursors((currentCursors) => ({
        ...currentCursors,
        [payload.socketId]: {
          socketId: payload.socketId,
          name: getDisplayName(payload.name),
          x: payload.x,
          y: payload.y,
          color: getStableColorFromKey(payload.socketId),
          updatedAt: Date.now(),
        },
      }));
    };

    const handleRemoteCursorLeave = (payload: {
      roomCode: string;
      socketId: string;
    }) => {
      if (payload.roomCode !== activeRoomCodeRef.current) {
        return;
      }

      setRemoteCursors((currentCursors) => {
        const nextCursors = { ...currentCursors };
        delete nextCursors[payload.socketId];
        return nextCursors;
      });
    };

    socket.on("board:cursor:update", handleRemoteCursorUpdate);
    socket.on("board:cursor:leave", handleRemoteCursorLeave);

    return () => {
      socket.off("board:cursor:update", handleRemoteCursorUpdate);
      socket.off("board:cursor:leave", handleRemoteCursorLeave);
    };
  }, []);

  useEffect(() => {
    if (
      roomConnectionStatus === "local" ||
      roomConnectionStatus === "disconnected"
    ) {
      setRemoteCursors({});
    }
  }, [roomConnectionStatus]);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      const now = Date.now();

      setRemoteCursors((currentCursors) => {
        const nextCursors = Object.fromEntries(
          Object.entries(currentCursors).filter(
            ([, cursor]) => now - cursor.updatedAt < 5000,
          ),
        );

        return nextCursors;
      });
    }, 2000);

    return () => window.clearInterval(intervalId);
  }, []);

  useEffect(() => {
    activeRoomCodeRef.current = activeRoomCode;
  }, [activeRoomCode]);

  useEffect(() => {
    roomConnectionStatusRef.current = roomConnectionStatus;
  }, [roomConnectionStatus]);

  useEffect(() => {
    isEditingTitleRef.current = isEditingTitle;
  }, [isEditingTitle]);

  useEffect(() => {
    if (roomConnectionStatus === "local") {
      setRoomUsers([]);
    }
  }, [roomConnectionStatus]);

  useEffect(() => {
    const handleBoardTitleUpdate = (payload: {
      roomCode: string;
      title: string;
    }) => {
      if (payload.roomCode !== activeRoomCodeRef.current) {
        return;
      }

      const nextTitle = payload.title.trim() || "Untitled Board";

      setBoardTitle(nextTitle);

      if (!isEditingTitleRef.current) {
        setDraftTitle(nextTitle);
      }
    };

    socket.on("board:title:update", handleBoardTitleUpdate);

    return () => {
      socket.off("board:title:update", handleBoardTitleUpdate);
    };
  }, []);

  useEffect(() => {
    const handleRemoteLineCreate = (payload: {
      roomCode: string;
      line: DrawnLine;
    }) => {
      if (payload.roomCode !== activeRoomCodeRef.current) {
        return;
      }

      setLines((currentLines) =>
        currentLines.some((line) => line.id === payload.line.id)
          ? currentLines
          : [...currentLines, payload.line],
      );
    };

    const handleRemoteLineUpdate = (payload: {
      roomCode: string;
      line: DrawnLine;
    }) => {
      if (payload.roomCode !== activeRoomCodeRef.current) {
        return;
      }

      setLines((currentLines) =>
        currentLines.map((line) =>
          line.id === payload.line.id ? payload.line : line,
        ),
      );
    };

    const handleRemoteLineDelete = (payload: {
      roomCode: string;
      lineId: string;
    }) => {
      if (payload.roomCode !== activeRoomCodeRef.current) {
        return;
      }

      setLines((currentLines) =>
        currentLines.filter((line) => line.id !== payload.lineId),
      );
    };

    const handleRemoteLinesDelete = (payload: {
      roomCode: string;
      lineIds: string[];
    }) => {
      if (payload.roomCode !== activeRoomCodeRef.current) {
        return;
      }

      const lineIdSet = new Set(payload.lineIds);

      setLines((currentLines) =>
        currentLines.filter((line) => !lineIdSet.has(line.id)),
      );
    };

    socket.on("board:line:create", handleRemoteLineCreate);
    socket.on("board:line:update", handleRemoteLineUpdate);
    socket.on("board:line:delete", handleRemoteLineDelete);
    socket.on("board:lines:delete", handleRemoteLinesDelete);

    return () => {
      socket.off("board:line:create", handleRemoteLineCreate);
      socket.off("board:line:update", handleRemoteLineUpdate);
      socket.off("board:line:delete", handleRemoteLineDelete);
      socket.off("board:lines:delete", handleRemoteLinesDelete);
    };
  }, []);

  useEffect(() => {
    const handleRoomUsers = (payload: {
      roomCode: string;
      users: RoomUser[];
      count: number;
    }) => {
      setActiveRoomCode(payload.roomCode);
      setRoomConnectionStatus("connected");
      setRoomUsers(payload.users);
      setConnectedUsersCount(payload.count);
    };

    socket.on("room:users", handleRoomUsers);

    return () => {
      socket.off("room:users", handleRoomUsers);
    };
  }, []);

  useEffect(() => {
    const handleConnectError = () => {
      if (activeRoomCodeRef.current || hasShownConnectErrorToastRef.current) {
        return;
      }

      hasShownConnectErrorToastRef.current = true;
      showRoomErrorToast("Could not connect to the room server.");
    };

    socket.on("connect_error", handleConnectError);

    return () => {
      socket.off("connect_error", handleConnectError);
    };
  }, [showRoomErrorToast]);

  useEffect(() => {
    const handleDisconnect = () => {
      if (activeRoomCodeRef.current) {
        setRoomConnectionStatus("disconnected");

        if (!hasShownDisconnectToastRef.current) {
          hasShownDisconnectToastRef.current = true;
          showRoomErrorToast("Disconnected from room.");
        }
      }
    };

    const handleReconnectAttempt = () => {
      if (activeRoomCodeRef.current) {
        setRoomConnectionStatus("reconnecting");

        if (!hasShownReconnectingToastRef.current) {
          hasShownReconnectingToastRef.current = true;
          showRoomErrorToast("Reconnecting...");
        }
      }
    };

    const handleReconnect = () => {
      if (activeRoomCodeRef.current) {
        setRoomConnectionStatus("connected");
        resetConnectionToastGuards();
        showSuccessToast("Reconnected");
      }
    };

    const handleReconnectFailed = () => {
      if (activeRoomCodeRef.current) {
        setRoomConnectionStatus("disconnected");
        setConnectedUsersCount(1);
        setRoomUsers([]);

        if (!hasShownReconnectFailedToastRef.current) {
          hasShownReconnectFailedToastRef.current = true;
          showRoomErrorToast("Could not reconnect to room.");
        }
      }
    };

    socket.on("disconnect", handleDisconnect);
    socket.io.on("reconnect_attempt", handleReconnectAttempt);
    socket.io.on("reconnect", handleReconnect);
    socket.io.on("reconnect_failed", handleReconnectFailed);

    return () => {
      socket.off("disconnect", handleDisconnect);
      socket.io.off("reconnect_attempt", handleReconnectAttempt);
      socket.io.off("reconnect", handleReconnect);
      socket.io.off("reconnect_failed", handleReconnectFailed);
    };
  }, [resetConnectionToastGuards, showRoomErrorToast, showSuccessToast]);

  useEffect(() => {
    return () => {
      if (successToastTimeoutRef.current !== null) {
        window.clearTimeout(successToastTimeoutRef.current);
      }

      if (roomErrorToastTimeoutRef.current !== null) {
        window.clearTimeout(roomErrorToastTimeoutRef.current);
      }
    };
  }, []);

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
    if (!isStickyColorPickerOpen) {
      return;
    }

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as HTMLElement | null;

      if (target?.closest("[data-sticky-trigger='true']")) {
        return;
      }

      if (!stickyColorPickerRef.current?.contains(event.target as Node)) {
        setIsStickyColorPickerOpen(false);
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsStickyColorPickerOpen(false);
        setSelectedStickyColor(null);
        setActiveTool("select");
      }
    };

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleEscape);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [isStickyColorPickerOpen]);

  useEffect(() => {
    if (!isPenSettingsOpen) {
      return;
    }

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as HTMLElement | null;

      if (target?.closest("[data-pen-trigger='true']")) {
        return;
      }

      if (!penSettingsRef.current?.contains(event.target as Node)) {
        setIsPenSettingsOpen(false);
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsPenSettingsOpen(false);
      }
    };

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleEscape);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [isPenSettingsOpen]);

  useEffect(() => {
    if (!isShapePickerOpen) {
      return;
    }

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as HTMLElement | null;

      if (target?.closest("[data-shape-trigger='true']")) {
        return;
      }

      if (!shapePickerRef.current?.contains(event.target as Node)) {
        setIsShapePickerOpen(false);
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsShapePickerOpen(false);
        setSelectedShapeType(null);
        setActiveTool("select");
      }
    };

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleEscape);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [isShapePickerOpen]);

  useEffect(() => {
    if (activeTool !== "sticky" || !selectedStickyColor) {
      return;
    }

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setSelectedStickyColor(null);
        setActiveTool("select");
      }
    };

    document.addEventListener("keydown", handleEscape);

    return () => document.removeEventListener("keydown", handleEscape);
  }, [activeTool, selectedStickyColor]);

  useEffect(() => {
    if (activeTool !== "text") {
      return;
    }

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setActiveTool("select");
      }
    };

    document.addEventListener("keydown", handleEscape);

    return () => document.removeEventListener("keydown", handleEscape);
  }, [activeTool]);

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

    return () =>
      document.removeEventListener("keydown", handleKeyboardShortcut);
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
    if (
      !isCreateRoomModalOpen &&
      !isJoinRoomModalOpen &&
      !isJoinReplaceConfirmOpen
    ) {
      return;
    }

    const handleRoomModalKeyboard = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        closeRoomModals();
      }
    };

    document.addEventListener("keydown", handleRoomModalKeyboard);

    return () =>
      document.removeEventListener("keydown", handleRoomModalKeyboard);
  }, [
    closeRoomModals,
    isCreateRoomModalOpen,
    isJoinReplaceConfirmOpen,
    isJoinRoomModalOpen,
  ]);

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
      Math.ceil(titleMeasureRef.current.scrollWidth) +
      TITLE_INPUT_HORIZONTAL_CHROME;
    const clampedWidth = Math.min(measuredWidth, TITLE_INPUT_MAX_WIDTH);

    setTitleInputWidth((currentWidth) =>
      currentWidth === clampedWidth ? currentWidth : clampedWidth,
    );
  }, [draftTitle, isEditingTitle]);

  const shouldShowPresence =
    Boolean(activeRoomCode) &&
    roomConnectionStatus !== "local" &&
    roomUsers.length > 0;
  const visibleRoomUsers = roomUsers.slice(0, 6);
  const hiddenRoomUserCount = Math.max(
    roomUsers.length - visibleRoomUsers.length,
    0,
  );

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="window-spacer" aria-hidden="true" />

        <div
          className={isMenuOpen ? "app-menu open" : "app-menu"}
          ref={menuRef}
        >
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
                <button
                  className="menu-action primary"
                  type="button"
                  onClick={createNewBoard}
                >
                  <ToolIcon name="plus" />
                  <span>
                    <strong>New Board</strong>
                  </span>
                </button>

                {collaborationActions.map((action) => (
                  <button
                    className="menu-action"
                    type="button"
                    key={action.label}
                    onClick={
                      action.label === "Create"
                        ? openCreateRoomModal
                        : openJoinRoomModal
                    }
                  >
                    <ToolIcon name={action.icon} />
                    <span>
                      <strong>{action.label} Room</strong>
                    </span>
                  </button>
                ))}

                {menuActions.map((action) => (
                  <button
                    className="menu-action"
                    type="button"
                    key={action.label}
                    onClick={
                      action.action === "saveAs"
                        ? saveBoardAs
                        : action.action === "save"
                          ? saveBoard
                          : action.action === "exportPng"
                            ? exportBoardAsPng
                            : loadBoard
                    }
                  >
                    <ToolIcon name={action.icon} />
                    <span>
                      <strong>{action.label}</strong>
                    </span>
                  </button>
                ))}
              </div>

              <div className="menu-section">
                <div className="menu-heading">
                  <span>Recent</span>
                </div>

                {recentBoards.map((board) => (
                  <button
                    className="recent-board"
                    type="button"
                    key={board.path}
                    onClick={() => openRecentBoard(board)}
                  >
                    <span className="board-dot" aria-hidden="true" />
                    <span>
                      <strong>{board.name}</strong>
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        <div
          className={isEditingTitle ? "board-title editing" : "board-title"}
          aria-label="Current board"
        >
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
          <div
            className={`session-pill is-${roomConnectionStatus}`}
            aria-label="Session status"
          >
            <span className="session-state">
              <span className="status-dot" aria-hidden="true" />
              {!activeRoomCode
                ? "Local mode"
                : roomConnectionStatus === "reconnecting"
                  ? "Reconnecting..."
                  : roomConnectionStatus === "disconnected"
                    ? "Disconnected"
                    : "Collaboration mode"}
            </span>
            {activeRoomCode && (
              <>
                <button
                  className="session-room-code has-tooltip"
                  type="button"
                  data-tooltip="Copy to clipboard"
                  onClick={copyRoomCodeToClipboard}
                >
                  Room code: <span>{activeRoomCode}</span>
                </button>
                {roomConnectionStatus === "connected" && (
                  <span>Users: {connectedUsersCount}</span>
                )}
              </>
            )}
          </div>

          <div className="zoom-control" aria-label="Zoom controls">
            <button
              className="zoom-control-button"
              type="button"
              aria-label="Zoom out"
              title="Zoom out"
              disabled={canvasZoom <= 1.01}
              onClick={() => whiteboardCanvasRef.current?.zoomOut()}
            >
              −
            </button>

            <button
              className="zoom-control-value"
              type="button"
              aria-label="Reset zoom"
              title="Reset zoom"
              onClick={() => whiteboardCanvasRef.current?.resetZoom()}
            >
              {Math.round(canvasZoom * 100)}%
            </button>

            <button
              className="zoom-control-button"
              type="button"
              aria-label="Zoom in"
              title="Zoom in"
              disabled={canvasZoom >= 4.99}
              onClick={() => whiteboardCanvasRef.current?.zoomIn()}
            >
              +
            </button>
          </div>
        </div>
      </header>

      {isSuccessToastVisible && successToastMessage && (
        <div
          className="saved-toast"
          key={successToastKey}
          role="status"
          aria-live="polite"
        >
          <svg
            className="saved-toast-icon"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <path d="M20 6 9 17l-5-5" />
          </svg>
          <span>{successToastMessage}</span>
        </div>
      )}

      {isRoomErrorToastVisible && roomError && (
        <div
          className="room-error-toast"
          key={roomErrorToastKey}
          role="alert"
          aria-live="assertive"
        >
          <svg
            className="room-error-toast-icon"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <path d="M12 8v5" />
            <path d="M12 17h.01" />
            <path d="M10.3 4.3 2.8 17.2A2 2 0 0 0 4.5 20h15a2 2 0 0 0 1.7-2.8L13.7 4.3a2 2 0 0 0-3.4 0z" />
          </svg>
          <span>{roomError}</span>
        </div>
      )}

      <section className="workspace" aria-label="Whiteboard workspace">
        <div className="canvas-shell">
          <WhiteboardCanvas
            ref={whiteboardCanvasRef}
            activeTool={activeTool}
            lines={lines}
            notes={notes}
            shapes={shapes}
            textBoxes={textBoxes}
            remoteCursors={Object.values(remoteCursors)}
            onCursorMove={handleCursorMove}
            onCursorLeave={handleCursorLeave}
            selectedStickyColor={selectedStickyColor}
            selectedShapeType={selectedShapeType}
            penColor={selectedPenColor}
            penStrokeWidth={selectedPenStrokeWidth}
            onLinesChange={handleLinesChange}
            onDrawingCommit={handleDrawingCommit}
            onEraseLine={handleEraseLine}
            onEraseCommit={handleEraseCommit}
            onCreateNote={handleCreateNote}
            onMoveNote={handleMoveNote}
            onResizeNote={handleResizeNote}
            onEditNote={handleEditNote}
            onDeleteNote={handleDeleteNote}
            onStickyNotePlaced={handleStickyNotePlaced}
            onCreateTextBox={handleCreateTextBox}
            onMoveTextBox={handleMoveTextBox}
            onResizeTextBox={handleResizeTextBox}
            onEditTextBox={handleEditTextBox}
            onUpdateTextBoxStyle={handleUpdateTextBoxStyle}
            onDeleteTextBox={handleDeleteTextBox}
            onTextBoxPlaced={handleTextBoxPlaced}
            onCreateShape={handleCreateShape}
            onMoveShape={handleMoveShape}
            onResizeShape={handleResizeShape}
            onEditShape={handleEditShape}
            onUpdateShapeStyle={handleUpdateShapeStyle}
            onDeleteShape={handleDeleteShape}
            onMoveSelectedObjects={handleMoveSelectedObjects}
            onDeleteSelectedObjects={handleDeleteSelectedObjects}
            onCreateObjectsBatch={handleCreateObjectsBatch}
            onLayerObject={handleLayerObject}
            onLayerSelectedObjects={handleLayerSelectedObjects}
            onShapePlaced={handleShapePlaced}
            onZoomChange={handleZoomChange}
          />
        </div>

        {shouldShowPresence && (
          <div className="presence-list" aria-label="Room users">
            {visibleRoomUsers.map((user, index) => {
              const displayName = getDisplayName(user.name);

              return (
                <button
                  className="presence-avatar has-tooltip"
                  type="button"
                  key={user.socketId}
                  aria-label={displayName}
                  data-tooltip={displayName}
                  style={{ backgroundColor: getStableUserColor(user, index) }}
                >
                  {getUserInitial(displayName)}
                </button>
              );
            })}

            {hiddenRoomUserCount > 0 && (
              <button
                className="presence-avatar presence-more has-tooltip"
                type="button"
                aria-label={`${hiddenRoomUserCount} more users`}
                data-tooltip={`${hiddenRoomUserCount} more users`}
              >
                ...
              </button>
            )}
          </div>
        )}

        {isStickyColorPickerOpen && (
          <div
            className="sticky-color-picker"
            ref={stickyColorPickerRef}
            aria-label="Choose sticky note color"
          >
            <div className="sticky-color-grid">
              {STICKY_NOTE_COLORS.map((color) => (
                <button
                  className={
                    selectedStickyColor === color.value
                      ? "sticky-color-swatch selected"
                      : "sticky-color-swatch"
                  }
                  type="button"
                  key={color.value}
                  aria-label={`${color.name} sticky note`}
                  title={color.name}
                  style={{ background: color.value }}
                  onClick={() => {
                    setSelectedStickyColor(color.value);
                    setIsStickyColorPickerOpen(false);
                    setIsPenSettingsOpen(false);
                    setActiveTool("sticky");
                  }}
                />
              ))}
            </div>
          </div>
        )}

        {isPenSettingsOpen && (
          <div
            className="pen-settings-popover"
            ref={penSettingsRef}
            aria-label="Pen settings"
          >
            <div className="pen-color-grid">
              {PEN_COLORS.map((color) => (
                <button
                  className={
                    selectedPenColor === color.value
                      ? "pen-color-swatch selected"
                      : "pen-color-swatch"
                  }
                  type="button"
                  key={color.value}
                  aria-label={`${color.name} pen`}
                  title={color.name}
                  style={{ background: color.value }}
                  onClick={() => {
                    setSelectedPenColor(color.value);
                    setActiveTool("pen");
                  }}
                />
              ))}
            </div>

            <label className="pen-size-slider" aria-label="Pen stroke size">
              <div className="pen-size-slider-header">
                <span>Thickness</span>
                <strong>{selectedPenStrokeWidth}px</strong>
              </div>

              <div className="pen-size-slider-control">
                <input
                  type="range"
                  min="1"
                  max="14"
                  step="1"
                  value={selectedPenStrokeWidth}
                  onChange={(event) => {
                    setSelectedPenStrokeWidth(Number(event.target.value));
                    setActiveTool("pen");
                  }}
                />
              </div>
            </label>
          </div>
        )}

        {isShapePickerOpen && (
          <div
            className="shape-picker-popover"
            ref={shapePickerRef}
            aria-label="Choose shape"
          >
            {SHAPE_OPTIONS.map((shape) => (
              <button
                className={
                  selectedShapeType === shape.type
                    ? "shape-picker-button selected has-tooltip"
                    : "shape-picker-button has-tooltip"
                }
                type="button"
                key={shape.type}
                aria-label={shape.label}
                data-tooltip={shape.label}
                onClick={() => {
                  setSelectedShapeType(shape.type);
                  setIsShapePickerOpen(false);
                  setIsStickyColorPickerOpen(false);
                  setIsPenSettingsOpen(false);
                  setActiveTool("shape");
                }}
              >
                <ShapeOptionIcon type={shape.type} />
              </button>
            ))}
          </div>
        )}

        <nav className="bottom-toolbar" aria-label="Whiteboard tools">
          <div className="tool-group">
            {toolbarTools.map((tool) => (
              <button
                className={
                  tool.tool === activeTool ||
                  (tool.tool === "sticky" && isStickyColorPickerOpen) ||
                  (tool.tool === "pen" && isPenSettingsOpen) ||
                  (tool.tool === "shape" && isShapePickerOpen)
                    ? "tool-button active has-tooltip"
                    : "tool-button has-tooltip"
                }
                type="button"
                key={tool.label}
                aria-label={tool.label}
                data-tooltip={tool.label}
                data-sticky-trigger={
                  tool.tool === "sticky" ? "true" : undefined
                }
                data-pen-trigger={tool.tool === "pen" ? "true" : undefined}
                data-shape-trigger={tool.tool === "shape" ? "true" : undefined}
                disabled={tool.disabled}
                onClick={() => {
                  if (tool.tool === "sticky") {
                    setIsStickyColorPickerOpen((isOpen) => !isOpen);
                    setIsPenSettingsOpen(false);
                    setIsShapePickerOpen(false);
                    setSelectedStickyColor(null);
                    setActiveTool("select");
                    return;
                  }

                  if (tool.tool === "pen") {
                    setIsPenSettingsOpen((isOpen) => !isOpen);
                    setIsStickyColorPickerOpen(false);
                    setIsShapePickerOpen(false);
                    setSelectedStickyColor(null);
                    setActiveTool("pen");
                    return;
                  }

                  if (tool.tool === "shape") {
                    setIsShapePickerOpen((isOpen) => !isOpen);
                    setIsStickyColorPickerOpen(false);
                    setIsPenSettingsOpen(false);
                    setSelectedShapeType(null);
                    setActiveTool("select");
                    return;
                  }

                  if (tool.tool) {
                    setIsStickyColorPickerOpen(false);
                    setIsPenSettingsOpen(false);
                    setIsShapePickerOpen(false);
                    setSelectedStickyColor(null);
                    setSelectedShapeType(null);
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
                className="tool-button has-tooltip"
                type="button"
                aria-label={tool.label}
                data-tooltip={tool.label}
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
            className="tool-button clear-board-button has-tooltip"
            type="button"
            aria-label="Clear Board"
            data-tooltip="Clear Board"
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
              <button
                type="button"
                className="modal-button"
                onClick={() => setIsClearModalOpen(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="modal-button danger"
                onClick={clearBoard}
              >
                Clear Board
              </button>
            </div>
          </section>
        </div>
      )}

      {isCreateRoomModalOpen && (
        <div className="modal-overlay" role="presentation">
          <form
            className="confirmation-modal room-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="create-room-title"
            onSubmit={(event) => {
              event.preventDefault();
              createRoom();
            }}
          >
            <h2 id="create-room-title">Create room</h2>

            <label className="modal-field">
              <span>Your name</span>
              <input
                value={roomDisplayName}
                placeholder="Guest"
                autoFocus
                onChange={(event) => setRoomDisplayName(event.target.value)}
              />
            </label>
            <div className="modal-actions">
              <button
                type="button"
                className="modal-button"
                onClick={closeRoomModals}
              >
                Cancel
              </button>
              <button type="submit" className="modal-button primary">
                Create Room
              </button>
            </div>
          </form>
        </div>
      )}

      {isJoinRoomModalOpen && (
        <div className="modal-overlay" role="presentation">
          <form
            className="confirmation-modal room-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="join-room-title"
            onSubmit={(event) => {
              event.preventDefault();
              requestJoinRoom();
            }}
          >
            <h2 id="join-room-title">Join room</h2>

            <label className="modal-field">
              <span>Your name</span>
              <input
                value={roomDisplayName}
                placeholder="Guest"
                autoFocus
                onChange={(event) => setRoomDisplayName(event.target.value)}
              />
            </label>

            <label className="modal-field">
              <span>Room code</span>
              <input
                value={joinRoomCode}
                placeholder="X7K2Q"
                maxLength={12}
                onChange={(event) =>
                  setJoinRoomCode(event.target.value.toUpperCase())
                }
              />
            </label>
            <div className="modal-actions">
              <button
                type="button"
                className="modal-button"
                onClick={closeRoomModals}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="modal-button primary"
                disabled={!joinRoomCode.trim()}
              >
                Join Room
              </button>
            </div>
          </form>
        </div>
      )}

      {isJoinReplaceConfirmOpen && (
        <div className="modal-overlay" role="presentation">
          <section
            className="confirmation-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="join-replace-title"
          >
            <h2 id="join-replace-title">
              Joining this room will replace your current board. Continue?
            </h2>
            <p>
              Your current board will be replaced by the collaborative room
              board. Save it first if you want to keep a local copy.
            </p>

            <div className="modal-actions">
              <button
                type="button"
                className="modal-button"
                onClick={() => {
                  setIsJoinReplaceConfirmOpen(false);
                  setIsJoinRoomModalOpen(true);
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                className="modal-button primary"
                onClick={joinRoom}
              >
                Continue
              </button>
            </div>
          </section>
        </div>
      )}
    </main>
  );
}

export default App;
