import { createContext, useContext, useState, type ReactNode } from "react";
import type { KnowledgeFile } from "./types";

export interface KnowledgeState {
  knowledgeFiles: KnowledgeFile[];
  setKnowledgeFiles: React.Dispatch<React.SetStateAction<KnowledgeFile[]>>;
}

const KnowledgeContext = createContext<KnowledgeState | null>(null);

export function KnowledgeProvider({ children }: { children: ReactNode }) {
  const [knowledgeFiles, setKnowledgeFiles] = useState<KnowledgeFile[]>([]);

  return (
    <KnowledgeContext.Provider value={{ knowledgeFiles, setKnowledgeFiles }}>
      {children}
    </KnowledgeContext.Provider>
  );
}

export function useKnowledgeState() {
  const ctx = useContext(KnowledgeContext);
  if (!ctx) throw new Error("useKnowledgeState must be used within KnowledgeProvider");
  return ctx;
}
