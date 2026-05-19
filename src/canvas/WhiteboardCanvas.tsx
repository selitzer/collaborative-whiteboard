import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import {
  Arrow,
  Circle,
  Ellipse,
  Group,
  Layer,
  Line,
  Rect,
  Stage,
  Text,
} from "react-konva";
import type { KonvaEventObject } from "konva/lib/Node";

export type WhiteboardCanvasHandle = {
  getPngDataUrl: () => Promise<string | null>;
  zoomIn: () => void;
  zoomOut: () => void;
  resetZoom: () => void;
};

export type RemoteCursor = {
  socketId: string;
  name: string;
  x: number;
  y: number;
  color: string;
  updatedAt: number;
};

export type RemoteMarqueeSelection = {
  socketId: string;
  name: string;
  color: string;
  selection: {
    start: { x: number; y: number };
    current: { x: number; y: number };
  };
  updatedAt: number;
};

export type DrawnLine = {
  id: string;
  points: number[];
  stroke: string;
  strokeWidth: number;
  zIndex: number;
};

export type StickyNote = {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  text: string;
  color: string;
  zIndex: number;
};

export type TextBox = {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  text: string;
  textColor: string;
  fontSize: number | null;
  fontWeight: "normal" | "bold";
  textAlign: "left" | "center" | "right";
  zIndex: number;
};

export type Shape = {
  id: string;
  type: "rectangle" | "ellipse" | "triangle" | "line" | "arrow";
  x: number;
  y: number;
  width: number;
  height: number;
  text: string;
  fill: string;
  stroke: string;
  strokeWidth: number;
  lineStyle: "solid" | "dashed" | "dotted";
  textColor: string;
  fontSize: number | null;
  fontWeight: "normal" | "bold";
  textAlign: "left" | "center" | "right";
  zIndex: number;
};

export type ActiveTool =
  | "select"
  | "sticky"
  | "pen"
  | "eraser"
  | "text"
  | "shape";

type CanvasSize = {
  width: number;
  height: number;
};

type Viewport = {
  x: number;
  y: number;
  zoom: number;
};

type ContextMenuState = {
  x: number;
  y: number;
  target:
    | { type: "canvas"; boardX: number; boardY: number }
    | { type: "selection"; x: number; y: number }
    | { type: "line"; id: string; x: number; y: number }
    | { type: "note"; id: string; x: number; y: number }
    | { type: "textBox"; id: string; x: number; y: number }
    | { type: "shape"; id: string; x: number; y: number };
} | null;

type SelectedObjectIds = {
  lineIds: string[];
  noteIds: string[];
  textBoxIds: string[];
  shapeIds: string[];
};

type CopiedObject =
  | { type: "line"; line: Omit<DrawnLine, "id" | "zIndex"> }
  | { type: "note"; note: Omit<StickyNote, "id" | "x" | "y" | "zIndex"> }
  | { type: "textBox"; textBox: Omit<TextBox, "id" | "x" | "y" | "zIndex"> }
  | { type: "shape"; shape: Omit<Shape, "id" | "x" | "y" | "zIndex"> }
  | {
      type: "group";
      lines: Array<Omit<DrawnLine, "id" | "zIndex">>;
      notes: Array<Omit<StickyNote, "id" | "zIndex">>;
      textBoxes: Array<Omit<TextBox, "id" | "zIndex">>;
      shapes: Array<Omit<Shape, "id" | "zIndex">>;
      bounds: NoteBounds;
    }
  | null;

type EditingNoteState = {
  id: string;
  text: string;
  originalText: string;
  left: number;
  top: number;
  width: number;
  height: number;
  color: string;
} | null;

type EditingTextBoxState = {
  id: string;
  text: string;
  originalText: string;
  left: number;
  top: number;
  width: number;
  height: number;
} | null;

type EditingShapeState = {
  id: string;
  text: string;
  originalText: string;
  left: number;
  top: number;
  width: number;
  height: number;
} | null;

type DraftShapeState = {
  shape: Shape;
  startX: number;
  startY: number;
} | null;

type MarqueeSelectionState = {
  start: { x: number; y: number };
  current: { x: number; y: number };
} | null;

type GroupDragStartState = {
  dragged: ObjectMenuTarget;
  x: number;
  y: number;
} | null;

type ActiveShapePopover = "fill" | "line" | "textColor" | "more" | null;
type ActiveTextBoxPopover = "textColor" | "more" | null;
type ObjectMenuTarget =
  | { type: "line"; id: string }
  | { type: "note"; id: string }
  | { type: "textBox"; id: string }
  | { type: "shape"; id: string };

type LayerAction = "front" | "forward" | "backward" | "back";

type NoteBounds = Pick<StickyNote, "x" | "y" | "width" | "height">;
type TextBoxBounds = Pick<TextBox, "x" | "y" | "width" | "height">;
type ShapeBounds = Pick<Shape, "x" | "y" | "width" | "height">;

type ResizeHandle = "nw" | "ne" | "sw" | "se";

const DEFAULT_NOTE_WIDTH = 180;
const DEFAULT_NOTE_HEIGHT = 120;
const DEFAULT_NOTE_TEXT = "New note";
const DEFAULT_TEXT_BOX_WIDTH = 240;
const DEFAULT_TEXT_BOX_HEIGHT = 96;
const DEFAULT_SHAPE_WIDTH = 180;
const DEFAULT_SHAPE_HEIGHT = 120;
const DEFAULT_SHAPE_TEXT = "";
const MIN_SHAPE_WIDTH = 40;
const TOPBAR_HEIGHT = 48;
const MIN_SHAPE_HEIGHT = 40;
const DEFAULT_NOTE_COLOR = "#fff2a8";
const NOTE_TEXT_COLOR = "#2f2a1f";
const NOTE_TEXT_PADDING = 14;
const NOTE_TEXT_MIN_FONT_SIZE = 14;
const NOTE_TEXT_MAX_FONT_SIZE = 712;
const MIN_NOTE_WIDTH = 120;
const MIN_NOTE_HEIGHT = 80;
const BOARD_WIDTH = 3000;
const BOARD_HEIGHT = 2000;
const MIN_ZOOM = 1;
const MAX_ZOOM = 5;
const ZOOM_SENSITIVITY = 0.0035;
const CONTEXT_MENU_WIDTH = 156;
const CANVAS_CONTEXT_MENU_HEIGHT = 88;
const OBJECT_CONTEXT_MENU_HEIGHT = 202;
const CONTEXT_SUBMENU_WIDTH = 190;
const CONTEXT_SUBMENU_HEIGHT = 140;
const CONTEXT_SUBMENU_GAP = 10;
const CONTEXT_SUBMENU_TRIGGER_OFFSET = 104;
const CONTEXT_MENU_SAFE_PADDING = 12;
const DRAG_VISIBLE_MARGIN = 40;
const CENTER_ANIMATION_MS = 180;
const SHAPE_FILL_COLORS = [
  { name: "No fill", value: "transparent" },
  { name: "Yellow", value: "#fef3c7" },
  { name: "Orange", value: "#fed7aa" },
  { name: "Pink", value: "#fce7f3" },
  { name: "Green", value: "#dcfce7" },
  { name: "Blue", value: "#dbeafe" },
  { name: "Purple", value: "#ede9fe" },
  { name: "Gold", value: "#fde68a" },
  { name: "Red", value: "#fecaca" },
  { name: "Dark green", value: "#166534" },
  { name: "Navy", value: "#1e3a8a" },
  { name: "Gray", value: "#e5e7eb" },
  { name: "Black", value: "#111827" },
  { name: "White", value: "#ffffff" },
];
const SHAPE_STROKE_COLORS = [
  { name: "No line", value: "transparent" },
  { name: "Black", value: "#1f2937" },
  { name: "Gray", value: "#6b7280" },
  { name: "Blue", value: "#2563eb" },
  { name: "Red", value: "#dc2626" },
  { name: "Green", value: "#16a34a" },
  { name: "Purple", value: "#7c3aed" },
  { name: "White", value: "#ffffff" },
];
const SHAPE_LINE_STYLES = [
  { label: "Solid", value: "solid" },
  { label: "Dashed", value: "dashed" },
  { label: "Dotted", value: "dotted" },
] satisfies Array<{ label: string; value: Shape["lineStyle"] }>;
const TEXT_COLORS = [
  { name: "Black", value: "#1f2937" },
  { name: "Gray", value: "#6b7280" },
  { name: "White", value: "#ffffff" },
  { name: "Red", value: "#dc2626" },
  { name: "Orange", value: "#ea580c" },
  { name: "Yellow", value: "#ca8a04" },
  { name: "Green", value: "#16a34a" },
  { name: "Blue", value: "#2563eb" },
  { name: "Purple", value: "#7c3aed" },
];
const DEFAULT_TEXT_COLOR = "#1f2937";
const DEFAULT_FONT_WEIGHT: TextBox["fontWeight"] = "bold";
const DEFAULT_TEXT_ALIGN: TextBox["textAlign"] = "center";

const isLightColor = (color: string) => {
  const normalizedColor = color.trim().toLowerCase();

  if (!normalizedColor || normalizedColor === "transparent") {
    return false;
  }

  let red: number;
  let green: number;
  let blue: number;

  if (/^#[0-9a-f]{3}$/.test(normalizedColor)) {
    red = parseInt(normalizedColor[1] + normalizedColor[1], 16);
    green = parseInt(normalizedColor[2] + normalizedColor[2], 16);
    blue = parseInt(normalizedColor[3] + normalizedColor[3], 16);
  } else if (/^#[0-9a-f]{6}$/.test(normalizedColor)) {
    red = parseInt(normalizedColor.slice(1, 3), 16);
    green = parseInt(normalizedColor.slice(3, 5), 16);
    blue = parseInt(normalizedColor.slice(5, 7), 16);
  } else {
    const rgbMatch = normalizedColor.match(
      /^rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)/,
    );

    if (!rgbMatch) {
      return false;
    }

    red = Number(rgbMatch[1]);
    green = Number(rgbMatch[2]);
    blue = Number(rgbMatch[3]);
  }

  const luminance = (0.2126 * red + 0.7152 * green + 0.0722 * blue) / 255;

  return luminance > 0.72;
};

type WhiteboardCanvasProps = {
  activeTool: ActiveTool;
  lines: DrawnLine[];
  notes: StickyNote[];
  shapes: Shape[];
  textBoxes: TextBox[];
  selectedStickyColor: string | null;
  selectedShapeType: Shape["type"] | null;
  penColor: string;
  penStrokeWidth: number;
  remoteCursors: RemoteCursor[];
  remoteMarquees: RemoteMarqueeSelection[];
  onMarqueeUpdate: (selection: {
    start: { x: number; y: number };
    current: { x: number; y: number };
  }) => void;
  onMarqueeEnd: () => void;
  onCursorMove: (point: { x: number; y: number }) => void;
  onCursorLeave: () => void;
  onLinesChange: (updater: (currentLines: DrawnLine[]) => DrawnLine[]) => void;
  onDrawingCommit: (previousLines: DrawnLine[]) => void;
  onLiveLineStart: (line: DrawnLine) => void;
  onLiveLineUpdate: (line: DrawnLine) => void;
  onEraseLine: (lineId: string) => void;
  onEraseCommit: (previousLines: DrawnLine[]) => void;
  onCreateNote: (note: StickyNote) => void;
  onPreviewMoveNote: (note: StickyNote) => void;
  onPreviewResizeNote: (note: StickyNote) => void;
  onMoveNote: (noteId: string, x: number, y: number) => void;
  onResizeNote: (noteId: string, bounds: NoteBounds) => void;
  onEditNote: (noteId: string, text: string) => void;
  onDeleteNote: (noteId: string) => void;
  onStickyNotePlaced: () => void;
  onCreateTextBox: (textBox: TextBox) => void;
  onPreviewMoveTextBox: (textBox: TextBox) => void;
  onPreviewResizeTextBox: (textBox: TextBox) => void;
  onMoveTextBox: (textBoxId: string, x: number, y: number) => void;
  onResizeTextBox: (textBoxId: string, bounds: TextBoxBounds) => void;
  onEditTextBox: (textBoxId: string, text: string) => void;
  onPreviewMoveSelectedObjects: (
    deltaX: number,
    deltaY: number,
    selectedIds: SelectedObjectIds,
  ) => void;
  onUpdateTextBoxStyle: (
    textBoxId: string,
    style: Partial<Pick<TextBox, "textColor" | "fontWeight" | "textAlign">>,
  ) => void;
  onDeleteTextBox: (textBoxId: string) => void;
  onTextBoxPlaced: () => void;
  onCreateShape: (shape: Shape) => void;
  onPreviewMoveShape: (shape: Shape) => void;
  onPreviewResizeShape: (shape: Shape) => void;
  onMoveShape: (shapeId: string, x: number, y: number) => void;
  onResizeShape: (shapeId: string, bounds: ShapeBounds) => void;
  onEditShape: (shapeId: string, text: string) => void;
  onUpdateShapeStyle: (
    shapeId: string,
    style: Partial<
      Pick<
        Shape,
        | "fill"
        | "stroke"
        | "strokeWidth"
        | "lineStyle"
        | "textColor"
        | "fontWeight"
        | "textAlign"
      >
    >,
  ) => void;
  onDeleteShape: (shapeId: string) => void;
  onMoveSelectedObjects: (
    deltaX: number,
    deltaY: number,
    selectedIds: SelectedObjectIds,
  ) => void;
  onDeleteSelectedObjects: (selectedIds: SelectedObjectIds) => void;
  onCreateObjectsBatch: (objects: {
    lines: DrawnLine[];
    notes: StickyNote[];
    textBoxes: TextBox[];
    shapes: Shape[];
  }) => void;
  onLayerObject: (target: ObjectMenuTarget, action: LayerAction) => void;
  onLayerSelectedObjects: (
    selectedIds: SelectedObjectIds,
    action: LayerAction,
  ) => void;
  onShapePlaced: () => void;
  onZoomChange: (zoom: number) => void;
};

const WhiteboardCanvas = forwardRef<
  WhiteboardCanvasHandle,
  WhiteboardCanvasProps
>(function WhiteboardCanvas(
  {
    activeTool,
    lines,
    notes,
    shapes,
    textBoxes,
    selectedStickyColor,
    selectedShapeType,
    penColor,
    penStrokeWidth,
    onLinesChange,
    onDrawingCommit,
    onEraseLine,
    onEraseCommit,
    onCreateNote,
    onPreviewMoveNote,
    onPreviewResizeNote,
    onMoveNote,
    onResizeNote,
    onEditNote,
    onDeleteNote,
    onStickyNotePlaced,
    onCreateTextBox,
    onPreviewMoveTextBox,
    onPreviewResizeTextBox,
    onMoveTextBox,
    onResizeTextBox,
    onEditTextBox,
    onUpdateTextBoxStyle,
    remoteMarquees,
    onMarqueeUpdate,
    onMarqueeEnd,
    onDeleteTextBox,
    onPreviewMoveSelectedObjects,
    onTextBoxPlaced,
    onCreateShape,
    onPreviewMoveShape,
    onPreviewResizeShape,
    onMoveShape,
    onResizeShape,
    onEditShape,
    onUpdateShapeStyle,
    onDeleteShape,
    onMoveSelectedObjects,
    onDeleteSelectedObjects,
    onCreateObjectsBatch,
    onLayerObject,
    onLayerSelectedObjects,
    onShapePlaced,
    onZoomChange,
    remoteCursors,
    onCursorMove,
    onCursorLeave,
    onLiveLineStart,
    onLiveLineUpdate,
  }: WhiteboardCanvasProps,
  ref,
) {
  const stageRef = useRef<any>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const contextMenuRef = useRef<HTMLDivElement>(null);
  const shapeToolbarRef = useRef<HTMLDivElement>(null);
  const noteEditorRef = useRef<HTMLTextAreaElement>(null);
  const textBoxEditorRef = useRef<HTMLTextAreaElement>(null);
  const shapeEditorRef = useRef<HTMLTextAreaElement>(null);
  const nextZIndexRef = useRef(1);
  const viewportRef = useRef<Viewport>({ x: 0, y: 0, zoom: 1 });
  const editingTextBoxRef = useRef<EditingTextBoxState>(null);
  const centerAnimationRef = useRef<number | null>(null);
  const isDrawingRef = useRef(false);
  const isErasingRef = useRef(false);
  const isPanningRef = useRef(false);
  const activeLineIdRef = useRef<string | null>(null);
  const lastPanPointRef = useRef<{ x: number; y: number } | null>(null);
  const linesBeforeStrokeRef = useRef<DrawnLine[] | null>(null);
  const linesBeforeEraseRef = useRef<DrawnLine[] | null>(null);
  const skipNoteBlurSaveRef = useRef(false);
  const erasedLineIdsRef = useRef<Set<string>>(new Set());
  const hasInitializedViewportRef = useRef(false);
  const resizeStartRef = useRef<StickyNote | null>(null);
  const textBoxResizeStartRef = useRef<TextBox | null>(null);
  const shapeResizeStartRef = useRef<Shape | null>(null);
  const lastLiveLineUpdateRef = useRef(0);
  const activeLiveLineRef = useRef<DrawnLine | null>(null);
  const selectionDragStartRef = useRef<{ x: number; y: number } | null>(null);
  const [size, setSize] = useState<CanvasSize>({ width: 0, height: 0 });
  const [viewport, setViewport] = useState<Viewport>({ x: 0, y: 0, zoom: 1 });
  const [contextMenu, setContextMenu] = useState<ContextMenuState>(null);
  const [copiedObject, setCopiedObject] = useState<CopiedObject>(null);
  const [editingNote, setEditingNote] = useState<EditingNoteState>(null);
  const [editingTextBox, setEditingTextBox] =
    useState<EditingTextBoxState>(null);
  const [editingShape, setEditingShape] = useState<EditingShapeState>(null);
  const [selectedLineIds, setSelectedLineIds] = useState<string[]>([]);
  const [selectedNoteId, setSelectedNoteId] = useState<string | null>(null);
  const [selectedTextBoxId, setSelectedTextBoxId] = useState<string | null>(
    null,
  );
  const [selectedShapeId, setSelectedShapeId] = useState<string | null>(null);
  const [selectedNoteIds, setSelectedNoteIds] = useState<string[]>([]);
  const [selectedTextBoxIds, setSelectedTextBoxIds] = useState<string[]>([]);
  const [selectedShapeIds, setSelectedShapeIds] = useState<string[]>([]);
  const [isDraggingShape, setIsDraggingShape] = useState(false);
  const [resizingNote, setResizingNote] = useState<
    (NoteBounds & { id: string }) | null
  >(null);
  const [resizingTextBox, setResizingTextBox] = useState<
    (TextBoxBounds & { id: string }) | null
  >(null);
  const [resizingShape, setResizingShape] = useState<
    (ShapeBounds & { id: string }) | null
  >(null);
  const [draftShape, setDraftShape] = useState<DraftShapeState>(null);
  const [marqueeSelection, setMarqueeSelection] =
    useState<MarqueeSelectionState>(null);
  const [selectionDragOffset, setSelectionDragOffset] = useState({
    x: 0,
    y: 0,
  });
  const [activeShapePopover, setActiveShapePopover] =
    useState<ActiveShapePopover>(null);
  const [activeTextBoxPopover, setActiveTextBoxPopover] =
    useState<ActiveTextBoxPopover>(null);
  const [groupDragStart, setGroupDragStart] =
    useState<GroupDragStartState>(null);
  const [isPanning, setIsPanning] = useState(false);
  void selectedNoteId;
  void selectedTextBoxId;
  const selectedObjectCount =
    selectedLineIds.length +
    selectedNoteIds.length +
    selectedTextBoxIds.length +
    selectedShapeIds.length;
  const hasMultipleSelection = selectedObjectCount > 1;
  const selectedIds: SelectedObjectIds = {
    lineIds: selectedLineIds,
    noteIds: selectedNoteIds,
    textBoxIds: selectedTextBoxIds,
    shapeIds: selectedShapeIds,
  };
  const baseScale =
    size.width > 0 && size.height > 0
      ? Math.min(size.width / BOARD_WIDTH, size.height / BOARD_HEIGHT)
      : 1;

  const actualScale = baseScale * viewport.zoom;

  const layerScaleX = actualScale;
  const layerScaleY = actualScale;
  const getNoteTextColor = (backgroundColor: string) => {
    const hex = backgroundColor.replace("#", "");

    if (hex.length !== 6) {
      return NOTE_TEXT_COLOR;
    }

    const red = parseInt(hex.slice(0, 2), 16);
    const green = parseInt(hex.slice(2, 4), 16);
    const blue = parseInt(hex.slice(4, 6), 16);
    const luminance = (0.2126 * red + 0.7152 * green + 0.0722 * blue) / 255;

    return luminance < 0.42 ? "#f8fafc" : NOTE_TEXT_COLOR;
  };

  const zoomToPoint = (
    zoomMultiplier: number,
    screenPoint: { x: number; y: number },
  ) => {
    setViewport((currentViewport) => {
      const nextZoom = Math.min(
        Math.max(currentViewport.zoom * zoomMultiplier, MIN_ZOOM),
        MAX_ZOOM,
      );

      if (nextZoom === currentViewport.zoom) {
        return currentViewport;
      }

      const currentActualScale = baseScale * currentViewport.zoom;
      const pointerBoardX =
        (screenPoint.x - currentViewport.x) / currentActualScale;
      const pointerBoardY =
        (screenPoint.y - currentViewport.y) / currentActualScale;

      return clampViewport({
        zoom: nextZoom,
        x: screenPoint.x - pointerBoardX * baseScale * nextZoom,
        y: screenPoint.y - pointerBoardY * baseScale * nextZoom,
      });
    });
  };

  const zoomToCenter = (zoomMultiplier: number) => {
    zoomToPoint(zoomMultiplier, {
      x: size.width / 2,
      y: size.height / 2,
    });
  };

  useImperativeHandle(ref, () => ({
    getPngDataUrl: () => {
      const stage = stageRef.current;

      if (!stage) {
        return null;
      }

      const transparentDataUrl = stage.toDataURL({
        mimeType: "image/png",
        pixelRatio: 2,
      });

      const image = new Image();
      image.src = transparentDataUrl;

      const exportCanvas = document.createElement("canvas");
      exportCanvas.width = size.width * 2;
      exportCanvas.height = size.height * 2;

      const context = exportCanvas.getContext("2d");

      if (!context) {
        return transparentDataUrl;
      }

      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, exportCanvas.width, exportCanvas.height);

      return new Promise<string | null>((resolve) => {
        image.onload = () => {
          context.drawImage(
            image,
            0,
            0,
            exportCanvas.width,
            exportCanvas.height,
          );
          resolve(exportCanvas.toDataURL("image/png"));
        };

        image.onerror = () => {
          resolve(transparentDataUrl);
        };
      });
    },

    zoomIn: () => {
      zoomToCenter(1.2);
    },

    zoomOut: () => {
      zoomToCenter(1 / 1.2);
    },

    resetZoom: () => {
      setViewport(getCenteredViewport(1));
    },
  }));

  const getNoteFontSize = (text: string, width: number, height: number) => {
    const normalizedText = text.trim() || DEFAULT_NOTE_TEXT;
    const contentWidth = Math.max(width - NOTE_TEXT_PADDING * 2, 24);
    const contentHeight = Math.max(height - NOTE_TEXT_PADDING * 2, 24);
    const maxSize = Math.min(
      NOTE_TEXT_MAX_FONT_SIZE,
      Math.max(NOTE_TEXT_MIN_FONT_SIZE, Math.min(width, height) * 0.34),
    );

    for (
      let fontSize = Math.round(maxSize);
      fontSize >= NOTE_TEXT_MIN_FONT_SIZE;
      fontSize -= 1
    ) {
      const lineCount = getEstimatedNoteLineCount(
        normalizedText,
        contentWidth,
        fontSize,
      );
      const estimatedTextHeight = lineCount * fontSize * 1.12;

      if (estimatedTextHeight <= contentHeight) {
        return fontSize;
      }
    }

    return NOTE_TEXT_MIN_FONT_SIZE;
  };
  const getEstimatedTextBoxLineCount = (
    text: string,
    contentWidth: number,
    fontSize: number,
  ) => {
    const maxCharactersPerLine = Math.max(
      1,
      Math.floor(contentWidth / (fontSize * 0.54)),
    );

    return text.split("\n").reduce((lineCount, paragraph) => {
      if (paragraph.trim() === "") {
        return lineCount + 1;
      }

      const words = paragraph.split(/(\s+)/);
      let currentLineLength = 0;
      let paragraphLineCount = 1;

      words.forEach((word) => {
        if (word.trim() === "") {
          if (currentLineLength > 0) {
            currentLineLength += word.length;
          }

          return;
        }

        if (word.length > maxCharactersPerLine) {
          if (currentLineLength > 0) {
            paragraphLineCount += 1;
            currentLineLength = 0;
          }

          paragraphLineCount +=
            Math.ceil(word.length / maxCharactersPerLine) - 1;
          currentLineLength = word.length % maxCharactersPerLine;

          if (currentLineLength === 0) {
            currentLineLength = maxCharactersPerLine;
          }

          return;
        }

        const nextLength =
          currentLineLength === 0
            ? word.length
            : currentLineLength + word.length;

        if (nextLength > maxCharactersPerLine) {
          paragraphLineCount += 1;
          currentLineLength = word.length;
        } else {
          currentLineLength = nextLength;
        }
      });

      return lineCount + paragraphLineCount;
    }, 0);
  };

  const getTextBoxFontSize = (text: string, width: number, height: number) => {
    const normalizedText = text.trim();

    if (!normalizedText) {
      return NOTE_TEXT_MIN_FONT_SIZE;
    }

    const contentWidth = Math.max(width - NOTE_TEXT_PADDING * 2, 24);
    const contentHeight = Math.max(height - NOTE_TEXT_PADDING * 2, 24);

    const maxSize = Math.min(
      NOTE_TEXT_MAX_FONT_SIZE,
      Math.max(NOTE_TEXT_MIN_FONT_SIZE, Math.min(width, height) * 0.42),
    );

    for (
      let fontSize = Math.floor(maxSize);
      fontSize >= NOTE_TEXT_MIN_FONT_SIZE;
      fontSize -= 1
    ) {
      const lineCount = getEstimatedTextBoxLineCount(
        normalizedText,
        contentWidth,
        fontSize,
      );

      const estimatedTextHeight = lineCount * fontSize * 1.12;

      if (estimatedTextHeight <= contentHeight) {
        return fontSize;
      }
    }

    return NOTE_TEXT_MIN_FONT_SIZE;
  };

  const getEstimatedNoteLineCount = (
    text: string,
    contentWidth: number,
    fontSize: number,
  ) => {
    const normalizedText = text.trim() || DEFAULT_NOTE_TEXT;
    const maxCharactersPerLine = Math.max(
      1,
      Math.floor(contentWidth / (fontSize * 0.54)),
    );

    return normalizedText.split("\n").reduce((lineCount, paragraph) => {
      if (paragraph.trim() === "") {
        return lineCount + 1;
      }

      const words = paragraph.trim().split(/\s+/);
      let currentLineLength = 0;
      let paragraphLineCount = 1;

      words.forEach((word) => {
        if (word.length > maxCharactersPerLine) {
          if (currentLineLength > 0) {
            paragraphLineCount += 1;
            currentLineLength = 0;
          }

          paragraphLineCount += Math.max(
            0,
            Math.ceil(word.length / maxCharactersPerLine) - 1,
          );
          currentLineLength = word.length % maxCharactersPerLine;
          return;
        }

        const nextLength =
          currentLineLength === 0
            ? word.length
            : currentLineLength + 1 + word.length;

        if (nextLength > maxCharactersPerLine) {
          paragraphLineCount += 1;
          currentLineLength = word.length;
        } else {
          currentLineLength = nextLength;
        }
      });

      return lineCount + paragraphLineCount;
    }, 0);
  };

  const getNoteEditorVerticalPadding = (
    text: string,
    width: number,
    height: number,
    fontSize: number,
  ) => {
    const contentWidth = Math.max(width - NOTE_TEXT_PADDING * 2, 24);
    const lineCount = getEstimatedNoteLineCount(text, contentWidth, fontSize);
    const estimatedTextHeight = lineCount * fontSize * 1.12;

    return Math.max(NOTE_TEXT_PADDING, (height - estimatedTextHeight) / 2);
  };

  const clampViewport = (nextViewport: Viewport): Viewport => {
    const scale =
      size.width > 0 && size.height > 0
        ? Math.min(size.width / BOARD_WIDTH, size.height / BOARD_HEIGHT) *
          nextViewport.zoom
        : nextViewport.zoom;

    const scaledBoardWidth = BOARD_WIDTH * scale;
    const scaledBoardHeight = BOARD_HEIGHT * scale;

    const getBounds = (viewportSize: number, scaledBoardSize: number) => {
      const centeredPosition = (viewportSize - scaledBoardSize) / 2;

      if (scaledBoardSize <= viewportSize) {
        return {
          min: centeredPosition,
          max: centeredPosition,
        };
      }

      return {
        min: viewportSize - scaledBoardSize,
        max: 0,
      };
    };

    const xBounds = getBounds(size.width, scaledBoardWidth);
    const yBounds = getBounds(size.height, scaledBoardHeight);

    return {
      ...nextViewport,
      x: Math.min(Math.max(nextViewport.x, xBounds.min), xBounds.max),
      y: Math.min(Math.max(nextViewport.y, yBounds.min), yBounds.max),
    };
  };

  useEffect(() => {
    editingTextBoxRef.current = editingTextBox;
  }, [editingTextBox]);

  useEffect(() => {
    const lineIds = new Set(lines.map((line) => line.id));

    setSelectedLineIds((currentIds) =>
      currentIds.filter((lineId) => lineIds.has(lineId)),
    );
  }, [lines]);

  useEffect(() => {
    const noteIds = new Set(notes.map((note) => note.id));

    setSelectedNoteIds((currentIds) =>
      currentIds.filter((noteId) => noteIds.has(noteId)),
    );

    setSelectedNoteId((currentId) =>
      currentId && noteIds.has(currentId) ? currentId : null,
    );

    if (editingNote && !noteIds.has(editingNote.id)) {
      setEditingNote(null);
    }
  }, [editingNote, notes]);

  useEffect(() => {
    const textBoxIds = new Set(textBoxes.map((textBox) => textBox.id));

    setSelectedTextBoxIds((currentIds) =>
      currentIds.filter((textBoxId) => textBoxIds.has(textBoxId)),
    );

    setSelectedTextBoxId((currentId) =>
      currentId && textBoxIds.has(currentId) ? currentId : null,
    );

    if (editingTextBox && !textBoxIds.has(editingTextBox.id)) {
      setEditingTextBox(null);
      editingTextBoxRef.current = null;
    }
  }, [editingTextBox, textBoxes]);

  useEffect(() => {
    const shapeIds = new Set(shapes.map((shape) => shape.id));

    setSelectedShapeIds((currentIds) =>
      currentIds.filter((shapeId) => shapeIds.has(shapeId)),
    );

    setSelectedShapeId((currentId) =>
      currentId && shapeIds.has(currentId) ? currentId : null,
    );

    if (editingShape && !shapeIds.has(editingShape.id)) {
      setEditingShape(null);
    }
  }, [editingShape, shapes]);

  useEffect(() => {
    const container = containerRef.current;

    if (!container) {
      return;
    }

    const updateSize = () => {
      const { width, height } = container.getBoundingClientRect();

      setSize({
        width: Math.floor(width),
        height: Math.floor(height),
      });
    };

    updateSize();

    const resizeObserver = new ResizeObserver(updateSize);
    resizeObserver.observe(container);

    return () => resizeObserver.disconnect();
  }, []);

  useEffect(() => {
    onZoomChange(viewport.zoom);
    viewportRef.current = viewport;
  }, [onZoomChange, viewport.zoom]);

  useEffect(() => {
    if (
      hasInitializedViewportRef.current ||
      size.width === 0 ||
      size.height === 0
    ) {
      return;
    }

    hasInitializedViewportRef.current = true;
    setViewport(getCenteredViewport(1));
  }, [size.width, size.height]);

  useEffect(() => {
    viewportRef.current = viewport;
  }, [viewport]);

  useEffect(() => {
    if (!hasInitializedViewportRef.current) {
      return;
    }

    setViewport((currentViewport) => clampViewport(currentViewport));
  }, [size.height, size.width]);

  useEffect(() => {
    const stageContainer =
      containerRef.current?.querySelector<HTMLElement>(".konvajs-content");
    const canvas = stageContainer?.querySelector("canvas");

    containerRef.current?.style.removeProperty("cursor");
    stageContainer?.style.removeProperty("cursor");
    canvas?.style.removeProperty("cursor");
  }, [activeTool]);

  useEffect(() => {
    if (!contextMenu) {
      return;
    }

    const closeContextMenu = (event: PointerEvent) => {
      if (!contextMenuRef.current?.contains(event.target as Node)) {
        setContextMenu(null);
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setContextMenu(null);
      }
    };

    document.addEventListener("pointerdown", closeContextMenu);
    document.addEventListener("keydown", handleEscape);

    return () => {
      document.removeEventListener("pointerdown", closeContextMenu);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [contextMenu]);

  useEffect(() => {
    if (!activeShapePopover) {
      return;
    }

    const closeShapePopover = (event: PointerEvent) => {
      if (!shapeToolbarRef.current?.contains(event.target as Node)) {
        setActiveShapePopover(null);
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setActiveShapePopover(null);
      }
    };

    document.addEventListener("pointerdown", closeShapePopover);
    document.addEventListener("keydown", handleEscape);

    return () => {
      document.removeEventListener("pointerdown", closeShapePopover);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [activeShapePopover]);

  useEffect(() => {
    if (!activeTextBoxPopover) {
      return;
    }

    const closeTextBoxPopover = (event: PointerEvent) => {
      if (!shapeToolbarRef.current?.contains(event.target as Node)) {
        setActiveTextBoxPopover(null);
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setActiveTextBoxPopover(null);
      }
    };

    document.addEventListener("pointerdown", closeTextBoxPopover);
    document.addEventListener("keydown", handleEscape);

    return () => {
      document.removeEventListener("pointerdown", closeTextBoxPopover);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [activeTextBoxPopover]);

  useEffect(() => {
    setActiveShapePopover(null);
  }, [selectedShapeId]);

  useEffect(() => {
    setActiveTextBoxPopover(null);
  }, [selectedTextBoxId]);

  useEffect(() => {
    const handleDeleteSelectedObject = (event: KeyboardEvent) => {
      if (event.key !== "Delete" && event.key !== "Backspace") {
        return;
      }

      const target = event.target as HTMLElement | null;
      const isEditableTarget =
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target?.isContentEditable;

      if (isEditableTarget || editingNote || editingTextBox || editingShape) {
        return;
      }

      if (activeTool !== "select") {
        return;
      }

      if (selectedObjectCount > 0) {
        event.preventDefault();
        onDeleteSelectedObjects(selectedIds);
        clearSelection();
      }
    };

    document.addEventListener("keydown", handleDeleteSelectedObject);

    return () => {
      document.removeEventListener("keydown", handleDeleteSelectedObject);
    };
  }, [
    editingNote,
    editingTextBox,
    editingShape,
    activeTool,
    onDeleteNote,
    onDeleteSelectedObjects,
    onDeleteShape,
    onDeleteTextBox,
    selectedLineIds,
    selectedNoteIds,
    selectedObjectCount,
    selectedShapeIds,
    selectedTextBoxIds,
  ]);

  useLayoutEffect(() => {
    if (!editingNote) {
      return;
    }

    const animationFrame = window.requestAnimationFrame(() => {
      const editor = noteEditorRef.current;

      if (!editor) {
        return;
      }

      editor.focus();
      editor.select();
    });

    return () => window.cancelAnimationFrame(animationFrame);
  }, [editingNote?.id]);

  useLayoutEffect(() => {
    if (!editingTextBox) {
      return;
    }

    const animationFrame = window.requestAnimationFrame(() => {
      const editor = textBoxEditorRef.current;

      if (!editor) {
        return;
      }

      editor.focus();
      editor.select();
    });

    return () => window.cancelAnimationFrame(animationFrame);
  }, [editingTextBox?.id]);

  useLayoutEffect(() => {
    if (!editingShape) {
      return;
    }

    const animationFrame = window.requestAnimationFrame(() => {
      const editor = shapeEditorRef.current;

      if (!editor) {
        return;
      }

      editor.focus();
      editor.select();
    });

    return () => window.cancelAnimationFrame(animationFrame);
  }, [editingShape?.id]);

  useEffect(() => {
    if (!editingNote) {
      return;
    }

    const note = notes.find((currentNote) => currentNote.id === editingNote.id);

    if (!note) {
      return;
    }

    setEditingNote((currentNote) =>
      currentNote
        ? {
            ...currentNote,
            left: viewport.x + note.x * actualScale,
            top: viewport.y + note.y * actualScale,
            width: note.width * actualScale,
            height: note.height * actualScale,
            color: note.color,
          }
        : currentNote,
    );
  }, [actualScale, editingNote?.id, notes, viewport.x, viewport.y]);

  useEffect(() => {
    if (!editingTextBox) {
      return;
    }

    const textBox = textBoxes.find(
      (currentTextBox) => currentTextBox.id === editingTextBox.id,
    );

    if (!textBox) {
      return;
    }

    setEditingTextBox((currentTextBox) =>
      currentTextBox
        ? {
            ...currentTextBox,
            left: viewport.x + textBox.x * actualScale,
            top: viewport.y + textBox.y * actualScale,
            width: textBox.width * actualScale,
            height: textBox.height * actualScale,
          }
        : currentTextBox,
    );
  }, [actualScale, editingTextBox?.id, textBoxes, viewport.x, viewport.y]);

  useEffect(() => {
    if (!editingShape) {
      return;
    }

    const shape = shapes.find(
      (currentShape) => currentShape.id === editingShape.id,
    );

    if (!shape) {
      return;
    }

    setEditingShape((currentShape) =>
      currentShape
        ? {
            ...currentShape,
            left: viewport.x + shape.x * actualScale,
            top: viewport.y + shape.y * actualScale,
            width: shape.width * actualScale,
            height: shape.height * actualScale,
          }
        : currentShape,
    );
  }, [actualScale, editingShape?.id, shapes, viewport.x, viewport.y]);

  useEffect(() => {
    return () => {
      if (centerAnimationRef.current !== null) {
        cancelAnimationFrame(centerAnimationRef.current);
      }
    };
  }, []);

  const getBoardPointFromPointer = (
    pointerPosition: { x: number; y: number } | null,
  ) => {
    if (!pointerPosition) {
      return null;
    }

    return {
      x: (pointerPosition.x - viewport.x) / actualScale,
      y: (pointerPosition.y - viewport.y) / actualScale,
    };
  };

  const getBoardPointFromClientPoint = (clientX: number, clientY: number) => {
    const stage = stageRef.current;

    if (!stage) {
      return null;
    }

    const stageRect = stage.container().getBoundingClientRect();

    return getBoardPointFromPointer({
      x: clientX - stageRect.left,
      y: clientY - stageRect.top,
    });
  };

  const getBoardPoint = (event: KonvaEventObject<MouseEvent>) => {
    const stage = event.target.getStage();
    const pointerPosition = stage?.getPointerPosition() ?? null;

    return getBoardPointFromPointer(pointerPosition);
  };

  const setStageCursor = (event: KonvaEventObject<Event>, cursor: string) => {
    const stage = event.target.getStage();
    const stageContainer = stage?.container();
    const canvas = stageContainer?.querySelector("canvas");

    if (!cursor) {
      stageContainer?.style.removeProperty("cursor");
      canvas?.style.removeProperty("cursor");
      containerRef.current?.style.removeProperty("cursor");
      return;
    }

    stageContainer?.style.setProperty("cursor", cursor, "important");
    canvas?.style.setProperty("cursor", cursor, "important");

    containerRef.current?.style.setProperty("cursor", cursor, "important");
  };
  const canSelectObjects = activeTool === "select";
  const isLineSelected = (id: string) => selectedLineIds.includes(id);
  const isNoteSelected = (id: string) => selectedNoteIds.includes(id);
  const isTextBoxSelected = (id: string) => selectedTextBoxIds.includes(id);
  const isShapeSelected = (id: string) => selectedShapeIds.includes(id);

  const clearSelection = () => {
    setSelectedNoteId(null);
    setSelectedTextBoxId(null);
    setSelectedShapeId(null);
    setSelectedLineIds([]);
    setSelectedNoteIds([]);
    setSelectedTextBoxIds([]);
    setSelectedShapeIds([]);
  };

  const selectOnly = (target: ObjectMenuTarget) => {
    setSelectedLineIds(target.type === "line" ? [target.id] : []);
    setSelectedNoteId(target.type === "note" ? target.id : null);
    setSelectedTextBoxId(target.type === "textBox" ? target.id : null);
    setSelectedShapeId(target.type === "shape" ? target.id : null);
    setSelectedNoteIds(target.type === "note" ? [target.id] : []);
    setSelectedTextBoxIds(target.type === "textBox" ? [target.id] : []);
    setSelectedShapeIds(target.type === "shape" ? [target.id] : []);
  };

  const toggleSelection = (target: ObjectMenuTarget) => {
    if (target.type === "line") {
      setSelectedLineIds((currentIds) =>
        currentIds.includes(target.id)
          ? currentIds.filter((id) => id !== target.id)
          : [...currentIds, target.id],
      );
      setSelectedNoteId(null);
      setSelectedTextBoxId(null);
      setSelectedShapeId(null);
      return;
    }

    if (target.type === "note") {
      setSelectedNoteIds((currentIds) =>
        currentIds.includes(target.id)
          ? currentIds.filter((id) => id !== target.id)
          : [...currentIds, target.id],
      );
      setSelectedTextBoxId(null);
      setSelectedShapeId(null);
      setSelectedNoteId(target.id);
      return;
    }

    if (target.type === "textBox") {
      setSelectedTextBoxIds((currentIds) =>
        currentIds.includes(target.id)
          ? currentIds.filter((id) => id !== target.id)
          : [...currentIds, target.id],
      );
      setSelectedNoteId(null);
      setSelectedShapeId(null);
      setSelectedTextBoxId(target.id);
      return;
    }

    setSelectedShapeIds((currentIds) =>
      currentIds.includes(target.id)
        ? currentIds.filter((id) => id !== target.id)
        : [...currentIds, target.id],
    );
    setSelectedNoteId(null);
    setSelectedTextBoxId(null);
    setSelectedShapeId(target.id);
  };

  const isTargetSelected = (target: ObjectMenuTarget) => {
    if (target.type === "line") {
      return isLineSelected(target.id);
    }

    if (target.type === "note") {
      return isNoteSelected(target.id);
    }

    if (target.type === "textBox") {
      return isTextBoxSelected(target.id);
    }

    return isShapeSelected(target.id);
  };

  const getNextZIndex = () => {
    const allZIndexes = [
      ...lines.map((line) => line.zIndex ?? 0),
      ...notes.map((note) => note.zIndex ?? 0),
      ...shapes.map((shape) => shape.zIndex ?? 0),
      ...textBoxes.map((textBox) => textBox.zIndex ?? 0),
      nextZIndexRef.current,
    ];

    const nextZIndex = Math.max(...allZIndexes) + 1;
    nextZIndexRef.current = nextZIndex;

    return nextZIndex;
  };

  const handleMouseDown = (event: KonvaEventObject<MouseEvent>) => {
    if (event.evt.button === 1) {
      event.evt.preventDefault();
      setContextMenu(null);

      const point = event.target.getStage()?.getPointerPosition();

      if (point) {
        isPanningRef.current = true;
        lastPanPointRef.current = point;
        setIsPanning(true);
      }

      return;
    }

    if (event.evt.button !== 0) {
      return;
    }

    setContextMenu(null);

    if (event.target === event.target.getStage() && activeTool !== "sticky") {
      clearSelection();
    }

    if (activeTool === "sticky" && event.target === event.target.getStage()) {
      const point = getBoardPoint(event);

      if (!point) {
        return;
      }

      const id = crypto.randomUUID();
      const note = {
        id,
        x: point.x - DEFAULT_NOTE_WIDTH / 2,
        y: point.y - DEFAULT_NOTE_HEIGHT / 2,
        width: DEFAULT_NOTE_WIDTH,
        height: DEFAULT_NOTE_HEIGHT,
        text: DEFAULT_NOTE_TEXT,
        color: selectedStickyColor || DEFAULT_NOTE_COLOR,
        zIndex: getNextZIndex(),
      };

      onCreateNote({
        ...note,
      });
      setSelectedNoteId(id);
      setSelectedTextBoxId(null);
      setSelectedShapeId(null);
      setSelectedNoteIds([id]);
      setSelectedTextBoxIds([]);
      setSelectedShapeIds([]);
      setEditingNote({
        id,
        text: "",
        originalText: DEFAULT_NOTE_TEXT,
        left: viewport.x + note.x * actualScale,
        top: viewport.y + note.y * actualScale,
        width: note.width * actualScale,
        height: note.height * actualScale,
        color: note.color,
      });
      onStickyNotePlaced();
      setStageCursor(event, "default");
      window.setTimeout(() => setStageCursor(event, ""), 0);

      return;
    }

    if (activeTool === "text" && event.target === event.target.getStage()) {
      if (editingTextBox) {
        return;
      }

      const point = getBoardPoint(event);

      if (!point) {
        return;
      }

      const id = crypto.randomUUID();
      const textBox = {
        id,
        x: point.x - DEFAULT_TEXT_BOX_WIDTH / 2,
        y: point.y - DEFAULT_TEXT_BOX_HEIGHT / 2,
        width: DEFAULT_TEXT_BOX_WIDTH,
        height: DEFAULT_TEXT_BOX_HEIGHT,
        text: "",
        textColor: DEFAULT_TEXT_COLOR,
        fontSize: null,
        fontWeight: DEFAULT_FONT_WEIGHT,
        textAlign: DEFAULT_TEXT_ALIGN,
        zIndex: getNextZIndex(),
      };

      onCreateTextBox(textBox);
      setSelectedTextBoxId(id);
      setSelectedNoteId(null);
      setSelectedShapeId(null);
      setSelectedNoteIds([]);
      setSelectedTextBoxIds([id]);
      setSelectedShapeIds([]);
      setEditingTextBox({
        id,
        text: "",
        originalText: "",
        left: viewport.x + textBox.x * actualScale,
        top: viewport.y + textBox.y * actualScale,
        width: textBox.width * actualScale,
        height: textBox.height * actualScale,
      });

      return;
    }

    if (
      activeTool === "shape" &&
      selectedShapeType &&
      event.target === event.target.getStage()
    ) {
      const point = getBoardPoint(event);

      if (!point) {
        return;
      }

      const shape = {
        id: crypto.randomUUID(),
        type: selectedShapeType,
        x: point.x,
        y: point.y,
        width: 1,
        height: 1,
        text: DEFAULT_SHAPE_TEXT,
        fill:
          selectedShapeType === "line" || selectedShapeType === "arrow"
            ? "transparent"
            : "#ffffff",
        stroke: "#1f2937",
        strokeWidth: 2,
        lineStyle: "solid" as const,
        textColor: DEFAULT_TEXT_COLOR,
        fontSize: null,
        fontWeight: DEFAULT_FONT_WEIGHT,
        textAlign: DEFAULT_TEXT_ALIGN,
        zIndex: getNextZIndex(),
      };

      setDraftShape({ shape, startX: point.x, startY: point.y });
      return;
    }

    if (activeTool === "select" && event.target === event.target.getStage()) {
      const point = getBoardPoint(event);

      if (point) {
        const nextSelection = { start: point, current: point };

        setMarqueeSelection(nextSelection);
        onMarqueeUpdate(nextSelection);
      }

      return;
    }

    if (activeTool === "eraser") {
      isErasingRef.current = true;
      linesBeforeEraseRef.current = lines;
      erasedLineIdsRef.current = new Set();
      return;
    }

    if (activeTool !== "pen") {
      return;
    }

    const point = getBoardPoint(event);

    if (!point) {
      return;
    }

    const id = crypto.randomUUID();
    const newLine: DrawnLine = {
      id,
      points: [point.x, point.y],
      stroke: penColor,
      strokeWidth: penStrokeWidth,
      zIndex: getNextZIndex(),
    };

    isDrawingRef.current = true;
    activeLineIdRef.current = id;
    activeLiveLineRef.current = newLine;
    linesBeforeStrokeRef.current = lines;
    lastLiveLineUpdateRef.current = 0;

    onLinesChange((currentLines) => [...currentLines, newLine]);
    onLiveLineStart(newLine);
  };

  const handleMouseMove = (event: KonvaEventObject<MouseEvent>) => {
    const cursorPoint = getBoardPoint(event);

    if (cursorPoint) {
      onCursorMove(cursorPoint);
    }
    if (draftShape) {
      const point = getBoardPoint(event);

      if (!point) {
        return;
      }

      setDraftShape((currentDraft) => {
        if (!currentDraft) {
          return currentDraft;
        }

        if (
          currentDraft.shape.type === "line" ||
          currentDraft.shape.type === "arrow"
        ) {
          return {
            ...currentDraft,
            shape: {
              ...currentDraft.shape,
              x: currentDraft.startX,
              y: currentDraft.startY,
              width: point.x - currentDraft.startX,
              height: point.y - currentDraft.startY,
            },
          };
        }

        const x = Math.min(currentDraft.startX, point.x);
        const y = Math.min(currentDraft.startY, point.y);
        const width = Math.abs(point.x - currentDraft.startX);
        const height = Math.abs(point.y - currentDraft.startY);

        return {
          ...currentDraft,
          shape: {
            ...currentDraft.shape,
            x,
            y,
            width,
            height,
          },
        };
      });
      return;
    }

    if (marqueeSelection) {
      const point = getBoardPoint(event);

      if (!point) {
        return;
      }

      const nextSelection = {
        ...marqueeSelection,
        current: point,
      };

      setMarqueeSelection(nextSelection);
      onMarqueeUpdate(nextSelection);
      return;
    }

    if (isPanningRef.current && lastPanPointRef.current) {
      const point = event.target.getStage()?.getPointerPosition();

      if (!point) {
        return;
      }

      const lastPoint = lastPanPointRef.current;
      const deltaX = point.x - lastPoint.x;
      const deltaY = point.y - lastPoint.y;

      lastPanPointRef.current = point;
      setViewport((currentViewport) =>
        clampViewport({
          ...currentViewport,
          x: currentViewport.x + deltaX,
          y: currentViewport.y + deltaY,
        }),
      );

      return;
    }

    if (!isDrawingRef.current || !activeLineIdRef.current) {
      return;
    }

    const point = getBoardPoint(event);

    if (!point) {
      return;
    }

    const activeLineId = activeLineIdRef.current;
    const currentLiveLine = activeLiveLineRef.current;

    if (!currentLiveLine || currentLiveLine.id !== activeLineId) {
      return;
    }

    const updatedLine: DrawnLine = {
      ...currentLiveLine,
      points: [...currentLiveLine.points, point.x, point.y],
    };

    activeLiveLineRef.current = updatedLine;

    onLinesChange((currentLines) =>
      currentLines.map((line) =>
        line.id === activeLineId ? updatedLine : line,
      ),
    );

    const now = performance.now();

    if (now - lastLiveLineUpdateRef.current >= 40) {
      lastLiveLineUpdateRef.current = now;
      onLiveLineUpdate(updatedLine);
    }
  };

  const handleLineMouseDown = (
    event: KonvaEventObject<MouseEvent>,
    lineId: string,
  ) => {
    if (event.evt.button !== 0) {
      return;
    }

    if (activeTool === "select") {
      event.cancelBubble = true;

      if (event.evt.shiftKey) {
        toggleSelection({ type: "line", id: lineId });
      } else if (!isLineSelected(lineId)) {
        selectOnly({ type: "line", id: lineId });
      }

      return;
    }

    if (activeTool !== "eraser") {
      return;
    }

    event.cancelBubble = true;
    if (!isErasingRef.current) {
      isErasingRef.current = true;
      linesBeforeEraseRef.current = lines;
      erasedLineIdsRef.current = new Set();
    }

    if (!erasedLineIdsRef.current.has(lineId)) {
      erasedLineIdsRef.current.add(lineId);
      onEraseLine(lineId);
    }
  };

  const handleLineMouseEnter = (lineId: string) => {
    if (
      activeTool === "eraser" &&
      isErasingRef.current &&
      !erasedLineIdsRef.current.has(lineId)
    ) {
      erasedLineIdsRef.current.add(lineId);
      onEraseLine(lineId);
    }
  };

  const openNoteEditor = (
    event: KonvaEventObject<MouseEvent | TouchEvent>,
    note: StickyNote,
  ) => {
    event.cancelBubble = true;

    setEditingNote({
      id: note.id,
      text: note.text,
      originalText: note.text,
      left: viewport.x + note.x * actualScale,
      top: viewport.y + note.y * actualScale,
      width: note.width * actualScale,
      height: note.height * actualScale,
      color: note.color,
    });
  };

  const saveEditingNote = () => {
    if (skipNoteBlurSaveRef.current) {
      skipNoteBlurSaveRef.current = false;
      return;
    }

    if (!editingNote) {
      return;
    }

    onEditNote(editingNote.id, editingNote.text.trim() || DEFAULT_NOTE_TEXT);
    setEditingNote(null);
  };

  const cancelEditingNote = () => {
    skipNoteBlurSaveRef.current = true;

    if (editingNote && editingNote.text !== editingNote.originalText) {
      onEditNote(editingNote.id, editingNote.originalText || DEFAULT_NOTE_TEXT);
    }

    setEditingNote(null);
    window.setTimeout(() => {
      skipNoteBlurSaveRef.current = false;
    }, 0);
  };

  const openTextBoxEditor = (
    event: KonvaEventObject<MouseEvent | TouchEvent>,
    textBox: TextBox,
  ) => {
    event.cancelBubble = true;

    setEditingTextBox({
      id: textBox.id,
      text: textBox.text,
      originalText: textBox.text,
      left: viewport.x + textBox.x * actualScale,
      top: viewport.y + textBox.y * actualScale,
      width: textBox.width * actualScale,
      height: textBox.height * actualScale,
    });
  };

  const saveEditingTextBox = (textAreaValue?: string) => {
    const currentEditingTextBox = editingTextBoxRef.current ?? editingTextBox;
    const nextText = (
      textAreaValue ??
      textBoxEditorRef.current?.value ??
      ""
    ).trim();

    if (!currentEditingTextBox) {
      onTextBoxPlaced();
      return;
    }

    if (!nextText) {
      onDeleteTextBox(currentEditingTextBox.id);
      setSelectedTextBoxId(null);
      setEditingTextBox(null);
      editingTextBoxRef.current = null;
      onTextBoxPlaced();
      return;
    }

    onEditTextBox(currentEditingTextBox.id, nextText);
    setEditingTextBox(null);
    editingTextBoxRef.current = null;
    onTextBoxPlaced();
  };

  const cancelEditingTextBox = () => {
    const currentEditingTextBox = editingTextBoxRef.current;

    if (!currentEditingTextBox) {
      onTextBoxPlaced();
      return;
    }

    if (!currentEditingTextBox.originalText.trim()) {
      onDeleteTextBox(currentEditingTextBox.id);
      setSelectedTextBoxId(null);
    }

    setEditingTextBox(null);
    editingTextBoxRef.current = null;
    onTextBoxPlaced();
  };

  const openShapeEditor = (
    event: KonvaEventObject<MouseEvent | TouchEvent>,
    shape: Shape,
  ) => {
    event.cancelBubble = true;

    setEditingShape({
      id: shape.id,
      text: shape.text,
      originalText: shape.text,
      left: viewport.x + shape.x * actualScale,
      top: viewport.y + shape.y * actualScale,
      width: shape.width * actualScale,
      height: shape.height * actualScale,
    });
  };

  const saveEditingShape = () => {
    if (!editingShape) {
      return;
    }

    onEditShape(editingShape.id, editingShape.text.trim());
    setEditingShape(null);
  };

  const cancelEditingShape = () => {
    if (editingShape && editingShape.text !== editingShape.originalText) {
      onEditShape(editingShape.id, editingShape.originalText);
    }

    setEditingShape(null);
  };

  const getRenderedNote = (note: StickyNote): StickyNote => {
    if (resizingNote?.id !== note.id) {
      return note;
    }

    return {
      ...note,
      x: resizingNote.x,
      y: resizingNote.y,
      width: resizingNote.width,
      height: resizingNote.height,
    };
  };

  const getRenderedTextBox = (textBox: TextBox): TextBox => {
    if (resizingTextBox?.id !== textBox.id) {
      return textBox;
    }

    return {
      ...textBox,
      x: resizingTextBox.x,
      y: resizingTextBox.y,
      width: resizingTextBox.width,
      height: resizingTextBox.height,
    };
  };

  const getRenderedShape = (shape: Shape): Shape => {
    if (resizingShape?.id !== shape.id) {
      return shape;
    }

    return {
      ...shape,
      x: resizingShape.x,
      y: resizingShape.y,
      width: resizingShape.width,
      height: resizingShape.height,
    };
  };

  const getResizedBounds = (
    handle: ResizeHandle,
    bounds: NoteBounds,
    point: { x: number; y: number },
    minWidth = MIN_NOTE_WIDTH,
    minHeight = MIN_NOTE_HEIGHT,
  ): NoteBounds => {
    const right = bounds.x + bounds.width;
    const bottom = bounds.y + bounds.height;

    if (handle === "nw") {
      const x = Math.min(point.x, right - minWidth);
      const y = Math.min(point.y, bottom - minHeight);

      return {
        x,
        y,
        width: right - x,
        height: bottom - y,
      };
    }

    if (handle === "ne") {
      const y = Math.min(point.y, bottom - minHeight);

      return {
        x: bounds.x,
        y,
        width: Math.max(point.x - bounds.x, minWidth),
        height: bottom - y,
      };
    }

    if (handle === "sw") {
      const x = Math.min(point.x, right - minWidth);

      return {
        x,
        y: bounds.y,
        width: right - x,
        height: Math.max(point.y - bounds.y, minHeight),
      };
    }

    return {
      x: bounds.x,
      y: bounds.y,
      width: Math.max(point.x - bounds.x, minWidth),
      height: Math.max(point.y - bounds.y, minHeight),
    };
  };

  const handleResizeMove = (
    event: KonvaEventObject<DragEvent>,
    note: StickyNote,
    handle: ResizeHandle,
  ) => {
    event.cancelBubble = true;

    const pointerPosition =
      event.target.getStage()?.getPointerPosition() ?? null;
    const point = getBoardPointFromPointer(pointerPosition);
    const startingNote = resizeStartRef.current ?? note;

    if (!point) {
      return;
    }

    const nextBounds = getResizedBounds(handle, startingNote, point);

    setResizingNote({
      id: note.id,
      ...nextBounds,
    });
    onPreviewResizeNote({
      ...note,
      ...nextBounds,
    });
  };

  const handleResizeEnd = (
    event: KonvaEventObject<DragEvent>,
    note: StickyNote,
  ) => {
    event.cancelBubble = true;

    if (resizingNote?.id === note.id) {
      onResizeNote(note.id, {
        x: resizingNote.x,
        y: resizingNote.y,
        width: resizingNote.width,
        height: resizingNote.height,
      });
    }

    resizeStartRef.current = null;
    setResizingNote(null);
  };

  const handleTextBoxResizeMove = (
    event: KonvaEventObject<DragEvent>,
    textBox: TextBox,
    handle: ResizeHandle,
  ) => {
    event.cancelBubble = true;

    const pointerPosition =
      event.target.getStage()?.getPointerPosition() ?? null;
    const point = getBoardPointFromPointer(pointerPosition);
    const startingTextBox = textBoxResizeStartRef.current ?? textBox;

    if (!point) {
      return;
    }

    const nextBounds = getResizedBounds(handle, startingTextBox, point);

    setResizingTextBox({
      id: textBox.id,
      ...nextBounds,
    });
    onPreviewResizeTextBox({
      ...textBox,
      ...nextBounds,
    });
    onCursorMove(point);
  };

  const handleTextBoxResizeEnd = (
    event: KonvaEventObject<DragEvent>,
    textBox: TextBox,
  ) => {
    event.cancelBubble = true;

    if (resizingTextBox?.id === textBox.id) {
      onResizeTextBox(textBox.id, {
        x: resizingTextBox.x,
        y: resizingTextBox.y,
        width: resizingTextBox.width,
        height: resizingTextBox.height,
      });
    }

    textBoxResizeStartRef.current = null;
    setResizingTextBox(null);
  };

  const handleShapeResizeMove = (
    event: KonvaEventObject<DragEvent>,
    shape: Shape,
    handle: ResizeHandle,
  ) => {
    event.cancelBubble = true;

    const pointerPosition =
      event.target.getStage()?.getPointerPosition() ?? null;
    const point = getBoardPointFromPointer(pointerPosition);
    const startingShape = shapeResizeStartRef.current ?? shape;

    if (!point) {
      return;
    }

    const nextBounds = getResizedBounds(
      handle,
      startingShape,
      point,
      MIN_SHAPE_WIDTH,
      MIN_SHAPE_HEIGHT,
    );

    setResizingShape({
      id: shape.id,
      ...nextBounds,
    });
    onPreviewResizeShape({
      ...shape,
      ...nextBounds,
    });
    onCursorMove(point);
  };

  const handleShapeResizeEnd = (
    event: KonvaEventObject<DragEvent>,
    shape: Shape,
  ) => {
    event.cancelBubble = true;

    if (resizingShape?.id === shape.id) {
      onResizeShape(shape.id, {
        x: resizingShape.x,
        y: resizingShape.y,
        width: resizingShape.width,
        height: resizingShape.height,
      });
    }

    shapeResizeStartRef.current = null;
    setResizingShape(null);
  };

  const handleLineShapeEndpointMove = (
    event: KonvaEventObject<DragEvent>,
    shape: Shape,
    endpoint: "start" | "end",
  ) => {
    event.cancelBubble = true;

    const pointerPosition =
      event.target.getStage()?.getPointerPosition() ?? null;
    const point = getBoardPointFromPointer(pointerPosition);
    const startingShape = shapeResizeStartRef.current ?? shape;

    if (!point) {
      return;
    }

    if (endpoint === "start") {
      const oldEndX = startingShape.x + startingShape.width;
      const oldEndY = startingShape.y + startingShape.height;
      const nextBounds = {
        x: point.x,
        y: point.y,
        width: oldEndX - point.x,
        height: oldEndY - point.y,
      };

      setResizingShape({
        id: shape.id,
        ...nextBounds,
      });
      onPreviewResizeShape({
        ...shape,
        ...nextBounds,
      });
      onCursorMove(point);
      return;
    }

    const nextBounds = {
      x: startingShape.x,
      y: startingShape.y,
      width: point.x - startingShape.x,
      height: point.y - startingShape.y,
    };

    setResizingShape({
      id: shape.id,
      ...nextBounds,
    });
    onPreviewResizeShape({
      ...shape,
      ...nextBounds,
    });
    onCursorMove(point);
  };

  const handleWheel = (event: KonvaEventObject<WheelEvent>) => {
    event.evt.preventDefault();
    setContextMenu(null);

    const stage = event.target.getStage();
    const pointerPosition = stage?.getPointerPosition();

    if (!pointerPosition) {
      return;
    }

    const isTrackpadPan =
      !event.evt.ctrlKey &&
      !event.evt.metaKey &&
      (Math.abs(event.evt.deltaX) > 0 || Math.abs(event.evt.deltaY) < 40);

    if (isTrackpadPan) {
      setViewport((currentViewport) =>
        clampViewport({
          ...currentViewport,
          x: currentViewport.x - event.evt.deltaX,
          y: currentViewport.y - event.evt.deltaY,
        }),
      );
      return;
    }

    setViewport((currentViewport) => {
      const nextZoom =
        currentViewport.zoom * Math.exp(-event.evt.deltaY * ZOOM_SENSITIVITY);
      const clampedZoom = Math.min(Math.max(nextZoom, MIN_ZOOM), MAX_ZOOM);

      if (clampedZoom === currentViewport.zoom) {
        return currentViewport;
      }

      const currentActualScale = baseScale * currentViewport.zoom;

      const pointerBoardX =
        (pointerPosition.x - currentViewport.x) / currentActualScale;
      const pointerBoardY =
        (pointerPosition.y - currentViewport.y) / currentActualScale;

      return clampViewport({
        zoom: clampedZoom,
        x: pointerPosition.x - pointerBoardX * baseScale * clampedZoom,
        y: pointerPosition.y - pointerBoardY * baseScale * clampedZoom,
      });
    });
  };

  const getCenteredViewport = (zoom: number) => {
    const scale = baseScale * zoom;

    return clampViewport({
      zoom,
      x: size.width / 2 - (BOARD_WIDTH * scale) / 2,
      y: size.height / 2 - (BOARD_HEIGHT * scale) / 2,
    });
  };

  const centerView = () => {
    setContextMenu(null);

    if (centerAnimationRef.current !== null) {
      cancelAnimationFrame(centerAnimationRef.current);
    }

    const startViewport = viewportRef.current;
    const endViewport = getCenteredViewport(startViewport.zoom);
    const startTime = performance.now();

    const animate = (time: number) => {
      const progress = Math.min((time - startTime) / CENTER_ANIMATION_MS, 1);
      const easedProgress = 1 - Math.pow(1 - progress, 3);

      setViewport({
        zoom: startViewport.zoom,
        x: startViewport.x + (endViewport.x - startViewport.x) * easedProgress,
        y: startViewport.y + (endViewport.y - startViewport.y) * easedProgress,
      });

      if (progress < 1) {
        centerAnimationRef.current = requestAnimationFrame(animate);
      } else {
        centerAnimationRef.current = null;
      }
    };

    centerAnimationRef.current = requestAnimationFrame(animate);
  };

  const getContextMenuPosition = (
    clientX: number,
    clientY: number,
    menuHeight = OBJECT_CONTEXT_MENU_HEIGHT,
  ) => {
    const container = containerRef.current;

    if (!container) {
      return null;
    }

    const containerRect = container.getBoundingClientRect();
    const maxX = Math.max(
      containerRect.width - CONTEXT_MENU_WIDTH - CONTEXT_MENU_SAFE_PADDING,
      CONTEXT_MENU_SAFE_PADDING,
    );
    const maxY = Math.max(
      containerRect.height - menuHeight - CONTEXT_MENU_SAFE_PADDING,
      CONTEXT_MENU_SAFE_PADDING,
    );
    const x = Math.min(
      Math.max(clientX - containerRect.left, CONTEXT_MENU_SAFE_PADDING),
      maxX,
    );
    const y = Math.min(
      Math.max(clientY - containerRect.top, CONTEXT_MENU_SAFE_PADDING),
      maxY,
    );

    return { x, y };
  };

  const getContextSubmenuPlacement = () => {
    if (!contextMenu) {
      return {
        className: "context-menu-submenu-panel",
        style: undefined,
      };
    }

    const containerRect = containerRef.current?.getBoundingClientRect();
    const availableWidth = containerRect?.width ?? window.innerWidth;
    const availableHeight = containerRect?.height ?? window.innerHeight;
    const opensLeft =
      contextMenu.x +
        CONTEXT_MENU_WIDTH +
        CONTEXT_SUBMENU_GAP +
        CONTEXT_SUBMENU_WIDTH >
      availableWidth - CONTEXT_MENU_SAFE_PADDING;
    const submenuViewportTop = contextMenu.y + CONTEXT_SUBMENU_TRIGGER_OFFSET;
    const maxSubmenuTop =
      availableHeight - CONTEXT_SUBMENU_HEIGHT - CONTEXT_MENU_SAFE_PADDING;
    const offsetY = Math.min(0, maxSubmenuTop - submenuViewportTop);

    return {
      className: opensLeft
        ? "context-menu-submenu-panel opens-left"
        : "context-menu-submenu-panel",
      style:
        offsetY < 0
          ? ({ top: offsetY } as const)
          : undefined,
    };
  };

  const isPointInsideObject = (point: { x: number; y: number }) => {
    return (
      notes.some(
        (note) =>
          point.x >= note.x &&
          point.x <= note.x + note.width &&
          point.y >= note.y &&
          point.y <= note.y + note.height,
      ) ||
      textBoxes.some(
        (textBox) =>
          point.x >= textBox.x &&
          point.x <= textBox.x + textBox.width &&
          point.y >= textBox.y &&
          point.y <= textBox.y + textBox.height,
      ) ||
      shapes.some(
        (shape) =>
          point.x >= shape.x &&
          point.x <= shape.x + shape.width &&
          point.y >= shape.y &&
          point.y <= shape.y + shape.height,
      )
    );
  };

  const handleContextMenu = (event: KonvaEventObject<MouseEvent>) => {
    event.evt.preventDefault();

    const stage = event.target.getStage();

    if (!stage || event.target !== stage) {
      return;
    }

    const point = getBoardPoint(event);

    if (point && isPointInsideObject(point)) {
      setContextMenu(null);
      return;
    }

    if (!point) {
      return;
    }

    const position = getContextMenuPosition(
      event.evt.clientX,
      event.evt.clientY,
      CANVAS_CONTEXT_MENU_HEIGHT,
    );

    if (!position) {
      return;
    }

    setContextMenu({
      ...position,
      target: { type: "canvas", boardX: point.x, boardY: point.y },
    });
  };

  const openObjectContextMenu = (
    event: KonvaEventObject<MouseEvent>,
    target: ObjectMenuTarget,
  ) => {
    event.evt.preventDefault();
    event.cancelBubble = true;

    const position = getContextMenuPosition(
      event.evt.clientX,
      event.evt.clientY,
    );

    if (!position) {
      return;
    }

    const nextTarget = { ...target, x: position.x, y: position.y };

    if (!isTargetSelected(target)) {
      selectOnly(target);
    } else {
      if (target.type === "line") {
        setSelectedLineIds([target.id]);
      } else if (target.type === "note") {
        setSelectedNoteId(target.id);
      } else if (target.type === "textBox") {
        setSelectedTextBoxId(target.id);
      } else {
        setSelectedShapeId(target.id);
      }
    }

    setContextMenu({ ...position, target: nextTarget });
  };

  const getLineBounds = (line: Pick<DrawnLine, "points">): NoteBounds => {
    const xPoints = line.points.filter((_, index) => index % 2 === 0);
    const yPoints = line.points.filter((_, index) => index % 2 === 1);
    const minX = Math.min(...xPoints);
    const minY = Math.min(...yPoints);
    const maxX = Math.max(...xPoints);
    const maxY = Math.max(...yPoints);

    return {
      x: minX,
      y: minY,
      width: Math.max(maxX - minX, 1),
      height: Math.max(maxY - minY, 1),
    };
  };

  const getVisibleBoardBounds = () => ({
    left: -viewport.x / actualScale,
    top: (-viewport.y + TOPBAR_HEIGHT) / actualScale,
    right: (-viewport.x + size.width) / actualScale,
    bottom: (-viewport.y + size.height) / actualScale,
  });

  const clampDragDeltaToVisibleViewport = (
    bounds: NoteBounds,
    deltaX: number,
    deltaY: number,
  ) => {
    const visibleBounds = getVisibleBoardBounds();
    let nextDeltaX = deltaX;
    let nextDeltaY = deltaY;

    if (bounds.x + bounds.width + nextDeltaX < visibleBounds.left + DRAG_VISIBLE_MARGIN) {
      nextDeltaX = visibleBounds.left + DRAG_VISIBLE_MARGIN - (bounds.x + bounds.width);
    }

    if (bounds.x + nextDeltaX > visibleBounds.right - DRAG_VISIBLE_MARGIN) {
      nextDeltaX = visibleBounds.right - DRAG_VISIBLE_MARGIN - bounds.x;
    }

    if (bounds.y + bounds.height + nextDeltaY < visibleBounds.top + DRAG_VISIBLE_MARGIN) {
      nextDeltaY = visibleBounds.top + DRAG_VISIBLE_MARGIN - (bounds.y + bounds.height);
    }

    if (bounds.y + nextDeltaY > visibleBounds.bottom - DRAG_VISIBLE_MARGIN) {
      nextDeltaY = visibleBounds.bottom - DRAG_VISIBLE_MARGIN - bounds.y;
    }

    return { deltaX: nextDeltaX, deltaY: nextDeltaY };
  };

  const clampObjectPositionToVisibleViewport = (
    bounds: NoteBounds,
    nextX: number,
    nextY: number,
  ) => {
    const { deltaX, deltaY } = clampDragDeltaToVisibleViewport(
      bounds,
      nextX - bounds.x,
      nextY - bounds.y,
    );

    return {
      x: bounds.x + deltaX,
      y: bounds.y + deltaY,
    };
  };

  const getSelectedGroupBounds = (
    selectedLines: DrawnLine[],
    selectedNotes: StickyNote[],
    selectedTextBoxes: TextBox[],
    selectedShapes: Shape[],
  ): NoteBounds | null => {
    const bounds = [
      ...selectedLines.map(getLineBounds),
      ...[...selectedNotes, ...selectedTextBoxes, ...selectedShapes].map(
        (object) =>
          getNormalizedBounds({
            x: object.x,
            y: object.y,
            width: object.width,
            height: object.height,
          }),
      ),
    ];

    if (bounds.length === 0) {
      return null;
    }

    const minX = Math.min(...bounds.map((bound) => bound.x));
    const minY = Math.min(...bounds.map((bound) => bound.y));
    const maxX = Math.max(...bounds.map((bound) => bound.x + bound.width));
    const maxY = Math.max(...bounds.map((bound) => bound.y + bound.height));

    return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
  };

  const getSelectedGroupObjects = () => {
    const selectedLines = lines.filter((line) =>
      selectedLineIds.includes(line.id),
    );
    const selectedNotes = notes.filter((note) =>
      selectedNoteIds.includes(note.id),
    );
    const selectedTextBoxes = textBoxes.filter((textBox) =>
      selectedTextBoxIds.includes(textBox.id),
    );
    const selectedShapes = shapes.filter((shape) =>
      selectedShapeIds.includes(shape.id),
    );

    return {
      lines: selectedLines,
      notes: selectedNotes,
      textBoxes: selectedTextBoxes,
      shapes: selectedShapes,
      bounds: getSelectedGroupBounds(
        selectedLines,
        selectedNotes,
        selectedTextBoxes,
        selectedShapes,
      ),
    };
  };

  const copySelectedObjects = () => {
    const group = getSelectedGroupObjects();

    if (!group.bounds) {
      return;
    }

    setCopiedObject({
      type: "group",
      lines: group.lines.map(({ id: _id, zIndex: _zIndex, ...line }) => line),
      notes: group.notes.map(({ id: _id, zIndex: _zIndex, ...note }) => note),
      textBoxes: group.textBoxes.map(
        ({ id: _id, zIndex: _zIndex, ...textBox }) => textBox,
      ),
      shapes: group.shapes.map(
        ({ id: _id, zIndex: _zIndex, ...shape }) => shape,
      ),
      bounds: group.bounds,
    });
  };

  const duplicateSelectedObjects = () => {
    const group = getSelectedGroupObjects();
    const nextLines = group.lines.map((line) => ({
      ...line,
      id: crypto.randomUUID(),
      points: line.points.map((point) => point + 24),
      zIndex: getNextZIndex(),
    }));
    const nextNotes = group.notes.map((note) => ({
      ...note,
      id: crypto.randomUUID(),
      x: note.x + 24,
      y: note.y + 24,
      zIndex: getNextZIndex(),
    }));
    const nextTextBoxes = group.textBoxes.map((textBox) => ({
      ...textBox,
      id: crypto.randomUUID(),
      x: textBox.x + 24,
      y: textBox.y + 24,
      zIndex: getNextZIndex(),
    }));
    const nextShapes = group.shapes.map((shape) => ({
      ...shape,
      id: crypto.randomUUID(),
      x: shape.x + 24,
      y: shape.y + 24,
      zIndex: getNextZIndex(),
    }));

    onCreateObjectsBatch({
      lines: nextLines,
      notes: nextNotes,
      textBoxes: nextTextBoxes,
      shapes: nextShapes,
    });
    setSelectedLineIds(nextLines.map((line) => line.id));
    setSelectedNoteIds(nextNotes.map((note) => note.id));
    setSelectedTextBoxIds(nextTextBoxes.map((textBox) => textBox.id));
    setSelectedShapeIds(nextShapes.map((shape) => shape.id));
    setSelectedNoteId(null);
    setSelectedTextBoxId(null);
    setSelectedShapeId(null);
  };

  const deleteSelectedObjects = () => {
    onDeleteSelectedObjects(selectedIds);
    clearSelection();
  };

  const copyObject = (target: ObjectMenuTarget) => {
    if (hasMultipleSelection && isTargetSelected(target)) {
      copySelectedObjects();
      return;
    }

    if (target.type === "line") {
      const line = lines.find((currentLine) => currentLine.id === target.id);

      if (line) {
        setCopiedObject({
          type: "line",
          line: {
            points: line.points,
            stroke: line.stroke,
            strokeWidth: line.strokeWidth,
          },
        });
      }
    } else if (target.type === "note") {
      const note = notes.find((currentNote) => currentNote.id === target.id);

      if (note) {
        setCopiedObject({
          type: "note",
          note: {
            width: note.width,
            height: note.height,
            text: note.text,
            color: note.color,
          },
        });
      }
    } else if (target.type === "textBox") {
      const textBox = textBoxes.find(
        (currentTextBox) => currentTextBox.id === target.id,
      );

      if (textBox) {
        setCopiedObject({
          type: "textBox",
          textBox: {
            width: textBox.width,
            height: textBox.height,
            text: textBox.text,
            textColor: textBox.textColor,
            fontSize: textBox.fontSize,
            fontWeight: textBox.fontWeight,
            textAlign: textBox.textAlign,
          },
        });
      }
    } else {
      const shape = shapes.find(
        (currentShape) => currentShape.id === target.id,
      );

      if (shape) {
        setCopiedObject({
          type: "shape",
          shape: {
            type: shape.type,
            width: shape.width,
            height: shape.height,
            text: shape.text,
            fill: shape.fill,
            stroke: shape.stroke,
            strokeWidth: shape.strokeWidth,
            lineStyle: shape.lineStyle,
            textColor: shape.textColor,
            fontSize: shape.fontSize,
            fontWeight: shape.fontWeight,
            textAlign: shape.textAlign,
          },
        });
      }
    }
  };

  const copyContextMenuObject = () => {
    if (!contextMenu || contextMenu.target.type === "canvas") {
      return;
    }

    if (contextMenu.target.type === "selection") {
      copySelectedObjects();
      setContextMenu(null);
      return;
    }

    copyObject(contextMenu.target);

    setContextMenu(null);
  };

  const layerContextMenuObject = (action: LayerAction) => {
    if (!contextMenu || contextMenu.target.type === "canvas") {
      return;
    }

    if (contextMenu.target.type === "selection") {
      onLayerSelectedObjects(selectedIds, action);
      setContextMenu(null);
      return;
    }

    onLayerObject(contextMenu.target, action);
    setContextMenu(null);
  };

  const layerTextBoxFromToolbar = (action: LayerAction) => {
    if (!renderedSelectedTextBox) {
      return;
    }

    onLayerObject({ type: "textBox", id: renderedSelectedTextBox.id }, action);
    setActiveTextBoxPopover(null);
  };

  const layerShapeFromToolbar = (action: LayerAction) => {
    if (!renderedSelectedShape) {
      return;
    }

    onLayerObject({ type: "shape", id: renderedSelectedShape.id }, action);
    setActiveShapePopover(null);
  };

  const pasteCopiedObject = () => {
    if (!contextMenu || contextMenu.target.type !== "canvas" || !copiedObject) {
      return;
    }

    if (copiedObject.type === "line") {
      const bounds = getLineBounds(copiedObject.line);
      const offsetX = contextMenu.target.boardX - (bounds.x + bounds.width / 2);
      const offsetY =
        contextMenu.target.boardY - (bounds.y + bounds.height / 2);
      const line = {
        ...copiedObject.line,
        id: crypto.randomUUID(),
        points: copiedObject.line.points.map((point, index) =>
          index % 2 === 0 ? point + offsetX : point + offsetY,
        ),
        zIndex: getNextZIndex(),
      };

      onCreateObjectsBatch({
        lines: [line],
        notes: [],
        textBoxes: [],
        shapes: [],
      });
      setSelectedLineIds([line.id]);
      setSelectedNoteIds([]);
      setSelectedTextBoxIds([]);
      setSelectedShapeIds([]);
      setSelectedNoteId(null);
      setSelectedTextBoxId(null);
      setSelectedShapeId(null);
    } else if (copiedObject.type === "note") {
      const note = {
        ...copiedObject.note,
        id: crypto.randomUUID(),
        x: contextMenu.target.boardX - copiedObject.note.width / 2,
        y: contextMenu.target.boardY - copiedObject.note.height / 2,
        zIndex: getNextZIndex(),
      };

      onCreateNote(note);
      setSelectedNoteId(note.id);
      setSelectedTextBoxId(null);
      setSelectedShapeId(null);
      setSelectedLineIds([]);
      setSelectedNoteIds([note.id]);
      setSelectedTextBoxIds([]);
      setSelectedShapeIds([]);
    } else if (copiedObject.type === "textBox") {
      const textBox = {
        ...copiedObject.textBox,
        id: crypto.randomUUID(),
        x: contextMenu.target.boardX - copiedObject.textBox.width / 2,
        y: contextMenu.target.boardY - copiedObject.textBox.height / 2,
        zIndex: getNextZIndex(),
      };

      onCreateTextBox(textBox);
      setSelectedTextBoxId(textBox.id);
      setSelectedNoteId(null);
      setSelectedShapeId(null);
      setSelectedLineIds([]);
      setSelectedNoteIds([]);
      setSelectedTextBoxIds([textBox.id]);
      setSelectedShapeIds([]);
    } else if (copiedObject.type === "shape") {
      const shape = {
        ...copiedObject.shape,
        id: crypto.randomUUID(),
        x: contextMenu.target.boardX - copiedObject.shape.width / 2,
        y: contextMenu.target.boardY - copiedObject.shape.height / 2,
        zIndex: getNextZIndex(),
      };

      onCreateShape(shape);
      setSelectedShapeId(shape.id);
      setSelectedNoteId(null);
      setSelectedTextBoxId(null);
      setSelectedNoteIds([]);
      setSelectedTextBoxIds([]);
      setSelectedShapeIds([shape.id]);
    } else {
      const offsetX =
        contextMenu.target.boardX -
        (copiedObject.bounds.x + copiedObject.bounds.width / 2);
      const offsetY =
        contextMenu.target.boardY -
        (copiedObject.bounds.y + copiedObject.bounds.height / 2);
      const nextLines = copiedObject.lines.map((line) => ({
        ...line,
        id: crypto.randomUUID(),
        points: line.points.map((point, index) =>
          index % 2 === 0 ? point + offsetX : point + offsetY,
        ),
        zIndex: getNextZIndex(),
      }));
      const nextNotes = copiedObject.notes.map((note) => ({
        ...note,
        id: crypto.randomUUID(),
        x: note.x + offsetX,
        y: note.y + offsetY,
        zIndex: getNextZIndex(),
      }));
      const nextTextBoxes = copiedObject.textBoxes.map((textBox) => ({
        ...textBox,
        id: crypto.randomUUID(),
        x: textBox.x + offsetX,
        y: textBox.y + offsetY,
        zIndex: getNextZIndex(),
      }));
      const nextShapes = copiedObject.shapes.map((shape) => ({
        ...shape,
        id: crypto.randomUUID(),
        x: shape.x + offsetX,
        y: shape.y + offsetY,
        zIndex: getNextZIndex(),
      }));

      onCreateObjectsBatch({
        lines: nextLines,
        notes: nextNotes,
        textBoxes: nextTextBoxes,
        shapes: nextShapes,
      });
      setSelectedLineIds(nextLines.map((line) => line.id));
      setSelectedNoteIds(nextNotes.map((note) => note.id));
      setSelectedTextBoxIds(nextTextBoxes.map((textBox) => textBox.id));
      setSelectedShapeIds(nextShapes.map((shape) => shape.id));
      setSelectedNoteId(null);
      setSelectedTextBoxId(null);
      setSelectedShapeId(null);
    }

    setContextMenu(null);
  };

  const duplicateObject = (target: ObjectMenuTarget) => {
    if (hasMultipleSelection && isTargetSelected(target)) {
      duplicateSelectedObjects();
      return;
    }

    if (target.type === "line") {
      const sourceLine = lines.find((line) => line.id === target.id);

      if (!sourceLine) {
        return;
      }

      const line = {
        ...sourceLine,
        id: crypto.randomUUID(),
        points: sourceLine.points.map((point) => point + 24),
        zIndex: getNextZIndex(),
      };

      onCreateObjectsBatch({
        lines: [line],
        notes: [],
        textBoxes: [],
        shapes: [],
      });
      setSelectedLineIds([line.id]);
      setSelectedNoteIds([]);
      setSelectedTextBoxIds([]);
      setSelectedShapeIds([]);
      setSelectedNoteId(null);
      setSelectedTextBoxId(null);
      setSelectedShapeId(null);
    } else if (target.type === "note") {
      const sourceNote = notes.find((note) => note.id === target.id);

      if (!sourceNote) {
        return;
      }

      const note = {
        ...sourceNote,
        id: crypto.randomUUID(),
        x: sourceNote.x + 24,
        y: sourceNote.y + 24,
        zIndex: getNextZIndex(),
      };

      onCreateNote(note);
      setSelectedNoteId(note.id);
      setSelectedTextBoxId(null);
      setSelectedShapeId(null);
      setSelectedLineIds([]);
      setSelectedNoteIds([note.id]);
      setSelectedTextBoxIds([]);
      setSelectedShapeIds([]);
    } else if (target.type === "textBox") {
      const sourceTextBox = textBoxes.find(
        (textBox) => textBox.id === target.id,
      );

      if (!sourceTextBox) {
        return;
      }

      const textBox = {
        ...sourceTextBox,
        id: crypto.randomUUID(),
        x: sourceTextBox.x + 24,
        y: sourceTextBox.y + 24,
        zIndex: getNextZIndex(),
      };

      onCreateTextBox(textBox);
      setSelectedTextBoxId(textBox.id);
      setSelectedNoteId(null);
      setSelectedShapeId(null);
      setSelectedLineIds([]);
      setSelectedNoteIds([]);
      setSelectedTextBoxIds([textBox.id]);
      setSelectedShapeIds([]);
    } else {
      const sourceShape = shapes.find((shape) => shape.id === target.id);

      if (!sourceShape) {
        return;
      }

      const shape = {
        ...sourceShape,
        id: crypto.randomUUID(),
        x: sourceShape.x + 24,
        y: sourceShape.y + 24,
        zIndex: getNextZIndex(),
      };

      onCreateShape(shape);
      setSelectedShapeId(shape.id);
      setSelectedNoteId(null);
      setSelectedTextBoxId(null);
      setSelectedLineIds([]);
      setSelectedNoteIds([]);
      setSelectedTextBoxIds([]);
      setSelectedShapeIds([shape.id]);
    }
  };

  const duplicateContextMenuObject = () => {
    if (!contextMenu || contextMenu.target.type === "canvas") {
      return;
    }

    if (contextMenu.target.type === "selection") {
      duplicateSelectedObjects();
      setContextMenu(null);
      return;
    }

    duplicateObject(contextMenu.target);

    setContextMenu(null);
  };

  const deleteObject = (target: ObjectMenuTarget) => {
    if (hasMultipleSelection && isTargetSelected(target)) {
      deleteSelectedObjects();
      return;
    }

    if (target.type === "line") {
      onDeleteSelectedObjects({
        lineIds: [target.id],
        noteIds: [],
        textBoxIds: [],
        shapeIds: [],
      });
      setSelectedLineIds([]);
    } else if (target.type === "note") {
      onDeleteNote(target.id);
      setSelectedNoteId(null);
    } else if (target.type === "textBox") {
      onDeleteTextBox(target.id);
      setSelectedTextBoxId(null);
    } else {
      onDeleteShape(target.id);
      setSelectedShapeId(null);
    }
  };

  const deleteContextMenuObject = () => {
    if (!contextMenu || contextMenu.target.type === "canvas") {
      return;
    }

    if (contextMenu.target.type === "selection") {
      deleteSelectedObjects();
      setContextMenu(null);
      return;
    }

    deleteObject(contextMenu.target);

    setContextMenu(null);
  };

  const getNormalizedBounds = (bounds: NoteBounds): NoteBounds => {
    const x = Math.min(bounds.x, bounds.x + bounds.width);
    const y = Math.min(bounds.y, bounds.y + bounds.height);

    return {
      x,
      y,
      width: Math.abs(bounds.width),
      height: Math.abs(bounds.height),
    };
  };

  const doBoundsIntersect = (
    firstBounds: NoteBounds,
    secondBounds: NoteBounds,
  ) => {
    const first = getNormalizedBounds(firstBounds);
    const second = getNormalizedBounds(secondBounds);

    return (
      first.x <= second.x + second.width &&
      first.x + first.width >= second.x &&
      first.y <= second.y + second.height &&
      first.y + first.height >= second.y
    );
  };

  const getMarqueeBounds = (
    selection: MarqueeSelectionState,
  ): NoteBounds | null => {
    if (!selection) {
      return null;
    }

    return getNormalizedBounds({
      x: selection.start.x,
      y: selection.start.y,
      width: selection.current.x - selection.start.x,
      height: selection.current.y - selection.start.y,
    });
  };

  const finishMarqueeSelection = () => {
    const bounds = getMarqueeBounds(marqueeSelection);

    if (!bounds) {
      return;
    }

    const isClick =
      bounds.width < 4 / actualScale && bounds.height < 4 / actualScale;

    if (isClick) {
      clearSelection();
      onMarqueeEnd();
      setMarqueeSelection(null);
      return;
    }

    setSelectedLineIds(
      lines
        .filter((line) => doBoundsIntersect(bounds, getLineBounds(line)))
        .map((line) => line.id),
    );
    setSelectedNoteIds(
      notes
        .filter((note) => doBoundsIntersect(bounds, note))
        .map((note) => note.id),
    );
    setSelectedTextBoxIds(
      textBoxes
        .filter((textBox) => doBoundsIntersect(bounds, textBox))
        .map((textBox) => textBox.id),
    );
    setSelectedShapeIds(
      shapes
        .filter((shape) => doBoundsIntersect(bounds, shape))
        .map((shape) => shape.id),
    );
    setSelectedNoteId(null);
    setSelectedTextBoxId(null);
    setSelectedShapeId(null);
    onMarqueeEnd();
    setMarqueeSelection(null);
  };

  const stopDrawing = () => {
    if (marqueeSelection) {
      finishMarqueeSelection();
    }

    if (draftShape) {
      const isLineShape =
        draftShape.shape.type === "line" || draftShape.shape.type === "arrow";
      const isTiny = isLineShape
        ? Math.abs(draftShape.shape.width) < 8 &&
          Math.abs(draftShape.shape.height) < 8
        : draftShape.shape.width < 8 || draftShape.shape.height < 8;
      const shape = isLineShape
        ? isTiny
          ? {
              ...draftShape.shape,
              x: draftShape.startX,
              y: draftShape.startY,
              width: 160,
              height: 0,
            }
          : draftShape.shape
        : isTiny
          ? {
              ...draftShape.shape,
              x: draftShape.startX - DEFAULT_SHAPE_WIDTH / 2,
              y: draftShape.startY - DEFAULT_SHAPE_HEIGHT / 2,
              width: DEFAULT_SHAPE_WIDTH,
              height: DEFAULT_SHAPE_HEIGHT,
            }
          : {
              ...draftShape.shape,
              width: Math.max(draftShape.shape.width, MIN_SHAPE_WIDTH),
              height: Math.max(draftShape.shape.height, MIN_SHAPE_HEIGHT),
            };

      onCreateShape(shape);
      setSelectedShapeId(shape.id);
      setSelectedNoteId(null);
      setSelectedTextBoxId(null);
      setDraftShape(null);
      onShapePlaced();
    }

    if (isDrawingRef.current) {
      const finalLine = activeLiveLineRef.current;

      if (finalLine) {
        onLiveLineUpdate(finalLine);
      }

      if (linesBeforeStrokeRef.current) {
        onDrawingCommit(linesBeforeStrokeRef.current);
      }
    }

    if (
      isErasingRef.current &&
      erasedLineIdsRef.current.size > 0 &&
      linesBeforeEraseRef.current
    ) {
      onEraseCommit(linesBeforeEraseRef.current);
    }

    isDrawingRef.current = false;
    isErasingRef.current = false;
    isPanningRef.current = false;
    setIsPanning(false);
    activeLineIdRef.current = null;
    activeLiveLineRef.current = null;
    lastPanPointRef.current = null;
    linesBeforeStrokeRef.current = null;
    linesBeforeEraseRef.current = null;
    erasedLineIdsRef.current = new Set();
  };
  const orderedCanvasItems = [
    ...lines.map((line) => ({
      type: "line" as const,
      zIndex: line.zIndex ?? 0,
      item: line,
    })),
    ...notes.map((note) => ({
      type: "note" as const,
      zIndex: note.zIndex ?? 0,
      item: note,
    })),
    ...shapes.map((shape) => ({
      type: "shape" as const,
      zIndex: shape.zIndex ?? 0,
      item: shape,
    })),
    ...textBoxes.map((textBox) => ({
      type: "textBox" as const,
      zIndex: textBox.zIndex ?? 0,
      item: textBox,
    })),
    ...(draftShape
      ? [
          {
            type: "shape" as const,
            zIndex: draftShape.shape.zIndex,
            item: draftShape.shape,
          },
        ]
      : []),
  ].sort((a, b) => a.zIndex - b.zIndex);

  const selectedShape =
    selectedShapeIds.length === 1
      ? (shapes.find((shape) => shape.id === selectedShapeIds[0]) ?? null)
      : selectedShapeId && selectedObjectCount === 1
        ? (shapes.find((shape) => shape.id === selectedShapeId) ?? null)
        : null;
  const selectedTextBox =
    selectedTextBoxIds.length === 1
      ? (textBoxes.find((textBox) => textBox.id === selectedTextBoxIds[0]) ??
        null)
      : selectedTextBoxId && selectedObjectCount === 1
        ? (textBoxes.find((textBox) => textBox.id === selectedTextBoxId) ??
          null)
        : null;
  const renderedSelectedShape = selectedShape
    ? getRenderedShape(selectedShape)
    : null;
  const renderedSelectedTextBox = selectedTextBox
    ? getRenderedTextBox(selectedTextBox)
    : null;
  const selectedGroup = getSelectedGroupObjects();
  const selectedGroupBounds =
    hasMultipleSelection && selectedGroup.bounds ? selectedGroup.bounds : null;
  const selectedSingleLine =
    selectedObjectCount === 1 && selectedLineIds.length === 1
      ? (lines.find((line) => line.id === selectedLineIds[0]) ?? null)
      : null;
  const selectedSingleLineBounds = selectedSingleLine
    ? getLineBounds(selectedSingleLine)
    : null;
  const selectedShapeCanUseFill =
    renderedSelectedShape?.type !== "line" &&
    renderedSelectedShape?.type !== "arrow";

  const getShapeDash = (shape: Shape) => {
    if (shape.lineStyle === "dashed") {
      return [10 / actualScale, 6 / actualScale];
    }

    if (shape.lineStyle === "dotted") {
      return [2 / actualScale, 6 / actualScale];
    }

    return undefined;
  };

  const TextAlignIcon = ({ align }: { align: TextBox["textAlign"] }) => {
    if (align === "center") {
      return (
        <svg
          className="text-toolbar-align-icon"
          viewBox="0 0 72 72"
          aria-hidden="true"
        >
          <path d="m63 15h-54c-1.7 0-3-1.3-3-3s1.3-3 3-3h54c1.7 0 3 1.3 3 3s-1.3 3-3 3z" />
          <path d="m54 31h-36c-1.7 0-3-1.3-3-3s1.3-3 3-3h36c1.7 0 3 1.3 3 3s-1.3 3-3 3z" />
          <path d="m63 47h-54c-1.7 0-3-1.3-3-3s1.3-3 3-3h54c1.7 0 3 1.3 3 3s-1.3 3-3 3z" />
          <path d="m54 63h-36c-1.7 0-3-1.3-3-3s1.3-3 3-3h36c1.7 0 3 1.3 3 3s-1.3 3-3 3z" />
        </svg>
      );
    }

    return (
      <svg
        className="text-toolbar-align-icon"
        viewBox="0 0 24 24"
        aria-hidden="true"
      >
        <path d="m3 4h18a1 1 0 0 0 0-2h-18a1 1 0 0 0 0 2z" />
        <path d="m3 10h12a1 1 0 0 0 0-2h-12a1 1 0 0 0 0 2z" />
        <path d="m3 16h18a1 1 0 0 0 0-2h-18a1 1 0 0 0 0 2z" />
        <path d="m3 22h12a1 1 0 0 0 0-2h-12a1 1 0 0 0 0 2z" />
      </svg>
    );
  };
  const contextSubmenuPlacement = getContextSubmenuPlacement();

  return (
    <div
      className={`whiteboard-canvas is-${activeTool}-tool${isPanning ? " is-panning" : ""}`}
      ref={containerRef}
    >
      <Stage
        ref={stageRef}
        width={size.width}
        height={size.height}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={stopDrawing}
        onMouseLeave={() => {
          onCursorLeave();
          stopDrawing();
        }}
        onWheel={handleWheel}
        onContextMenu={handleContextMenu}
      >
        <Layer
          x={viewport.x}
          y={viewport.y}
          scaleX={layerScaleX}
          scaleY={layerScaleY}
        >
          {orderedCanvasItems.map((canvasItem) => {
            if (canvasItem.type === "line") {
              const line = canvasItem.item;
              const isSelected = isLineSelected(line.id);
              const renderedLinePoints = isSelected
                ? line.points.map((point, index) =>
                    index % 2 === 0
                      ? point + selectionDragOffset.x
                      : point + selectionDragOffset.y,
                  )
                : line.points;

              return (
                <Group key={line.id}>
                  <Line
                    points={renderedLinePoints}
                    stroke={line.stroke}
                    strokeWidth={line.strokeWidth}
                    lineCap="round"
                    lineJoin="round"
                    tension={0.35}
                    hitStrokeWidth={16}
                    onMouseDown={(event) => handleLineMouseDown(event, line.id)}
                    onContextMenu={(event) =>
                      openObjectContextMenu(event, {
                        type: "line",
                        id: line.id,
                      })
                    }
                    onMouseEnter={() => handleLineMouseEnter(line.id)}
                  />
                </Group>
              );
            }

            if (canvasItem.type === "note") {
              const note = canvasItem.item;
              const baseRenderedNote = getRenderedNote(note);
              const isSelected = isNoteSelected(note.id);
              const renderedNote = isSelected
                ? {
                    ...baseRenderedNote,
                    x: baseRenderedNote.x + selectionDragOffset.x,
                    y: baseRenderedNote.y + selectionDragOffset.y,
                  }
                : baseRenderedNote;
              const noteFontSize = getNoteFontSize(
                renderedNote.text,
                renderedNote.width,
                renderedNote.height,
              );
              const handleSize = 12 / actualScale;
              const handleOffset = handleSize / 2;
              const handles: Array<{
                handle: ResizeHandle;
                x: number;
                y: number;
              }> = [
                { handle: "nw", x: -handleOffset, y: -handleOffset },
                {
                  handle: "ne",
                  x: renderedNote.width - handleOffset,
                  y: -handleOffset,
                },
                {
                  handle: "sw",
                  x: -handleOffset,
                  y: renderedNote.height - handleOffset,
                },
                {
                  handle: "se",
                  x: renderedNote.width - handleOffset,
                  y: renderedNote.height - handleOffset,
                },
              ];

              return (
                <Group
                  key={note.id}
                  x={renderedNote.x}
                  y={renderedNote.y}
                  width={renderedNote.width}
                  height={renderedNote.height}
                  draggable={canSelectObjects && !hasMultipleSelection}
                  listening={canSelectObjects}
                  onMouseDown={(event) => {
                    event.cancelBubble = true;
                    if (!canSelectObjects) {
                      return;
                    }

                    if (event.evt.shiftKey) {
                      toggleSelection({ type: "note", id: note.id });
                    } else if (!isSelected) {
                      selectOnly({ type: "note", id: note.id });
                    }
                  }}
                  onMouseUp={(event) => {
                    event.cancelBubble = true;
                    stopDrawing();
                  }}
                  onMouseMove={(event) => {
                    event.cancelBubble = true;

                    const cursorPoint = getBoardPoint(event);

                    if (cursorPoint) {
                      onCursorMove(cursorPoint);
                    }
                  }}
                  onDragStart={(event) => {
                    event.cancelBubble = true;
                    if (!isSelected) {
                      selectOnly({ type: "note", id: note.id });
                    }
                    setGroupDragStart({
                      dragged: { type: "note", id: note.id },
                      x: note.x,
                      y: note.y,
                    });
                    setStageCursor(event, "grabbing");
                  }}
                  onDragMove={(event) => {
                    event.cancelBubble = true;
                    const cursorPoint = getBoardPoint(event);
                    if (cursorPoint) {
                      onCursorMove(cursorPoint);
                    }
                    if (hasMultipleSelection && isSelected && groupDragStart) {
                      const clampedDelta = clampDragDeltaToVisibleViewport(
                        selectedGroupBounds ?? note,
                        event.target.x() - groupDragStart.x,
                        event.target.y() - groupDragStart.y,
                      );
                      event.target.position({
                        x: groupDragStart.x + clampedDelta.deltaX,
                        y: groupDragStart.y + clampedDelta.deltaY,
                      });
                      onPreviewMoveSelectedObjects(
                        clampedDelta.deltaX,
                        clampedDelta.deltaY,
                        selectedIds,
                      );
                      return;
                    }

                    const clampedPosition = clampObjectPositionToVisibleViewport(
                      note,
                      event.target.x(),
                      event.target.y(),
                    );
                    event.target.position(clampedPosition);
                    onPreviewMoveNote({
                      ...note,
                      ...clampedPosition,
                    });
                  }}
                  onDragEnd={(event) => {
                    event.cancelBubble = true;
                    setStageCursor(event, "auto");
                    if (groupDragStart && hasMultipleSelection && isSelected) {
                      const clampedDelta = clampDragDeltaToVisibleViewport(
                        selectedGroupBounds ?? note,
                        event.target.x() - groupDragStart.x,
                        event.target.y() - groupDragStart.y,
                      );
                      onMoveSelectedObjects(
                        clampedDelta.deltaX,
                        clampedDelta.deltaY,
                        selectedIds,
                      );
                    } else {
                      const clampedPosition = clampObjectPositionToVisibleViewport(
                        note,
                        event.target.x(),
                        event.target.y(),
                      );
                      onMoveNote(note.id, clampedPosition.x, clampedPosition.y);
                    }
                    setGroupDragStart(null);
                  }}
                  onContextMenu={(event) =>
                    openObjectContextMenu(event, { type: "note", id: note.id })
                  }
                  onDblClick={(event) => {
                    if (canSelectObjects) {
                      openNoteEditor(event, renderedNote);
                    }
                  }}
                  onDblTap={(event) => {
                    if (canSelectObjects) {
                      openNoteEditor(event, renderedNote);
                    }
                  }}
                >
                  <Rect
                    width={renderedNote.width}
                    height={renderedNote.height}
                    fill={renderedNote.color}
                    cornerRadius={8}
                    shadowColor="rgba(17, 24, 39, 0.18)"
                    shadowBlur={12}
                    shadowOffset={{ x: 0, y: 6 }}
                    shadowOpacity={1}
                  />

                  <Text
                    text={renderedNote.text}
                    x={NOTE_TEXT_PADDING}
                    y={NOTE_TEXT_PADDING}
                    width={renderedNote.width - NOTE_TEXT_PADDING * 2}
                    height={renderedNote.height - NOTE_TEXT_PADDING * 2}
                    fill={getNoteTextColor(renderedNote.color)}
                    fontSize={noteFontSize}
                    fontFamily="Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif"
                    fontStyle="bold"
                    align="center"
                    verticalAlign="middle"
                    lineHeight={1.12}
                    wrap="word"
                    ellipsis={false}
                    listening={false}
                  />

                  {(canSelectObjects || editingNote?.id === note.id) &&
                    isSelected &&
                    !hasMultipleSelection && (
                      <>
                        <Rect
                          x={-4 / actualScale}
                          y={-4 / actualScale}
                          width={renderedNote.width + 8 / actualScale}
                          height={renderedNote.height + 8 / actualScale}
                          stroke="#2563eb"
                          strokeWidth={2 / actualScale}
                          cornerRadius={10}
                          dash={[6 / actualScale, 4 / actualScale]}
                          listening={false}
                        />

                        {!hasMultipleSelection &&
                          handles.map((resizeHandle) => (
                            <Rect
                              key={resizeHandle.handle}
                              x={resizeHandle.x}
                              y={resizeHandle.y}
                              width={handleSize}
                              height={handleSize}
                              fill="#f8fafc"
                              stroke="#2563eb"
                              strokeWidth={1.5 / actualScale}
                              cornerRadius={3 / actualScale}
                              draggable
                              onMouseEnter={(event) =>
                                setStageCursor(
                                  event,
                                  resizeHandle.handle === "nw" ||
                                    resizeHandle.handle === "se"
                                    ? "nwse-resize"
                                    : "nesw-resize",
                                )
                              }
                              onMouseLeave={(event) => {
                                event.cancelBubble = true;
                                setStageCursor(event, "auto");
                              }}
                              onMouseDown={(event) => {
                                event.cancelBubble = true;
                                stopDrawing();
                                resizeStartRef.current = renderedNote;
                              }}
                              onDragStart={(event) => {
                                event.cancelBubble = true;
                                resizeStartRef.current = renderedNote;
                                setStageCursor(event, "grabbing");
                              }}
                              onDragMove={(event) => {
                                const cursorPoint = getBoardPoint(event);

                                if (cursorPoint) {
                                  onCursorMove(cursorPoint);
                                }

                                handleResizeMove(
                                  event,
                                  renderedNote,
                                  resizeHandle.handle,
                                );
                              }}
                              onDragEnd={(event) => {
                                event.cancelBubble = true;
                                setStageCursor(event, "auto");
                                handleResizeEnd(event, renderedNote);
                              }}
                            />
                          ))}
                      </>
                    )}
                </Group>
              );
            }

            if (canvasItem.type === "shape") {
              const shape = canvasItem.item;
              const baseRenderedShape = getRenderedShape(shape);
              const isSelected = isShapeSelected(shape.id);
              const renderedShape = isSelected
                ? {
                    ...baseRenderedShape,
                    x: baseRenderedShape.x + selectionDragOffset.x,
                    y: baseRenderedShape.y + selectionDragOffset.y,
                  }
                : baseRenderedShape;
              const shapeFontSize = getTextBoxFontSize(
                renderedShape.text,
                renderedShape.width,
                renderedShape.height,
              );
              const finalShapeFontSize =
                renderedShape.fontSize ?? shapeFontSize;
              const handleSize = 12 / actualScale;
              const handleOffset = handleSize / 2;
              const handles: Array<{
                handle: ResizeHandle;
                x: number;
                y: number;
              }> = [
                { handle: "nw", x: -handleOffset, y: -handleOffset },
                {
                  handle: "ne",
                  x: renderedShape.width - handleOffset,
                  y: -handleOffset,
                },
                {
                  handle: "sw",
                  x: -handleOffset,
                  y: renderedShape.height - handleOffset,
                },
                {
                  handle: "se",
                  x: renderedShape.width - handleOffset,
                  y: renderedShape.height - handleOffset,
                },
              ];
              const shouldRenderText =
                renderedShape.type !== "line" && renderedShape.type !== "arrow";
              const isLineShape =
                renderedShape.type === "line" || renderedShape.type === "arrow";
              const shapeDash = getShapeDash(renderedShape);

              return (
                <Group
                  key={shape.id}
                  x={renderedShape.x}
                  y={renderedShape.y}
                  width={renderedShape.width}
                  height={renderedShape.height}
                  draggable={canSelectObjects && !hasMultipleSelection}
                  listening={canSelectObjects}
                  onMouseDown={(event) => {
                    event.cancelBubble = true;
                    if (!canSelectObjects) {
                      return;
                    }

                    if (event.evt.shiftKey) {
                      toggleSelection({ type: "shape", id: shape.id });
                    } else if (!isSelected) {
                      selectOnly({ type: "shape", id: shape.id });
                    }
                  }}
                  onMouseUp={(event) => {
                    event.cancelBubble = true;
                    stopDrawing();
                  }}
                  onMouseMove={(event) => {
                    event.cancelBubble = true;
                    const cursorPoint = getBoardPoint(event);

                    if (cursorPoint) {
                      onCursorMove(cursorPoint);
                    }
                  }}
                  onDragStart={(event) => {
                    event.cancelBubble = true;
                    setIsDraggingShape(true);
                    setActiveShapePopover(null);
                    if (!isSelected) {
                      selectOnly({ type: "shape", id: shape.id });
                    }
                    setGroupDragStart({
                      dragged: { type: "shape", id: shape.id },
                      x: shape.x,
                      y: shape.y,
                    });
                    setStageCursor(event, "grabbing");
                  }}
                  onDragMove={(event) => {
                    event.cancelBubble = true;
                    const cursorPoint = getBoardPoint(event);

                    if (cursorPoint) {
                      onCursorMove(cursorPoint);
                    }

                    if (groupDragStart && hasMultipleSelection && isSelected) {
                      const clampedDelta = clampDragDeltaToVisibleViewport(
                        selectedGroupBounds ?? shape,
                        event.target.x() - groupDragStart.x,
                        event.target.y() - groupDragStart.y,
                      );
                      event.target.position({
                        x: groupDragStart.x + clampedDelta.deltaX,
                        y: groupDragStart.y + clampedDelta.deltaY,
                      });
                      onPreviewMoveSelectedObjects(
                        clampedDelta.deltaX,
                        clampedDelta.deltaY,
                        selectedIds,
                      );
                      return;
                    }

                    const clampedPosition = clampObjectPositionToVisibleViewport(
                      getNormalizedBounds(shape),
                      event.target.x(),
                      event.target.y(),
                    );
                    event.target.position(clampedPosition);
                    onPreviewMoveShape({
                      ...shape,
                      ...clampedPosition,
                    });
                  }}
                  onDragEnd={(event) => {
                    event.cancelBubble = true;
                    setIsDraggingShape(false);
                    setStageCursor(event, "auto");
                    if (groupDragStart && hasMultipleSelection && isSelected) {
                      const clampedDelta = clampDragDeltaToVisibleViewport(
                        selectedGroupBounds ?? shape,
                        event.target.x() - groupDragStart.x,
                        event.target.y() - groupDragStart.y,
                      );
                      onMoveSelectedObjects(
                        clampedDelta.deltaX,
                        clampedDelta.deltaY,
                        selectedIds,
                      );
                    } else {
                      const clampedPosition = clampObjectPositionToVisibleViewport(
                        getNormalizedBounds(shape),
                        event.target.x(),
                        event.target.y(),
                      );
                      onMoveShape(
                        shape.id,
                        clampedPosition.x,
                        clampedPosition.y,
                      );
                    }
                    setGroupDragStart(null);
                  }}
                  onContextMenu={(event) =>
                    openObjectContextMenu(event, {
                      type: "shape",
                      id: shape.id,
                    })
                  }
                  onDblClick={(event) => {
                    if (canSelectObjects && shouldRenderText) {
                      openShapeEditor(event, renderedShape);
                    }
                  }}
                  onDblTap={(event) => {
                    if (canSelectObjects && shouldRenderText) {
                      openShapeEditor(event, renderedShape);
                    }
                  }}
                >
                  {renderedShape.type === "rectangle" && (
                    <Rect
                      width={renderedShape.width}
                      height={renderedShape.height}
                      fill={renderedShape.fill}
                      stroke={renderedShape.stroke}
                      strokeWidth={renderedShape.strokeWidth}
                      dash={shapeDash}
                      cornerRadius={6}
                    />
                  )}

                  {renderedShape.type === "ellipse" && (
                    <Ellipse
                      x={renderedShape.width / 2}
                      y={renderedShape.height / 2}
                      radiusX={renderedShape.width / 2}
                      radiusY={renderedShape.height / 2}
                      fill={renderedShape.fill}
                      stroke={renderedShape.stroke}
                      strokeWidth={renderedShape.strokeWidth}
                      dash={shapeDash}
                    />
                  )}

                  {renderedShape.type === "triangle" && (
                    <Line
                      points={[
                        renderedShape.width / 2,
                        0,
                        renderedShape.width,
                        renderedShape.height,
                        0,
                        renderedShape.height,
                      ]}
                      closed
                      fill={renderedShape.fill}
                      stroke={renderedShape.stroke}
                      strokeWidth={renderedShape.strokeWidth}
                      dash={shapeDash}
                      lineJoin="round"
                    />
                  )}

                  {renderedShape.type === "line" && (
                    <Line
                      points={[0, 0, renderedShape.width, renderedShape.height]}
                      stroke={renderedShape.stroke}
                      strokeWidth={renderedShape.strokeWidth}
                      dash={shapeDash}
                      hitStrokeWidth={16 / actualScale}
                      lineCap="round"
                    />
                  )}

                  {renderedShape.type === "arrow" && (
                    <Arrow
                      points={[0, 0, renderedShape.width, renderedShape.height]}
                      stroke={renderedShape.stroke}
                      fill={renderedShape.stroke}
                      strokeWidth={renderedShape.strokeWidth}
                      dash={shapeDash}
                      pointerLength={14}
                      pointerWidth={14}
                      hitStrokeWidth={16 / actualScale}
                      lineCap="round"
                    />
                  )}

                  {shouldRenderText && editingShape?.id !== shape.id && (
                    <Text
                      text={renderedShape.text}
                      x={NOTE_TEXT_PADDING}
                      y={NOTE_TEXT_PADDING}
                      width={renderedShape.width - NOTE_TEXT_PADDING * 2}
                      height={renderedShape.height - NOTE_TEXT_PADDING * 2}
                      fill={renderedShape.textColor}
                      fontSize={finalShapeFontSize}
                      fontFamily="Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif"
                      fontStyle={renderedShape.fontWeight}
                      align={renderedShape.textAlign}
                      verticalAlign="middle"
                      lineHeight={1.12}
                      wrap="word"
                      ellipsis={false}
                      listening={false}
                    />
                  )}

                  {canSelectObjects &&
                    isSelected &&
                    isLineShape &&
                    !hasMultipleSelection && (
                      <>
                        <Line
                          points={[
                            0,
                            0,
                            renderedShape.width,
                            renderedShape.height,
                          ]}
                          stroke="#2563eb"
                          strokeWidth={2 / actualScale}
                          dash={[6 / actualScale, 4 / actualScale]}
                          listening={false}
                        />

                        {!hasMultipleSelection &&
                          [
                            { endpoint: "start" as const, x: 0, y: 0 },
                            {
                              endpoint: "end" as const,
                              x: renderedShape.width,
                              y: renderedShape.height,
                            },
                          ].map((handle) => (
                            <Circle
                              key={handle.endpoint}
                              x={handle.x}
                              y={handle.y}
                              radius={6 / actualScale}
                              fill="#f8fafc"
                              stroke="#2563eb"
                              strokeWidth={1.5 / actualScale}
                              draggable
                              onMouseEnter={(event) =>
                                setStageCursor(event, "grab")
                              }
                              onMouseLeave={(event) => {
                                event.cancelBubble = true;
                                setStageCursor(event, "auto");
                              }}
                              onMouseDown={(event) => {
                                event.cancelBubble = true;
                                stopDrawing();
                                shapeResizeStartRef.current = renderedShape;
                              }}
                              onDragStart={(event) => {
                                event.cancelBubble = true;
                                shapeResizeStartRef.current = renderedShape;
                                setStageCursor(event, "grabbing");
                              }}
                              onDragMove={(event) =>
                                handleLineShapeEndpointMove(
                                  event,
                                  renderedShape,
                                  handle.endpoint,
                                )
                              }
                              onDragEnd={(event) => {
                                event.cancelBubble = true;
                                setStageCursor(event, "auto");
                                handleShapeResizeEnd(event, renderedShape);
                              }}
                            />
                          ))}
                      </>
                    )}

                  {canSelectObjects &&
                    isSelected &&
                    !isLineShape &&
                    !hasMultipleSelection && (
                      <>
                        <Rect
                          x={-4 / actualScale}
                          y={-4 / actualScale}
                          width={renderedShape.width + 8 / actualScale}
                          height={renderedShape.height + 8 / actualScale}
                          stroke="#2563eb"
                          strokeWidth={2 / actualScale}
                          cornerRadius={8}
                          dash={[6 / actualScale, 4 / actualScale]}
                          listening={false}
                        />

                        {!hasMultipleSelection &&
                          handles.map((resizeHandle) => (
                            <Rect
                              key={resizeHandle.handle}
                              x={resizeHandle.x}
                              y={resizeHandle.y}
                              width={handleSize}
                              height={handleSize}
                              fill="#f8fafc"
                              stroke="#2563eb"
                              strokeWidth={1.5 / actualScale}
                              cornerRadius={3 / actualScale}
                              draggable
                              onMouseEnter={(event) =>
                                setStageCursor(
                                  event,
                                  resizeHandle.handle === "nw" ||
                                    resizeHandle.handle === "se"
                                    ? "nwse-resize"
                                    : "nesw-resize",
                                )
                              }
                              onMouseLeave={(event) => {
                                event.cancelBubble = true;
                                setStageCursor(event, "auto");
                              }}
                              onMouseDown={(event) => {
                                event.cancelBubble = true;
                                stopDrawing();
                                shapeResizeStartRef.current = renderedShape;
                              }}
                              onDragStart={(event) => {
                                event.cancelBubble = true;
                                shapeResizeStartRef.current = renderedShape;
                                setStageCursor(event, "grabbing");
                              }}
                              onDragMove={(event) =>
                                handleShapeResizeMove(
                                  event,
                                  renderedShape,
                                  resizeHandle.handle,
                                )
                              }
                              onDragEnd={(event) => {
                                event.cancelBubble = true;
                                setStageCursor(event, "auto");
                                handleShapeResizeEnd(event, renderedShape);
                              }}
                            />
                          ))}
                      </>
                    )}
                </Group>
              );
            }

            const textBox = canvasItem.item;
            const baseRenderedTextBox = getRenderedTextBox(textBox);
            const isSelected = isTextBoxSelected(textBox.id);
            const renderedTextBox = isSelected
              ? {
                  ...baseRenderedTextBox,
                  x: baseRenderedTextBox.x + selectionDragOffset.x,
                  y: baseRenderedTextBox.y + selectionDragOffset.y,
                }
              : baseRenderedTextBox;
            const textBoxFontSize = getTextBoxFontSize(
              renderedTextBox.text,
              renderedTextBox.width,
              renderedTextBox.height,
            );
            const finalTextBoxFontSize =
              renderedTextBox.fontSize ?? textBoxFontSize;
            const handleSize = 12 / actualScale;
            const handleOffset = handleSize / 2;
            const handles: Array<{
              handle: ResizeHandle;
              x: number;
              y: number;
            }> = [
              { handle: "nw", x: -handleOffset, y: -handleOffset },
              {
                handle: "ne",
                x: renderedTextBox.width - handleOffset,
                y: -handleOffset,
              },
              {
                handle: "sw",
                x: -handleOffset,
                y: renderedTextBox.height - handleOffset,
              },
              {
                handle: "se",
                x: renderedTextBox.width - handleOffset,
                y: renderedTextBox.height - handleOffset,
              },
            ];

            return (
              <Group
                key={textBox.id}
                x={renderedTextBox.x}
                y={renderedTextBox.y}
                width={renderedTextBox.width}
                height={renderedTextBox.height}
                draggable={canSelectObjects && !hasMultipleSelection}
                listening={canSelectObjects}
                onMouseDown={(event) => {
                  event.cancelBubble = true;
                  if (!canSelectObjects) {
                    return;
                  }

                  if (event.evt.shiftKey) {
                    toggleSelection({ type: "textBox", id: textBox.id });
                  } else if (!isSelected) {
                    selectOnly({ type: "textBox", id: textBox.id });
                  }
                }}
                onMouseUp={(event) => {
                  event.cancelBubble = true;
                  stopDrawing();
                }}
                onMouseMove={(event) => {
                  event.cancelBubble = true;
                  const cursorPoint = getBoardPoint(event);

                  if (cursorPoint) {
                    onCursorMove(cursorPoint);
                  }
                }}
                onDragStart={(event) => {
                  event.cancelBubble = true;
                  if (!isSelected) {
                    selectOnly({ type: "textBox", id: textBox.id });
                  }
                  setGroupDragStart({
                    dragged: { type: "textBox", id: textBox.id },
                    x: textBox.x,
                    y: textBox.y,
                  });
                  setStageCursor(event, "grabbing");
                }}
                onDragMove={(event) => {
                  event.cancelBubble = true;
                  const cursorPoint = getBoardPoint(event);

                  if (cursorPoint) {
                    onCursorMove(cursorPoint);
                  }

                  if (hasMultipleSelection && isSelected && groupDragStart) {
                    const clampedDelta = clampDragDeltaToVisibleViewport(
                      selectedGroupBounds ?? textBox,
                      event.target.x() - groupDragStart.x,
                      event.target.y() - groupDragStart.y,
                    );
                    event.target.position({
                      x: groupDragStart.x + clampedDelta.deltaX,
                      y: groupDragStart.y + clampedDelta.deltaY,
                    });
                    onPreviewMoveSelectedObjects(
                      clampedDelta.deltaX,
                      clampedDelta.deltaY,
                      selectedIds,
                    );
                    return;
                  }

                  const clampedPosition = clampObjectPositionToVisibleViewport(
                    textBox,
                    event.target.x(),
                    event.target.y(),
                  );
                  event.target.position(clampedPosition);
                  onPreviewMoveTextBox({
                    ...textBox,
                    ...clampedPosition,
                  });
                }}
                onDragEnd={(event) => {
                  event.cancelBubble = true;
                  setStageCursor(event, "auto");
                  if (groupDragStart && hasMultipleSelection && isSelected) {
                    const clampedDelta = clampDragDeltaToVisibleViewport(
                      selectedGroupBounds ?? textBox,
                      event.target.x() - groupDragStart.x,
                      event.target.y() - groupDragStart.y,
                    );
                    onMoveSelectedObjects(
                      clampedDelta.deltaX,
                      clampedDelta.deltaY,
                      selectedIds,
                    );
                  } else {
                    const clampedPosition = clampObjectPositionToVisibleViewport(
                      textBox,
                      event.target.x(),
                      event.target.y(),
                    );
                    onMoveTextBox(
                      textBox.id,
                      clampedPosition.x,
                      clampedPosition.y,
                    );
                  }
                  setGroupDragStart(null);
                }}
                onContextMenu={(event) =>
                  openObjectContextMenu(event, {
                    type: "textBox",
                    id: textBox.id,
                  })
                }
                onDblClick={(event) => {
                  if (canSelectObjects) {
                    openTextBoxEditor(event, renderedTextBox);
                  }
                }}
                onDblTap={(event) => {
                  if (canSelectObjects) {
                    openTextBoxEditor(event, renderedTextBox);
                  }
                }}
              >
                <Rect
                  width={renderedTextBox.width}
                  height={renderedTextBox.height}
                  fill="rgba(255, 255, 255, 0.01)"
                  cornerRadius={6}
                />

                {editingTextBox?.id !== textBox.id && (
                  <Text
                    text={renderedTextBox.text}
                    x={NOTE_TEXT_PADDING}
                    y={NOTE_TEXT_PADDING}
                    width={renderedTextBox.width - NOTE_TEXT_PADDING * 2}
                    height={renderedTextBox.height - NOTE_TEXT_PADDING * 2}
                    fill={renderedTextBox.textColor}
                    fontSize={finalTextBoxFontSize}
                    fontFamily="Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif"
                    fontStyle={renderedTextBox.fontWeight}
                    align={renderedTextBox.textAlign}
                    verticalAlign="middle"
                    lineHeight={1.12}
                    wrap="char"
                    ellipsis={false}
                    listening={false}
                  />
                )}

                {(canSelectObjects || editingTextBox?.id === textBox.id) &&
                  isSelected &&
                  !hasMultipleSelection && (
                    <>
                      <Rect
                        x={-4 / actualScale}
                        y={-4 / actualScale}
                        width={renderedTextBox.width + 8 / actualScale}
                        height={renderedTextBox.height + 8 / actualScale}
                        stroke="#2563eb"
                        strokeWidth={2 / actualScale}
                        cornerRadius={8}
                        dash={[6 / actualScale, 4 / actualScale]}
                        listening={false}
                      />

                      {!hasMultipleSelection &&
                        handles.map((resizeHandle) => (
                          <Rect
                            key={resizeHandle.handle}
                            x={resizeHandle.x}
                            y={resizeHandle.y}
                            width={handleSize}
                            height={handleSize}
                            fill="#f8fafc"
                            stroke="#2563eb"
                            strokeWidth={1.5 / actualScale}
                            cornerRadius={3 / actualScale}
                            draggable
                            onMouseEnter={(event) =>
                              setStageCursor(
                                event,
                                resizeHandle.handle === "nw" ||
                                  resizeHandle.handle === "se"
                                  ? "nwse-resize"
                                  : "nesw-resize",
                              )
                            }
                            onMouseLeave={(event) => {
                              event.cancelBubble = true;
                              setStageCursor(event, "auto");
                            }}
                            onMouseDown={(event) => {
                              event.cancelBubble = true;
                              stopDrawing();
                              textBoxResizeStartRef.current = renderedTextBox;
                            }}
                            onDragStart={(event) => {
                              event.cancelBubble = true;
                              textBoxResizeStartRef.current = renderedTextBox;
                              setStageCursor(event, "grabbing");
                            }}
                            onDragMove={(event) =>
                              handleTextBoxResizeMove(
                                event,
                                renderedTextBox,
                                resizeHandle.handle,
                              )
                            }
                            onDragEnd={(event) => {
                              event.cancelBubble = true;
                              setStageCursor(event, "auto");
                              handleTextBoxResizeEnd(event, renderedTextBox);
                            }}
                          />
                        ))}
                    </>
                  )}
              </Group>
            );
          })}
          {marqueeSelection &&
            (() => {
              const bounds = getMarqueeBounds(marqueeSelection);

              if (!bounds) {
                return null;
              }

              return (
                <Rect
                  x={bounds.x}
                  y={bounds.y}
                  width={bounds.width}
                  height={bounds.height}
                  fill="rgba(37, 99, 235, 0.1)"
                  stroke="#2563eb"
                  strokeWidth={1.5 / actualScale}
                  dash={[6 / actualScale, 4 / actualScale]}
                  listening={false}
                />
              );
            })()}
          {remoteMarquees.map((remoteMarquee) => {
            const bounds = getMarqueeBounds(remoteMarquee.selection);

            if (!bounds) {
              return null;
            }

            return (
              <Rect
                key={remoteMarquee.socketId}
                x={bounds.x}
                y={bounds.y}
                width={bounds.width}
                height={bounds.height}
                fill={`${remoteMarquee.color}1A`}
                stroke={remoteMarquee.color}
                strokeWidth={1.5 / actualScale}
                dash={[6 / actualScale, 4 / actualScale]}
                listening={false}
              />
            );
          })}
          {selectedSingleLine &&
            selectedSingleLineBounds &&
            (() => {
              const selectionPadding = 4 / actualScale;
              const selectionX =
                selectedSingleLineBounds.x +
                selectionDragOffset.x -
                selectionPadding;
              const selectionY =
                selectedSingleLineBounds.y +
                selectionDragOffset.y -
                selectionPadding;

              return (
                <Group
                  x={selectionX}
                  y={selectionY}
                  draggable
                  onMouseDown={(event) => {
                    event.cancelBubble = true;
                  }}
                  onMouseEnter={(event) => setStageCursor(event, "grab")}
                  onMouseLeave={(event) => {
                    event.cancelBubble = true;
                    setStageCursor(event, "auto");
                  }}
                  onDragStart={(event) => {
                    event.cancelBubble = true;
                    selectionDragStartRef.current = {
                      x: event.target.x(),
                      y: event.target.y(),
                    };
                    setStageCursor(event, "grabbing");
                  }}
                  onDragMove={(event) => {
                    event.cancelBubble = true;

                    const cursorPoint = getBoardPoint(event);

                    if (cursorPoint) {
                      onCursorMove(cursorPoint);
                    }
                    const start = selectionDragStartRef.current;

                    if (!start) {
                      return;
                    }

                    const clampedDelta = clampDragDeltaToVisibleViewport(
                      selectedSingleLineBounds,
                      event.target.x() - start.x,
                      event.target.y() - start.y,
                    );

                    event.target.position({
                      x: start.x + clampedDelta.deltaX,
                      y: start.y + clampedDelta.deltaY,
                    });

                    setSelectionDragOffset({
                      x: clampedDelta.deltaX,
                      y: clampedDelta.deltaY,
                    });

                    onPreviewMoveSelectedObjects(
                      clampedDelta.deltaX,
                      clampedDelta.deltaY,
                      selectedIds,
                    );
                  }}
                  onDragEnd={(event) => {
                    event.cancelBubble = true;
                    const start = selectionDragStartRef.current;

                    if (start) {
                      const clampedDelta = clampDragDeltaToVisibleViewport(
                        selectedSingleLineBounds,
                        event.target.x() - start.x,
                        event.target.y() - start.y,
                      );

                      onMoveSelectedObjects(
                        clampedDelta.deltaX,
                        clampedDelta.deltaY,
                        selectedIds,
                      );
                    }

                    selectionDragStartRef.current = null;
                    setSelectionDragOffset({ x: 0, y: 0 });
                    setStageCursor(event, "auto");
                  }}
                  onContextMenu={(event) =>
                    openObjectContextMenu(event, {
                      type: "line",
                      id: selectedSingleLine.id,
                    })
                  }
                >
                  <Rect
                    width={
                      selectedSingleLineBounds.width + selectionPadding * 2
                    }
                    height={
                      selectedSingleLineBounds.height + selectionPadding * 2
                    }
                    fill="rgba(37, 99, 235, 0.025)"
                    stroke="#2563eb"
                    strokeWidth={2 / actualScale}
                    cornerRadius={6}
                    dash={[6 / actualScale, 4 / actualScale]}
                  />
                </Group>
              );
            })()}
          {selectedGroupBounds && (
            <Group
              x={selectedGroupBounds.x + selectionDragOffset.x}
              y={selectedGroupBounds.y + selectionDragOffset.y}
              draggable
              onMouseDown={(event) => {
                event.cancelBubble = true;
              }}
              onContextMenu={(event) => {
                event.evt.preventDefault();
                event.cancelBubble = true;

                const position = getContextMenuPosition(
                  event.evt.clientX,
                  event.evt.clientY,
                );

                if (!position) {
                  return;
                }

                setContextMenu({
                  ...position,
                  target: { type: "selection", x: position.x, y: position.y },
                });
              }}
              onDragStart={(event) => {
                event.cancelBubble = true;
                selectionDragStartRef.current = {
                  x: event.target.x(),
                  y: event.target.y(),
                };
                setStageCursor(event, "grabbing");
              }}
              onDragMove={(event) => {
                event.cancelBubble = true;
                const start = selectionDragStartRef.current;

                if (!start) {
                  return;
                }

                const cursorPoint = getBoardPoint(event);

                if (cursorPoint) {
                  onCursorMove(cursorPoint);
                }

                const clampedDelta = clampDragDeltaToVisibleViewport(
                  selectedGroupBounds,
                  event.target.x() - start.x,
                  event.target.y() - start.y,
                );

                event.target.position({
                  x: start.x + clampedDelta.deltaX,
                  y: start.y + clampedDelta.deltaY,
                });

                setSelectionDragOffset({
                  x: clampedDelta.deltaX,
                  y: clampedDelta.deltaY,
                });

                onPreviewMoveSelectedObjects(
                  clampedDelta.deltaX,
                  clampedDelta.deltaY,
                  selectedIds,
                );
              }}
              onDragEnd={(event) => {
                event.cancelBubble = true;
                const start = selectionDragStartRef.current;

                if (start) {
                  const clampedDelta = clampDragDeltaToVisibleViewport(
                    selectedGroupBounds,
                    event.target.x() - start.x,
                    event.target.y() - start.y,
                  );

                  onMoveSelectedObjects(
                    clampedDelta.deltaX,
                    clampedDelta.deltaY,
                    selectedIds,
                  );
                }

                selectionDragStartRef.current = null;
                setSelectionDragOffset({ x: 0, y: 0 });
                setStageCursor(event, "auto");
              }}
            >
              <Rect
                width={selectedGroupBounds.width}
                height={selectedGroupBounds.height}
                fill="rgba(37, 99, 235, 0.025)"
                stroke="#2563eb"
                strokeWidth={2 / actualScale}
                dash={[6 / actualScale, 4 / actualScale]}
                listening
              />
            </Group>
          )}
        </Layer>
      </Stage>

      <div className="remote-cursor-layer" aria-hidden="true">
        {remoteCursors.map((cursor) => (
          <div
            className="remote-cursor"
            key={cursor.socketId}
            style={{
              left: viewport.x + cursor.x * actualScale,
              top: viewport.y + cursor.y * actualScale,
            }}
          >
            <svg
              className="remote-cursor-pointer"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <path
                d="M4 3 18 14h-7l3 7-3 1.5-3-7-4 5.5V3z"
                fill={cursor.color}
                stroke="#ffffff"
                strokeWidth="1.6"
                strokeLinejoin="round"
              />
            </svg>

            <span
              className="remote-cursor-name"
              style={{ backgroundColor: cursor.color }}
            >
              {cursor.name}
            </span>
          </div>
        ))}
      </div>

      {renderedSelectedTextBox && canSelectObjects && !groupDragStart && (
        <div
          className="selected-shape-toolbar selected-text-toolbar"
          ref={shapeToolbarRef}
          style={{
            left:
              viewport.x +
              renderedSelectedTextBox.x * actualScale +
              (renderedSelectedTextBox.width * actualScale) / 2,
            top: viewport.y + renderedSelectedTextBox.y * actualScale - 12,
          }}
          aria-label="Text box style"
          onPointerDown={(event) => event.stopPropagation()}
        >
          <button
            className="selected-shape-toolbar-button"
            type="button"
            aria-label="Text color"
            title="Text color"
            onClick={() =>
              setActiveTextBoxPopover((currentPopover) =>
                currentPopover === "textColor" ? null : "textColor",
              )
            }
          >
            <span
              className={
                isLightColor(renderedSelectedTextBox.textColor)
                  ? "text-toolbar-color is-light-color"
                  : "text-toolbar-color"
              }
              style={{ color: renderedSelectedTextBox.textColor }}
            >
              A
            </span>
            <span className="shape-toolbar-tooltip">Text color</span>
          </button>

          <button
            className={
              renderedSelectedTextBox.textAlign === "left"
                ? "selected-shape-toolbar-button active"
                : "selected-shape-toolbar-button"
            }
            type="button"
            aria-label="Left align"
            title="Left align"
            onClick={() =>
              onUpdateTextBoxStyle(renderedSelectedTextBox.id, {
                textAlign: "left",
              })
            }
          >
            <TextAlignIcon align="left" />
            <span className="shape-toolbar-tooltip">Left align</span>
          </button>

          <button
            className={
              renderedSelectedTextBox.textAlign === "center"
                ? "selected-shape-toolbar-button active"
                : "selected-shape-toolbar-button"
            }
            type="button"
            aria-label="Center align"
            title="Center align"
            onClick={() =>
              onUpdateTextBoxStyle(renderedSelectedTextBox.id, {
                textAlign: "center",
              })
            }
          >
            <TextAlignIcon align="center" />
            <span className="shape-toolbar-tooltip">Center align</span>
          </button>

          <button
            className={
              renderedSelectedTextBox.fontWeight === "bold"
                ? "selected-shape-toolbar-button active"
                : "selected-shape-toolbar-button"
            }
            type="button"
            aria-label="Bold"
            title="Bold"
            onClick={() =>
              onUpdateTextBoxStyle(renderedSelectedTextBox.id, {
                fontWeight:
                  renderedSelectedTextBox.fontWeight === "bold"
                    ? "normal"
                    : "bold",
              })
            }
          >
            <span className="text-toolbar-bold">B</span>
            <span className="shape-toolbar-tooltip">Bold</span>
          </button>

          <span className="selected-shape-toolbar-divider" aria-hidden="true" />

          <button
            className="selected-shape-toolbar-button"
            type="button"
            aria-label="More text box options"
            title="More options"
            onClick={() =>
              setActiveTextBoxPopover((currentPopover) =>
                currentPopover === "more" ? null : "more",
              )
            }
          >
            <span className="shape-toolbar-more">...</span>
          </button>

          {activeTextBoxPopover === "textColor" && (
            <div className="shape-popover shape-fill-popover">
              <div className="shape-color-grid">
                {TEXT_COLORS.map((color) => (
                  <button
                    className={
                      renderedSelectedTextBox.textColor === color.value
                        ? "shape-color-swatch selected"
                        : "shape-color-swatch"
                    }
                    type="button"
                    key={color.value}
                    aria-label={`${color.name} text`}
                    title={`${color.name} text`}
                    onClick={() =>
                      onUpdateTextBoxStyle(renderedSelectedTextBox.id, {
                        textColor: color.value,
                      })
                    }
                  >
                    <span
                      className="shape-color-preview"
                      style={{ background: color.value }}
                    />
                    {renderedSelectedTextBox.textColor === color.value && (
                      <span className="shape-color-check">✓</span>
                    )}
                  </button>
                ))}
              </div>
            </div>
          )}

          {activeTextBoxPopover === "more" && (
            <div className="shape-popover shape-more-popover">
              <button
                type="button"
                onClick={() => {
                  copyObject({
                    type: "textBox",
                    id: renderedSelectedTextBox.id,
                  });
                  setActiveTextBoxPopover(null);
                }}
              >
                Copy
              </button>
              <button
                type="button"
                onClick={() => {
                  duplicateObject({
                    type: "textBox",
                    id: renderedSelectedTextBox.id,
                  });
                  setActiveTextBoxPopover(null);
                }}
              >
                Duplicate
              </button>
              <div className="context-menu-submenu">
                <button type="button" className="context-menu-submenu-trigger">
                  <span>Arrange</span>
                  <span className="context-menu-submenu-arrow">›</span>
                </button>

                <div
                  className={contextSubmenuPlacement.className}
                  style={contextSubmenuPlacement.style}
                >
                  <button
                    type="button"
                    onClick={() => layerTextBoxFromToolbar("forward")}
                  >
                    Bring Forward
                  </button>

                  <button
                    type="button"
                    onClick={() => layerTextBoxFromToolbar("front")}
                  >
                    Bring to Front
                  </button>

                  <button
                    type="button"
                    onClick={() => layerTextBoxFromToolbar("backward")}
                  >
                    Send Backward
                  </button>

                  <button
                    type="button"
                    onClick={() => layerTextBoxFromToolbar("back")}
                  >
                    Send to Back
                  </button>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  deleteObject({
                    type: "textBox",
                    id: renderedSelectedTextBox.id,
                  });
                  setActiveTextBoxPopover(null);
                }}
              >
                Delete
              </button>
            </div>
          )}
        </div>
      )}

      {renderedSelectedShape &&
        canSelectObjects &&
        !isDraggingShape &&
        !groupDragStart && (
          <div
            className="selected-shape-toolbar"
            ref={shapeToolbarRef}
            style={{
              left:
                viewport.x +
                renderedSelectedShape.x * actualScale +
                (renderedSelectedShape.width * actualScale) / 2,
              top: viewport.y + renderedSelectedShape.y * actualScale - 12,
            }}
            aria-label="Shape style"
            onPointerDown={(event) => event.stopPropagation()}
          >
            {selectedShapeCanUseFill && (
              <button
                className="selected-shape-toolbar-button"
                type="button"
                aria-label="Fill color"
                title="Fill color"
                onClick={() =>
                  setActiveShapePopover((currentPopover) =>
                    currentPopover === "fill" ? null : "fill",
                  )
                }
              >
                <span
                  className={
                    renderedSelectedShape.fill === "transparent"
                      ? "shape-toolbar-color is-transparent"
                      : "shape-toolbar-color"
                  }
                  style={{
                    background:
                      renderedSelectedShape.fill === "transparent"
                        ? undefined
                        : renderedSelectedShape.fill,
                  }}
                />
                <span className="shape-toolbar-tooltip">Fill</span>
              </button>
            )}

            <button
              className="selected-shape-toolbar-button"
              type="button"
              aria-label="Line options"
              title="Line options"
              onClick={() =>
                setActiveShapePopover((currentPopover) =>
                  currentPopover === "line" ? null : "line",
                )
              }
            >
              <span
                className={
                  renderedSelectedShape.stroke === "transparent"
                    ? "shape-toolbar-outline is-transparent-outline"
                    : "shape-toolbar-outline"
                }
                style={
                  renderedSelectedShape.stroke === "transparent"
                    ? undefined
                    : {
                        borderColor: renderedSelectedShape.stroke,
                        borderWidth: "2px",
                      }
                }
              />
              <span className="shape-toolbar-tooltip">Outline</span>
            </button>
            {selectedShapeCanUseFill && (
              <>
                <button
                  className="selected-shape-toolbar-button"
                  type="button"
                  aria-label="Shape text color"
                  title="Text color"
                  onClick={() =>
                    setActiveShapePopover((currentPopover) =>
                      currentPopover === "textColor" ? null : "textColor",
                    )
                  }
                >
                  <span
                    className={
                      isLightColor(renderedSelectedShape.textColor)
                        ? "text-toolbar-color is-light-color"
                        : "text-toolbar-color"
                    }
                    style={{ color: renderedSelectedShape.textColor }}
                  >
                    A
                  </span>
                  <span className="shape-toolbar-tooltip">Text color</span>
                </button>

                <button
                  className={
                    renderedSelectedShape.textAlign === "left"
                      ? "selected-shape-toolbar-button active"
                      : "selected-shape-toolbar-button"
                  }
                  type="button"
                  aria-label="Shape left align"
                  title="Left align"
                  onClick={() =>
                    onUpdateShapeStyle(renderedSelectedShape.id, {
                      textAlign: "left",
                    })
                  }
                >
                  <TextAlignIcon align="left" />
                  <span className="shape-toolbar-tooltip">Left align</span>
                </button>

                <button
                  className={
                    renderedSelectedShape.textAlign === "center"
                      ? "selected-shape-toolbar-button active"
                      : "selected-shape-toolbar-button"
                  }
                  type="button"
                  aria-label="Shape center align"
                  title="Center align"
                  onClick={() =>
                    onUpdateShapeStyle(renderedSelectedShape.id, {
                      textAlign: "center",
                    })
                  }
                >
                  <TextAlignIcon align="center" />
                  <span className="shape-toolbar-tooltip">Center align</span>
                </button>

                <button
                  className={
                    renderedSelectedShape.fontWeight === "bold"
                      ? "selected-shape-toolbar-button active"
                      : "selected-shape-toolbar-button"
                  }
                  type="button"
                  aria-label="Shape bold text"
                  title="Bold"
                  onClick={() =>
                    onUpdateShapeStyle(renderedSelectedShape.id, {
                      fontWeight:
                        renderedSelectedShape.fontWeight === "bold"
                          ? "normal"
                          : "bold",
                    })
                  }
                >
                  <span className="text-toolbar-bold">B</span>
                  <span className="shape-toolbar-tooltip">Bold</span>
                </button>
              </>
            )}
            <span
              className="selected-shape-toolbar-divider"
              aria-hidden="true"
            />
            <button
              className="selected-shape-toolbar-button"
              type="button"
              aria-label="More shape options"
              title="More options"
              onClick={() =>
                setActiveShapePopover((currentPopover) =>
                  currentPopover === "more" ? null : "more",
                )
              }
            >
              <span className="shape-toolbar-more">...</span>
            </button>

            {activeShapePopover === "fill" && selectedShapeCanUseFill && (
              <div className="shape-popover shape-fill-popover">
                <div className="shape-color-grid">
                  {SHAPE_FILL_COLORS.map((color) => (
                    <button
                      className={
                        renderedSelectedShape.fill === color.value
                          ? "shape-color-swatch selected"
                          : "shape-color-swatch"
                      }
                      type="button"
                      key={color.value}
                      aria-label={`${color.name} fill`}
                      title={`${color.name} fill`}
                      onClick={() =>
                        onUpdateShapeStyle(renderedSelectedShape.id, {
                          fill: color.value,
                        })
                      }
                    >
                      <span
                        className={
                          color.value === "transparent"
                            ? "shape-color-preview is-transparent"
                            : "shape-color-preview"
                        }
                        style={{
                          background:
                            color.value === "transparent"
                              ? undefined
                              : color.value,
                        }}
                      />
                      {renderedSelectedShape.fill === color.value && (
                        <span className="shape-color-check">✓</span>
                      )}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {activeShapePopover === "line" && (
              <div className="shape-popover shape-line-popover">
                <div className="shape-line-style-row" aria-label="Line style">
                  {SHAPE_LINE_STYLES.map((lineStyle) => (
                    <button
                      className={
                        renderedSelectedShape.lineStyle === lineStyle.value
                          ? "shape-line-style-button selected"
                          : "shape-line-style-button"
                      }
                      type="button"
                      key={lineStyle.value}
                      aria-label={`${lineStyle.label} line`}
                      title={lineStyle.label}
                      onClick={() =>
                        onUpdateShapeStyle(renderedSelectedShape.id, {
                          lineStyle: lineStyle.value,
                        })
                      }
                    >
                      <span
                        className={`shape-line-preview is-${lineStyle.value}`}
                      />
                    </button>
                  ))}
                </div>

                <label className="shape-thickness-control">
                  <span>
                    Thickness
                    <strong>{renderedSelectedShape.strokeWidth}px</strong>
                  </span>
                  <input
                    type="range"
                    min="1"
                    max="12"
                    step="1"
                    value={renderedSelectedShape.strokeWidth}
                    onChange={(event) =>
                      onUpdateShapeStyle(renderedSelectedShape.id, {
                        strokeWidth: Number(event.target.value),
                      })
                    }
                  />
                </label>

                <div className="shape-color-grid">
                  {SHAPE_STROKE_COLORS.map((color) => (
                    <button
                      className={
                        renderedSelectedShape.stroke === color.value
                          ? "shape-color-swatch selected"
                          : "shape-color-swatch"
                      }
                      type="button"
                      key={color.value}
                      aria-label={`${color.name} line`}
                      title={`${color.name} line`}
                      onClick={() =>
                        onUpdateShapeStyle(renderedSelectedShape.id, {
                          stroke: color.value,
                        })
                      }
                    >
                      <span
                        className={
                          color.value === "transparent"
                            ? "shape-color-preview is-transparent"
                            : "shape-color-preview"
                        }
                        style={{
                          background:
                            color.value === "transparent"
                              ? undefined
                              : color.value,
                        }}
                      />
                      {renderedSelectedShape.stroke === color.value && (
                        <span className="shape-color-check">✓</span>
                      )}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {activeShapePopover === "textColor" && selectedShapeCanUseFill && (
              <div className="shape-popover shape-fill-popover">
                <div className="shape-color-grid">
                  {TEXT_COLORS.map((color) => (
                    <button
                      className={
                        renderedSelectedShape.textColor === color.value
                          ? "shape-color-swatch selected"
                          : "shape-color-swatch"
                      }
                      type="button"
                      key={color.value}
                      aria-label={`${color.name} shape text`}
                      title={`${color.name} shape text`}
                      onClick={() =>
                        onUpdateShapeStyle(renderedSelectedShape.id, {
                          textColor: color.value,
                        })
                      }
                    >
                      <span
                        className="shape-color-preview"
                        style={{ background: color.value }}
                      />
                      {renderedSelectedShape.textColor === color.value && (
                        <span className="shape-color-check">✓</span>
                      )}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {activeShapePopover === "more" && (
              <div className="shape-popover shape-more-popover">
                <button
                  type="button"
                  onClick={() => {
                    copyObject({ type: "shape", id: renderedSelectedShape.id });
                    setActiveShapePopover(null);
                  }}
                >
                  Copy
                </button>

                <button
                  type="button"
                  onClick={() => {
                    duplicateObject({
                      type: "shape",
                      id: renderedSelectedShape.id,
                    });
                    setActiveShapePopover(null);
                  }}
                >
                  Duplicate
                </button>
                <div className="context-menu-submenu">
                  <button
                    type="button"
                    className="context-menu-submenu-trigger"
                  >
                    <span>Arrange</span>
                    <span className="context-menu-submenu-arrow">›</span>
                  </button>

                  <div className="context-menu-submenu-panel">
                    <button
                      type="button"
                      onClick={() => layerShapeFromToolbar("forward")}
                    >
                      Bring Forward
                    </button>

                    <button
                      type="button"
                      onClick={() => layerShapeFromToolbar("front")}
                    >
                      Bring to Front
                    </button>

                    <button
                      type="button"
                      onClick={() => layerShapeFromToolbar("backward")}
                    >
                      Send Backward
                    </button>

                    <button
                      type="button"
                      onClick={() => layerShapeFromToolbar("back")}
                    >
                      Send to Back
                    </button>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    deleteObject({
                      type: "shape",
                      id: renderedSelectedShape.id,
                    });
                    setActiveShapePopover(null);
                  }}
                >
                  Delete
                </button>
              </div>
            )}
          </div>
        )}

      {editingNote &&
        (() => {
          const logicalWidth = editingNote.width / actualScale;
          const logicalHeight = editingNote.height / actualScale;
          const logicalFontSize = getNoteFontSize(
            editingNote.text,
            logicalWidth,
            logicalHeight,
          );
          const editorPaddingY =
            getNoteEditorVerticalPadding(
              editingNote.text,
              logicalWidth,
              logicalHeight,
              logicalFontSize,
            ) * actualScale;

          return (
            <textarea
              ref={noteEditorRef}
              className="note-editor"
              value={editingNote.text}
              style={{
                left: editingNote.left,
                top: editingNote.top,
                width: editingNote.width,
                height: editingNote.height,
                backgroundColor: editingNote.color,
                color: getNoteTextColor(editingNote.color),
                paddingTop: editorPaddingY,
                paddingRight: NOTE_TEXT_PADDING * actualScale,
                paddingBottom: editorPaddingY,
                paddingLeft: NOTE_TEXT_PADDING * actualScale,
                fontSize: logicalFontSize * actualScale,
              }}
              aria-label="Sticky note text"
              onChange={(event) =>
                setEditingNote((currentNote) =>
                  currentNote
                    ? { ...currentNote, text: event.target.value }
                    : currentNote,
                )
              }
              onBlur={saveEditingNote}
              onKeyDown={(event) => {
                if (event.key === "Escape") {
                  event.preventDefault();
                  cancelEditingNote();
                }

                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  saveEditingNote();
                }
              }}
              onMouseMove={(event) => {
                const cursorPoint = getBoardPointFromClientPoint(
                  event.clientX,
                  event.clientY,
                );

                if (cursorPoint) {
                  onCursorMove(cursorPoint);
                }
              }}
            />
          );
        })()}

      {editingTextBox &&
        (() => {
          const currentTextBox = textBoxes.find(
            (textBox) => textBox.id === editingTextBox.id,
          );
          const logicalWidth = editingTextBox.width / actualScale;
          const logicalHeight = editingTextBox.height / actualScale;
          const logicalFontSize = getTextBoxFontSize(
            editingTextBox.text,
            logicalWidth,
            logicalHeight,
          );
          const finalLogicalFontSize =
            currentTextBox?.fontSize ?? logicalFontSize;
          const editorPaddingY =
            getNoteEditorVerticalPadding(
              editingTextBox.text,
              logicalWidth,
              logicalHeight,
              finalLogicalFontSize,
            ) * actualScale;

          return (
            <textarea
              ref={textBoxEditorRef}
              className="text-box-editor"
              value={editingTextBox.text}
              style={{
                left: editingTextBox.left,
                top: editingTextBox.top,
                width: editingTextBox.width,
                height: editingTextBox.height,
                paddingTop: editorPaddingY,
                paddingRight: NOTE_TEXT_PADDING * actualScale,
                paddingBottom: editorPaddingY,
                paddingLeft: NOTE_TEXT_PADDING * actualScale,
                color: currentTextBox?.textColor ?? DEFAULT_TEXT_COLOR,
                caretColor: currentTextBox?.textColor ?? DEFAULT_TEXT_COLOR,
                fontSize: finalLogicalFontSize * actualScale,
                fontWeight: currentTextBox?.fontWeight ?? DEFAULT_FONT_WEIGHT,
                textAlign: currentTextBox?.textAlign ?? DEFAULT_TEXT_ALIGN,
              }}
              aria-label="Text box text"
              onChange={(event) => {
                const nextText = event.currentTarget.value;

                setEditingTextBox((currentTextBox) => {
                  if (!currentTextBox) {
                    return currentTextBox;
                  }

                  const nextTextBox = {
                    ...currentTextBox,
                    text: nextText,
                  };

                  editingTextBoxRef.current = nextTextBox;

                  return nextTextBox;
                });
              }}
              onBlur={(event) => {
                saveEditingTextBox(event.currentTarget.value);
              }}
              onMouseMove={(event) => {
                const cursorPoint = getBoardPointFromClientPoint(
                  event.clientX,
                  event.clientY,
                );

                if (cursorPoint) {
                  onCursorMove(cursorPoint);
                }
              }}
              onKeyDown={(event) => {
                if (event.key === "Escape") {
                  event.preventDefault();
                  cancelEditingTextBox();
                }

                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  saveEditingTextBox(event.currentTarget.value);
                }
              }}
            />
          );
        })()}

      {editingShape &&
        (() => {
          const currentShape = shapes.find(
            (shape) => shape.id === editingShape.id,
          );
          const logicalWidth = editingShape.width / actualScale;
          const logicalHeight = editingShape.height / actualScale;
          const logicalFontSize = getTextBoxFontSize(
            editingShape.text,
            logicalWidth,
            logicalHeight,
          );
          const finalLogicalFontSize =
            currentShape?.fontSize ?? logicalFontSize;
          const editorPaddingY =
            getNoteEditorVerticalPadding(
              editingShape.text,
              logicalWidth,
              logicalHeight,
              finalLogicalFontSize,
            ) * actualScale;

          return (
            <textarea
              ref={shapeEditorRef}
              className="shape-text-editor"
              value={editingShape.text}
              style={{
                left: editingShape.left,
                top: editingShape.top,
                width: editingShape.width,
                height: editingShape.height,
                paddingTop: editorPaddingY,
                paddingRight: NOTE_TEXT_PADDING * actualScale,
                paddingBottom: editorPaddingY,
                paddingLeft: NOTE_TEXT_PADDING * actualScale,
                color: currentShape?.textColor ?? DEFAULT_TEXT_COLOR,
                caretColor: currentShape?.textColor ?? DEFAULT_TEXT_COLOR,
                fontSize: finalLogicalFontSize * actualScale,
                fontWeight: currentShape?.fontWeight ?? DEFAULT_FONT_WEIGHT,
                textAlign: currentShape?.textAlign ?? DEFAULT_TEXT_ALIGN,
              }}
              aria-label="Shape text"
              onChange={(event) =>
                setEditingShape((currentShape) =>
                  currentShape
                    ? { ...currentShape, text: event.target.value }
                    : currentShape,
                )
              }
              onBlur={saveEditingShape}
              onMouseMove={(event) => {
                const cursorPoint = getBoardPointFromClientPoint(
                  event.clientX,
                  event.clientY,
                );

                if (cursorPoint) {
                  onCursorMove(cursorPoint);
                }
              }}
              onKeyDown={(event) => {
                if (event.key === "Escape") {
                  event.preventDefault();
                  cancelEditingShape();
                }

                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  saveEditingShape();
                }
              }}
            />
          );
        })()}

      {contextMenu && (
        <div
          className="canvas-context-menu"
          ref={contextMenuRef}
          style={{ left: contextMenu.x, top: contextMenu.y }}
          role="menu"
        >
          {contextMenu.target.type === "canvas" ? (
            <>
              <button
                type="button"
                role="menuitem"
                disabled={!copiedObject}
                onClick={pasteCopiedObject}
              >
                Paste
              </button>
              <button type="button" role="menuitem" onClick={centerView}>
                Center View
              </button>
            </>
          ) : (
            <>
              <div className="canvas-context-menu-label">
                {contextMenu.target.type === "selection"
                  ? "Selected items"
                  : contextMenu.target.type === "line"
                    ? "Pen drawing"
                    : contextMenu.target.type === "note"
                      ? "Sticky note"
                      : contextMenu.target.type === "textBox"
                        ? "Text box"
                        : "Shape"}
              </div>
              <button
                type="button"
                role="menuitem"
                onClick={copyContextMenuObject}
              >
                Copy
              </button>

              <button
                type="button"
                role="menuitem"
                onClick={duplicateContextMenuObject}
              >
                Duplicate
              </button>

              <div className="context-menu-submenu">
                <button
                  type="button"
                  role="menuitem"
                  className="context-menu-submenu-trigger"
                >
                  <span>Arrange</span>
                  <span className="context-menu-submenu-arrow">›</span>
                </button>

                <div
                  className={contextSubmenuPlacement.className}
                  style={contextSubmenuPlacement.style}
                >
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => layerContextMenuObject("forward")}
                  >
                    Bring Forward
                  </button>

                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => layerContextMenuObject("front")}
                  >
                    Bring to Front
                  </button>

                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => layerContextMenuObject("backward")}
                  >
                    Send Backward
                  </button>

                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => layerContextMenuObject("back")}
                  >
                    Send to Back
                  </button>
                </div>
              </div>

              <button
                type="button"
                role="menuitem"
                onClick={deleteContextMenuObject}
              >
                Delete
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
});

export default WhiteboardCanvas;
