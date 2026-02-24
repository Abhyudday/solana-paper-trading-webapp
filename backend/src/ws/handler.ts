import { FastifyInstance } from "fastify";
import { redisSub, redisConnected, CHANNELS } from "../lib/redis";

interface WsClient {
  socket: { send: (data: string) => void; readyState: number };
  userId?: string;
  subscribedMints: Set<string>;
}

const clients = new Set<WsClient>();

export async function setupWebSocket(app: FastifyInstance) {
  app.get("/ws", { websocket: true }, (socket, _request) => {
    const client: WsClient = {
      socket,
      subscribedMints: new Set(),
    };
    clients.add(client);

    socket.on("message", (raw: Buffer) => {
      try {
        const msg = JSON.parse(raw.toString());
        if (msg.type === "auth" && msg.userId) {
          client.userId = msg.userId;
        }
        if (msg.type === "subscribe" && msg.mint) {
          client.subscribedMints.add(msg.mint);
        }
        if (msg.type === "unsubscribe" && msg.mint) {
          client.subscribedMints.delete(msg.mint);
        }
      } catch {
        // ignore malformed messages
      }
    });

    socket.on("close", () => {
      clients.delete(client);
    });
  });

  if (!redisConnected) {
    console.warn("Redis not available — WebSocket pub/sub disabled");
    return;
  }

  await redisSub.subscribe(CHANNELS.priceUpdate);

  redisSub.on("message", (channel: string, message: string) => {
    if (channel === CHANNELS.priceUpdate) {
      try {
        const data = JSON.parse(message);
        const mint = data.mint as string;
        for (const client of clients) {
          if (client.subscribedMints.has(mint) && client.socket.readyState === 1) {
            client.socket.send(JSON.stringify({ type: "price", ...data }));
          }
        }
      } catch {
        // ignore parse errors
      }
    }

    // Handle portfolio and trade updates for specific users
    for (const client of clients) {
      if (client.userId) {
        if (channel === CHANNELS.portfolioUpdate(client.userId)) {
          client.socket.send(JSON.stringify({ type: "portfolio_update", data: message }));
        }
        if (channel === CHANNELS.tradeExecuted(client.userId)) {
          client.socket.send(JSON.stringify({ type: "trade_executed", data: message }));
        }
      }
    }
  });
}

export function broadcastToUser(userId: string, payload: unknown) {
  const data = JSON.stringify(payload);
  for (const client of clients) {
    if (client.userId === userId && client.socket.readyState === 1) {
      client.socket.send(data);
    }
  }
}
