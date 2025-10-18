import React from 'react';
import './Sidebar.css';

function Sidebar({ activeView, onViewChange, onSignOut, userName, isMobileMenuOpen, setIsMobileMenuOpen }) {
  const menuItems = [
    { id: 'dashboard', icon: '📊', label: 'Dashboard', description: 'Overview & Stats' },
    { id: 'expenses', icon: '💰', label: 'Expenses', description: 'View all expenses' },
    { id: 'categories', icon: '📂', label: 'Categories', description: 'Organize by category' },
    { id: 'manage', icon: '🎯', label: 'Manage', description: 'Budgets & Goals' },
    { id: 'upload', icon: '📤', label: 'Upload', description: 'Add new receipt' },
    { id: 'manual', icon: '✍️', label: 'Manual Entry', description: 'Quick add' }
  ];

  const handleMenuItemClick = (id) => {
    onViewChange(id);
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
        {menuItems.map(item => (
          <button
            key={item.id}
            className={`nav-item ${activeView === item.id ? 'active' : ''}`}
            onClick={() => handleMenuItemClick(item.id)}
          >
            <span className="nav-icon">{item.icon}</span>
            <div className="nav-content">
              <span className="nav-label">{item.label}</span>
              <span className="nav-description">{item.description}</span>
            </div>
          </button>
        ))}
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
