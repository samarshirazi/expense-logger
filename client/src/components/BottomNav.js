import React from 'react';
import './BottomNav.css';

function BottomNav({ activeView, onViewChange, showNav }) {
  const navItems = [
    { id: 'dashboard', icon: '📊', label: 'Dashboard' },
    { id: 'expenses', icon: '💰', label: 'Expenses' },
    { id: 'manage', icon: '🎯', label: 'Manage' },
    { id: 'log', icon: '🧾', label: 'Log' }
  ];

  const handleNavClick = (itemId) => {
    if (onViewChange) {
      onViewChange(itemId);
    }
  };

  return (
    <nav className={`bottom-nav ${showNav ? 'visible' : 'hidden'}`}>
      <div className="bottom-nav-container">
        {navItems.map(item => (
          <button
            key={item.id}
            className={`bottom-nav-item ${activeView === item.id ? 'active' : ''}`}
            onClick={() => handleNavClick(item.id)}
          >
            <span className="bottom-nav-icon">{item.icon}</span>
            <span className="bottom-nav-label">{item.label}</span>
          </button>
        ))}
      </div>
    </nav>
  );
}

export default BottomNav;
