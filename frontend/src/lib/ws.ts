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
const BASE_RECONNECT_MS = 1000;
const MAX_RECONNECT_MS = 30000;
const HEARTBEAT_INTERVAL_MS = 25000;

type MessageHandler = (data: Record<string, unknown>) => void;

class WebSocketClient {
  private ws: WebSocket | null = null;
  private handlers = new Map<string, Set<MessageHandler>>();
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private userId: string | null = null;
  private reconnectAttempts = 0;
  private subscriptions = new Set<string>();
  private pendingMessages: unknown[] = [];
  private intentionalClose = false;

  connect() {
    if (typeof window === "undefined") return;
    if (this.ws?.readyState === WebSocket.OPEN || this.ws?.readyState === WebSocket.CONNECTING) return;

    this.intentionalClose = false;

    try {
      this.ws = new WebSocket(`${WS_URL}/ws`);
    } catch {
      this.scheduleReconnect();
      return;
    }

    this.ws.onopen = () => {
      this.reconnectAttempts = 0;
      // Re-authenticate
      if (this.userId) {
        this.sendImmediate({ type: "auth", userId: this.userId });
      }
      // Re-subscribe to all active subscriptions
      for (const mint of this.subscriptions) {
        this.sendImmediate({ type: "subscribe", mint });
      }
      // Flush pending messages
      while (this.pendingMessages.length > 0) {
        this.sendImmediate(this.pendingMessages.shift());
      }
      // Start heartbeat
      this.startHeartbeat();
    };

    this.ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === "pong") return; // heartbeat response
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
      this.stopHeartbeat();
      if (!this.intentionalClose) {
        this.scheduleReconnect();
      }
    };

    this.ws.onerror = () => {
      this.ws?.close();
    };

    // Reconnect when tab becomes visible again
    if (typeof document !== "undefined") {
      document.addEventListener("visibilitychange", this.handleVisibility);
    }
  }

  private handleVisibility = () => {
    if (document.visibilityState === "visible" && this.ws?.readyState !== WebSocket.OPEN) {
      this.reconnectAttempts = 0; // reset backoff on tab focus
      this.scheduleReconnect(100); // quick reconnect
    }
  };

  private scheduleReconnect(overrideMs?: number) {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    const delay = overrideMs ?? Math.min(BASE_RECONNECT_MS * Math.pow(2, this.reconnectAttempts), MAX_RECONNECT_MS);
    this.reconnectAttempts++;
    this.reconnectTimer = setTimeout(() => this.connect(), delay);
  }

  private startHeartbeat() {
    this.stopHeartbeat();
    this.heartbeatTimer = setInterval(() => {
      this.sendImmediate({ type: "ping" });
    }, HEARTBEAT_INTERVAL_MS);
  }

  private stopHeartbeat() {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  disconnect() {
    this.intentionalClose = true;
    this.stopHeartbeat();
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    if (typeof document !== "undefined") {
      document.removeEventListener("visibilitychange", this.handleVisibility);
    }
    this.ws?.close();
    this.ws = null;
  }

  authenticate(userId: string) {
    this.userId = userId;
    this.send({ type: "auth", userId });
  }

  subscribe(mint: string) {
    this.subscriptions.add(mint);
    this.send({ type: "subscribe", mint });
  }

  unsubscribe(mint: string) {
    this.subscriptions.delete(mint);
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

  get isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  private send(data: unknown) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(data));
    } else {
      // Queue messages to send on reconnect
      this.pendingMessages.push(data);
      if (this.pendingMessages.length > 50) this.pendingMessages.shift();
    }
  }

  private sendImmediate(data: unknown) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(data));
    }
  }
}

export const wsClient = new WebSocketClient();
