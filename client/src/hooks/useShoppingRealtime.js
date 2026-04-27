import { useEffect } from 'react';
import supabase from '../services/supabaseClient';

/**
 * Subscribes to inserts/updates/deletes on shopping_list_items for a given
 * household, and invokes onChange(payload) for each event. RLS policies
 * filter to only the household's items, so we don't have to filter in JS.
 *
 * Usage:
 *   useShoppingRealtime(householdId, ({ eventType, new: row, old }) => {...})
 */
export function useShoppingItemsRealtime(householdId, onChange) {
  useEffect(() => {
    if (!supabase || !householdId || typeof onChange !== 'function') return;

    const channel = supabase
      .channel(`shopping-items-${householdId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'shopping_list_items',
          filter: `household_id=eq.${householdId}`,
        },
        (payload) => onChange(payload)
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [householdId, onChange]);
}

export function useShoppingListsRealtime(householdId, onChange) {
  useEffect(() => {
    if (!supabase || !householdId || typeof onChange !== 'function') return;

    const channel = supabase
      .channel(`shopping-lists-${householdId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'shopping_lists',
          filter: `household_id=eq.${householdId}`,
        },
        (payload) => onChange(payload)
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [householdId, onChange]);
}
