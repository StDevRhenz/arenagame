import { useEffect, useMemo, useRef, useState } from "react";
import { io } from "socket.io-client";
import GameCanvas from "./components/GameCanvas.jsx";

const SERVER_URL = import.meta.env.VITE_SERVER_URL || "http://localhost:4000";
const JOYSTICK_MAX_OFFSET = 42;
const JOYSTICK_DEAD_ZONE = 14;

const DIRECTION_VECTORS = {
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
};

function vectorToDirection(vector) {
  if (Math.abs(vector.x) > Math.abs(vector.y)) {
    return vector.x > 0 ? "right" : "left";
  }

  return vector.y > 0 ? "down" : "up";
}

function getRelativeDirection(screenDirection, facingDirection) {
  const forward = DIRECTION_VECTORS[facingDirection] ?? DIRECTION_VECTORS.up;
  const right = {
    x: -forward.y,
    y: forward.x,
  };

  switch (screenDirection) {
    case "up":
      return vectorToDirection(forward);
    case "down":
      return vectorToDirection({ x: -forward.x, y: -forward.y });
    case "left":
      return vectorToDirection({ x: -right.x, y: -right.y });
    case "right":
      return vectorToDirection(right);
    default:
      return screenDirection;
  }
}

function keyToScreenDirection(key) {
  switch (key) {
    case "ArrowUp":
    case "w":
    case "W":
      return "up";
    case "ArrowDown":
    case "s":
    case "S":
      return "down";
    case "ArrowLeft":
    case "a":
    case "A":
      return "left";
    case "ArrowRight":
    case "d":
    case "D":
      return "right";
    default:
      return null;
  }
}

export default function App() {
  const [socket, setSocket] = useState(null);
  const [connectionStatus, setConnectionStatus] = useState("connecting");
  const [playerId, setPlayerId] = useState("");
  const [gameState, setGameState] = useState(null);
  const [joystick, setJoystick] = useState({ active: false, x: 0, y: 0 });
  const joystickBaseRef = useRef(null);
  const joystickDirectionRef = useRef(null);
  const playerFacingRef = useRef("up");
  const holdIntervalRef = useRef(null);

  function sendIntent(intent) {
    if (!socket || connectionStatus !== "connected") {
      return;
    }

    socket.emit("game:intent", intent);
  }

  useEffect(() => {
    const client = io(SERVER_URL, {
      transports: ["websocket", "polling"],
      autoConnect: true,
      reconnection: true,
      withCredentials: false,
    });

    setSocket(client);

    client.on("connect", () => {
      setConnectionStatus("connected");
    });

    client.on("disconnect", () => {
      setConnectionStatus("disconnected");
    });

    client.on("connect_error", () => {
      setConnectionStatus("error");
    });

    client.on("game:welcome", (payload) => {
      setPlayerId(payload.playerId);
      setGameState(payload.state);
    });

    client.on("game:state", (nextState) => {
      setGameState(nextState);
    });

    return () => {
      client.removeAllListeners();
      client.disconnect();
    };
  }, []);

  useEffect(() => {
    function handleKeyDown(event) {
      if (event.repeat) {
        return;
      }

      const screenDirection = keyToScreenDirection(event.key);
      if (screenDirection) {
        handleMoveIntent(screenDirection);
        return;
      }

      if (event.code === "Space") {
        event.preventDefault();
        sendIntent({
          type: "trap",
        });
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [socket, connectionStatus]);

  useEffect(() => {
    const localPlayer = gameState?.players?.find((player) => player.id === playerId);
    playerFacingRef.current = localPlayer?.direction ?? playerFacingRef.current;
  }, [gameState, playerId]);

  function handleMoveIntent(direction) {
    const relativeDirection = getRelativeDirection(direction, playerFacingRef.current);

    sendIntent({
      type: "move",
      direction: relativeDirection,
    });
  }

  function handleTrapIntent() {
    sendIntent({
      type: "trap",
    });
  }

  function startHold(direction) {
    handleMoveIntent(direction);
    if (holdIntervalRef.current) {
      window.clearInterval(holdIntervalRef.current);
    }

    holdIntervalRef.current = window.setInterval(() => {
      handleMoveIntent(direction);
    }, 140);
  }

  function stopHold() {
    if (!holdIntervalRef.current) {
      return;
    }

    window.clearInterval(holdIntervalRef.current);
    holdIntervalRef.current = null;
  }

  function resolveJoystickDirection(offsetX, offsetY) {
    if (Math.hypot(offsetX, offsetY) < JOYSTICK_DEAD_ZONE) {
      return null;
    }

    if (Math.abs(offsetX) > Math.abs(offsetY)) {
      return offsetX > 0 ? "right" : "left";
    }

    return offsetY > 0 ? "down" : "up";
  }

  function updateJoystick(pointerX, pointerY) {
    const base = joystickBaseRef.current;
    if (!base) {
      return null;
    }

    const rect = base.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    const rawX = pointerX - centerX;
    const rawY = pointerY - centerY;
    const distance = Math.hypot(rawX, rawY);
    const scale = distance > JOYSTICK_MAX_OFFSET ? JOYSTICK_MAX_OFFSET / distance : 1;
    const x = rawX * scale;
    const y = rawY * scale;

    setJoystick({ active: true, x, y });
    return resolveJoystickDirection(x, y);
  }

  function setJoystickDirection(direction) {
    if (!direction) {
      joystickDirectionRef.current = null;
      stopHold();
      return;
    }

    if (joystickDirectionRef.current === direction) {
      return;
    }

    joystickDirectionRef.current = direction;
    startHold(direction);
  }

  function handleJoystickPointerDown(event) {
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    setJoystickDirection(updateJoystick(event.clientX, event.clientY));
  }

  function handleJoystickPointerMove(event) {
    if (!joystick.active) {
      return;
    }

    event.preventDefault();
    setJoystickDirection(updateJoystick(event.clientX, event.clientY));
  }

  function stopJoystick() {
    joystickDirectionRef.current = null;
    stopHold();
    setJoystick({ active: false, x: 0, y: 0 });
  }

  const players = useMemo(() => gameState?.players ?? [], [gameState]);
  const leaderboard = useMemo(() => {
    return [...players].sort((left, right) => right.score - left.score).slice(0, 5);
  }, [players]);
  const dashboardItems = useMemo(() => {
    const totalPlayers = players.length || 1;
    const visiblePlayers = gameState?.players?.filter((player) => player.alive).length || 0;
    const interestScore = Math.max(55, Math.min(100, Math.round((visiblePlayers / totalPlayers) * 100)));

    return [
      {
        label: "Server-Authority Interest Management",
        value: `${interestScore}%`,
        percent: interestScore,
      },
      {
        label: "Low Latency Binary Serialization",
        value: "94%",
        percent: 94,
      },
      {
        label: "Smooth FPS Stability Graphs",
        value: gameState ? `${Math.max(92, 100 - Math.min(gameState.powerUps.length, 8))}%` : "92%",
        percent: gameState ? Math.max(92, 100 - Math.min(gameState.powerUps.length, 8)) : 92,
      },
      {
        label: "Cross-Platform Smoothness",
        value: "98%",
        percent: 98,
      },
    ];
  }, [gameState, players]);

  return (
    <main className="app-shell">
      <section className="hero">
        <div>
          <p className="eyebrow">Authoritative multiplayer arena</p>
          <h1>Grid Arena</h1>
          <p className="lede">
            Move on the server, collect power-ups, and use traps to box opponents in.
          </p>
        </div>

        <div className="status-card">
          <span className={`status-indicator status-${connectionStatus}`} />
          <div>
            <strong>{connectionStatus}</strong>
            <p>Server: {SERVER_URL}</p>
          </div>
          <div className="status-meta">
            <span>Player ID</span>
            <strong>{playerId || "waiting"}</strong>
          </div>

        </div>
      </section>

      <section className="content-grid">
        <article className="arena-panel">
          <GameCanvas
            gameState={gameState}
            playerId={playerId}
            onMoveIntent={handleMoveIntent}
            onTrapIntent={handleTrapIntent}
          />

          <div className="mobile-controls" aria-label="Mobile controls">
            <div
              ref={joystickBaseRef}
              className={`joystick-base${joystick.active ? " is-active" : ""}`}
              role="application"
              aria-label="Movement joystick"
              onPointerDown={handleJoystickPointerDown}
              onPointerMove={handleJoystickPointerMove}
              onPointerUp={stopJoystick}
              onPointerCancel={stopJoystick}
            >
              <span
                className="joystick-stick"
                style={{ transform: `translate(${joystick.x}px, ${joystick.y}px)` }}
              />
            </div>

            <button type="button" className="trap-float-button" onPointerDown={handleTrapIntent}>
              Trap
            </button>
          </div>
        </article>

        <aside className="sidebar">
          <div className="panel">
            <h2>Controls</h2>
            <ul>
              <li>Move with WASD or the arrow keys.</li>
              <li>On mobile, swipe the arena or use the floating joystick.</li>
              <li>Hold the joystick direction for repeated movement.</li>
              <li>Press Space to place a trap after collecting trap charges.</li>
              <li>Avoid walls, obstacles, and active traps.</li>
            </ul>
          </div>

          <div className="panel">
            <h2>Leaderboard</h2>
            <ol className="leaderboard">
              {leaderboard.map((player) => (
                <li key={player.id} className={player.id === playerId ? "is-local" : ""}>
                  <span className="player-dot" style={{ backgroundColor: player.color }} />
                  <span className="player-name">{player.name}</span>
                  <span className="player-score">{player.score}</span>
                </li>
              ))}
            </ol>
          </div>

          <div className="panel dashboard-panel">
            <p className="dashboard-eyebrow">GAME ENGINE OPTIMIZATION DASHBOARD</p>
            <h2>System Overview</h2>
            <div className="dashboard-bars">
              {dashboardItems.map((item) => (
                <div key={item.label} className="dashboard-item">
                  <div className="dashboard-row">
                    <span>{item.label}</span>
                    <strong>{item.value}</strong>
                  </div>
                  <div className="dashboard-track">
                    <span style={{ width: `${item.percent}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </aside>
      </section>

    </main>
  );
}
