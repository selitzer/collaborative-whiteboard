import { useEffect, useRef, useState } from "react";
import { Layer, Line, Stage } from "react-konva";
import type { KonvaEventObject } from "konva/lib/Node";

export type DrawnLine = {
  id: string;
  points: number[];
  stroke: string;
  strokeWidth: number;
};

export type ActiveTool = "select" | "pen" | "eraser";

type CanvasSize = {
  width: number;
  height: number;
};

const DRAW_STROKE = "#1f2937";
const DRAW_STROKE_WIDTH = 3;
const BOARD_WIDTH = 1600;
const BOARD_HEIGHT = 1000;

type WhiteboardCanvasProps = {
  activeTool: ActiveTool;
  lines: DrawnLine[];
  onLinesChange: (updater: (currentLines: DrawnLine[]) => DrawnLine[]) => void;
  onDrawingCommit: (previousLines: DrawnLine[]) => void;
  onEraseLine: (lineId: string) => void;
  onEraseCommit: (previousLines: DrawnLine[]) => void;
};

function WhiteboardCanvas({
  activeTool,
  lines,
  onLinesChange,
  onDrawingCommit,
  onEraseLine,
  onEraseCommit,
}: WhiteboardCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const isDrawingRef = useRef(false);
  const isErasingRef = useRef(false);
  const activeLineIdRef = useRef<string | null>(null);
  const linesBeforeStrokeRef = useRef<DrawnLine[] | null>(null);
  const linesBeforeEraseRef = useRef<DrawnLine[] | null>(null);
  const erasedLineIdsRef = useRef<Set<string>>(new Set());
  const [size, setSize] = useState<CanvasSize>({ width: 0, height: 0 });
  const scaleX = size.width / BOARD_WIDTH || 1;
  const scaleY = size.height / BOARD_HEIGHT || 1;

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

  const getBoardPoint = (event: KonvaEventObject<MouseEvent>) => {
    const stage = event.target.getStage();
    const pointerPosition = stage?.getPointerPosition();

    if (!pointerPosition) {
      return null;
    }

    return {
      x: pointerPosition.x / scaleX,
      y: pointerPosition.y / scaleY,
    };
  };

  const handleMouseDown = (event: KonvaEventObject<MouseEvent>) => {
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

    isDrawingRef.current = true;
    activeLineIdRef.current = id;
    linesBeforeStrokeRef.current = lines;

    onLinesChange((currentLines) => [
      ...currentLines,
      {
        id,
        points: [point.x, point.y],
        stroke: DRAW_STROKE,
        strokeWidth: DRAW_STROKE_WIDTH,
      },
    ]);
  };

  const handleMouseMove = (event: KonvaEventObject<MouseEvent>) => {
    if (!isDrawingRef.current || !activeLineIdRef.current) {
      return;
    }

    const point = getBoardPoint(event);

    if (!point) {
      return;
    }

    const activeLineId = activeLineIdRef.current;

    onLinesChange((currentLines) =>
      currentLines.map((line) =>
        line.id === activeLineId
          ? { ...line, points: [...line.points, point.x, point.y] }
          : line,
      ),
    );
  };

  const handleLineMouseDown = (
    event: KonvaEventObject<MouseEvent>,
    lineId: string,
  ) => {
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

  const stopDrawing = () => {
    if (isDrawingRef.current && linesBeforeStrokeRef.current) {
      onDrawingCommit(linesBeforeStrokeRef.current);
    }

    if (isErasingRef.current && erasedLineIdsRef.current.size > 0 && linesBeforeEraseRef.current) {
      onEraseCommit(linesBeforeEraseRef.current);
    }

    isDrawingRef.current = false;
    isErasingRef.current = false;
    activeLineIdRef.current = null;
    linesBeforeStrokeRef.current = null;
    linesBeforeEraseRef.current = null;
    erasedLineIdsRef.current = new Set();
  };

  return (
    <div className={`whiteboard-canvas is-${activeTool}-tool`} ref={containerRef}>
      <Stage
        width={size.width}
        height={size.height}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={stopDrawing}
        onMouseLeave={stopDrawing}
      >
        <Layer scaleX={scaleX} scaleY={scaleY}>
          {lines.map((line) => (
            <Line
              key={line.id}
              points={line.points}
              stroke={line.stroke}
              strokeWidth={line.strokeWidth}
              lineCap="round"
              lineJoin="round"
              tension={0.35}
              hitStrokeWidth={16}
              onMouseDown={(event) => handleLineMouseDown(event, line.id)}
              onMouseEnter={() => handleLineMouseEnter(line.id)}
            />
          ))}
        </Layer>
      </Stage>
    </div>
  );
}

export default WhiteboardCanvas;
