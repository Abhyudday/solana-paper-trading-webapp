"use client";

import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from "react";
import { api } from "@/lib/api";
import { wsClient } from "@/lib/ws";

interface AuthState {
  token: string | null;
  userId: string | null;
  sessionId: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
}

interface AuthContextType extends AuthState {
  login: () => Promise<void>;
  logout: () => void;
}

const SESSION_KEY = "paper_trade_session_id";

function getOrCreateSessionId(): string {
  if (typeof window === "undefined") return "";
  let id = localStorage.getItem(SESSION_KEY);
  if (!id) {
    id = `session_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
    localStorage.setItem(SESSION_KEY, id);
  }
  return id;
}

const AuthContext = createContext<AuthContextType>({
  token: null,
  userId: null,
  sessionId: null,
  isAuthenticated: false,
  isLoading: false,
  login: async () => {},
  logout: () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({
    token: null,
    userId: null,
    sessionId: null,
    isAuthenticated: false,
    isLoading: false,
  });

  const login = useCallback(async () => {
    const sessionId = getOrCreateSessionId();
    if (!sessionId) return;
    setState((s) => ({ ...s, isLoading: true }));
    try {
      const { token, user } = await api.auth.connect(sessionId);
      localStorage.setItem("auth_token", token);
      setState({
        token,
        userId: user.id,
        sessionId,
        isAuthenticated: true,
        isLoading: false,
      });
      wsClient.connect();
      wsClient.authenticate(user.id);
    } catch {
      setState((s) => ({ ...s, isLoading: false }));
    }
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem("auth_token");
    localStorage.removeItem(SESSION_KEY);
    setState({
      token: null,
      userId: null,
      sessionId: null,
      isAuthenticated: false,
      isLoading: false,
    });
    wsClient.disconnect();
  }, []);

  // Connect WS eagerly for real-time price updates
  useEffect(() => {
    wsClient.connect();
  }, []);

  // Auto-login on mount
  useEffect(() => {
    if (!state.isAuthenticated && !state.isLoading) {
      login();
    }
  }, [state.isAuthenticated, state.isLoading, login]);

  return (
    <AuthContext.Provider value={{ ...state, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
