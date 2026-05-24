# Real-Time Multiplayer Grid Arena

## Project Structure

```text
Bubble-Sort/
├── render.yaml
├── client/
│   ├── index.html
│   ├── package.json
│   ├── vercel.json
│   ├── vite.config.js
│   └── src/
│       ├── App.jsx
│       ├── components/
│       │   └── GameCanvas.jsx
│       ├── main.jsx
│       └── styles.css
└── server/
    ├── gameState.js
    ├── index.js
    ├── package.json
    └── .env.example
```

## Environment Variables

### Server (`server/.env`)

```bash
PORT=4000
CLIENT_ORIGIN=http://localhost:5173
GRID_WIDTH=24
GRID_HEIGHT=18
TICK_RATE=30
POWER_UP_SPAWN_INTERVAL_TICKS=45
MAX_POWER_UPS=8
OBSTACLE_COUNT=28
```

### Client (`client/.env`)

```bash
VITE_SERVER_URL=http://localhost:4000
```

## Run Flow

1. Install dependencies in `server/` and `client/`.
2. Start the backend server first.
3. Start the Vite client.
4. Deploy the client to Vercel and point `VITE_SERVER_URL` at the hosted backend URL.

## Deployment Notes

### Render backend

1. Create a new Render Web Service from this repo and point it at the `server` directory.
2. Use the included `render.yaml` blueprint or configure these settings manually.
3. Set `CLIENT_ORIGIN` to your production Vercel URL, for example `https://grid-arena.vercel.app`.
4. Leave `PORT` unset in Render so the platform can inject it automatically.

### Vercel frontend

1. Create a new Vercel project from the `client` directory.
2. Set `VITE_SERVER_URL` to your Render backend URL, for example `https://grid-arena-server.onrender.com`.
3. The included `client/vercel.json` keeps client-side routing working if you add routes later.

### CORS

- Express and Socket.io both read `CLIENT_ORIGIN` from the environment.
- You can provide a comma-separated allow list if you want local development plus production, for example `http://localhost:5173,https://grid-arena.vercel.app`.
