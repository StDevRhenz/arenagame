import { useEffect, useMemo, useState } from "react";
import { io } from "socket.io-client";
import GameCanvas from "./components/GameCanvas.jsx";

const SERVER_URL = import.meta.env.VITE_SERVER_URL || "http://localhost:4000";

function keyToDirection(key) {
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

      const direction = keyToDirection(event.key);
      if (direction) {
        sendIntent({
          type: "move",
          direction,
        });
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

  function handleMoveIntent(direction) {
    sendIntent({
      type: "move",
      direction,
    });
  }

  function handleTrapIntent() {
    sendIntent({
      type: "trap",
    });
  }

  const players = useMemo(() => gameState?.players ?? [], [gameState]);
  const leaderboard = useMemo(() => {
    return [...players].sort((left, right) => right.score - left.score).slice(0, 5);
  }, [players]);

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

          <div className="touch-controls" aria-label="Touch controls">
            <div className="dpad">
              <span />
              <button type="button" onClick={() => handleMoveIntent("up")}>▲</button>
              <span />
              <button type="button" onClick={() => handleMoveIntent("left")}>◀</button>
              <button type="button" className="touch-center" onClick={handleTrapIntent}>
                Trap
              </button>
              <button type="button" onClick={() => handleMoveIntent("right")}>▶</button>
              <span />
              <button type="button" onClick={() => handleMoveIntent("down")}>▼</button>
              <span />
            </div>
          </div>
        </article>

        <aside className="sidebar">
          <div className="panel">
            <h2>Controls</h2>
            <ul>
              <li>Move with WASD or the arrow keys.</li>
              <li>On mobile, swipe the arena or use the on-screen buttons.</li>
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
        </aside>
      </section>
    </main>
  );
}
