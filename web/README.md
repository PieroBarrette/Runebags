# RuneBags Local Run

Do not open index.html directly with file://.

This project uses ES modules and WebSocket online sync, which require a local HTTP server.

## Quick start on Windows

1. Double-click run-local.bat
2. Or right-click run-local.ps1 and run with PowerShell

The game opens at:

http://127.0.0.1:8080

## Manual start

From the repository root (`Runebags`), run:

npm install
npm run start:server

Then open:

http://127.0.0.1:8080

## Notes

- The server now hosts the web app and the online WebSocket endpoint on the same port.
- Open two browser windows with the same room link to test online mode.

## Deploy Frontend on GitHub Pages + Backend on Render

1. Push this repository to GitHub.
2. In [web/index.html](web/index.html), set the online backend URL:

window.RUNEBAGS_ONLINE_SERVER = "https://YOUR-RENDER-SERVICE.onrender.com";

3. Commit and push that change.

### GitHub Pages frontend

1. On GitHub, open your repository.
2. Go to Settings -> Pages.
3. In Build and deployment, set Source to Deploy from a branch.
4. Select branch main (or your deploy branch).
5. Select folder /web.
6. Click Save.
7. Wait for Pages deployment to finish.
8. Open the published URL shown in Pages settings.

### Render backend

1. Sign in to Render.
2. Click New + -> Web Service.
3. Connect your GitHub repository.
4. Configure service:
	- Root Directory: (leave empty)
	- Build Command: npm install
	- Start Command: npm run start:server
	- Runtime: Node
5. Create the service and wait for deployment.
6. Confirm the service URL is reachable (for example https://YOUR-RENDER-SERVICE.onrender.com).
7. Make sure [web/index.html](web/index.html) uses that exact HTTPS URL in RUNEBAGS_ONLINE_SERVER.

### Final verification

1. Open your GitHub Pages game URL in Browser A.
2. Open the same URL in Browser B (or another device).
3. Create room in A, open room link in B.
4. Set both players ready and start match.
5. Confirm both boards stay synchronized for round and shop actions.
