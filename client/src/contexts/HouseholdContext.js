import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { listHouseholds, createHousehold } from '../services/householdApi';

const STORAGE_KEY = 'expense-logger.activeHouseholdId';

const HouseholdContext = createContext(null);

export function HouseholdProvider({ children, user }) {
  const [households, setHouseholds] = useState([]);
  const [activeId, setActiveId] = useState(() => {
    try {
      return window.localStorage.getItem(STORAGE_KEY) || null;
    } catch {
      return null;
    }
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const refresh = useCallback(async () => {
    if (!user) {
      setHouseholds([]);
      return [];
    }
    setLoading(true);
    setError(null);
    try {
      const list = await listHouseholds();
      setHouseholds(list);
      // If the stored active id is no longer valid, fall back to the first.
      setActiveId((prev) => {
        if (prev && list.some((h) => h.id === prev)) return prev;
        return list[0]?.id || null;
      });
      return list;
    } catch (err) {
      setError(err.message || 'Failed to load households');
      return [];
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    try {
      if (activeId) window.localStorage.setItem(STORAGE_KEY, activeId);
      else window.localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* ignore quota errors */
    }
  }, [activeId]);

  const switchHousehold = useCallback((id) => {
    setActiveId(id);
  }, []);

  const createAndActivate = useCallback(async (name) => {
    const created = await createHousehold(name);
    setHouseholds((prev) => [...prev, created]);
    setActiveId(created.id);
    return created;
  }, []);

  const activeHousehold = households.find((h) => h.id === activeId) || null;

  const value = {
    households,
    activeHousehold,
    activeHouseholdId: activeId,
    loading,
    error,
    refresh,
    switchHousehold,
    createAndActivate,
    isAdmin: activeHousehold?.role === 'admin',
  };

  return <HouseholdContext.Provider value={value}>{children}</HouseholdContext.Provider>;
}

export function useHousehold() {
  const ctx = useContext(HouseholdContext);
  if (!ctx) {
    throw new Error('useHousehold must be used within a HouseholdProvider');
  }
  return ctx;
}
