import { createServer } from "http";
import { Server, type Socket } from "socket.io";

const httpServer = createServer();

const io = new Server(httpServer, {
  cors: {
    origin: "http://localhost:5173",
  },
});

type RoomUser = {
  socketId: string;
  name: string;
};

type RoomBoardState = {
  version: number;
  title: string;
  lines: unknown[];
  notes: unknown[];
  shapes: unknown[];
  textBoxes: unknown[];
  savedAt: string;
};

type DrawnLine = {
  id: string;
  points: number[];
  stroke: string;
  strokeWidth: number;
  zIndex: number;
};

type StickyNote = {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  text: string;
  color: string;
  zIndex: number;
};

type TextBox = {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  text: string;
  textColor?: string;
  fontSize?: number | null;
  fontWeight?: "normal" | "bold";
  textAlign?: "left" | "center" | "right";
  zIndex: number;
};

type Shape = {
  id: string;
  type: "rectangle" | "ellipse" | "triangle" | "line" | "arrow";
  x: number;
  y: number;
  width: number;
  height: number;
  text?: string;
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
  lineStyle?: "solid" | "dashed" | "dotted";
  textColor?: string;
  fontSize?: number | null;
  fontWeight?: "normal" | "bold";
  textAlign?: "left" | "center" | "right";
  zIndex: number;
};

const rooms = new Map<string, RoomUser[]>();
const roomTitles = new Map<string, string>();
const roomBoards = new Map<string, RoomBoardState>();
const socketRooms = new Map<string, string>();
const DEFAULT_BOARD_TITLE = "Untitled Board";

const generateRoomCode = () => {
  const characters = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";

  for (let index = 0; index < 5; index += 1) {
    code += characters[Math.floor(Math.random() * characters.length)];
  }

  return code;
};

const getUniqueRoomCode = () => {
  let code = generateRoomCode();

  while (rooms.has(code)) {
    code = generateRoomCode();
  }

  return code;
};

const emitRoomUsers = (roomCode: string) => {
  const users = rooms.get(roomCode) ?? [];

  io.to(roomCode).emit("room:users", {
    roomCode,
    users,
    count: users.length,
  });
};

const normalizeBoardTitle = (title?: string) => {
  return title?.trim() || DEFAULT_BOARD_TITLE;
};

const createEmptyBoardState = (
  title = DEFAULT_BOARD_TITLE,
): RoomBoardState => ({
  version: 1,
  title: normalizeBoardTitle(title),
  lines: [],
  notes: [],
  shapes: [],
  textBoxes: [],
  savedAt: new Date().toISOString(),
});

const normalizeRoomBoardState = (
  boardData?: Partial<RoomBoardState>,
  fallbackTitle = DEFAULT_BOARD_TITLE,
): RoomBoardState => {
  if (!boardData || typeof boardData !== "object") {
    return createEmptyBoardState(fallbackTitle);
  }

  const title = normalizeBoardTitle(boardData.title ?? fallbackTitle);

  return {
    version: typeof boardData.version === "number" ? boardData.version : 1,
    title,
    lines: Array.isArray(boardData.lines) ? boardData.lines : [],
    notes: Array.isArray(boardData.notes) ? boardData.notes : [],
    shapes: Array.isArray(boardData.shapes) ? boardData.shapes : [],
    textBoxes: Array.isArray(boardData.textBoxes) ? boardData.textBoxes : [],
    savedAt:
      typeof boardData.savedAt === "string"
        ? boardData.savedAt
        : new Date().toISOString(),
  };
};

const isDrawnLine = (value: unknown): value is DrawnLine => {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Record<string, unknown>;

  return (
    typeof candidate.id === "string" &&
    Array.isArray(candidate.points) &&
    candidate.points.every((point) => typeof point === "number") &&
    typeof candidate.stroke === "string" &&
    typeof candidate.strokeWidth === "number" &&
    typeof candidate.zIndex === "number"
  );
};

const isStickyNote = (value: unknown): value is StickyNote => {
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
    typeof candidate.color === "string" &&
    typeof candidate.zIndex === "number"
  );
};

const isTextBox = (value: unknown): value is TextBox => {
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
      candidate.fontWeight === "normal" ||
      candidate.fontWeight === "bold") &&
    (candidate.textAlign === undefined ||
      candidate.textAlign === "left" ||
      candidate.textAlign === "center" ||
      candidate.textAlign === "right") &&
    typeof candidate.zIndex === "number"
  );
};

const isShape = (value: unknown): value is Shape => {
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
    (candidate.text === undefined || typeof candidate.text === "string") &&
    (candidate.fill === undefined || typeof candidate.fill === "string") &&
    (candidate.stroke === undefined || typeof candidate.stroke === "string") &&
    (candidate.strokeWidth === undefined ||
      typeof candidate.strokeWidth === "number") &&
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
      candidate.fontWeight === "normal" ||
      candidate.fontWeight === "bold") &&
    (candidate.textAlign === undefined ||
      candidate.textAlign === "left" ||
      candidate.textAlign === "center" ||
      candidate.textAlign === "right") &&
    typeof candidate.zIndex === "number"
  );
};

const getRoomBoard = (roomCode: string) => {
  const boardState = roomBoards.get(roomCode);

  if (boardState) {
    return boardState;
  }

  const nextBoardState = createEmptyBoardState(roomTitles.get(roomCode));
  roomBoards.set(roomCode, nextBoardState);
  return nextBoardState;
};

const leaveCurrentRoom = (socket: Socket) => {
  const currentRoomCode = socketRooms.get(socket.id);

  if (!currentRoomCode) {
    return;
  }

  const users = rooms.get(currentRoomCode) ?? [];
  const nextUsers = users.filter((user) => user.socketId !== socket.id);

  socket.to(currentRoomCode).emit("board:cursor:leave", {
    roomCode: currentRoomCode,
    socketId: socket.id,
  });

  socket.to(currentRoomCode).emit("board:marquee:end", {
    roomCode: currentRoomCode,
    socketId: socket.id,
  });

  socket.leave(currentRoomCode);
  socketRooms.delete(socket.id);

  if (nextUsers.length === 0) {
    rooms.delete(currentRoomCode);
    roomTitles.delete(currentRoomCode);
    roomBoards.delete(currentRoomCode);
    return;
  }

  rooms.set(currentRoomCode, nextUsers);
  emitRoomUsers(currentRoomCode);
};

io.on("connection", (socket) => {
  console.log("connected", socket.id);

  socket.on("room:create", ({ name, title, boardData }, callback) => {
    leaveCurrentRoom(socket);

    const roomCode = getUniqueRoomCode();
    const displayName = name?.trim() || "Guest";
    const roomBoardState = normalizeRoomBoardState(boardData, title);
    const boardTitle = roomBoardState.title;

    rooms.set(roomCode, [
      {
        socketId: socket.id,
        name: displayName,
      },
    ]);
    roomTitles.set(roomCode, boardTitle);
    roomBoards.set(roomCode, roomBoardState);

    socket.join(roomCode);
    socketRooms.set(socket.id, roomCode);

    callback({
      ok: true,
      roomCode,
      users: rooms.get(roomCode),
      count: 1,
      title: boardTitle,
      boardData: roomBoardState,
    });

    emitRoomUsers(roomCode);
  });

  socket.on("room:join", ({ roomCode, name }, callback) => {
    const normalizedRoomCode = roomCode?.trim().toUpperCase();
    const displayName = name?.trim() || "Guest";

    if (!normalizedRoomCode || !rooms.has(normalizedRoomCode)) {
      callback({
        ok: false,
        error: "Room not found.",
      });
      return;
    }

    const roomBoardState =
      roomBoards.get(normalizedRoomCode) ??
      createEmptyBoardState(roomTitles.get(normalizedRoomCode));
    const boardTitle = roomBoardState.title;

    leaveCurrentRoom(socket);

    const users = rooms.get(normalizedRoomCode) ?? [];

    users.push({
      socketId: socket.id,
      name: displayName,
    });

    rooms.set(normalizedRoomCode, users);
    roomTitles.set(normalizedRoomCode, boardTitle);
    roomBoards.set(normalizedRoomCode, roomBoardState);
    socket.join(normalizedRoomCode);
    socketRooms.set(socket.id, normalizedRoomCode);

    callback({
      ok: true,
      roomCode: normalizedRoomCode,
      users,
      count: users.length,
      title: boardTitle,
      boardData: roomBoardState,
    });

    emitRoomUsers(normalizedRoomCode);
  });

  socket.on("board:title:update", ({ roomCode, title }, callback) => {
    const normalizedRoomCode = roomCode?.trim().toUpperCase();

    if (!normalizedRoomCode || !rooms.has(normalizedRoomCode)) {
      callback?.({
        ok: false,
        error: "Room not found.",
      });
      return;
    }

    const nextTitle = normalizeBoardTitle(title);
    const currentBoardState =
      roomBoards.get(normalizedRoomCode) ?? createEmptyBoardState(nextTitle);

    roomTitles.set(normalizedRoomCode, nextTitle);
    roomBoards.set(normalizedRoomCode, {
      ...currentBoardState,
      title: nextTitle,
    });
    socket.to(normalizedRoomCode).emit("board:title:update", {
      roomCode: normalizedRoomCode,
      title: nextTitle,
    });
    callback?.({ ok: true });
  });

  socket.on("board:line:create", ({ roomCode, line }) => {
    const normalizedRoomCode = roomCode?.trim().toUpperCase();

    if (
      !normalizedRoomCode ||
      !rooms.has(normalizedRoomCode) ||
      !isDrawnLine(line)
    ) {
      return;
    }

    const boardState = getRoomBoard(normalizedRoomCode);

    if (
      !boardState.lines.some(
        (currentLine) => isDrawnLine(currentLine) && currentLine.id === line.id,
      )
    ) {
      boardState.lines = [...boardState.lines, line];
    }

    socket.to(normalizedRoomCode).emit("board:line:create", {
      roomCode: normalizedRoomCode,
      line,
    });
  });

  socket.on("board:line:update", ({ roomCode, line }) => {
    const normalizedRoomCode = roomCode?.trim().toUpperCase();

    if (
      !normalizedRoomCode ||
      !rooms.has(normalizedRoomCode) ||
      !isDrawnLine(line)
    ) {
      return;
    }

    const boardState = getRoomBoard(normalizedRoomCode);

    const existingLineIndex = boardState.lines.findIndex(
      (currentLine) => isDrawnLine(currentLine) && currentLine.id === line.id,
    );

    if (existingLineIndex === -1) {
      boardState.lines = [...boardState.lines, line];
    } else {
      boardState.lines = boardState.lines.map((currentLine) =>
        isDrawnLine(currentLine) && currentLine.id === line.id
          ? line
          : currentLine,
      );
    }

    socket.to(normalizedRoomCode).emit("board:line:update", {
      roomCode: normalizedRoomCode,
      line,
    });
  });

  socket.on("board:line:delete", ({ roomCode, lineId }) => {
    const normalizedRoomCode = roomCode?.trim().toUpperCase();

    if (
      !normalizedRoomCode ||
      !rooms.has(normalizedRoomCode) ||
      typeof lineId !== "string"
    ) {
      return;
    }

    const boardState = getRoomBoard(normalizedRoomCode);

    boardState.lines = boardState.lines.filter(
      (currentLine) => !isDrawnLine(currentLine) || currentLine.id !== lineId,
    );

    socket.to(normalizedRoomCode).emit("board:line:delete", {
      roomCode: normalizedRoomCode,
      lineId,
    });
  });

  socket.on("board:lines:delete", ({ roomCode, lineIds }) => {
    const normalizedRoomCode = roomCode?.trim().toUpperCase();

    if (
      !normalizedRoomCode ||
      !rooms.has(normalizedRoomCode) ||
      !Array.isArray(lineIds)
    ) {
      return;
    }

    const lineIdSet = new Set(
      lineIds.filter((lineId): lineId is string => typeof lineId === "string"),
    );

    if (lineIdSet.size === 0) {
      return;
    }

    const boardState = getRoomBoard(normalizedRoomCode);

    boardState.lines = boardState.lines.filter(
      (currentLine) =>
        !isDrawnLine(currentLine) || !lineIdSet.has(currentLine.id),
    );

    socket.to(normalizedRoomCode).emit("board:lines:delete", {
      roomCode: normalizedRoomCode,
      lineIds: Array.from(lineIdSet),
    });
  });

  socket.on("board:cursor:update", ({ roomCode, x, y }) => {
    const normalizedRoomCode = roomCode?.trim().toUpperCase();

    if (
      !normalizedRoomCode ||
      !rooms.has(normalizedRoomCode) ||
      typeof x !== "number" ||
      typeof y !== "number"
    ) {
      return;
    }

    const users = rooms.get(normalizedRoomCode) ?? [];
    const user = users.find(
      (currentUser) => currentUser.socketId === socket.id,
    );

    if (!user) {
      return;
    }

    socket.to(normalizedRoomCode).emit("board:cursor:update", {
      roomCode: normalizedRoomCode,
      socketId: socket.id,
      name: user.name,
      x,
      y,
    });
  });

  socket.on("board:cursor:leave", ({ roomCode }) => {
    const normalizedRoomCode = roomCode?.trim().toUpperCase();

    if (!normalizedRoomCode || !rooms.has(normalizedRoomCode)) {
      return;
    }

    socket.to(normalizedRoomCode).emit("board:cursor:leave", {
      roomCode: normalizedRoomCode,
      socketId: socket.id,
    });
  });

  socket.on("board:marquee:update", ({ roomCode, selection }) => {
    const normalizedRoomCode = roomCode?.trim().toUpperCase();

    if (
      !normalizedRoomCode ||
      !rooms.has(normalizedRoomCode) ||
      !selection ||
      typeof selection !== "object"
    ) {
      return;
    }

    const candidate = selection as {
      start?: { x?: unknown; y?: unknown };
      current?: { x?: unknown; y?: unknown };
    };

    if (
      typeof candidate.start?.x !== "number" ||
      typeof candidate.start?.y !== "number" ||
      typeof candidate.current?.x !== "number" ||
      typeof candidate.current?.y !== "number"
    ) {
      return;
    }

    socket.to(normalizedRoomCode).emit("board:marquee:update", {
      roomCode: normalizedRoomCode,
      socketId: socket.id,
      selection: {
        start: {
          x: candidate.start.x,
          y: candidate.start.y,
        },
        current: {
          x: candidate.current.x,
          y: candidate.current.y,
        },
      },
    });
  });

  socket.on("board:marquee:end", ({ roomCode }) => {
    const normalizedRoomCode = roomCode?.trim().toUpperCase();

    if (!normalizedRoomCode || !rooms.has(normalizedRoomCode)) {
      return;
    }

    socket.to(normalizedRoomCode).emit("board:marquee:end", {
      roomCode: normalizedRoomCode,
      socketId: socket.id,
    });
  });

  socket.on("board:note:create", ({ roomCode, note }) => {
    const normalizedRoomCode = roomCode?.trim().toUpperCase();

    if (
      !normalizedRoomCode ||
      !rooms.has(normalizedRoomCode) ||
      !isStickyNote(note)
    ) {
      return;
    }

    const boardState = getRoomBoard(normalizedRoomCode);

    if (
      !boardState.notes.some(
        (currentNote) =>
          isStickyNote(currentNote) && currentNote.id === note.id,
      )
    ) {
      boardState.notes = [...boardState.notes, note];
    }

    socket.to(normalizedRoomCode).emit("board:note:create", {
      roomCode: normalizedRoomCode,
      note,
    });
  });

  socket.on("board:note:update", ({ roomCode, note }) => {
    const normalizedRoomCode = roomCode?.trim().toUpperCase();

    if (
      !normalizedRoomCode ||
      !rooms.has(normalizedRoomCode) ||
      !isStickyNote(note)
    ) {
      return;
    }

    const boardState = getRoomBoard(normalizedRoomCode);
    const hasNote = boardState.notes.some(
      (currentNote) => isStickyNote(currentNote) && currentNote.id === note.id,
    );

    boardState.notes = hasNote
      ? boardState.notes.map((currentNote) =>
          isStickyNote(currentNote) && currentNote.id === note.id
            ? note
            : currentNote,
        )
      : [...boardState.notes, note];

    socket.to(normalizedRoomCode).emit("board:note:update", {
      roomCode: normalizedRoomCode,
      note,
    });
  });

  socket.on("board:note:delete", ({ roomCode, noteId }) => {
    const normalizedRoomCode = roomCode?.trim().toUpperCase();

    if (
      !normalizedRoomCode ||
      !rooms.has(normalizedRoomCode) ||
      typeof noteId !== "string"
    ) {
      return;
    }

    const boardState = getRoomBoard(normalizedRoomCode);

    boardState.notes = boardState.notes.filter(
      (currentNote) => !isStickyNote(currentNote) || currentNote.id !== noteId,
    );

    socket.to(normalizedRoomCode).emit("board:note:delete", {
      roomCode: normalizedRoomCode,
      noteId,
    });
  });

  socket.on("board:notes:delete", ({ roomCode, noteIds }) => {
    const normalizedRoomCode = roomCode?.trim().toUpperCase();

    if (
      !normalizedRoomCode ||
      !rooms.has(normalizedRoomCode) ||
      !Array.isArray(noteIds)
    ) {
      return;
    }

    const noteIdSet = new Set(
      noteIds.filter((noteId): noteId is string => typeof noteId === "string"),
    );

    if (noteIdSet.size === 0) {
      return;
    }

    const boardState = getRoomBoard(normalizedRoomCode);

    boardState.notes = boardState.notes.filter(
      (currentNote) =>
        !isStickyNote(currentNote) || !noteIdSet.has(currentNote.id),
    );

    socket.to(normalizedRoomCode).emit("board:notes:delete", {
      roomCode: normalizedRoomCode,
      noteIds: Array.from(noteIdSet),
    });
  });

  socket.on("board:textbox:create", ({ roomCode, textBox }) => {
    const normalizedRoomCode = roomCode?.trim().toUpperCase();

    if (!normalizedRoomCode || !rooms.has(normalizedRoomCode) || !isTextBox(textBox)) {
      return;
    }

    const boardState = getRoomBoard(normalizedRoomCode);

    if (!boardState.textBoxes.some((currentTextBox) => isTextBox(currentTextBox) && currentTextBox.id === textBox.id)) {
      boardState.textBoxes = [...boardState.textBoxes, textBox];
    }

    socket.to(normalizedRoomCode).emit("board:textbox:create", {
      roomCode: normalizedRoomCode,
      textBox,
    });
  });

  socket.on("board:textbox:update", ({ roomCode, textBox }) => {
    const normalizedRoomCode = roomCode?.trim().toUpperCase();

    if (!normalizedRoomCode || !rooms.has(normalizedRoomCode) || !isTextBox(textBox)) {
      return;
    }

    const boardState = getRoomBoard(normalizedRoomCode);
    const hasTextBox = boardState.textBoxes.some(
      (currentTextBox) =>
        isTextBox(currentTextBox) && currentTextBox.id === textBox.id,
    );

    boardState.textBoxes = hasTextBox
      ? boardState.textBoxes.map((currentTextBox) =>
          isTextBox(currentTextBox) && currentTextBox.id === textBox.id
            ? textBox
            : currentTextBox,
        )
      : [...boardState.textBoxes, textBox];

    socket.to(normalizedRoomCode).emit("board:textbox:update", {
      roomCode: normalizedRoomCode,
      textBox,
    });
  });

  socket.on("board:textbox:delete", ({ roomCode, textBoxId }) => {
    const normalizedRoomCode = roomCode?.trim().toUpperCase();

    if (!normalizedRoomCode || !rooms.has(normalizedRoomCode) || typeof textBoxId !== "string") {
      return;
    }

    const boardState = getRoomBoard(normalizedRoomCode);

    boardState.textBoxes = boardState.textBoxes.filter(
      (currentTextBox) =>
        !isTextBox(currentTextBox) || currentTextBox.id !== textBoxId,
    );

    socket.to(normalizedRoomCode).emit("board:textbox:delete", {
      roomCode: normalizedRoomCode,
      textBoxId,
    });
  });

  socket.on("board:textboxes:delete", ({ roomCode, textBoxIds }) => {
    const normalizedRoomCode = roomCode?.trim().toUpperCase();

    if (!normalizedRoomCode || !rooms.has(normalizedRoomCode) || !Array.isArray(textBoxIds)) {
      return;
    }

    const textBoxIdSet = new Set(
      textBoxIds.filter(
        (textBoxId): textBoxId is string => typeof textBoxId === "string",
      ),
    );

    if (textBoxIdSet.size === 0) {
      return;
    }

    const boardState = getRoomBoard(normalizedRoomCode);

    boardState.textBoxes = boardState.textBoxes.filter(
      (currentTextBox) =>
        !isTextBox(currentTextBox) || !textBoxIdSet.has(currentTextBox.id),
    );

    socket.to(normalizedRoomCode).emit("board:textboxes:delete", {
      roomCode: normalizedRoomCode,
      textBoxIds: Array.from(textBoxIdSet),
    });
  });

  socket.on("board:shape:create", ({ roomCode, shape }) => {
    const normalizedRoomCode = roomCode?.trim().toUpperCase();

    if (!normalizedRoomCode || !rooms.has(normalizedRoomCode) || !isShape(shape)) {
      return;
    }

    const boardState = getRoomBoard(normalizedRoomCode);

    if (!boardState.shapes.some((currentShape) => isShape(currentShape) && currentShape.id === shape.id)) {
      boardState.shapes = [...boardState.shapes, shape];
    }

    socket.to(normalizedRoomCode).emit("board:shape:create", {
      roomCode: normalizedRoomCode,
      shape,
    });
  });

  socket.on("board:shape:update", ({ roomCode, shape }) => {
    const normalizedRoomCode = roomCode?.trim().toUpperCase();

    if (!normalizedRoomCode || !rooms.has(normalizedRoomCode) || !isShape(shape)) {
      return;
    }

    const boardState = getRoomBoard(normalizedRoomCode);
    const hasShape = boardState.shapes.some(
      (currentShape) => isShape(currentShape) && currentShape.id === shape.id,
    );

    boardState.shapes = hasShape
      ? boardState.shapes.map((currentShape) =>
          isShape(currentShape) && currentShape.id === shape.id
            ? shape
            : currentShape,
        )
      : [...boardState.shapes, shape];

    socket.to(normalizedRoomCode).emit("board:shape:update", {
      roomCode: normalizedRoomCode,
      shape,
    });
  });

  socket.on("board:shape:delete", ({ roomCode, shapeId }) => {
    const normalizedRoomCode = roomCode?.trim().toUpperCase();

    if (!normalizedRoomCode || !rooms.has(normalizedRoomCode) || typeof shapeId !== "string") {
      return;
    }

    const boardState = getRoomBoard(normalizedRoomCode);

    boardState.shapes = boardState.shapes.filter(
      (currentShape) => !isShape(currentShape) || currentShape.id !== shapeId,
    );

    socket.to(normalizedRoomCode).emit("board:shape:delete", {
      roomCode: normalizedRoomCode,
      shapeId,
    });
  });

  socket.on("board:shapes:delete", ({ roomCode, shapeIds }) => {
    const normalizedRoomCode = roomCode?.trim().toUpperCase();

    if (!normalizedRoomCode || !rooms.has(normalizedRoomCode) || !Array.isArray(shapeIds)) {
      return;
    }

    const shapeIdSet = new Set(
      shapeIds.filter((shapeId): shapeId is string => typeof shapeId === "string"),
    );

    if (shapeIdSet.size === 0) {
      return;
    }

    const boardState = getRoomBoard(normalizedRoomCode);

    boardState.shapes = boardState.shapes.filter(
      (currentShape) => !isShape(currentShape) || !shapeIdSet.has(currentShape.id),
    );

    socket.to(normalizedRoomCode).emit("board:shapes:delete", {
      roomCode: normalizedRoomCode,
      shapeIds: Array.from(shapeIdSet),
    });
  });

  socket.on("board:clear", ({ roomCode }) => {
    const normalizedRoomCode = roomCode?.trim().toUpperCase();

    if (!normalizedRoomCode || !rooms.has(normalizedRoomCode)) {
      return;
    }

    const currentBoardState = getRoomBoard(normalizedRoomCode);
    const nextBoardState = {
      ...currentBoardState,
      lines: [],
      notes: [],
      shapes: [],
      textBoxes: [],
      savedAt: new Date().toISOString(),
    };

    roomBoards.set(normalizedRoomCode, nextBoardState);

    socket.to(normalizedRoomCode).emit("board:clear", {
      roomCode: normalizedRoomCode,
    });
  });

  socket.on("board:snapshot:update", ({ roomCode, boardData }) => {
    const normalizedRoomCode = roomCode?.trim().toUpperCase();

    if (!normalizedRoomCode || !rooms.has(normalizedRoomCode)) {
      return;
    }

    const normalizedBoardData = normalizeRoomBoardState(
      boardData,
      roomTitles.get(normalizedRoomCode),
    );

    roomTitles.set(normalizedRoomCode, normalizedBoardData.title);
    roomBoards.set(normalizedRoomCode, normalizedBoardData);

    socket.to(normalizedRoomCode).emit("board:snapshot:update", {
      roomCode: normalizedRoomCode,
      boardData: normalizedBoardData,
    });
  });

  socket.on("disconnecting", () => {
    leaveCurrentRoom(socket);
  });
});

httpServer.listen(3001, () => {
  console.log("Socket.IO server running on http://localhost:3001");
});
