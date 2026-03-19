import { createContext, useContext, useState, useCallback, ReactNode } from "react";

export interface InfraChatMsg {
  id: string;
  role: "user" | "assistant" | "status";
  content: string;
  timestamp: Date;
  tokensUsed?: number;
  cost?: number;
  model?: string;
  models?: string[];
}

export interface InfraAgent {
  agentKey: string;
  displayNameAr: string;
  displayNameEn: string;
  description: string;
}

interface InfraChatState {
  active: boolean;
  minimized: boolean;
  agent: InfraAgent | null;
  messages: InfraChatMsg[];
  loading: boolean;
}

interface InfraChatContextType {
  state: InfraChatState;
  openChat: (agent: InfraAgent) => void;
  closeChat: () => void;
  minimize: () => void;
  restore: () => void;
  setMessages: React.Dispatch<React.SetStateAction<InfraChatMsg[]>>;
  setLoading: (v: boolean) => void;
}

const InfraChatContext = createContext<InfraChatContextType | null>(null);

export function InfraChatProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<InfraChatState>({
    active: false,
    minimized: false,
    agent: null,
    messages: [],
    loading: false,
  });

  const openChat = useCallback((agent: InfraAgent) => {
    setState(prev => {
      if (prev.agent?.agentKey === agent.agentKey) {
        return { ...prev, active: true, minimized: false };
      }
      return { active: true, minimized: false, agent, messages: [], loading: false };
    });
  }, []);

  const closeChat = useCallback(() => {
    setState(prev => ({ ...prev, active: false, minimized: false }));
  }, []);

  const minimize = useCallback(() => {
    setState(prev => ({ ...prev, minimized: true }));
  }, []);

  const restore = useCallback(() => {
    setState(prev => ({ ...prev, minimized: false }));
  }, []);

  const setMessages: React.Dispatch<React.SetStateAction<InfraChatMsg[]>> = useCallback((action) => {
    setState(prev => ({
      ...prev,
      messages: typeof action === "function" ? action(prev.messages) : action,
    }));
  }, []);

  const setLoading = useCallback((v: boolean) => {
    setState(prev => ({ ...prev, loading: v }));
  }, []);

  return (
    <InfraChatContext.Provider value={{ state, openChat, closeChat, minimize, restore, setMessages, setLoading }}>
      {children}
    </InfraChatContext.Provider>
  );
}

export function useInfraChat() {
  const ctx = useContext(InfraChatContext);
  if (!ctx) throw new Error("useInfraChat must be used within InfraChatProvider");
  return ctx;
}
