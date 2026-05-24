const DEFAULT_CONFIG = {
  width: 24,
  height: 18,
  tickRate: 30,
  moveCooldownTicks: 3,
  respawnDelayTicks: 75,
  powerUpSpawnIntervalTicks: 45,
  powerUpLifetimeTicks: 240,
  maxPowerUps: 8,
  obstacleCount: 28,
  trapLifetimeTicks: 180,
  automataSteps: 5,
  wallFillChance: 0.44,
  viewportRadiusTiles: 7,
  networkRadiusTiles: 10,
};

const DIRECTION_VECTORS = {
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
};

const POWER_UP_TYPES = ["score", "trap"];
const PLAYER_COLORS = [
  "#7dd3fc",
  "#f9a8d4",
  "#86efac",
  "#fdba74",
  "#c4b5fd",
  "#fca5a5",
  "#fde68a",
  "#67e8f9",
];

function createKey(x, y) {
  return `${x}:${y}`;
}

function randomInt(max) {
  return Math.floor(Math.random() * max);
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function pickFromPalette(seed) {
  const numericSeed = Array.from(String(seed)).reduce((sum, char) => sum + char.charCodeAt(0), 0);
  return PLAYER_COLORS[numericSeed % PLAYER_COLORS.length];
}

function createEmptyGrid(config) {
  return Array.from({ length: config.height }, () => Array.from({ length: config.width }, () => 0));
}

function createInitialWallGrid(config) {
  const grid = createEmptyGrid(config);

  for (let y = 0; y < config.height; y += 1) {
    for (let x = 0; x < config.width; x += 1) {
      if (x === 0 || y === 0 || x === config.width - 1 || y === config.height - 1) {
        grid[y][x] = 1;
        continue;
      }

      grid[y][x] = Math.random() < config.wallFillChance ? 1 : 0;
    }
  }

  return grid;
}

function countWallNeighbors(grid, x, y) {
  let wallCount = 0;

  for (let offsetY = -1; offsetY <= 1; offsetY += 1) {
    for (let offsetX = -1; offsetX <= 1; offsetX += 1) {
      if (offsetX === 0 && offsetY === 0) {
        continue;
      }

      const neighborX = x + offsetX;
      const neighborY = y + offsetY;

      if (neighborX < 0 || neighborY < 0 || neighborX >= grid[0].length || neighborY >= grid.length) {
        wallCount += 1;
        continue;
      }

      wallCount += grid[neighborY][neighborX] === 1 ? 1 : 0;
    }
  }

  return wallCount;
}

function stepCellularAutomata(grid, config) {
  const nextGrid = createEmptyGrid(config);

  for (let y = 0; y < config.height; y += 1) {
    for (let x = 0; x < config.width; x += 1) {
      if (x === 0 || y === 0 || x === config.width - 1 || y === config.height - 1) {
        nextGrid[y][x] = 1;
        continue;
      }

      const wallNeighbors = countWallNeighbors(grid, x, y);
      const isWall = grid[y][x] === 1;
      nextGrid[y][x] = isWall ? (wallNeighbors >= 4 ? 1 : 0) : (wallNeighbors >= 5 ? 1 : 0);
    }
  }

  return nextGrid;
}

function clearSpawnArea(grid, centerX, centerY, radius) {
  for (let y = centerY - radius; y <= centerY + radius; y += 1) {
    for (let x = centerX - radius; x <= centerX + radius; x += 1) {
      if (y < 0 || x < 0 || y >= grid.length || x >= grid[0].length) {
        continue;
      }

      grid[y][x] = 0;
    }
  }
}

function gridToObstacles(grid) {
  const obstacles = [];

  for (let y = 0; y < grid.length; y += 1) {
    for (let x = 0; x < grid[y].length; x += 1) {
      if (grid[y][x] === 1) {
        obstacles.push({ x, y });
      }
    }
  }

  return obstacles;
}

function generateCellularAutomataObstacles(config) {
  let grid = createInitialWallGrid(config);

  for (let step = 0; step < config.automataSteps; step += 1) {
    grid = stepCellularAutomata(grid, config);
  }

  clearSpawnArea(grid, Math.floor(config.width / 2), Math.floor(config.height / 2), 2);
  clearSpawnArea(grid, 2, 2, 1);
  clearSpawnArea(grid, config.width - 3, 2, 1);
  clearSpawnArea(grid, 2, config.height - 3, 1);
  clearSpawnArea(grid, config.width - 3, config.height - 3, 1);

  return gridToObstacles(grid);
}

export function createGameState(overrides = {}) {
  const config = {
    ...DEFAULT_CONFIG,
    ...overrides,
  };

  const obstacles = generateCellularAutomataObstacles(config);

  return {
    tick: 0,
    config,
    obstacles,
    players: {},
    powerUps: [],
    traps: [],
    nextPowerUpId: 1,
    nextTrapId: 1,
  };
}

function buildOccupancySet(state, options = {}) {
  const {
    includePlayers = true,
    includePowerUps = true,
    includeTraps = true,
    ignorePlayerId = null,
  } = options;

  const occupied = new Set(state.obstacles.map((obstacle) => createKey(obstacle.x, obstacle.y)));

  if (includePowerUps) {
    for (const powerUp of state.powerUps) {
      occupied.add(createKey(powerUp.x, powerUp.y));
    }
  }

  if (includeTraps) {
    for (const trap of state.traps) {
      occupied.add(createKey(trap.x, trap.y));
    }
  }

  if (includePlayers) {
    for (const player of Object.values(state.players)) {
      if (player.id === ignorePlayerId) {
        continue;
      }
      occupied.add(createKey(player.x, player.y));
    }
  }

  return occupied;
}

function isWithinArena(state, x, y) {
  return x >= 0 && y >= 0 && x < state.config.width && y < state.config.height;
}

function getRandomEmptyTile(state, options = {}) {
  const occupied = buildOccupancySet(state, options);
  const attempts = Math.max(50, state.config.width * state.config.height);

  for (let index = 0; index < attempts; index += 1) {
    const x = randomInt(state.config.width);
    const y = randomInt(state.config.height);

    if (!occupied.has(createKey(x, y))) {
      return { x, y };
    }
  }

  return null;
}

function spawnPowerUp(state) {
  if (state.powerUps.length >= state.config.maxPowerUps) {
    return;
  }

  const tile = getRandomEmptyTile(state);
  if (!tile) {
    return;
  }

  const type = POWER_UP_TYPES[randomInt(POWER_UP_TYPES.length)];

  state.powerUps.push({
    id: state.nextPowerUpId++,
    x: tile.x,
    y: tile.y,
    type,
    expiresAtTick: state.tick + state.config.powerUpLifetimeTicks,
  });
}

function removeCollectedPowerUps(state, player) {
  const collected = [];
  state.powerUps = state.powerUps.filter((powerUp) => {
    const matches = powerUp.x === player.x && powerUp.y === player.y;
    if (matches) {
      collected.push(powerUp);
    }
    return !matches;
  });

  for (const powerUp of collected) {
    if (powerUp.type === "score") {
      player.score += 1;
    }

    if (powerUp.type === "trap") {
      player.trapCharges += 1;
    }
  }
}

function triggerTrapIfPresent(state, player) {
  const trapIndex = state.traps.findIndex((trap) => trap.x === player.x && trap.y === player.y);
  if (trapIndex === -1) {
    return;
  }

  const trap = state.traps[trapIndex];
  state.traps.splice(trapIndex, 1);

  if (trap.ownerId && state.players[trap.ownerId]) {
    state.players[trap.ownerId].score += 2;
  }

  player.score = Math.max(0, player.score - 1);
  player.alive = false;
  player.respawnTicks = state.config.respawnDelayTicks;
}

function placeTrap(state, player) {
  if (player.trapCharges <= 0) {
    return;
  }

  const occupiedByTrap = state.traps.some((trap) => trap.x === player.x && trap.y === player.y);
  if (occupiedByTrap) {
    return;
  }

  state.traps.push({
    id: state.nextTrapId++,
    ownerId: player.id,
    x: player.x,
    y: player.y,
    expiresAtTick: state.tick + state.config.trapLifetimeTicks,
  });

  player.trapCharges -= 1;
}

function respawnPlayer(state, player) {
  const spawn = getRandomEmptyTile(state, {
    includePlayers: true,
    ignorePlayerId: player.id,
    includePowerUps: true,
    includeTraps: true,
  });

  if (!spawn) {
    player.alive = true;
    player.respawnTicks = 0;
    return;
  }

  player.x = spawn.x;
  player.y = spawn.y;
  player.direction = "right";
  player.pendingDirection = "right";
  player.cooldownTicks = 0;
  player.blockedTicks = 0;
  player.alive = true;
  player.respawnTicks = 0;
}

function movePlayer(state, player) {
  if (!player.alive) {
    if (player.respawnTicks > 0) {
      player.respawnTicks -= 1;
      if (player.respawnTicks === 0) {
        respawnPlayer(state, player);
      }
    }

    return;
  }

  if (player.stunTicks > 0) {
    player.stunTicks -= 1;
    return;
  }

  if (player.cooldownTicks > 0) {
    player.cooldownTicks -= 1;
    return;
  }

  const direction = DIRECTION_VECTORS[player.pendingDirection] ? player.pendingDirection : player.direction;
  const vector = DIRECTION_VECTORS[direction];
  const nextX = player.x + vector.x;
  const nextY = player.y + vector.y;

  const blockedByBoundary = !isWithinArena(state, nextX, nextY);
  const blockedByObstacle = state.obstacles.some((obstacle) => obstacle.x === nextX && obstacle.y === nextY);
  const blockedByPlayer = Object.values(state.players).some((otherPlayer) => {
    if (otherPlayer.id === player.id || !otherPlayer.alive) {
      return false;
    }

    return otherPlayer.x === nextX && otherPlayer.y === nextY;
  });

  if (blockedByBoundary || blockedByObstacle || blockedByPlayer) {
    player.blockedTicks = (player.blockedTicks || 0) + 1;
    player.cooldownTicks = 1;

    if (player.blockedTicks >= 3) {
      player.stunTicks = 2;
      player.blockedTicks = 0;
    }

    return;
  }

  player.blockedTicks = 0;
  player.direction = direction;
  player.x = nextX;
  player.y = nextY;
  player.cooldownTicks = state.config.moveCooldownTicks;

  removeCollectedPowerUps(state, player);
  triggerTrapIfPresent(state, player);

  if (player.pendingTrap) {
    placeTrap(state, player);
  }

  player.pendingTrap = false;
}

function purgeExpiredEntities(state) {
  state.powerUps = state.powerUps.filter((powerUp) => powerUp.expiresAtTick > state.tick);
  state.traps = state.traps.filter((trap) => trap.expiresAtTick > state.tick);
}

export function addPlayer(state, playerInfo) {
  const spawn = getRandomEmptyTile(state, {
    includePlayers: true,
    includePowerUps: true,
    includeTraps: true,
  });

  const id = playerInfo.id;
  const color = playerInfo.color ?? pickFromPalette(id);
  const playerCount = Object.keys(state.players).length + 1;

  state.players[id] = {
    id,
    name: playerInfo.name ?? `Player ${playerCount}`,
    color,
    x: spawn?.x ?? 0,
    y: spawn?.y ?? 0,
    direction: "right",
    pendingDirection: "right",
    score: 0,
    trapCharges: 0,
    cooldownTicks: 0,
    blockedTicks: 0,
    stunTicks: 0,
    respawnTicks: 0,
    alive: true,
    pendingTrap: false,
  };

  return state.players[id];
}

export function removePlayer(state, playerId) {
  delete state.players[playerId];
}

export function queueMoveIntent(state, playerId, direction) {
  const player = state.players[playerId];
  if (!player || !DIRECTION_VECTORS[direction]) {
    return;
  }

  player.pendingDirection = direction;
}

export function queueTrapIntent(state, playerId) {
  const player = state.players[playerId];
  if (!player) {
    return;
  }

  player.pendingTrap = true;
}

export function advanceGameState(state) {
  state.tick += 1;
  purgeExpiredEntities(state);

  if (state.tick % state.config.powerUpSpawnIntervalTicks === 0) {
    spawnPowerUp(state);
  }

  for (const player of Object.values(state.players)) {
    movePlayer(state, player);
  }
}

function serializePlayer(player) {
  return {
    id: player.id,
    name: player.name,
    color: player.color,
    x: player.x,
    y: player.y,
    direction: player.direction,
    score: player.score,
    trapCharges: player.trapCharges,
    cooldownTicks: player.cooldownTicks,
    blockedTicks: player.blockedTicks,
    stunTicks: player.stunTicks,
    respawnTicks: player.respawnTicks,
    alive: player.alive,
  };
}

function createBounds(centerX, centerY, radius, state) {
  return {
    minX: clamp(centerX - radius, 0, state.config.width - 1),
    maxX: clamp(centerX + radius, 0, state.config.width - 1),
    minY: clamp(centerY - radius, 0, state.config.height - 1),
    maxY: clamp(centerY + radius, 0, state.config.height - 1),
  };
}

function isEntityWithinBounds(entity, bounds) {
  return entity.x >= bounds.minX && entity.x <= bounds.maxX && entity.y >= bounds.minY && entity.y <= bounds.maxY;
}

function filterEntitiesByBounds(entities, bounds) {
  return entities.filter((entity) => isEntityWithinBounds(entity, bounds));
}

export function getScopedState(state, viewerId) {
  const viewer = state.players[viewerId];

  if (!viewer) {
    return getPublicState(state);
  }

  const relevanceRadius = state.config.networkRadiusTiles;
  const viewportRadius = state.config.viewportRadiusTiles;
  const bounds = createBounds(viewer.x, viewer.y, relevanceRadius, state);

  return {
    tick: state.tick,
    config: {
      ...state.config,
      relevanceRadiusTiles: relevanceRadius,
      viewportRadiusTiles: viewportRadius,
    },
    camera: {
      x: viewer.x,
      y: viewer.y,
      viewportRadiusTiles: viewportRadius,
      relevanceRadiusTiles: relevanceRadius,
      bounds,
    },
    viewerId,
    players: filterEntitiesByBounds(Object.values(state.players).map(serializePlayer), bounds),
    obstacles: filterEntitiesByBounds(state.obstacles, bounds),
    powerUps: filterEntitiesByBounds(state.powerUps, bounds),
    traps: filterEntitiesByBounds(state.traps, bounds),
  };
}

export function getPublicState(state) {
  return {
    tick: state.tick,
    config: state.config,
    players: Object.values(state.players).map(serializePlayer),
    obstacles: state.obstacles,
    powerUps: state.powerUps,
    traps: state.traps,
  };
}
