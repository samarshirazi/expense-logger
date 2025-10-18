import React, { useState, useEffect, useRef, useCallback } from 'react';
import Sidebar from './components/Sidebar';
import Dashboard from './components/Dashboard';
import ReceiptUpload from './components/ReceiptUpload';
import ManualEntry from './components/ManualEntry';
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
  const [activeView, setActiveView] = useState('dashboard'); // 'dashboard', 'expenses', 'categories', 'upload', 'manual'
  const [showSummary, setShowSummary] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [showOptionsButton, setShowOptionsButton] = useState(true);
  const scrollStateRef = useRef({
    buttonVisible: true,
    previousScrollPosition: 0
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
    if (activeView === 'upload' || activeView === 'manual') {
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

  // Scroll handler using useCallback for stable reference
  const handleScroll = useCallback(() => {
    const mainContent = document.querySelector('.main-content');
    if (!mainContent) return;

    const state = scrollStateRef.current;
    const scrollPosition = mainContent.scrollTop;
    const scrollingDown = scrollPosition > state.previousScrollPosition;
    const scrollingUp = scrollPosition < state.previousScrollPosition;

    console.log('📊 Scroll:', scrollPosition, 'px | Down:', scrollingDown, '| Up:', scrollingUp, '| BtnVisible:', state.buttonVisible);

    // Simple behavior: Hide button when scrolling down, show when scrolling up

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

  // Attach scroll listener
  useEffect(() => {
    const mainContent = document.querySelector('.main-content');

    if (!mainContent) {
      console.log('⚠️ main-content not ready, waiting...');
      const timer = setTimeout(() => {
        const mc = document.querySelector('.main-content');
        if (mc) {
          console.log('📡 Attaching scroll listener');
          mc.addEventListener('scroll', handleScroll, { passive: true });
          handleScroll(); // Check initial position
        }
      }, 100);
      return () => clearTimeout(timer);
    }

    console.log('📡 Attaching scroll listener immediately');
    mainContent.addEventListener('scroll', handleScroll, { passive: true });
    handleScroll(); // Check initial position

    return () => {
      console.log('🧹 Cleanup scroll listener');
      mainContent.removeEventListener('scroll', handleScroll);
    };
  }, [handleScroll]);

  // Close expense details when navigating away from upload/manual views
  useEffect(() => {
    if (activeView !== 'upload' && activeView !== 'manual') {
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

  return (
    <div className="app-layout">
      <Sidebar
        activeView={activeView}
        onViewChange={setActiveView}
        onSignOut={handleSignOut}
        userName={authService.getUserDisplayName()}
        isMobileMenuOpen={isMobileMenuOpen}
        setIsMobileMenuOpen={setIsMobileMenuOpen}
      />

      <main className="main-content">
        {showNotificationPrompt && (
          <NotificationPrompt
            user={user}
            onComplete={() => setShowNotificationPrompt(false)}
          />
        )}

        {selectedExpense && (activeView === 'upload' || activeView === 'manual') && (
          <ExpenseDetails
            expense={selectedExpense}
            onClose={() => setSelectedExpense(null)}
          />
        )}

        {/* Shared TimeNavigator for Dashboard, Expenses, Categories, and Manage */}
        {['dashboard', 'expenses', 'categories', 'manage'].includes(activeView) && (
          <div className={`shared-timeline-container ${showOptionsButton ? 'with-button' : 'without-button'}`}>
            {/* Options Button - inside timeline container, positioned above TimeNavigator */}
            <button
              className={`options-toggle-btn ${showOptionsButton ? 'visible' : 'hidden'}`}
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
              aria-label="Toggle options menu"
            >
              <span className="options-icon">{isMobileMenuOpen ? '✕' : '⚙️'}</span>
            </button>

            <TimeNavigator
              onRangeChange={handleDateRangeChange}
              expenses={expenses}
              timelineState={sharedTimelineState}
              onTimelineStateChange={setSharedTimelineState}
            />
          </div>
        )}

        {activeView === 'dashboard' && (
          <Dashboard
            expenses={expenses}
            dateRange={dateRange}
          />
        )}

        {activeView === 'expenses' && (
          <div className="view-container">
            <ExpensesSummary
              expenses={expenses}
              dateRange={dateRange}
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

        {activeView === 'upload' && (
          <div className="view-container">
            <div className="view-header">
              <h1>Upload Receipt</h1>
              <p>Upload a photo of your receipt to extract data with AI</p>
            </div>
            <ReceiptUpload onExpenseAdded={handleExpenseAdded} />
          </div>
        )}

        {activeView === 'manual' && (
          <div className="view-container">
            <div className="view-header">
              <h1>Manual Entry</h1>
              <p>Quickly add expenses by typing naturally</p>
            </div>
            <ManualEntry onExpensesAdded={handleExpenseAdded} />
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