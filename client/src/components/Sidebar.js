import React from 'react';
import './Sidebar.css';

function Sidebar({ activeView, onViewChange, onSignOut, userName, isMobileMenuOpen, setIsMobileMenuOpen, onCoachToggle, coachHasUnread }) {
  const menuItems = [
    { id: 'expenses', icon: '💰', label: 'Expenses', description: 'View all expenses' },
    { id: 'categories', icon: '📂', label: 'Categories', description: 'Organize by category' },
    { id: 'overview', icon: '📈', label: 'Overview', description: 'Insights & Analytics' },
    { id: 'budgets', icon: '🎯', label: 'Budgets', description: 'Set spending limits' },
    { id: 'log', icon: '🧾', label: 'Log Expense', description: 'Upload or type quickly' },
    { id: 'settings', icon: '⚙️', label: 'Settings', description: 'Notifications & preferences' },
    { id: 'coach', icon: '🤖', label: 'AI Coach', description: 'Insights & advice', isCoach: true }
  ];

  const handleMenuItemClick = (item) => {
    if (item.id === 'coach') {
      if (onCoachToggle) {
        onCoachToggle(true, activeView || 'expenses');
      }
      setIsMobileMenuOpen(false);
      return;
    }

    if (onViewChange) {
      onViewChange(item.id);
    }
    setIsMobileMenuOpen(false);
  };

  return (
    <>
      <div className={`sidebar ${isMobileMenuOpen ? 'mobile-open' : ''}`}>
        <div className="sidebar-header">
        <div className="sidebar-logo">
          <span className="logo-icon">🧾</span>
          <div className="logo-text">
            <h2>ExpenseLogger</h2>
            <p>Track your spending</p>
          </div>
        </div>
      </div>

      <nav className="sidebar-nav">
        {menuItems.map(item => {
          const isActive = item.id !== 'coach' && activeView === item.id;
          // Items to hide on mobile (shown in bottom nav instead)
          const hideOnMobile = ['expenses', 'overview', 'log'].includes(item.id);
          // Map item IDs to tour data attributes
          const tourId = {
            'overview': 'overview',
            'log': 'log-expense',
            'expenses': 'expenses',
            'categories': 'categories',
            'budgets': 'budgets',
            'settings': 'settings'
          }[item.id];
          return (
            <button
              key={item.id}
              className={`nav-item ${isActive ? 'active' : ''} ${item.id === 'coach' ? 'nav-item-coach' : ''} ${hideOnMobile ? 'hide-on-mobile' : ''}`}
              onClick={() => handleMenuItemClick(item)}
              data-tour={tourId}
            >
              <span className="nav-icon">{item.icon}</span>
              <div className="nav-content">
                <span className="nav-label">{item.label}</span>
                <span className="nav-description">{item.description}</span>
              </div>
              {item.id === 'coach' && coachHasUnread && (
                <span className="nav-indicator" aria-hidden="true"></span>
              )}
            </button>
          );
        })}
      </nav>

      <div className="sidebar-footer">
        <div className="user-profile">
          <div className="user-avatar">
            {userName ? userName.charAt(0).toUpperCase() : 'U'}
          </div>
          <div className="user-info">
            <div className="user-name">{userName || 'User'}</div>
            <div className="user-status">Active</div>
          </div>
        </div>
        <button className="sign-out-btn" onClick={onSignOut}>
          <span>🚪</span>
          Sign Out
        </button>
      </div>
    </div>

    {isMobileMenuOpen && (
      <div
        className="sidebar-overlay"
        onClick={() => setIsMobileMenuOpen(false)}
      />
    )}
    </>
  );
}

export default Sidebar;
