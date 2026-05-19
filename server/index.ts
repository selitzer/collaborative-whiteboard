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

    boardState.lines = boardState.lines.map((currentLine) =>
      isDrawnLine(currentLine) && currentLine.id === line.id
        ? line
        : currentLine,
    );

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

  socket.on("disconnecting", () => {
    leaveCurrentRoom(socket);
  });
});

httpServer.listen(3001, () => {
  console.log("Socket.IO server running on http://localhost:3001");
});
