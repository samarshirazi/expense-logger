import React from 'react';
import './BottomNav.css';

function BottomNav({ activeView, onViewChange, showNav, onCoachToggle, coachHasUnread }) {
  const navItems = [
    { id: 'expenses', icon: '💰', label: 'Expenses' },
    { id: 'shopping', icon: '🛒', label: 'Shopping' },
    { id: 'overview', icon: '📈', label: 'Overview' },
    { id: 'log', icon: '🧾', label: 'Log' },
    { id: 'coach', icon: '🤖', label: 'AI Coach', isCoach: true }
  ];

  const handleNavClick = (item) => {
    if (item.id === 'coach') {
      if (onCoachToggle) {
        onCoachToggle(true, activeView || 'expenses');
      }
      return;
    }

    if (onViewChange) {
      onViewChange(item.id);
    }
  };

  return (
    <nav className={`bottom-nav ${showNav ? 'visible' : 'hidden'}`}>
      <div className="bottom-nav-container">
        {navItems.map(item => {
          const isActive = item.id !== 'coach' && activeView === item.id;
          // Map item IDs to tour data attributes
          const tourId = {
            'overview': 'overview',
            'log': 'log-expense',
            'expenses': 'expenses'
          }[item.id];
          return (
            <button
              key={item.id}
              className={`bottom-nav-item ${isActive ? 'active' : ''}`}
              onClick={() => handleNavClick(item)}
              data-tour={tourId}
            >
              <span className="bottom-nav-icon">{item.icon}</span>
              <span className="bottom-nav-label">{item.label}</span>
              {item.isCoach && coachHasUnread && (
                <span className="bottom-nav-indicator" aria-hidden="true"></span>
              )}
            </button>
          );
        })}
      </div>
    </nav>
  );
}

export default BottomNav;
