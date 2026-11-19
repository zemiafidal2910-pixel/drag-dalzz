
export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // Health check
    if (url.pathname === "/api/health") {
      return Response.json({
        status: "online",
        game: "DRAG DALZZ",
        multiplayer: true
      });
    }

    // Multiplayer room
    if (url.pathname === "/api/room") {
      if (request.headers.get("Upgrade") !== "websocket") {
        return Response.json({
          error: "WebSocket upgrade required"
        }, { status: 426 });
      }

      const room = (url.searchParams.get("room") || "global")
        .replace(/[^a-zA-Z0-9_-]/g, "")
        .slice(0, 32);

      const id = env.ROOMS.idFromName(room);
      const stub = env.ROOMS.get(id);

      return stub.fetch(request);
    }

    // Static game files
    if (env.ASSETS) {
      return env.ASSETS.fetch(request);
    }

    return new Response("DRAG DALZZ SERVER ONLINE", {
      headers: { "Content-Type": "text/plain" }
    });
  }
};

export class RaceRoom {
  constructor(state, env) {
    this.state = state;
    this.env = env;
  }

  async fetch(request) {
    if (request.headers.get("Upgrade") !== "websocket") {
      return new Response("WebSocket required", {
        status: 426
      });
    }

    const pair = new WebSocketPair();
    const client = pair[0];
    const server = pair[1];

    this.state.acceptWebSocket(server);

    server.send(JSON.stringify({
      type: "CONNECTED",
      message: "Welcome to DRAG DALZZ",
      players: this.state.getWebSockets().length
    }));

    this.broadcast({
      type: "PLAYER_JOINED",
      players: this.state.getWebSockets().length
    });

    return new Response(null, {
      status: 101,
      webSocket: client
    });
  }

  broadcast(data) {
    const message = JSON.stringify(data);

    for (const socket of this.state.getWebSockets()) {
      try {
        socket.send(message);
      } catch (error) {
        // Ignore disconnected sockets
      }
    }
  }

  webSocketMessage(socket, message) {
    try {
      const data = JSON.parse(message);

      const allowed = [
        "PLAYER_UPDATE",
        "RACE_START",
        "RACE_FINISH",
        "CHAT"
      ];

      if (!allowed.includes(data.type)) return;

      this.broadcast({
        ...data,
        sender: "player",
        timestamp: Date.now()
      });
    } catch (error) {
      socket.send(JSON.stringify({
        type: "ERROR",
        message: "Invalid message"
      }));
    }
  }

  webSocketClose() {
    this.broadcast({
      type: "PLAYER_LEFT",
      players: this.state.getWebSockets().length
    });
  }

  webSocketError() {
    // Connection error handled by Cloudflare
  }
}
