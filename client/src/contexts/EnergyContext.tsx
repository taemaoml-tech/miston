import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';

interface EnergyContextValue {
  energySaving: boolean;
  setEnergySaving: (enabled: boolean) => void;
  toggleEnergySaving: () => void;
}

const EnergyContext = createContext<EnergyContextValue>({
  energySaving: false,
  setEnergySaving: () => undefined,
  toggleEnergySaving: () => undefined,
});

export function EnergyProvider({ children }: { children: ReactNode }) {
  const [energySaving, setEnergySaving] = useState(() => localStorage.getItem('miston.energySaver') === '1');

  useEffect(() => {
    document.documentElement.classList.toggle('energy-saving', energySaving);
    localStorage.setItem('miston.energySaver', energySaving ? '1' : '0');
  }, [energySaving]);

  const value = useMemo(() => ({
    energySaving,
    setEnergySaving,
    toggleEnergySaving: () => setEnergySaving((current) => !current),
  }), [energySaving]);

  return <EnergyContext.Provider value={value}>{children}</EnergyContext.Provider>;
}

export function useEnergy() {
  return useContext(EnergyContext);
}
