import cors from "cors";
import dotenv from "dotenv";
import express from "express";
import helmet from "helmet";
import http from "http";
import { Server } from "socket.io";
import { addPlayer, advanceGameState, createGameState, getScopedState, queueMoveIntent, queueTrapIntent, removePlayer } from "./gameState.js";

dotenv.config();

const PORT = Number(process.env.PORT || 4000);
const TICK_RATE = Number(process.env.TICK_RATE || 30);
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN || "http://localhost:5173";
const ALLOWED_ORIGINS = CLIENT_ORIGIN.split(",").map((origin) => origin.trim()).filter(Boolean);

const gameState = createGameState({
  width: Number(process.env.GRID_WIDTH || 24),
  height: Number(process.env.GRID_HEIGHT || 18),
  tickRate: TICK_RATE,
  powerUpSpawnIntervalTicks: Number(process.env.POWER_UP_SPAWN_INTERVAL_TICKS || 45),
  maxPowerUps: Number(process.env.MAX_POWER_UPS || 8),
  obstacleCount: Number(process.env.OBSTACLE_COUNT || 28),
});

const app = express();
app.set("trust proxy", 1);
app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.json());
app.use(cors({
  origin(origin, callback) {
    if (!origin || ALLOWED_ORIGINS.includes(origin)) {
      callback(null, true);
      return;
    }

    callback(new Error(`Origin ${origin} is not allowed by CORS policy`));
  },
  methods: ["GET", "POST"],
  credentials: false,
}));

app.get("/healthz", (request, response) => {
  response.json({
    ok: true,
    tick: gameState.tick,
    players: Object.keys(gameState.players).length,
  });
});

app.get("/api/config", (request, response) => {
  response.json({
    tickRate: TICK_RATE,
    arena: {
      width: gameState.config.width,
      height: gameState.config.height,
    },
  });
});

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: ALLOWED_ORIGINS,
    methods: ["GET", "POST"],
    credentials: false,
  },
});

function emitState() {
  for (const socket of io.sockets.sockets.values()) {
    socket.emit("game:state", getScopedState(gameState, socket.id));
  }
}

io.on("connection", (socket) => {
  const player = addPlayer(gameState, {
    id: socket.id,
    name: `Player ${Object.keys(gameState.players).length + 1}`,
  });

  socket.emit("game:welcome", {
    playerId: socket.id,
    state: getScopedState(gameState, socket.id),
    config: {
      tickRate: TICK_RATE,
      arena: {
        width: gameState.config.width,
        height: gameState.config.height,
      },
    },
    player,
  });

  socket.broadcast.emit("game:system", {
    type: "player-joined",
    playerId: socket.id,
    name: player.name,
  });

  socket.on("game:intent", (intent) => {
    if (!intent || typeof intent !== "object") {
      return;
    }

    if (intent.type === "move" && typeof intent.direction === "string") {
      queueMoveIntent(gameState, socket.id, intent.direction);
    }

    if (intent.type === "trap") {
      queueTrapIntent(gameState, socket.id);
    }
  });

  socket.on("disconnect", () => {
    removePlayer(gameState, socket.id);
    socket.broadcast.emit("game:system", {
      type: "player-left",
      playerId: socket.id,
    });
    emitState();
  });

  emitState();
});

const tickIntervalMs = Math.round(1000 / TICK_RATE);
const gameLoop = setInterval(() => {
  advanceGameState(gameState);
  emitState();
}, tickIntervalMs);

function shutdown() {
  clearInterval(gameLoop);
  server.close(() => {
    process.exit(0);
  });
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

server.listen(PORT, () => {
  console.log(`Grid arena server listening on port ${PORT}`);
});
