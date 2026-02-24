function getWsUrl(): string {
  if (process.env.NEXT_PUBLIC_WS_URL) return process.env.NEXT_PUBLIC_WS_URL;
  if (typeof window !== "undefined") {
    const host = window.location.hostname;
    if (host.includes("railway.app")) {
      return "wss://paper-trading-backend-production.up.railway.app";
    }
  }
  return "ws://localhost:4000";
}

const WS_URL = getWsUrl();

type MessageHandler = (data: Record<string, unknown>) => void;

class WebSocketClient {
  private ws: WebSocket | null = null;
  private handlers = new Map<string, Set<MessageHandler>>();
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private userId: string | null = null;

  connect() {
    if (typeof window === "undefined") return;
    if (this.ws?.readyState === WebSocket.OPEN) return;

    this.ws = new WebSocket(`${WS_URL}/ws`);

    this.ws.onopen = () => {
      if (this.userId) {
        this.send({ type: "auth", userId: this.userId });
      }
    };

    this.ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        const type = data.type as string;
        const handlers = this.handlers.get(type);
        if (handlers) {
          handlers.forEach((h) => h(data));
        }
      } catch {
        // ignore parse errors
      }
    };

    this.ws.onclose = () => {
      this.reconnectTimer = setTimeout(() => this.connect(), 3000);
    };

    this.ws.onerror = () => {
      this.ws?.close();
    };
  }

  disconnect() {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.ws?.close();
    this.ws = null;
  }

  authenticate(userId: string) {
    this.userId = userId;
    this.send({ type: "auth", userId });
  }

  subscribe(mint: string) {
    this.send({ type: "subscribe", mint });
  }

  unsubscribe(mint: string) {
    this.send({ type: "unsubscribe", mint });
  }

  on(type: string, handler: MessageHandler) {
    if (!this.handlers.has(type)) {
      this.handlers.set(type, new Set());
    }
    this.handlers.get(type)!.add(handler);
    return () => {
      this.handlers.get(type)?.delete(handler);
    };
  }

  private send(data: unknown) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(data));
    }
  }
}

export const wsClient = new WebSocketClient();
