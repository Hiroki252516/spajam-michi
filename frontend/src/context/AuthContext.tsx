import React, { createContext, useContext, useState, useEffect } from 'react';
import { loginApi, registerApi, logoutApi } from '../services/authApi';
import type { UserProfile, VisitedEventItem } from '../services/authApi';

interface AuthContextType {
  user: UserProfile | null;
  token: string | null;
  isLoggedIn: boolean;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (name: string, email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  addVisitedEvent: (eventName: string, rating: number) => void;
  completeTutorial: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

/**
 * AuthProvider
 * アプリ全体のログイン・登録状態およびユーザー情報を管理
 */
export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  useEffect(() => {
    const initAuth = async () => {
      try {
        setUser(null);
      } finally {
        setIsLoading(false);
      }
    };
    initAuth();
  }, []);

  const login = async (email: string, password: string) => {
    setIsLoading(true);
    try {
      const res = await loginApi(email, password);
      setUser(res.user);
      setToken(res.token);
    } finally {
      setIsLoading(false);
    }
  };

  const register = async (name: string, email: string, password: string) => {
    setIsLoading(true);
    try {
      const res = await registerApi(name, email, password);
      setUser(res.user);
      setToken(res.token);
    } finally {
      setIsLoading(false);
    }
  };

  const logout = async () => {
    setIsLoading(true);
    try {
      if (token) await logoutApi(token);
    } catch {
      // Clear the local session even if the backend is temporarily unavailable.
    } finally {
      setUser(null);
      setToken(null);
      setIsLoading(false);
    }
  };

  const completeTutorial = () => {
    setUser((prev) => {
      if (!prev) return null;
      return {
        ...prev,
        isFirstLogin: false,
      };
    });
  };

  const addVisitedEvent = (eventName: string, rating: number) => {
    const newVisit: VisitedEventItem = {
      id: `visited_${Date.now()}`,
      eventName,
      visitedDate: new Date().toLocaleDateString('ja-JP', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      }),
      rating,
    };

    setUser((prev) => {
      if (!prev) {
        return {
          id: 'usr_guest',
          name: 'ゲストユーザー',
          avatarUrl: null,
          visitedEvents: [newVisit],
          isFirstLogin: false,
        };
      }
      return {
        ...prev,
        visitedEvents: [newVisit, ...prev.visitedEvents],
      };
    });
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        isLoggedIn: Boolean(user),
        isLoading,
        login,
        register,
        logout,
        addVisitedEvent,
        completeTutorial,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
