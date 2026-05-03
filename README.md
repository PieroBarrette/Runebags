# RuneBags

Single-tree project layout:

- Frontend app files live at repository root:
  - index.html
  - js/
  - styles/
  - assets/
- Backend WebSocket/HTTP server:
  - server/server.mjs

## Run

- Install dependencies: npm install
- Start server: npm run start:server
- Open: http://127.0.0.1:8080

## Deploy (Render + GitHub)

- Render service
  - Build Command: npm install
  - Start Command: npm run start:server

- Frontend backend URL
  - In index.html, set RUNEBAGS_ONLINE_SERVER to your Render URL if frontend is hosted separately.

## Notes

- The server now serves frontend assets directly from the root source tree (no duplicated web/ folder).
