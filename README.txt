# Online Inventory & Documents System

## Quick start (local)
- Open two terminals:
  - Client: open `client` folder (static files) with Live Server OR serve via Express (server serves client)
  - Server:
    ```
    cd server
    npm install
    cp .env.example .env
    # edit .env for MONGO_URI and SECURITY_CODE if needed
    npm run dev
    ```
- Visit http://localhost:5000/

## Render notes
- Root build: set service root to `server`
- Start command: `npm start`
- Ensure `node` engine >=18 in package.json
- If using Mongo, set `MONGO_URI` in Render environment.
- Set `SECURITY_CODE` in Render environment variable (same as your register form).

