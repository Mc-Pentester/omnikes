'use client';

import { createContext, useContext, useState, useEffect, ReactNode } from 'react';

const LOCAL_STORAGE_KEY = 'omnikes.currentStoreId';

interface Store {
  id: string;
  name: string;
  code: string;
  address?: string;
  city?: string;
  country?: string;
  phone?: string;
  email?: string;
  isActive: boolean;
}

interface StoreContextType {
  currentStore: Store | null;
  currentStoreId: string | null;
  setCurrentStore: (store: Store | null) => void;
  clearCurrentStore: () => void;
  loading: boolean;
}

const StoreContext = createContext<StoreContextType | undefined>(undefined);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [currentStore, setCurrentStoreState] = useState<Store | null>(null);
  const [loading, setLoading] = useState(true);

  // Load store from localStorage on mount
  useEffect(() => {
    try {
      const storedStoreId = localStorage.getItem(LOCAL_STORAGE_KEY);
      if (storedStoreId) {
        // We only store the ID, the actual store validation happens in the component
        setCurrentStoreState({ id: storedStoreId } as Store);
      }
    } catch (error) {
      console.error('Error loading store from localStorage:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  const setCurrentStore = (store: Store | null) => {
    setCurrentStoreState(store);
    
    if (store) {
      try {
        localStorage.setItem(LOCAL_STORAGE_KEY, store.id);
      } catch (error) {
        console.error('Error saving store to localStorage:', error);
      }
    } else {
      clearCurrentStore();
    }
  };

  const clearCurrentStore = () => {
    setCurrentStoreState(null);
    try {
      localStorage.removeItem(LOCAL_STORAGE_KEY);
    } catch (error) {
      console.error('Error clearing store from localStorage:', error);
    }
  };

  return (
    <StoreContext.Provider 
      value={{ 
        currentStore, 
        currentStoreId: currentStore?.id || null, 
        setCurrentStore, 
        clearCurrentStore,
        loading 
      }}
    >
      {children}
    </StoreContext.Provider>
  );
}

export function useCurrentStore() {
  const context = useContext(StoreContext);
  if (context === undefined) {
    throw new Error('useCurrentStore must be used within a StoreProvider');
  }
  return context;
}
