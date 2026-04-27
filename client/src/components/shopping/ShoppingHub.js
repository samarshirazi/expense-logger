import React, { useState } from 'react';
import { useHousehold } from '../../contexts/HouseholdContext';
import HouseholdOnboarding from './HouseholdOnboarding';
import HouseholdSwitcher from './HouseholdSwitcher';
import ShoppingListsHome from './ShoppingListsHome';
import ShoppingListDetail from './ShoppingListDetail';
import HouseholdMembers from './HouseholdMembers';
import './shopping.css';

/**
 * Top-level container for the shopping/household feature. Decides which
 * sub-view to render based on local state. App.js mounts this when
 * activeView === 'shopping'.
 */
export default function ShoppingHub({ onOpenVoice }) {
  const { households, loading, activeHousehold } = useHousehold();
  const [view, setView] = useState({ name: 'lists' });

  if (loading && households.length === 0) {
    return <p className="muted">Loading households…</p>;
  }

  if (households.length === 0) {
    return <HouseholdOnboarding />;
  }

  return (
    <div className="shopping-hub">
      <header className="shopping-hub-header">
        <HouseholdSwitcher />
        <nav className="shopping-hub-nav">
          <button
            type="button"
            className={view.name === 'lists' || view.name === 'detail' ? 'active' : ''}
            onClick={() => setView({ name: 'lists' })}
          >
            Lists
          </button>
          <button
            type="button"
            className={view.name === 'members' ? 'active' : ''}
            onClick={() => setView({ name: 'members' })}
          >
            Members
          </button>
        </nav>
      </header>

      {!activeHousehold && <p className="muted">Pick a household to continue.</p>}

      {activeHousehold && view.name === 'lists' && (
        <ShoppingListsHome
          onOpenList={(listId) => setView({ name: 'detail', listId })}
        />
      )}

      {activeHousehold && view.name === 'detail' && (
        <ShoppingListDetail
          listId={view.listId}
          onBack={() => setView({ name: 'lists' })}
          onOpenVoice={onOpenVoice ? () => onOpenVoice(view.listId) : null}
        />
      )}

      {activeHousehold && view.name === 'members' && <HouseholdMembers />}
    </div>
  );
}
