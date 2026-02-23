"use client";

import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { api } from "@/lib/api";
import { wsClient } from "@/lib/ws";

interface AuthState {
  token: string | null;
  userId: string | null;
  walletAddress: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
}

interface AuthContextType extends AuthState {
  login: () => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType>({
  token: null,
  userId: null,
  walletAddress: null,
  isAuthenticated: false,
  isLoading: false,
  login: async () => {},
  logout: () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const { publicKey, connected, disconnect } = useWallet();
  const [state, setState] = useState<AuthState>({
    token: null,
    userId: null,
    walletAddress: null,
    isAuthenticated: false,
    isLoading: false,
  });

  const login = useCallback(async () => {
    if (!publicKey) return;
    setState((s) => ({ ...s, isLoading: true }));
    try {
      const walletAddress = publicKey.toBase58();
      const { token, user } = await api.auth.connect(walletAddress);
      localStorage.setItem("auth_token", token);
      setState({
        token,
        userId: user.id,
        walletAddress,
        isAuthenticated: true,
        isLoading: false,
      });
      wsClient.connect();
      wsClient.authenticate(user.id);
    } catch {
      setState((s) => ({ ...s, isLoading: false }));
    }
  }, [publicKey]);

  const logout = useCallback(() => {
    localStorage.removeItem("auth_token");
    setState({
      token: null,
      userId: null,
      walletAddress: null,
      isAuthenticated: false,
      isLoading: false,
    });
    wsClient.disconnect();
    disconnect();
  }, [disconnect]);

  useEffect(() => {
    if (connected && publicKey && !state.isAuthenticated && !state.isLoading) {
      login();
    }
  }, [connected, publicKey, state.isAuthenticated, state.isLoading, login]);

  return (
    <AuthContext.Provider value={{ ...state, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
