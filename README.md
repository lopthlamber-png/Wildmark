# Wildmark online relay

Lets players on different networks (including phones on mobile data) play together with a 6-letter room code.
The host's device still runs the world; the relay only forwards packets.

## Run it
    cd relay
    npm install
    npm start            # listens on $PORT (default 8080)

## Put it online (any one of these)
- **Render / Railway / Fly.io**: create a Node web service from this folder (build `npm install`, start `npm start`).
  Use the `wss://your-app.onrender.com` address it gives you. Free tiers sleep when idle, so the first connect can take ~30 s.
- **Your own server**: run it with `node relay_server.js` behind a TLS proxy (Caddy / nginx) to get `wss://`.

## In the game
- Host: open a world, "Host on LAN", tick **Play online**, paste the server address. The pause menu shows the room code.
- Friends: Multiplayer, enter the same server address and the room code, press **Join online**.
