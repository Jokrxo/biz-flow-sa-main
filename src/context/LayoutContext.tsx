import React, { createContext, useContext, useState, useEffect } from 'react';

type LayoutMode = 'sidebar' | 'horizontal';

interface LayoutContextType {
  layoutMode: LayoutMode;
  setLayoutMode: (mode: LayoutMode) => void;
}

const LayoutContext = createContext<LayoutContextType | undefined>(undefined);

export const LayoutProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [layoutMode, setLayoutModeState] = useState<LayoutMode>('sidebar');

  useEffect(() => {
    const savedLayout = localStorage.getItem('app_layout_mode') as LayoutMode;
    if (savedLayout && (savedLayout === 'sidebar' || savedLayout === 'horizontal')) {
      setLayoutModeState(savedLayout);
    }
  }, []);

  const setLayoutMode = (mode: LayoutMode) => {
    setLayoutModeState(mode);
    localStorage.setItem('app_layout_mode', mode);
  };

  return (
    <LayoutContext.Provider value={{ layoutMode, setLayoutMode }}>
      {children}
    </LayoutContext.Provider>
  );
};

export const useLayout = () => {
  const context = useContext(LayoutContext);
  if (context === undefined) {
    throw new Error('useLayout must be used within a LayoutProvider');
  }
  return context;
};
