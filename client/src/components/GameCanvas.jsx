import { useEffect, useRef, useState } from "react";

const THEME = {
  skyTop: "#08111f",
  skyBottom: "#020617",
  floorTop: "#1a2b45",
  floorLeft: "#122033",
  floorRight: "#0d1727",
  wallTop: "#2a3f5d",
  wallLeft: "#1a2b45",
  wallRight: "#111f33",
  trapGlow: "#f97316",
  shieldGlow: "#67e8f9",
  scoreGlow: "#facc15",
  gridLine: "rgba(148, 163, 184, 0.12)",
  localRing: "rgba(255, 255, 255, 0.35)",
  shadow: "rgba(2, 6, 23, 0.4)",
};

const DIRECTION_VECTORS = {
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
};

const DIRECTION_ANGLES = {
  up: -Math.PI / 2,
  right: 0,
  down: Math.PI / 2,
  left: Math.PI,
};

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function easeInOut(value) {
  return value * value * (3 - 2 * value);
}

function lerp(start, end, progress) {
  return start + (end - start) * progress;
}

function normalizeAngle(angle) {
  return Math.atan2(Math.sin(angle), Math.cos(angle));
}

function lerpAngle(start, end, progress) {
  const delta = normalizeAngle(end - start);
  return normalizeAngle(start + delta * progress);
}

function directionToAngle(direction) {
  return DIRECTION_ANGLES[direction] ?? DIRECTION_ANGLES.up;
}

function indexById(items) {
  return new Map(items.map((item) => [item.id, item]));
}

function drawPolygon(context, points) {
  context.beginPath();
  context.moveTo(points[0].x, points[0].y);
  for (let index = 1; index < points.length; index += 1) {
    context.lineTo(points[index].x, points[index].y);
  }
  context.closePath();
}

function getCameraAxes(cameraAngle) {
  const forward = {
    x: Math.cos(cameraAngle),
    y: Math.sin(cameraAngle),
  };

  return {
    forward,
    right: {
      x: -forward.y,
      y: forward.x,
    },
  };
}

function getCameraCoordinates(worldX, worldY, focusX, focusY, cameraAngle) {
  const axes = getCameraAxes(cameraAngle);
  const deltaX = worldX - focusX;
  const deltaY = worldY - focusY;

  return {
    side: deltaX * axes.right.x + deltaY * axes.right.y,
    forward: deltaX * axes.forward.x + deltaY * axes.forward.y,
  };
}

function makeChaseProject(tileWidth, tileHeight, originX, originY, focusX, focusY, cameraAngle) {
  return function project(worldX, worldY, elevation = 0) {
    const camera = getCameraCoordinates(worldX, worldY, focusX, focusY, cameraAngle);
    const distanceScale = clamp(1 - camera.forward * 0.018, 0.72, 1.12);

    return {
      x: originX + camera.side * tileWidth * 0.72 * distanceScale,
      y: originY - camera.forward * tileHeight * 1.08 + Math.abs(camera.side) * tileHeight * 0.12 - elevation,
    };
  };
}

function createInterpolatedState(previousState, nextState, progress) {
  if (!previousState || !nextState) {
    return nextState;
  }

  const easedProgress = easeInOut(clamp(progress, 0, 1));
  const previousPlayers = indexById(previousState.players ?? []);
  const players = (nextState.players ?? []).map((nextPlayer) => {
    const previousPlayer = previousPlayers.get(nextPlayer.id);

    if (!previousPlayer || previousPlayer.alive !== nextPlayer.alive) {
      return nextPlayer;
    }

    const distance = Math.hypot(nextPlayer.x - previousPlayer.x, nextPlayer.y - previousPlayer.y);
    if (distance > 2) {
      return nextPlayer;
    }

    return {
      ...nextPlayer,
      x: lerp(previousPlayer.x, nextPlayer.x, easedProgress),
      y: lerp(previousPlayer.y, nextPlayer.y, easedProgress),
    };
  });

  const previousCamera = previousState.camera;
  const nextCamera = nextState.camera;
  const interpolateCamera = previousCamera && nextCamera && Math.hypot(nextCamera.x - previousCamera.x, nextCamera.y - previousCamera.y) <= 2;

  return {
    ...nextState,
    camera: interpolateCamera
      ? {
          ...nextCamera,
          x: lerp(previousCamera.x, nextCamera.x, easedProgress),
          y: lerp(previousCamera.y, nextCamera.y, easedProgress),
        }
      : nextCamera,
    players,
  };
}

function drawDiamond(context, points, fillStyle, strokeStyle = null, lineWidth = 1) {
  drawPolygon(context, points);
  context.fillStyle = fillStyle;
  context.fill();

  if (strokeStyle) {
    context.strokeStyle = strokeStyle;
    context.lineWidth = lineWidth;
    context.stroke();
  }
}

function drawWall(context, project, tileX, tileY, tileWidth, tileHeight, height) {
  const baseNorthWest = project(tileX, tileY, 0);
  const baseNorthEast = project(tileX + 1, tileY, 0);
  const baseSouthEast = project(tileX + 1, tileY + 1, 0);
  const baseSouthWest = project(tileX, tileY + 1, 0);
  const topNorthWest = project(tileX, tileY, height);
  const topNorthEast = project(tileX + 1, tileY, height);
  const topSouthEast = project(tileX + 1, tileY + 1, height);
  const topSouthWest = project(tileX, tileY + 1, height);

  const shadowCenter = project(tileX + 0.5, tileY + 0.5, 0);
  context.save();
  context.globalAlpha = 0.28;
  context.fillStyle = THEME.shadow;
  context.beginPath();
  context.ellipse(shadowCenter.x, shadowCenter.y + tileHeight * 0.24, tileWidth * 0.34, tileHeight * 0.34, 0, 0, Math.PI * 2);
  context.fill();
  context.restore();

  drawDiamond(context, [topSouthWest, topSouthEast, baseSouthEast, baseSouthWest], THEME.wallLeft, "rgba(2, 6, 23, 0.32)", 1);
  drawDiamond(context, [topNorthEast, topSouthEast, baseSouthEast, baseNorthEast], THEME.wallRight, "rgba(2, 6, 23, 0.32)", 1);
  drawDiamond(context, [topNorthWest, topNorthEast, topSouthEast, topSouthWest], THEME.wallTop, "rgba(255, 255, 255, 0.16)", 1.2);
}

function drawFloorTile(context, project, tileX, tileY, tileWidth, tileHeight, highlight = 0) {
  const top = project(tileX, tileY, 0);
  const points = [
    { x: top.x, y: top.y },
    { x: top.x + tileWidth / 2, y: top.y + tileHeight / 2 },
    { x: top.x, y: top.y + tileHeight },
    { x: top.x - tileWidth / 2, y: top.y + tileHeight / 2 },
  ];

  const alpha = 0.06 + highlight * 0.14;
  drawDiamond(context, points, `rgba(17, 24, 39, ${alpha})`, THEME.gridLine, 1);
}

function drawPlayer(context, project, player, tileWidth, tileHeight, isLocalPlayer, pulse) {
  const base = project(player.x + 0.5, player.y + 0.5, 0);
  const shadowPoints = [
    { x: base.x, y: base.y + tileHeight * 0.42 },
    { x: base.x + tileWidth * 0.18, y: base.y + tileHeight * 0.5 },
    { x: base.x, y: base.y + tileHeight * 0.58 },
    { x: base.x - tileWidth * 0.18, y: base.y + tileHeight * 0.5 },
  ];

  drawDiamond(context, shadowPoints, THEME.shadow);

  const bob = Math.sin(pulse * Math.PI * 2) * 4;
  const bodyTop = base.y - tileHeight * 0.62 + bob;
  const bodyHeight = tileHeight * 0.9;
  const bodyWidth = tileWidth * 0.38;
  const bodyLeft = base.x - bodyWidth / 2;
  const bodyRight = base.x + bodyWidth / 2;
  const topPoint = { x: base.x, y: bodyTop };
  const midLeft = { x: bodyLeft - tileWidth * 0.12, y: bodyTop + bodyHeight * 0.38 };
  const midRight = { x: bodyRight + tileWidth * 0.12, y: bodyTop + bodyHeight * 0.38 };
  const bottomLeft = { x: bodyLeft, y: bodyTop + bodyHeight };
  const bottomRight = { x: bodyRight, y: bodyTop + bodyHeight };

  drawPolygon(context, [topPoint, midRight, bottomRight, bottomLeft, midLeft]);
  const gradient = context.createLinearGradient(base.x, bodyTop, base.x, bodyTop + bodyHeight);
  gradient.addColorStop(0, player.color);
  gradient.addColorStop(1, "rgba(255,255,255,0.85)");
  context.fillStyle = gradient;
  context.fill();

  context.strokeStyle = isLocalPlayer ? THEME.localRing : "rgba(0,0,0,0.22)";
  context.lineWidth = isLocalPlayer ? 3 : 1;
  context.stroke();

  context.fillStyle = "rgba(255,255,255,0.95)";
  context.font = `${Math.max(11, Math.floor(tileWidth * 0.18))}px Inter, sans-serif`;
  context.textAlign = "center";
  context.fillText(player.name, base.x, bodyTop - 8);
}

function drawPowerUp(context, project, powerUp, tileWidth, tileHeight, pulse) {
  const base = project(powerUp.x + 0.5, powerUp.y + 0.5, 0);
  const isShield = powerUp.type === "shield" || powerUp.type === "score";
  const glowColor = isShield ? THEME.shieldGlow : THEME.scoreGlow;
  const coreColor = isShield ? "#bffafe" : "#fef08a";
  const sway = 0.5 + Math.sin(pulse * Math.PI * 2) * 0.12;

  context.save();
  context.shadowBlur = 18;
  context.shadowColor = glowColor;
  context.fillStyle = glowColor;
  context.beginPath();
  context.arc(base.x, base.y + tileHeight * 0.1, tileWidth * 0.12, 0, Math.PI * 2);
  context.fill();
  context.restore();

  const iconPoints = [
    { x: base.x, y: base.y - tileHeight * 0.24 },
    { x: base.x + tileWidth * 0.12, y: base.y - tileHeight * 0.06 },
    { x: base.x + tileWidth * 0.06, y: base.y + tileHeight * 0.18 },
    { x: base.x - tileWidth * 0.06, y: base.y + tileHeight * 0.18 },
    { x: base.x - tileWidth * 0.12, y: base.y - tileHeight * 0.06 },
  ];

  drawPolygon(context, iconPoints);
  const gradient = context.createRadialGradient(base.x, base.y - tileHeight * 0.05, 2, base.x, base.y, tileWidth * 0.18);
  gradient.addColorStop(0, coreColor);
  gradient.addColorStop(1, glowColor);
  context.fillStyle = gradient;
  context.fill();
  context.strokeStyle = "rgba(255,255,255,0.45)";
  context.lineWidth = 1.2;
  context.stroke();
}

function drawTrap(context, project, trap, tileWidth, tileHeight) {
  const base = project(trap.x + 0.5, trap.y + 0.5, 0);
  const points = [
    { x: base.x, y: base.y - tileHeight * 0.16 },
    { x: base.x + tileWidth * 0.16, y: base.y },
    { x: base.x, y: base.y + tileHeight * 0.16 },
    { x: base.x - tileWidth * 0.16, y: base.y },
  ];

  drawPolygon(context, points);
  context.fillStyle = "#fb923c";
  context.fill();
  context.strokeStyle = "rgba(255,255,255,0.4)";
  context.lineWidth = 1;
  context.stroke();
}

export default function GameCanvas({ gameState, playerId, onMoveIntent, onTrapIntent }) {
  const wrapperRef = useRef(null);
  const canvasRef = useRef(null);
  const touchStartRef = useRef(null);
  const animationRef = useRef({
    frameId: 0,
    previousState: null,
    nextState: null,
    startedAt: 0,
    durationMs: 1000 / 30,
  });
  const cameraPovRef = useRef({
    angle: DIRECTION_ANGLES.up,
    lastFrameAt: 0,
  });
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
    const swipeThreshold = 22;
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
    if (!gameState) {
      return;
    }

    const now = performance.now();
    const transition = animationRef.current;
    const tickRate = gameState.config?.tickRate || 30;
    const tickDurationMs = 1000 / tickRate;
    const currentProgress = transition.durationMs ? (now - transition.startedAt) / transition.durationMs : 1;

    transition.previousState = createInterpolatedState(
      transition.previousState,
      transition.nextState,
      currentProgress,
    ) ?? gameState;
    transition.nextState = gameState;
    transition.startedAt = now;
    transition.durationMs = tickDurationMs;
  }, [gameState]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return undefined;
    }

    const context = canvas.getContext("2d");
    if (!context) {
      return undefined;
    }

    function renderFrame(now) {
      const transition = animationRef.current;
      const displayState = createInterpolatedState(
        transition.previousState,
        transition.nextState,
        transition.durationMs ? (now - transition.startedAt) / transition.durationMs : 1,
      );

      if (!displayState) {
        transition.frameId = window.requestAnimationFrame(renderFrame);
        return;
      }

      const arenaWidth = displayState.config.width;
      const arenaHeight = displayState.config.height;
      const localPlayer = displayState.players.find((player) => player.id === playerId) ?? displayState.players[0] ?? null;
      const viewportRadius = displayState.config.viewportRadiusTiles ?? 7;
      const viewportDiameter = viewportRadius * 2 + 1;
      const tileWidth = 60;
      const tileHeight = 30;
      const availableWidth = Math.max(containerWidth || viewportDiameter * tileWidth, 320);
      const scale = clamp(availableWidth / (viewportDiameter * tileWidth), 0.72, 1.2);
      const scaledTileWidth = tileWidth * scale;
      const scaledTileHeight = tileHeight * scale;
      const canvasWidth = viewportDiameter * scaledTileWidth + scaledTileWidth;
      const canvasHeight = viewportDiameter * scaledTileHeight + 260;
      const devicePixelRatio = window.devicePixelRatio || 1;
      const playerDirection = localPlayer?.direction ?? "up";
      const targetCameraAngle = directionToAngle(playerDirection);
      const cameraPov = cameraPovRef.current;
      const deltaSeconds = cameraPov.lastFrameAt ? Math.min((now - cameraPov.lastFrameAt) / 1000, 0.08) : 0;
      const turnProgress = 1 - Math.exp(-deltaSeconds * 8.5);

      cameraPov.angle = lerpAngle(cameraPov.angle, targetCameraAngle, turnProgress);
      cameraPov.lastFrameAt = now;

      const directionVector = {
        x: Math.cos(cameraPov.angle),
        y: Math.sin(cameraPov.angle),
      };
      const lookAheadTiles = clamp(viewportRadius * 0.58, 4, 5.8);
      const playerCenterX = localPlayer ? localPlayer.x + 0.5 : displayState.camera?.x ?? Math.floor(arenaWidth / 2);
      const playerCenterY = localPlayer ? localPlayer.y + 0.5 : displayState.camera?.y ?? Math.floor(arenaHeight / 2);
      const cameraX = playerCenterX + directionVector.x * lookAheadTiles;
      const cameraY = playerCenterY + directionVector.y * lookAheadTiles;
      const cullRadius = viewportRadius + Math.ceil(lookAheadTiles) + 2;
      const cameraMinX = Math.floor(cameraX - cullRadius);
      const cameraMaxX = Math.ceil(cameraX + cullRadius);
      const cameraMinY = Math.floor(cameraY - cullRadius);
      const cameraMaxY = Math.ceil(cameraY + cullRadius);
      const originX = canvasWidth / 2;
      const originY = canvasHeight * 0.74;
      const project = makeChaseProject(
        scaledTileWidth,
        scaledTileHeight,
        originX,
        originY,
        playerCenterX,
        playerCenterY,
        cameraPov.angle,
      );
      const pulse = (displayState.tick + now / 1000) / 30;

      canvas.width = canvasWidth * devicePixelRatio;
      canvas.height = canvasHeight * devicePixelRatio;
      canvas.style.width = `${canvasWidth}px`;
      canvas.style.height = `${canvasHeight}px`;

      context.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
      context.clearRect(0, 0, canvasWidth, canvasHeight);

      const backgroundGradient = context.createLinearGradient(0, 0, 0, canvasHeight);
      backgroundGradient.addColorStop(0, THEME.skyTop);
      backgroundGradient.addColorStop(1, THEME.skyBottom);
      context.fillStyle = backgroundGradient;
      context.fillRect(0, 0, canvasWidth, canvasHeight);

      const horizonGlow = context.createRadialGradient(originX, originY * 0.5, 12, originX, originY * 0.5, canvasWidth * 0.8);
      horizonGlow.addColorStop(0, "rgba(103, 232, 249, 0.14)");
      horizonGlow.addColorStop(1, "rgba(8, 17, 31, 0)");
      context.fillStyle = horizonGlow;
      context.fillRect(0, 0, canvasWidth, canvasHeight);

      const floorTiles = [];
      for (let y = cameraMinY; y <= cameraMaxY; y += 1) {
        for (let x = cameraMinX; x <= cameraMaxX; x += 1) {
          if (x < 0 || y < 0 || x >= arenaWidth || y >= arenaHeight) {
            continue;
          }

          const tileCamera = getCameraCoordinates(x + 0.5, y + 0.5, playerCenterX, playerCenterY, cameraPov.angle);
          floorTiles.push({ x, y, depth: tileCamera.forward - Math.abs(tileCamera.side) * 0.04 });
        }
      }

      floorTiles.sort((left, right) => right.depth - left.depth);

      for (const tile of floorTiles) {
        const screen = project(tile.x, tile.y, 0);
        const highlight = localPlayer && tile.x === Math.floor(localPlayer.x) && tile.y === Math.floor(localPlayer.y) ? 1 : 0;
        drawFloorTile(context, project, tile.x, tile.y, scaledTileWidth, scaledTileHeight, highlight);
      }

      for (const obstacle of displayState.obstacles) {
        if (obstacle.x < cameraMinX || obstacle.x > cameraMaxX || obstacle.y < cameraMinY || obstacle.y > cameraMaxY) {
          continue;
        }

        drawWall(context, project, obstacle.x, obstacle.y, scaledTileWidth, scaledTileHeight, scaledTileHeight * 1.05);
      }

      const sortedTraps = [...displayState.traps].sort((left, right) => {
        const leftCamera = getCameraCoordinates(left.x + 0.5, left.y + 0.5, playerCenterX, playerCenterY, cameraPov.angle);
        const rightCamera = getCameraCoordinates(right.x + 0.5, right.y + 0.5, playerCenterX, playerCenterY, cameraPov.angle);
        return rightCamera.forward - leftCamera.forward;
      });
      for (const trap of sortedTraps) {
        if (trap.x < cameraMinX || trap.x > cameraMaxX || trap.y < cameraMinY || trap.y > cameraMaxY) {
          continue;
        }

        drawTrap(context, project, trap, scaledTileWidth, scaledTileHeight);
      }

      for (const powerUp of displayState.powerUps) {
        if (powerUp.x < cameraMinX || powerUp.x > cameraMaxX || powerUp.y < cameraMinY || powerUp.y > cameraMaxY) {
          continue;
        }

        drawPowerUp(context, project, powerUp, scaledTileWidth, scaledTileHeight, pulse);
      }

      const sortedPlayers = [...displayState.players]
        .filter((player) => player.alive)
        .sort((left, right) => {
          const leftCamera = getCameraCoordinates(left.x + 0.5, left.y + 0.5, playerCenterX, playerCenterY, cameraPov.angle);
          const rightCamera = getCameraCoordinates(right.x + 0.5, right.y + 0.5, playerCenterX, playerCenterY, cameraPov.angle);
          return rightCamera.forward - leftCamera.forward;
        });

      for (const player of sortedPlayers) {
        if (player.x < cameraMinX || player.x > cameraMaxX || player.y < cameraMinY || player.y > cameraMaxY) {
          continue;
        }

        drawPlayer(context, project, player, scaledTileWidth, scaledTileHeight, player.id === playerId, pulse + player.x * 0.02 + player.y * 0.03);
      }

      context.fillStyle = "rgba(5, 10, 20, 0.72)";
      context.fillRect(0, canvasHeight - 54, canvasWidth, 54);
      context.fillStyle = "#e2e8f0";
      context.font = "14px Inter, sans-serif";
      context.textAlign = "left";
      context.fillText(`Tick ${displayState.tick} | Chase camera ${playerDirection}`, 16, canvasHeight - 28);
      context.fillStyle = "rgba(148, 163, 184, 0.92)";
      context.font = "12px Inter, sans-serif";
      context.fillText(
        `Behind-player POV | Relevance radius ${displayState.config.networkRadiusTiles ?? 10} | Smooth interpolation enabled`,
        16,
        canvasHeight - 10,
      );

      transition.frameId = window.requestAnimationFrame(renderFrame);
    }

    animationRef.current.frameId = window.requestAnimationFrame(renderFrame);

    return () => {
      window.cancelAnimationFrame(animationRef.current.frameId);
    };
  }, [playerId, containerWidth]);

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
