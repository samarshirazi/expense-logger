import React, { useState, useEffect, useRef, useCallback } from 'react';
import Sidebar from './components/Sidebar';
import Dashboard from './components/Dashboard';
import LogExpense from './components/LogExpense';
import Settings from './components/Settings';
import ExpenseDetails from './components/ExpenseDetails';
import CategorizedExpenses from './components/CategorizedExpenses';
import ExpensesSummary from './components/ExpensesSummary';
import BudgetManage from './components/BudgetManage';
import SpendingSummary from './components/SpendingSummary';
import Auth from './components/Auth';
import NotificationPrompt from './components/NotificationPrompt';
import TimeNavigator from './components/TimeNavigator';
import { getExpenses } from './services/apiService';
import authService from './services/authService';
import './AppLayout.css';

// Helper function to format date in local timezone
const toLocalDateString = (date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

function App() {
  const [expenses, setExpenses] = useState([]);
  const [selectedExpense, setSelectedExpense] = useState(null);
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [showNotificationPrompt, setShowNotificationPrompt] = useState(false);
  const [activeView, setActiveView] = useState('dashboard'); // 'dashboard', 'expenses', 'categories', 'manage', 'log', 'settings'
  const [showSummary, setShowSummary] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [showOptionsButton, setShowOptionsButton] = useState(true);
  const [isCoachOpen, setIsCoachOpen] = useState(false);
  const [coachHasUnread, setCoachHasUnread] = useState(false);
  const [themePreference, setThemePreference] = useState(() => {
    if (typeof window === 'undefined') return 'system';
    try {
      return window.localStorage.getItem('theme:preference') || 'system';
    } catch (error) {
      console.warn('Failed to read theme preference:', error);
      return 'system';
    }
  });
  const [coachMood, setCoachMood] = useState(() => {
    if (typeof window === 'undefined') return 'motivator_serious';
    try {
      return window.localStorage.getItem('coach:mood') || 'motivator_serious';
    } catch (error) {
      console.warn('Failed to read coach mood preference:', error);
      return 'motivator_serious';
    }
  });
  const [coachAutoOpen, setCoachAutoOpen] = useState(() => {
    if (typeof window === 'undefined') return false;
    try {
      return window.localStorage.getItem('coach:autoOpen') === 'true';
    } catch (error) {
      console.warn('Failed to read coach auto-open preference:', error);
      return false;
    }
  });
  const mainContentRef = useRef(null);
  const scrollStateRef = useRef({
    buttonVisible: true,
    previousScrollPosition: 0,
    lastSource: 'element'
  });

  // Shared timeline state for all sections
  const [sharedTimelineState, setSharedTimelineState] = useState({
    viewMode: 'month',
    currentDate: new Date()
  });

  // Shared date range for all sections
  const [dateRange, setDateRange] = useState(() => {
    const today = new Date();
    const year = today.getFullYear();
    const month = today.getMonth();
    const startOfMonth = new Date(year, month, 1);
    const endOfMonth = new Date(year, month + 1, 0);
    return {
      startDate: toLocalDateString(startOfMonth),
      endDate: toLocalDateString(endOfMonth)
    };
  });

  useEffect(() => {
    // Initialize auth state
    const initAuth = async () => {
      setAuthLoading(true);
      const currentUser = authService.getCurrentUser();
      setUser(currentUser);
      setAuthLoading(false);

      if (currentUser) {
        loadExpenses();
      }
    };

    initAuth();

    // Subscribe to auth changes
    const unsubscribe = authService.subscribe((user, session) => {
      setUser(user);
      if (user) {
        loadExpenses();
      } else {
        setExpenses([]);
        setSelectedExpense(null);
      }
    });

    return unsubscribe;
  }, []);

  const loadExpenses = async () => {
    try {
      const data = await getExpenses();
      setExpenses(data);
    } catch (error) {
      console.error('Failed to load expenses:', error);
    }
  };

  const handleExpenseAdded = async (newExpense) => {
    // Add to local state for immediate feedback
    setExpenses(prev => [newExpense, ...prev]);
    // Only show the expense details if in upload or manual entry view
    if (activeView === 'log') {
      setSelectedExpense(newExpense);
    }
    // Refresh expenses from server immediately to ensure data is in sync
    // This is especially important for camera uploads
    await loadExpenses();
  };

  const handleExpenseSelect = (expense) => {
    setSelectedExpense(expense);
  };

  const handleCategoryUpdate = (expenseId, newCategory) => {
    // Update the expense in the local state
    setExpenses(prev => prev.map(expense =>
      expense.id === expenseId
        ? { ...expense, category: newCategory }
        : expense
    ));

    // Update selected expense if it's the one being updated
    if (selectedExpense && selectedExpense.id === expenseId) {
      setSelectedExpense({ ...selectedExpense, category: newCategory });
    }
  };

  const handleExpenseUpdated = (updatedExpense) => {
    if (!updatedExpense?.id) {
      return;
    }

    setExpenses(prev => prev.map(expense =>
      expense.id === updatedExpense.id
        ? { ...expense, ...updatedExpense }
        : expense
    ));

    setSelectedExpense(prev =>
      prev && prev.id === updatedExpense.id
        ? { ...prev, ...updatedExpense }
        : prev
    );
  };

  const applyTheme = useCallback((value) => {
    if (typeof document === 'undefined') return;
    const root = document.documentElement;
    if (value === 'light') {
      root.dataset.theme = 'light';
      root.style.colorScheme = 'light';
    } else if (value === 'dark') {
      root.dataset.theme = 'dark';
      root.style.colorScheme = 'dark';
    } else {
      root.removeAttribute('data-theme');
      root.style.colorScheme = '';
    }
  }, []);

  useEffect(() => {
    applyTheme(themePreference);
  }, [themePreference, applyTheme]);

  const handleThemeChange = useCallback((value) => {
    setThemePreference(value);
    if (typeof window !== 'undefined') {
      try {
        window.localStorage.setItem('theme:preference', value);
      } catch (error) {
        console.warn('Failed to store theme preference:', error);
      }
    }
  }, []);

  const handleCoachMoodChange = useCallback((value) => {
    setCoachMood(value);
    if (typeof window !== 'undefined') {
      try {
        window.localStorage.setItem('coach:mood', value);
      } catch (error) {
        console.warn('Failed to store coach mood:', error);
      }
    }
  }, []);

  const handleCoachAutoOpenChange = useCallback((value) => {
    setCoachAutoOpen(value);
    if (typeof window !== 'undefined') {
      try {
        window.localStorage.setItem('coach:autoOpen', String(value));
      } catch (error) {
        console.warn('Failed to store coach auto-open preference:', error);
      }
    }
  }, []);

  const handleCoachToggle = useCallback((valueOrUpdater) => {
    setIsCoachOpen(prev => {
      const next = typeof valueOrUpdater === 'function' ? valueOrUpdater(prev) : valueOrUpdater;
      if (next) {
        setCoachHasUnread(false);
      }
      return next;
    });
  }, []);

  useEffect(() => {
    if (coachAutoOpen && coachHasUnread && !isCoachOpen) {
      handleCoachToggle(true);
    }
  }, [coachAutoOpen, coachHasUnread, isCoachOpen, handleCoachToggle]);

  const handleAuthSuccess = () => {
    // Auth service will automatically trigger the subscriber
    // which will update the user state and load expenses

    // Show notification prompt after successful login
    // Check if user hasn't already granted or denied permission
    if (Notification.permission === 'default') {
      setTimeout(() => setShowNotificationPrompt(true), 2000);
    }
  };

  const handleSignOut = async () => {
    try {
      await authService.signOut();
      // Auth service subscriber will handle state cleanup
    } catch (error) {
      console.error('Sign out error:', error);
    }
  };

  const handleDateRangeChange = (range) => {
    setDateRange(range);
  };

  // Update visibility of the options button based on scroll position
  const updateButtonVisibility = useCallback((scrollPosition, source) => {
    const state = scrollStateRef.current;

    if (source && state.lastSource !== source) {
      console.log('🔄 Switching scroll source to:', source);
      state.lastSource = source;
      state.previousScrollPosition = scrollPosition;
    }

    const previousPosition = state.previousScrollPosition ?? 0;
    const delta = scrollPosition - previousPosition;
    const absDelta = Math.abs(delta);
    const scrollingDown = delta > 0;
    const scrollingUp = delta < 0;
    const nearTop = scrollPosition <= 8;

    if (scrollPosition !== previousPosition) {
      console.log('📊 Scroll:', scrollPosition, 'px | Prev:', previousPosition, '| Down:', scrollingDown, '| Up:', scrollingUp, '| BtnVisible:', state.buttonVisible);
    }

    if (nearTop) {
      if (!state.buttonVisible) {
        console.log('🔁 Show button near top');
        state.buttonVisible = true;
        setShowOptionsButton(true);
      }
      state.previousScrollPosition = scrollPosition;
      return;
    }

    if (absDelta < 5) {
      state.previousScrollPosition = scrollPosition;
      return;
    }

    if (scrollingDown && state.buttonVisible) {
      console.log('❌ HIDE button (scrolling down)');
      setShowOptionsButton(false);
      state.buttonVisible = false;
    } else if (scrollingUp && !state.buttonVisible) {
      console.log('✅ SHOW button (scrolling up)');
      setShowOptionsButton(true);
      state.buttonVisible = true;
    }

    state.previousScrollPosition = scrollPosition;
  }, []);

  const getWindowScrollPosition = useCallback(() => {
    if (typeof window === 'undefined') {
      return 0;
    }

    if (typeof window.scrollY === 'number') {
      return window.scrollY;
    }

    if (typeof window.pageYOffset === 'number') {
      return window.pageYOffset;
    }

    if (document?.documentElement?.scrollTop != null) {
      return document.documentElement.scrollTop;
    }

    if (document?.body?.scrollTop != null) {
      return document.body.scrollTop;
    }

    return 0;
  }, []);

  useEffect(() => {
    const element = mainContentRef.current;

    const handleElementScroll = () => {
      if (!mainContentRef.current) {
        return;
      }
      updateButtonVisibility(mainContentRef.current.scrollTop, 'element');
    };

    const handleWindowScroll = () => {
      updateButtonVisibility(getWindowScrollPosition(), 'window');
    };

    if (element) {
      console.log('📡 Attaching scroll listener to main-content element');
      element.addEventListener('scroll', handleElementScroll, { passive: true });
    } else {
      console.log('⚠️ main-content ref missing for element scroll');
    }

    window.addEventListener('scroll', handleWindowScroll, { passive: true });

    if (element && element.scrollHeight > element.clientHeight + 1) {
      updateButtonVisibility(element.scrollTop, 'element');
    } else {
      handleWindowScroll();
    }

    return () => {
      console.log('🧹 Cleanup scroll listeners');
      if (element) {
        element.removeEventListener('scroll', handleElementScroll);
      }
      window.removeEventListener('scroll', handleWindowScroll);
    };
  }, [getWindowScrollPosition, updateButtonVisibility]);

  useEffect(() => {
    const handleResize = () => {
      if (typeof window === 'undefined') {
        return;
      }

      const isMobileView = window.innerWidth <= 768;
      if (!isMobileView && !scrollStateRef.current.buttonVisible) {
        scrollStateRef.current.buttonVisible = true;
        setShowOptionsButton(true);
      }

      const element = mainContentRef.current;
      if (element && element.scrollHeight > element.clientHeight + 1) {
        updateButtonVisibility(element.scrollTop, 'element');
      } else {
        updateButtonVisibility(getWindowScrollPosition(), 'window');
      }
    };

    window.addEventListener('resize', handleResize);
    handleResize();

    return () => {
      window.removeEventListener('resize', handleResize);
    };
  }, [getWindowScrollPosition, updateButtonVisibility]);

  useEffect(() => {
    const element = mainContentRef.current;
    if (element && element.scrollHeight > element.clientHeight + 1) {
      updateButtonVisibility(element.scrollTop, 'element');
    } else {
      updateButtonVisibility(getWindowScrollPosition(), 'window');
    }
  }, [activeView, getWindowScrollPosition, updateButtonVisibility]);

  // Close expense details when navigating away from logging view
  useEffect(() => {
    if (activeView !== 'log') {
      setSelectedExpense(null);
    }
  }, [activeView]);

  if (authLoading) {
    return (
      <div className="container">
        <div style={{ textAlign: 'center', padding: '50px' }}>
          <h2>Loading...</h2>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="container">
        <header className="header">
          <h1>🧾 Expense Receipt Logger</h1>
          <p>Upload receipts, extract data with AI, and store in Google Drive</p>
        </header>
        <Auth onAuthSuccess={handleAuthSuccess} />
      </div>
    );
  }

  const renderOptionsToggleButton = (variant = 'floating') => {
    const variantClass = variant === 'inline' ? 'inline' : '';
    const visibilityClass =
      variant === 'floating'
        ? (showOptionsButton ? 'visible' : 'hidden')
        : (showOptionsButton ? 'inline-visible' : 'inline-hidden');

    return (
      <button
        className={`options-toggle-btn ${variantClass} ${visibilityClass}`}
        onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
        aria-label="Toggle options menu"
      >
        <span className="options-icon">{isMobileMenuOpen ? '✕' : '⚙️'}</span>
      </button>
    );
  };

  return (
    <div className="app-layout">
      <Sidebar
        activeView={activeView}
        onViewChange={setActiveView}
        onSignOut={handleSignOut}
        userName={authService.getUserDisplayName()}
        isMobileMenuOpen={isMobileMenuOpen}
        setIsMobileMenuOpen={setIsMobileMenuOpen}
        onCoachToggle={handleCoachToggle}
        coachHasUnread={coachHasUnread}
      />

      <main className="main-content" ref={mainContentRef}>
        {showNotificationPrompt && (
          <NotificationPrompt
            user={user}
            onComplete={() => setShowNotificationPrompt(false)}
          />
        )}

        {selectedExpense && activeView === 'log' && (
          <ExpenseDetails
            expense={selectedExpense}
            onClose={() => setSelectedExpense(null)}
          />
        )}

        {/* Shared TimeNavigator for Dashboard, Expenses, Categories, and Manage */}
        {['dashboard', 'expenses', 'categories', 'manage'].includes(activeView) && (
          <div className={`shared-timeline-container ${showOptionsButton ? 'with-button' : 'without-button'}`}>
            {/* Options Button - inside timeline container, positioned above TimeNavigator */}
            {renderOptionsToggleButton('floating')}

            <TimeNavigator
              onRangeChange={handleDateRangeChange}
              expenses={expenses}
              timelineState={sharedTimelineState}
              onTimelineStateChange={setSharedTimelineState}
              adjustEnabled={activeView !== 'expenses'}
            />
          </div>
        )}

        <div style={{ display: activeView === 'dashboard' ? 'block' : 'none' }}>
          <Dashboard
            expenses={expenses}
            dateRange={dateRange}
            isCoachOpen={isCoachOpen}
            onCoachToggle={handleCoachToggle}
            coachHasUnread={coachHasUnread}
            onCoachUnreadChange={setCoachHasUnread}
            coachMood={coachMood}
          />
        </div>

        {activeView === 'expenses' && (
          <div className="view-container">
            <ExpensesSummary
              expenses={expenses}
              dateRange={dateRange}
              onExpenseUpdated={handleExpenseUpdated}
            />
          </div>
        )}

        {activeView === 'categories' && (
          <div className="view-container">
            <CategorizedExpenses
              expenses={expenses}
              onExpenseSelect={handleExpenseSelect}
              onCategoryUpdate={handleCategoryUpdate}
              onRefresh={loadExpenses}
              dateRange={dateRange}
            />
          </div>
        )}

        {activeView === 'manage' && (
          <div className="view-container">
            <BudgetManage
              expenses={expenses}
              dateRange={dateRange}
            />
          </div>
        )}

        {activeView === 'log' && (
          <div className="view-container no-timeline">
            {renderOptionsToggleButton('inline')}
            <div className="view-header">
              <h1>Log Expense</h1>
              <p>Upload receipts or add expenses manually</p>
            </div>
            <LogExpense onExpenseAdded={handleExpenseAdded} expenses={expenses} />
          </div>
        )}

        {activeView === 'settings' && (
          <div className="view-container no-timeline">
            {renderOptionsToggleButton('inline')}
            <div className="view-header">
              <h1>Settings</h1>
              <p>Control notifications, the AI Coach, and theme preferences</p>
            </div>
            <Settings
              onShowNotificationPrompt={() => setShowNotificationPrompt(true)}
              onOpenCoach={() => handleCoachToggle(true)}
              themePreference={themePreference}
              onThemeChange={handleThemeChange}
              coachMood={coachMood}
              onCoachMoodChange={handleCoachMoodChange}
              coachAutoOpen={coachAutoOpen}
              onCoachAutoOpenChange={handleCoachAutoOpenChange}
            />
          </div>
        )}

        {showSummary && (
          <SpendingSummary onClose={() => setShowSummary(false)} expenses={expenses} />
        )}
      </main>
    </div>
  );
}

export default App;
