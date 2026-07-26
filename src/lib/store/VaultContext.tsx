import { createContext, useContext, useState, type ReactNode } from "react";

export interface VaultState {
  vaultKeys: Record<string, string>;
  setVaultKey: (key: string, value: string) => void;
}

const VaultContext = createContext<VaultState | null>(null);

export function VaultProvider({ children }: { children: ReactNode }) {
  const [vaultKeys, setVaultKeys] = useState<Record<string, string>>({});

  const setVaultKey = (key: string, value: string) => {
    setVaultKeys((prev) => ({ ...prev, [key]: value }));
  };

  return (
    <VaultContext.Provider value={{ vaultKeys, setVaultKey }}>
      {children}
    </VaultContext.Provider>
  );
}

export function useVaultState() {
  const ctx = useContext(VaultContext);
  if (!ctx) throw new Error("useVaultState must be used within VaultProvider");
  return ctx;
}
