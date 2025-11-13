import React, { useState, useEffect, useRef, useCallback } from 'react';
import Sidebar from './components/Sidebar';
import AICoachPanel from './components/AICoachPanel';
import LogExpense from './components/LogExpense';
import Settings from './components/Settings';
import ExpenseDetails from './components/ExpenseDetails';
import CategorizedExpenses from './components/CategorizedExpenses';
import ExpensesSummary from './components/ExpensesSummary';
import Overview from './components/Overview';
import SpendingSummary from './components/SpendingSummary';
import IncomeSavings from './components/IncomeSavings';
import GroceryListPage from './components/GroceryListPage';
import Auth from './components/Auth';
import NotificationPrompt from './components/NotificationPrompt';
import TimeNavigator from './components/TimeNavigator';
import BottomNav from './components/BottomNav';
import { getExpenses } from './services/apiService';
import {
  scheduleDailyExpenseReminder,
  cancelDailyExpenseReminder,
  scheduleMonthlyBudgetReminder,
  cancelMonthlyBudgetReminder,
  getStoredNotificationPreferences,
  getStoredNotificationsEnabled
} from './services/notificationService';
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
  const [activeView, setActiveView] = useState('expenses'); // 'expenses', 'categories', 'overview', 'log', 'settings'
  const [showSummary, setShowSummary] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [showOptionsButton, setShowOptionsButton] = useState(true);
  const [isCoachOpen, setIsCoachOpen] = useState(false);
  const [coachHasUnread, setCoachHasUnread] = useState(false);
  const [coachContext, setCoachContext] = useState('expenses');
  const [coachAnalysis, setCoachAnalysis] = useState({ data: null, key: null });
  const coachAnalysisData = coachAnalysis.data;
  const coachAnalysisKey = coachAnalysis.key;
  const [pendingGroceryExpense, setPendingGroceryExpense] = useState(null);
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
  const [expensesMode, setExpensesMode] = useState('summary');

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

    // Dispatch event to notify charts to refresh
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('expenseDataChanged'));
    }
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

    // Dispatch event to notify charts to refresh
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('expenseDataChanged'));
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

    // Dispatch event to notify charts to refresh
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('expenseDataChanged'));
    }
  };

  const handleCreateExpenseFromGrocery = useCallback((item) => {
    if (!item || !item.totalAmount) {
      setExpensesMode('summary');
      setActiveView('log');
      return;
    }

    const totalAmount = Number.parseFloat(item.totalAmount) || 0;
    const date = item.date || toLocalDateString(new Date());

    setPendingGroceryExpense({
      merchantName: item.merchantName || item.description || item.name || 'Groceries',
      description: item.description || item.name || 'Grocery purchase',
      totalAmount,
      date,
      category: item.category || 'Food',
      paymentMethod: item.paymentMethod || '',
      notes: item.notes || ''
    });

    setExpensesMode('summary');
    setActiveView('log');
  }, []);

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

  useEffect(() => {
    if (activeView !== 'expenses') {
      setExpensesMode('summary');
    }
  }, [activeView]);

  useEffect(() => {
    if (activeView !== 'expenses') {
      setExpensesMode('summary');
    }
  }, [activeView]);

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

  const handleCoachToggle = useCallback((valueOrUpdater, context) => {
    setIsCoachOpen(prev => {
      const nextValue = typeof valueOrUpdater === 'function' ? valueOrUpdater(prev) : valueOrUpdater;
      const isOpening = Boolean(nextValue);
      if (isOpening) {
        setCoachHasUnread(false);
        setCoachContext(previous => {
          if (typeof context === 'string' && context.trim().length > 0) {
            return context;
          }
          return previous || 'expenses';
        });
      }
      return isOpening;
    });
  }, []);

  // eslint-disable-next-line no-unused-vars
  const handleCoachAnalysisChange = useCallback((analysisData, analysisKey) => {
    setCoachAnalysis(prev => {
      const nextKey = analysisKey ?? null;
      const nextData = analysisData ?? null;
      if (prev.key === nextKey) {
        if (prev.data === nextData) {
          return prev;
        }
        if (nextKey === null) {
          return prev;
        }
      }
      return { data: nextData, key: nextKey };
    });
  }, []);

  // Compute expense statistics for AI Coach
  useEffect(() => {
    if (!expenses || expenses.length === 0) {
      setCoachAnalysis({ data: null, key: null });
      return;
    }

    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth();

    // Filter expenses by current date range
    const filteredExpenses = expenses.filter(exp => {
      if (!exp.date) return false;
      const expDate = exp.date.substring(0, 10);
      return expDate >= dateRange.startDate && expDate <= dateRange.endDate;
    });

    // Calculate totals
    const totalSpending = filteredExpenses.reduce((sum, exp) => {
      return sum + (exp.totalAmount || exp.amount || 0);
    }, 0);

    const averageExpense = filteredExpenses.length > 0 ? totalSpending / filteredExpenses.length : 0;

    // Calculate category breakdown
    const categoryBreakdown = {};
    filteredExpenses.forEach(exp => {
      const category = exp.category || 'Other';
      if (!categoryBreakdown[category]) {
        categoryBreakdown[category] = {
          categoryName: category,
          spent: 0,
          count: 0,
          budget: 0,
          remaining: 0
        };
      }
      categoryBreakdown[category].spent += (exp.totalAmount || exp.amount || 0);
      categoryBreakdown[category].count += 1;
    });

    // Get budgets from localStorage
    let monthlyBudgets = {};
    try {
      const stored = window.localStorage.getItem('monthlyBudgets');
      if (stored) {
        monthlyBudgets = JSON.parse(stored) || {};
      }
    } catch (error) {
      console.error('Failed to parse monthly budgets:', error);
    }

    const monthKey = dateRange.startDate.substring(0, 7);
    const budgets = monthlyBudgets[monthKey] || {};

    // Add budget info to categories
    Object.keys(categoryBreakdown).forEach(category => {
      const budget = budgets[category] || 0;
      categoryBreakdown[category].budget = budget;
      categoryBreakdown[category].remaining = budget - categoryBreakdown[category].spent;
    });

    const categorySummary = Object.values(categoryBreakdown);

    // Calculate total budget
    const totalBudget = Object.values(budgets).reduce((sum, val) => sum + (val || 0), 0);
    const deltaVsBudget = totalBudget - totalSpending;

    // Find top merchant
    const merchantStats = {};
    filteredExpenses.forEach(exp => {
      const merchant = exp.merchantName || 'Unknown';
      if (!merchantStats[merchant]) {
        merchantStats[merchant] = { name: merchant, count: 0, totalSpent: 0 };
      }
      merchantStats[merchant].count += 1;
      merchantStats[merchant].totalSpent += (exp.totalAmount || exp.amount || 0);
    });

    const topMerchants = Object.values(merchantStats)
      .sort((a, b) => b.totalSpent - a.totalSpent)
      .slice(0, 5);

    // Calculate most active day
    const dayStats = {};
    filteredExpenses.forEach(exp => {
      if (!exp.date) return;
      const date = new Date(exp.date);
      const dayName = date.toLocaleDateString('en-US', { weekday: 'long' });
      dayStats[dayName] = (dayStats[dayName] || 0) + 1;
    });

    const mostActiveDay = Object.keys(dayStats).reduce((a, b) =>
      dayStats[a] > dayStats[b] ? a : b
    , null);

    const analysisData = {
      context: {
        activeView: coachContext,
        dateRange: dateRange,
        currentMonth: `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}`
      },
      totals: {
        spending: totalSpending,
        average: averageExpense,
        budget: totalBudget,
        deltaVsBudget: deltaVsBudget
      },
      expenseCount: filteredExpenses.length,
      categorySummary: categorySummary,
      spendingPatterns: {
        topMerchants: topMerchants,
        mostActiveDay: mostActiveDay
      },
      preferences: {
        mood: coachMood
      }
    };

    const analysisKey = `${dateRange.startDate}_${dateRange.endDate}_${expenses.length}`;
    setCoachAnalysis({ data: analysisData, key: analysisKey });
  }, [expenses, dateRange, coachContext, coachMood]);

  const handleCoachAssistantMessage = useCallback(() => {
    if (!isCoachOpen) {
      setCoachHasUnread(true);
    }
  }, [isCoachOpen]);

  const handleCoachRefreshHandled = useCallback(() => {
    if (isCoachOpen) {
      setCoachHasUnread(false);
    }
  }, [isCoachOpen]);

  useEffect(() => {
    if (coachAutoOpen && coachHasUnread && !isCoachOpen) {
      handleCoachToggle(true);
    }
  }, [coachAutoOpen, coachHasUnread, isCoachOpen, handleCoachToggle]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return undefined;
    }

    const applyReminderSchedule = () => {
      cancelDailyExpenseReminder();
      cancelMonthlyBudgetReminder();

      if (typeof Notification === 'undefined') {
        return;
      }

      const permissionGranted = Notification.permission === 'granted';
      const storedEnabled = getStoredNotificationsEnabled();
      const notificationsEnabled = storedEnabled === null
        ? permissionGranted
        : (storedEnabled && permissionGranted);

      if (!notificationsEnabled) {
        return;
      }

      const preferences = getStoredNotificationPreferences();
      const frequency = preferences?.frequency || 'daily';

      // Schedule daily expense reminder
      const wantsDailyReminder = Boolean(preferences?.dailySummary);
      const shouldScheduleDaily = wantsDailyReminder && frequency !== 'weekly';

      if (shouldScheduleDaily) {
        scheduleDailyExpenseReminder({
          hour: 21,
          minute: 0,
          title: 'Daily expense check-in',
          body: "It's 9 PM - review and log today's spending."
        });
      }

      // Schedule monthly budget reminder
      const wantsMonthlyReminder = Boolean(preferences?.monthlyBudgetReminder);
      if (wantsMonthlyReminder) {
        scheduleMonthlyBudgetReminder({
          hour: 9,
          minute: 0,
          title: 'Monthly Budget Review',
          body: 'Start of a new month! Time to review and set your budget.'
        });
      }
    };

    applyReminderSchedule();
    window.addEventListener('notificationPreferencesChanged', applyReminderSchedule);

    return () => {
      window.removeEventListener('notificationPreferencesChanged', applyReminderSchedule);
      cancelDailyExpenseReminder();
      cancelMonthlyBudgetReminder();
    };
  }, []);

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

        {/* Shared TimeNavigator for selected views */}
        {(
          ['categories', 'overview', 'income-savings'].includes(activeView) ||
          (activeView === 'expenses' && (expensesMode === 'summary' || expensesMode === 'shopping'))
        ) && (
          <div className={`shared-timeline-container ${showOptionsButton ? 'with-button' : 'without-button'}`}>
            {/* Options Button - inside timeline container, positioned above TimeNavigator */}
            {renderOptionsToggleButton('floating')}

            <TimeNavigator
              onRangeChange={handleDateRangeChange}
              expenses={expenses}
              timelineState={sharedTimelineState}
              onTimelineStateChange={setSharedTimelineState}
              adjustEnabled={true}
            />
          </div>
        )}

        {activeView === 'expenses' && (
          <div className="view-container">
            {renderOptionsToggleButton('inline')}
            {expensesMode === 'shopping' ? (
              <GroceryListPage
                onBack={() => setExpensesMode('summary')}
                onCreateExpense={handleCreateExpenseFromGrocery}
                dateRange={dateRange}
              />
            ) : (
              <ExpensesSummary
                expenses={expenses}
                dateRange={dateRange}
                onExpenseUpdated={handleExpenseUpdated}
                onOpenShoppingList={() => setExpensesMode('shopping')}
              />
            )}
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
              onSwitchToLog={() => setActiveView('log')}
            />
          </div>
        )}

        <div style={{ display: activeView === 'overview' ? 'block' : 'none' }}>
          <Overview
            expenses={expenses}
            dateRange={dateRange}
          />
        </div>

        {activeView === 'income-savings' && (
          <div className="view-container">
            {renderOptionsToggleButton('inline')}
            <IncomeSavings
              dateRange={dateRange}
              timelineState={sharedTimelineState}
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
            <LogExpense
              onExpenseAdded={handleExpenseAdded}
              expenses={expenses}
              prefillExpense={pendingGroceryExpense}
              onPrefillConsumed={() => setPendingGroceryExpense(null)}
            />
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
              onOpenCoach={() => handleCoachToggle(true, 'settings')}
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

        <AICoachPanel
          isOpen={isCoachOpen}
          onClose={() => handleCoachToggle(false)}
          analysisData={coachAnalysisData}
          analysisKey={coachAnalysisKey}
          onRefreshHandled={handleCoachRefreshHandled}
          onAssistantMessage={handleCoachAssistantMessage}
          contextView={coachContext}
        />
      </main>

      {/* Bottom Navigation for mobile */}
      <BottomNav
        activeView={activeView}
        onViewChange={setActiveView}
        showNav={showOptionsButton}
        onCoachToggle={handleCoachToggle}
        coachHasUnread={coachHasUnread}
      />
    </div>
  );
}

export default App;
