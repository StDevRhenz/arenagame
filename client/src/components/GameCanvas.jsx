import { useEffect, useRef, useState } from "react";

const THEME = {
  background: "#050816",
  gridMajor: "rgba(148, 163, 184, 0.18)",
  gridMinor: "rgba(148, 163, 184, 0.08)",
  obstacle: "#1f2937",
  trap: "#f97316",
  scorePowerUp: "#22d3ee",
  trapPowerUp: "#fb7185",
  localGlow: "rgba(255, 255, 255, 0.24)",
};

function drawRoundedRect(context, x, y, width, height, radius) {
  context.beginPath();
  context.moveTo(x + radius, y);
  context.arcTo(x + width, y, x + width, y + height, radius);
  context.arcTo(x + width, y + height, x, y + height, radius);
  context.arcTo(x, y + height, x, y, radius);
  context.arcTo(x, y, x + width, y, radius);
  context.closePath();
}

export default function GameCanvas({ gameState, playerId, onMoveIntent, onTrapIntent }) {
  const wrapperRef = useRef(null);
  const canvasRef = useRef(null);
  const touchStartRef = useRef(null);
  const [containerWidth, setContainerWidth] = useState(0);

  useEffect(() => {
    if (!wrapperRef.current) {
      return undefined;
    }

    const observer = new ResizeObserver((entries) => {
      const nextWidth = entries[0]?.contentRect?.width ?? 0;
      setContainerWidth(nextWidth);
    });

    observer.observe(wrapperRef.current);
    return () => observer.disconnect();
  }, []);

  function resolveSwipeDirection(deltaX, deltaY) {
    if (Math.abs(deltaX) > Math.abs(deltaY)) {
      return deltaX > 0 ? "right" : "left";
    }

    return deltaY > 0 ? "down" : "up";
  }

  function handleTouchStart(event) {
    const touch = event.touches[0];
    if (!touch) {
      return;
    }

    touchStartRef.current = {
      x: touch.clientX,
      y: touch.clientY,
      startedAt: Date.now(),
    };
  }

  function handleTouchEnd(event) {
    const start = touchStartRef.current;
    touchStartRef.current = null;

    const touch = event.changedTouches[0];
    if (!start || !touch) {
      return;
    }

    const deltaX = touch.clientX - start.x;
    const deltaY = touch.clientY - start.y;
    const distance = Math.hypot(deltaX, deltaY);
    const duration = Date.now() - start.startedAt;
    const swipeThreshold = 24;
    const tapThreshold = 14;

    if (distance >= swipeThreshold) {
      onMoveIntent?.(resolveSwipeDirection(deltaX, deltaY));
      return;
    }

    if (distance <= tapThreshold && duration < 250) {
      onTrapIntent?.();
    }
  }

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !gameState) {
      return;
    }

    const context = canvas.getContext("2d");
    if (!context) {
      return;
    }

    const arenaWidth = gameState.config.width;
    const arenaHeight = gameState.config.height;
    const localPlayer = gameState.players.find((player) => player.id === playerId) ?? gameState.players[0] ?? null;
    const viewportRadius = gameState.config.viewportRadiusTiles ?? 7;
    const viewportDiameter = viewportRadius * 2 + 1;
    const fallbackWidth = viewportDiameter * 32;
    const availableWidth = Math.max(containerWidth || fallbackWidth, 320);
    const tileSize = Math.max(18, Math.floor(availableWidth / viewportDiameter));
    const canvasWidth = viewportDiameter * tileSize;
    const canvasHeight = viewportDiameter * tileSize;
    const devicePixelRatio = window.devicePixelRatio || 1;
    const cameraX = gameState.camera?.x ?? localPlayer?.x ?? Math.floor(arenaWidth / 2);
    const cameraY = gameState.camera?.y ?? localPlayer?.y ?? Math.floor(arenaHeight / 2);
    const cameraMinX = cameraX - viewportRadius;
    const cameraMinY = cameraY - viewportRadius;
    const cameraMaxX = cameraX + viewportRadius;
    const cameraMaxY = cameraY + viewportRadius;

    function toScreenPosition(worldX, worldY) {
      return {
        x: (worldX - cameraMinX) * tileSize,
        y: (worldY - cameraMinY) * tileSize,
      };
    }

    function isVisible(worldX, worldY) {
      return worldX >= cameraMinX && worldX <= cameraMaxX && worldY >= cameraMinY && worldY <= cameraMaxY;
    }

    canvas.width = canvasWidth * devicePixelRatio;
    canvas.height = canvasHeight * devicePixelRatio;
    canvas.style.width = `${canvasWidth}px`;
    canvas.style.height = `${canvasHeight}px`;

    context.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
    context.clearRect(0, 0, canvasWidth, canvasHeight);
    context.fillStyle = THEME.background;
    context.fillRect(0, 0, canvasWidth, canvasHeight);

    const pulse = 0.5 + Math.sin(gameState.tick / 6) * 0.25;

    for (let column = 0; column <= viewportDiameter; column += 1) {
      context.strokeStyle = column % 4 === 0 ? THEME.gridMajor : THEME.gridMinor;
      context.beginPath();
      context.moveTo(column * tileSize + 0.5, 0);
      context.lineTo(column * tileSize + 0.5, canvasHeight);
      context.stroke();
    }

    for (let row = 0; row <= viewportDiameter; row += 1) {
      context.strokeStyle = row % 4 === 0 ? THEME.gridMajor : THEME.gridMinor;
      context.beginPath();
      context.moveTo(0, row * tileSize + 0.5);
      context.lineTo(canvasWidth, row * tileSize + 0.5);
      context.stroke();
    }

    for (const obstacle of gameState.obstacles) {
      if (!isVisible(obstacle.x, obstacle.y)) {
        continue;
      }

      const screen = toScreenPosition(obstacle.x, obstacle.y);
      context.fillStyle = THEME.obstacle;
      drawRoundedRect(context, screen.x + 2, screen.y + 2, tileSize - 4, tileSize - 4, 6);
      context.fill();
    }

    for (const powerUp of gameState.powerUps) {
      if (!isVisible(powerUp.x, powerUp.y)) {
        continue;
      }

      const screen = toScreenPosition(powerUp.x, powerUp.y);
      const centerX = screen.x + tileSize / 2;
      const centerY = screen.y + tileSize / 2;
      const radius = tileSize * (0.24 + pulse * 0.08);

      context.beginPath();
      context.fillStyle = powerUp.type === "trap" ? THEME.trapPowerUp : THEME.scorePowerUp;
      context.arc(centerX, centerY, radius, 0, Math.PI * 2);
      context.fill();

      context.strokeStyle = "rgba(255, 255, 255, 0.18)";
      context.lineWidth = 2;
      context.stroke();
    }

    for (const trap of gameState.traps) {
      if (!isVisible(trap.x, trap.y)) {
        continue;
      }

      const screen = toScreenPosition(trap.x, trap.y);
      const offset = tileSize * 0.18;
      context.fillStyle = THEME.trap;
      context.beginPath();
      context.moveTo(screen.x + tileSize / 2, screen.y + offset);
      context.lineTo(screen.x + tileSize - offset, screen.y + tileSize / 2);
      context.lineTo(screen.x + tileSize / 2, screen.y + tileSize - offset);
      context.lineTo(screen.x + offset, screen.y + tileSize / 2);
      context.closePath();
      context.fill();
    }

    for (const player of gameState.players) {
      if (!player.alive) {
        continue;
      }

      if (!isVisible(player.x, player.y)) {
        continue;
      }

      const screen = toScreenPosition(player.x, player.y);
      const playerX = screen.x + 2;
      const playerY = screen.y + 2;
      const isLocalPlayer = player.id === playerId;

      context.fillStyle = player.color;
      drawRoundedRect(context, playerX, playerY, tileSize - 4, tileSize - 4, 8);
      context.fill();

      if (isLocalPlayer) {
        context.strokeStyle = THEME.localGlow;
        context.lineWidth = 3;
        drawRoundedRect(context, playerX - 1, playerY - 1, tileSize - 2, tileSize - 2, 8);
        context.stroke();
      }

      context.fillStyle = "rgba(255, 255, 255, 0.95)";
      context.font = `${Math.max(10, Math.floor(tileSize * 0.28))}px sans-serif`;
      context.textAlign = "center";
      context.fillText(player.name, screen.x + tileSize / 2, screen.y - 4);
    }

    context.fillStyle = "rgba(15, 23, 42, 0.88)";
    context.fillRect(0, canvasHeight - 34, canvasWidth, 34);
    context.fillStyle = "#e2e8f0";
    context.font = "13px sans-serif";
    context.textAlign = "left";
    const visiblePlayers = gameState.players.filter((player) => player.alive && isVisible(player.x, player.y)).length;
    context.fillText(
      `Tick ${gameState.tick} | Visible players ${visiblePlayers} | Relevance ${gameState.config.networkRadiusTiles ?? 10}`,
      12,
      canvasHeight - 12,
    );
  }, [gameState, playerId, containerWidth]);

  return (
    <div ref={wrapperRef} className="canvas-wrapper">
      <canvas
        ref={canvasRef}
        className="game-canvas"
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        onTouchCancel={() => {
          touchStartRef.current = null;
        }}
      />
      {!gameState ? <div className="canvas-placeholder">Waiting for the first synchronized game state...</div> : null}
    </div>
  );
}
