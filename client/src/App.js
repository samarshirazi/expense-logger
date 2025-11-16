import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
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
import CategoryBudgets from './components/CategoryBudgets';
import RecurringExpenses from './components/RecurringExpenses';
import GroceryListPage from './components/GroceryListPage';
import Auth from './components/Auth';
import NotificationPrompt from './components/NotificationPrompt';
import TimeNavigator from './components/TimeNavigator';
import BottomNav from './components/BottomNav';
import { getExpenses, getCategoryBudgets } from './services/apiService';
import { getAllCategories } from './services/categoryService';
import {
  scheduleDailyExpenseReminder,
  cancelDailyExpenseReminder,
  scheduleMonthlyBudgetReminder,
  cancelMonthlyBudgetReminder,
  getStoredNotificationPreferences,
  getStoredNotificationsEnabled
} from './services/notificationService';
import authService from './services/authService';
import { normalizeBudgets, buildBudgetLookup } from './constants/defaultBudgets';
import './AppLayout.css';

// Helper function to format date in local timezone
const toLocalDateString = (date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const mapBudgetsByCategory = (records = []) => {
  const shaped = {};
  (records || []).forEach(record => {
    const name = record?.category;
    const amount = Number(record?.monthly_limit);
    if (!name || !Number.isFinite(amount)) {
      return;
    }
    shaped[name] = amount;
  });
  return shaped;
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
  const [allCategories, setAllCategories] = useState(() => {
    try {
      return getAllCategories();
    } catch (error) {
      console.warn('Failed to load categories for coach analysis:', error);
      return [];
    }
  });
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
  const [categoryBudgets, setCategoryBudgets] = useState({});

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

  const loadCategoryBudgets = useCallback(async () => {
    try {
      const data = await getCategoryBudgets();
      setCategoryBudgets(mapBudgetsByCategory(Array.isArray(data) ? data : []));
    } catch (error) {
      console.warn('Failed to load category budgets:', error);
    }
  }, []);

  useEffect(() => {
    if (!user) {
      setCategoryBudgets({});
      return;
    }
    loadCategoryBudgets();
  }, [user, loadCategoryBudgets]);

  useEffect(() => {
    const handleBudgetsUpdated = () => {
      if (!user) {
        return;
      }
      loadCategoryBudgets();
    };

    window.addEventListener('categoryBudgetsUpdated', handleBudgetsUpdated);
    return () => {
      window.removeEventListener('categoryBudgetsUpdated', handleBudgetsUpdated);
    };
  }, [user, loadCategoryBudgets]);

  const normalizedCategoryBudgets = useMemo(
    () => normalizeBudgets(categoryBudgets),
    [categoryBudgets]
  );

  const categoryBudgetLookup = useMemo(
    () => buildBudgetLookup(normalizedCategoryBudgets),
    [normalizedCategoryBudgets]
  );

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

  useEffect(() => {
    const handleCategoriesUpdated = () => {
      try {
        setAllCategories(getAllCategories());
      } catch (error) {
        console.warn('Failed to refresh categories:', error);
      }
    };

    if (typeof window !== 'undefined') {
      window.addEventListener('categoriesUpdated', handleCategoriesUpdated);
    }

    return () => {
      if (typeof window !== 'undefined') {
        window.removeEventListener('categoriesUpdated', handleCategoriesUpdated);
      }
    };
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

    const categoryLookup = allCategories.reduce((map, category) => {
      const id = category.id || category.name;
      if (!id) {
        return map;
      }
      map[id] = category;
      return map;
    }, {});

    const ensureCategoryEntry = (bucket, categoryId) => {
      const key = categoryId || 'Other';
      if (bucket[key]) {
        return bucket[key];
      }
      const meta = categoryLookup[key] || null;
      bucket[key] = {
        categoryId: key,
        categoryName: meta?.name || key,
        isCustom: Boolean(meta?.isCustom),
        color: meta?.color || null,
        spent: 0,
        count: 0,
        budget: 0,
        remaining: 0
      };
      return bucket[key];
    };

    // Calculate totals
    const totalSpending = filteredExpenses.reduce((sum, exp) => {
      return sum + (exp.totalAmount || exp.amount || 0);
    }, 0);

    const averageExpense = filteredExpenses.length > 0 ? totalSpending / filteredExpenses.length : 0;

    // Calculate category breakdown
    const categoryBreakdown = {};
    filteredExpenses.forEach(exp => {
      const categoryId = exp.category || 'Other';
      const entry = ensureCategoryEntry(categoryBreakdown, categoryId);
      entry.spent += (exp.totalAmount || exp.amount || 0);
      entry.count += 1;
    });

    const budgets = normalizedCategoryBudgets;

    const resolveBudgetForCategory = (categoryId) => {
      if (!categoryId) {
        return 0;
      }
      const meta = categoryLookup[categoryId] || null;
      const displayName = meta?.name || categoryId;
      return (
        categoryBudgetLookup[categoryId] ??
        categoryBudgetLookup[displayName] ??
        categoryBudgetLookup[categoryId?.toLowerCase()] ??
        categoryBudgetLookup[displayName?.toLowerCase()] ??
        0
      );
    };

    // Add budget info to categories
    Object.keys(budgets).forEach(categoryId => {
      ensureCategoryEntry(categoryBreakdown, categoryId);
    });

    Object.keys(categoryBreakdown).forEach(categoryId => {
      const entry = categoryBreakdown[categoryId];
      const budget = resolveBudgetForCategory(categoryId);
      entry.budget = budget;
      entry.remaining = budget - entry.spent;
    });

    const categorySummary = Object.values(categoryBreakdown);

    // Calculate total budget
    const totalBudget = Object.values(budgets || {}).reduce((sum, val) => sum + (val || 0), 0);
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

    // Prepare expense details for AI Coach
    const recentExpenses = [...filteredExpenses]
      .sort((a, b) => new Date(b.date) - new Date(a.date))
      .slice(0, 50) // Last 50 expenses
      .map(exp => ({
        date: exp.date,
        merchant: exp.merchantName,
        amount: exp.totalAmount || exp.amount || 0,
        category: exp.category,
        categoryName: categoryLookup[exp.category]?.name || exp.category,
        isCustomCategory: Boolean(categoryLookup[exp.category]?.isCustom),
        items: exp.items ? exp.items.map(item => ({
          description: item.description,
          price: item.totalPrice || item.price || 0,
          category: item.category,
          categoryName: categoryLookup[item.category]?.name || item.category,
          isCustomCategory: Boolean(categoryLookup[item.category]?.isCustom)
        })) : []
      }));

    // Full expense history for AI context + trend analysis
    const expenseHistory = expenses
      .map((exp, index) => ({
        id: exp.id || exp.uuid || exp.clientId || `exp-${index}`,
        date: exp.date,
        merchant: exp.merchantName || exp.description || 'Unknown',
        amount: exp.totalAmount || exp.amount || 0,
        category: exp.category || 'Other',
        categoryName: categoryLookup[exp.category]?.name || exp.category || 'Other'
      }))
      .filter(entry => Number.isFinite(entry.amount))
      .sort((a, b) => {
        if (!a.date && !b.date) {
          return 0;
        }
        if (!a.date) return 1;
        if (!b.date) return -1;
        return new Date(b.date) - new Date(a.date);
      });

    const monthlyTotalsMap = expenseHistory.reduce((acc, exp) => {
      if (!exp.date) {
        return acc;
      }
      const monthKey = exp.date.substring(0, 7);
      if (!monthKey) {
        return acc;
      }
      acc[monthKey] = (acc[monthKey] || 0) + exp.amount;
      return acc;
    }, {});

    const orderedMonthlyTotals = Object.entries(monthlyTotalsMap)
      .map(([month, total]) => ({ month, total }))
      .sort((a, b) => new Date(`${a.month}-01`) - new Date(`${b.month}-01`));

    const lastTwelveMonths = orderedMonthlyTotals.slice(-12);
    const trailingAverage = lastTwelveMonths.length
      ? lastTwelveMonths.reduce((sum, entry) => sum + entry.total, 0) / lastTwelveMonths.length
      : totalSpending;

    const lifetimeCategoryTotals = expenseHistory.reduce((acc, exp) => {
      const category = exp.category || 'Other';
      acc[category] = (acc[category] || 0) + exp.amount;
      return acc;
    }, {});

    const earliestExpense = expenseHistory[expenseHistory.length - 1] || null;
    const latestExpense = expenseHistory[0] || null;

    const resolveRangeDate = (rawDate, fallback) => {
      if (rawDate) {
        return new Date(rawDate);
      }
      return fallback;
    };

    const MS_PER_DAY = 1000 * 60 * 60 * 24;
    const currentPeriodStart = resolveRangeDate(
      dateRange.startDate,
      new Date(currentYear, currentMonth, 1)
    );
    const currentPeriodEnd = resolveRangeDate(
      dateRange.endDate,
      new Date(currentYear, currentMonth + 1, 0)
    );

    const normalizeDate = (date) => {
      if (!date) return null;
      return new Date(date.getFullYear(), date.getMonth(), date.getDate());
    };

    const normalizedStart = normalizeDate(currentPeriodStart);
    const normalizedEnd = normalizeDate(currentPeriodEnd);
    const today = normalizeDate(new Date());

    let effectiveToday = normalizedEnd;
    if (today && normalizedStart && normalizedEnd) {
      if (today < normalizedStart) {
        effectiveToday = normalizedStart;
      } else if (today <= normalizedEnd) {
        effectiveToday = today;
      }
    }

    const totalDaysInPeriod = (normalizedStart && normalizedEnd)
      ? Math.max(1, Math.floor((normalizedEnd - normalizedStart) / MS_PER_DAY) + 1)
      : 1;

    const daysElapsed = (normalizedStart && effectiveToday)
      ? Math.max(1, Math.floor((effectiveToday - normalizedStart) / MS_PER_DAY) + 1)
      : 1;

    const averageDailySpend = totalSpending / daysElapsed;
    const projectedTotal = averageDailySpend * totalDaysInPeriod;

    const categoryDefinitions = allCategories.map(category => ({
      id: category.id || category.name,
      name: category.name || category.id,
      color: category.color || null,
      icon: category.icon || null,
      isCustom: Boolean(category.isCustom)
    }));

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
      categories: categoryDefinitions,
      recentExpenses: recentExpenses,
      allExpenses: {
        total: expenses.length,
        inCurrentPeriod: filteredExpenses.length,
        totalAllTime: expenses.reduce((sum, exp) => sum + (exp.totalAmount || exp.amount || 0), 0)
      },
      history: {
        expenseHistory,
        monthlyTotals: orderedMonthlyTotals,
        recentMonthlyTotals: lastTwelveMonths,
        trailingAverage,
        lifetimeCategoryTotals,
        firstExpenseDate: earliestExpense?.date || null,
        latestExpenseDate: latestExpense?.date || null
      },
      projections: {
        daysElapsed,
        totalDays: totalDaysInPeriod,
        averageDailySpend,
        projectedTotal,
        remainingVsBudget: totalBudget - projectedTotal,
        trailingAverageMonthlySpend: trailingAverage
      },
      preferences: {
        mood: coachMood
      }
    };

    const categoryKey = allCategories
      .map(category => category.id || category.name)
      .filter(Boolean)
      .join('|');

    const budgetKey = Object.entries(budgets || {})
      .map(([name, value]) => `${name}:${value}`)
      .sort()
      .join('|');
    const analysisKey = `${dateRange.startDate}_${dateRange.endDate}_${expenses.length}_${Math.round(totalSpending)}_${categoryKey}_${budgetKey}`;
    setCoachAnalysis({ data: analysisData, key: analysisKey });
  }, [expenses, dateRange, coachContext, coachMood, allCategories, normalizedCategoryBudgets, categoryBudgetLookup]);

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
                onOpenRecurring={() => setActiveView('recurring')}
                categoryBudgets={normalizedCategoryBudgets}
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
              categoryBudgets={normalizedCategoryBudgets}
            />
          </div>
        )}

        <div style={{ display: activeView === 'overview' ? 'block' : 'none' }}>
          <Overview
            expenses={expenses}
            dateRange={dateRange}
            categoryBudgets={normalizedCategoryBudgets}
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

        {activeView === 'budgets' && (
          <div className="view-container no-timeline">
            {renderOptionsToggleButton('inline')}
            <div className="view-header">
              <h1>Category Budgets</h1>
              <p>Set monthly spending limits for each category</p>
            </div>
            <CategoryBudgets />
          </div>
        )}

        {activeView === 'recurring' && (
          <div className="view-container no-timeline">
            {renderOptionsToggleButton('inline')}
            <div className="view-header">
              <h1>Recurring Expenses</h1>
              <p>Manage expenses that repeat every month</p>
            </div>
            <RecurringExpenses />
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
