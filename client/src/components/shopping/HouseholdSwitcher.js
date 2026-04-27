import React from 'react';
import { useHousehold } from '../../contexts/HouseholdContext';

export default function HouseholdSwitcher() {
  const { households, activeHouseholdId, switchHousehold } = useHousehold();

  if (households.length <= 1) {
    return (
      <div className="household-switcher single">
        <span className="muted small">Household</span>
        <strong>{households[0]?.name || '—'}</strong>
      </div>
    );
  }

  return (
    <label className="household-switcher">
      <span className="muted small">Household</span>
      <select
        value={activeHouseholdId || ''}
        onChange={(e) => switchHousehold(e.target.value)}
      >
        {households.map((h) => (
          <option key={h.id} value={h.id}>
            {h.name} {h.role === 'admin' ? '★' : ''}
          </option>
        ))}
      </select>
    </label>
  );
}
