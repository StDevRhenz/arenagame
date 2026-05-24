import { useEffect, useMemo, useRef, useState } from "react";
import { io } from "socket.io-client";
import GameCanvas from "./components/GameCanvas.jsx";

const SERVER_URL = import.meta.env.VITE_SERVER_URL || "http://localhost:4000";
const MUSIC_SRC = "/music/background.mp3";

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
  const [musicEnabled, setMusicEnabled] = useState(false);
  const [musicReady, setMusicReady] = useState(false);
  const audioRef = useRef(null);
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

  async function toggleMusic() {
    const audio = audioRef.current;
    if (!audio) {
      return;
    }

    if (audio.paused) {
      try {
        await audio.play();
        setMusicEnabled(true);
      } catch {
        setMusicEnabled(false);
      }
      return;
    }

    audio.pause();
    setMusicEnabled(false);
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

          <button type="button" className="music-button" onClick={toggleMusic}>
            {musicEnabled ? "Pause music" : "Play music"}
          </button>
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
              <button
                type="button"
                onPointerDown={() => startHold("up")}
                onPointerUp={stopHold}
                onPointerLeave={stopHold}
                onPointerCancel={stopHold}
              >
                ▲
              </button>
              <span />
              <button
                type="button"
                onPointerDown={() => startHold("left")}
                onPointerUp={stopHold}
                onPointerLeave={stopHold}
                onPointerCancel={stopHold}
              >
                ◀
              </button>
              <button type="button" className="touch-center" onPointerDown={handleTrapIntent}>
                Trap
              </button>
              <button
                type="button"
                onPointerDown={() => startHold("right")}
                onPointerUp={stopHold}
                onPointerLeave={stopHold}
                onPointerCancel={stopHold}
              >
                ▶
              </button>
              <span />
              <button
                type="button"
                onPointerDown={() => startHold("down")}
                onPointerUp={stopHold}
                onPointerLeave={stopHold}
                onPointerCancel={stopHold}
              >
                ▼
              </button>
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
              <li>Hold the on-screen buttons for repeated movement.</li>
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

      <audio
        ref={audioRef}
        src={MUSIC_SRC}
        loop
        preload="auto"
        onCanPlayThrough={() => setMusicReady(true)}
        onPlay={() => setMusicEnabled(true)}
        onPause={() => setMusicEnabled(false)}
      />

      {!musicReady ? <p className="music-note">Add your licensed track at <span>client/public/music/background.mp3</span>.</p> : null}
    </main>
  );
}
