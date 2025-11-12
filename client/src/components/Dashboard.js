import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import axios from 'axios';
import * as XLSX from 'xlsx';
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer
} from 'recharts';
import authService from '../services/authService';
import './Dashboard.css';
import { getAllCategories } from '../services/categoryService';
import SummaryCards from './analytics/SummaryCards';
import CategoryOverview from './analytics/CategoryOverview';

const DEFAULT_BUDGET = {
  Food: 500,
  Transport: 200,
  Shopping: 300,
  Bills: 400,
  Other: 100
};

const toLocalDateString = (date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const getMonthKey = (dateString) => {
  if (!dateString || dateString.length < 7) return null;
  return dateString.substring(0, 7);
};

const getPreviousMonthKey = (monthKey) => {
  if (!monthKey) return null;
  const [yearStr, monthStr] = monthKey.split('-');
  let year = Number(yearStr);
  let month = Number(monthStr);

  if (!Number.isFinite(year) || !Number.isFinite(month)) {
    return null;
  }

  month -= 1;
  if (month < 1) {
    month = 12;
    year -= 1;
  }

  if (year < 1) {
    return null;
  }

  return `${year}-${String(month).padStart(2, '0')}`;
};

const getMonthBounds = (monthKey) => {
  if (!monthKey) return null;
  const [yearStr, monthStr] = monthKey.split('-');
  const year = Number(yearStr);
  const month = Number(monthStr);

  if (!Number.isFinite(year) || !Number.isFinite(month)) {
    return null;
  }

  const start = new Date(year, month - 1, 1);
  const end = new Date(year, month, 0);

  return {
    start: toLocalDateString(start),
    end: toLocalDateString(end)
  };
};

const getPreviousDateRange = (range) => {
  if (!range?.startDate || !range?.endDate) {
    return null;
  }

  const start = new Date(range.startDate);
  const end = new Date(range.endDate);

  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return null;
  }

  const millisecondsPerDay = 24 * 60 * 60 * 1000;
  const spanDays = Math.max(1, Math.round((end - start) / millisecondsPerDay) + 1);
  const previousEnd = new Date(start.getTime() - millisecondsPerDay);
  const previousStart = new Date(previousEnd.getTime() - (spanDays - 1) * millisecondsPerDay);

  return {
    startDate: toLocalDateString(previousStart),
    endDate: toLocalDateString(previousEnd)
  };
};

const ensureBudgetShape = (candidate) => {
  const shaped = {};
  const categories = getAllCategories();

  categories.forEach(category => {
    const rawValue = candidate?.[category.id];
    const numericValue = typeof rawValue === 'number' ? rawValue : parseFloat(rawValue);
    shaped[category.id] = Number.isFinite(numericValue) ? numericValue : 0;
  });

  return shaped;
};

const getEffectiveBudgetForMonth = (monthKey) => {
  if (typeof window === 'undefined') {
    return ensureBudgetShape(DEFAULT_BUDGET);
  }

  let budgets = {};
  try {
    const stored = window.localStorage.getItem('monthlyBudgets');
    if (stored) {
      budgets = JSON.parse(stored) || {};
    }
  } catch (error) {
    console.error('Failed to parse monthly budgets:', error);
    return ensureBudgetShape(DEFAULT_BUDGET);
  }

  if (monthKey && budgets[monthKey]) {
    return ensureBudgetShape(budgets[monthKey]);
  }

  let fallbackKey = monthKey;
  for (let i = 0; i < 24; i += 1) {
    fallbackKey = getPreviousMonthKey(fallbackKey);
    if (!fallbackKey) {
      break;
    }

    if (fallbackKey && budgets[fallbackKey]) {
      return ensureBudgetShape(budgets[fallbackKey]);
    }
  }

  return ensureBudgetShape(DEFAULT_BUDGET);
};

function Dashboard({
  expenses = [],
  dateRange,
  isCoachOpen = false,
  onCoachToggle = () => {},
  coachHasUnread = false,
  onCoachUnreadChange = () => {},
  coachMood = "motivator_serious",
  onCoachAnalysisChange = () => {},
  quickActions = {}
}) {
  const [CATEGORIES, setCATEGORIES] = useState(getAllCategories());
  const [summary, setSummary] = useState(null);
  const [progressSummary, setProgressSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [comparisonSummary, setComparisonSummary] = useState(null);
  const summaryInitializedRef = useRef(false);
  const summarySignatureRef = useRef(null);
  const isCoachOpenRef = useRef(isCoachOpen);
  const loadedDateRangeRef = useRef(null);
  const [activeChartTab, setActiveChartTab] = useState('categories');
  const chartTouchStartRef = useRef(null);
  const chartTabs = useMemo(() => ([
    { id: 'categories', label: 'Categories', icon: '🍩' },
    { id: 'trend', label: 'Trend', icon: '📈' },
    { id: 'comparison', label: 'Comparisons', icon: '📊' }
  ]), []);

  const handleChartTouchStart = useCallback((event) => {
    if (!event.touches?.length) {
      return;
    }
    chartTouchStartRef.current = event.touches[0].clientX;
  }, []);

  const handleChartTouchEnd = useCallback((event) => {
    if (!event.changedTouches?.length || chartTouchStartRef.current == null) {
      return;
    }
    const deltaX = event.changedTouches[0].clientX - chartTouchStartRef.current;
    chartTouchStartRef.current = null;
    if (Math.abs(deltaX) < 50) {
      return;
    }
    const direction = deltaX > 0 ? -1 : 1;
    const currentIndex = chartTabs.findIndex(tab => tab.id === activeChartTab);
    const nextIndex = Math.min(chartTabs.length - 1, Math.max(0, currentIndex + direction));
    setActiveChartTab(chartTabs[nextIndex].id);
  }, [activeChartTab, chartTabs]);

  // Listen for category updates
  useEffect(() => {
    const handleCategoriesUpdated = () => {
      setCATEGORIES(getAllCategories());
    };

    window.addEventListener('categoriesUpdated', handleCategoriesUpdated);

    return () => {
      window.removeEventListener('categoriesUpdated', handleCategoriesUpdated);
    };
  }, []);

  const loadSummary = useCallback(async (force = false) => {
    // Skip if already loaded for this date range and not forcing refresh
    const currentRangeKey = JSON.stringify(dateRange);
    if (!force && loadedDateRangeRef.current === currentRangeKey && summary) {
      return;
    }

    try {
      setLoading(true);
      loadedDateRangeRef.current = currentRangeKey;
      const token = authService.getAccessToken();
      const API_BASE_URL = process.env.NODE_ENV === 'production'
        ? '/api'
        : 'http://localhost:5000/api';

      const params = new URLSearchParams();
      if (dateRange?.startDate) params.append('startDate', dateRange.startDate);
      if (dateRange?.endDate) params.append('endDate', dateRange.endDate);

      const summaryRequest = axios.get(`${API_BASE_URL}/expenses/summary?${params}`, {
        headers: {
          Authorization: `Bearer ${token}`
        }
      });

      const previousRange = getPreviousDateRange(dateRange);

      let comparisonRequest = null;
      if (previousRange?.startDate && previousRange?.endDate) {
        const comparisonParams = new URLSearchParams();
        comparisonParams.append('startDate', previousRange.startDate);
        comparisonParams.append('endDate', previousRange.endDate);
        comparisonRequest = axios.get(`${API_BASE_URL}/expenses/summary?${comparisonParams}`, {
          headers: {
            Authorization: `Bearer ${token}`
          }
        });
      } else {
        setComparisonSummary(null);
      }

      const referenceDateStr = dateRange?.endDate || dateRange?.startDate || toLocalDateString(new Date());
      const referenceMonthKey = getMonthKey(referenceDateStr) || getMonthKey(toLocalDateString(new Date()));
      const monthBounds = getMonthBounds(referenceMonthKey);
      const isFullMonthRange = Boolean(
        monthBounds &&
        dateRange?.startDate === monthBounds.start &&
        dateRange?.endDate === monthBounds.end
      );

      let progressRequest = null;

      if (monthBounds?.start) {
        const clampToBounds = (candidate) => {
          if (!candidate) return monthBounds.end;
          if (candidate < monthBounds.start) return monthBounds.start;
          if (candidate > monthBounds.end) return monthBounds.end;
          return candidate;
        };

        const progressEnd = clampToBounds(referenceDateStr);
        const progressParams = new URLSearchParams();
        progressParams.append('startDate', monthBounds.start);
        if (progressEnd) {
          progressParams.append('endDate', progressEnd);
        }

        if (!isFullMonthRange || progressEnd !== monthBounds.end) {
          progressRequest = axios.get(`${API_BASE_URL}/expenses/summary?${progressParams}`, {
            headers: {
              Authorization: `Bearer ${token}`
            }
          });
        }
      }

      const safeProgressPromise = progressRequest
        ? progressRequest.catch(error => {
            console.error('Failed to load month-to-date summary:', error);
            return null;
          })
        : Promise.resolve(null);

      const [rangeResponse, progressResponse, comparisonResponse] = await Promise.all([
        summaryRequest,
        safeProgressPromise,
        comparisonRequest ? comparisonRequest.catch(error => {
          console.error('Failed to load comparison summary:', error);
          return null;
        }) : Promise.resolve(null)
      ]);

      setSummary(rangeResponse.data);
      setProgressSummary(progressResponse?.data || rangeResponse.data);
      setComparisonSummary(comparisonResponse?.data || null);
    } catch (error) {
      console.error('Failed to load summary:', error);
      setProgressSummary(null);
    } finally {
      setLoading(false);
    }
  }, [dateRange, summary]);

  useEffect(() => {
    loadSummary();
  }, [loadSummary]);

  useEffect(() => {
    if (!summary) {
      return;
    }

    const signature = JSON.stringify({
      total: summary?.totalSpending ?? null,
      count: summary?.expenseCount ?? null,
      updated: summary?.dateRange ?? null
    });

    if (summarySignatureRef.current === signature) {
      return;
    }

    summarySignatureRef.current = signature;

    if (summaryInitializedRef.current) {
      if (!isCoachOpenRef.current) {
        onCoachUnreadChange(true);
      }
    }

    summaryInitializedRef.current = true;
  }, [summary, onCoachUnreadChange]);

  useEffect(() => {
    if (isCoachOpen) {
      onCoachUnreadChange(false);
    }
  }, [isCoachOpen, onCoachUnreadChange]);

  
  useEffect(() => {
    isCoachOpenRef.current = isCoachOpen;
  }, [isCoachOpen]);
const formatCurrency = (amount) => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD'
  }).format(amount);
};

const formatPercent = (value) => {
  if (value == null || !Number.isFinite(value)) {
    return '—';
  }

  const prefix = value > 0 ? '+' : '';
  return `${prefix}${value.toFixed(1)}%`;
};

const formatDateDisplay = (iso) => {
  if (!iso) return '—';
  // Parse YYYY-MM-DD format properly to avoid timezone issues
  const [year, month, day] = iso.split('-').map(Number);
  if (!year || !month || !day) return '—';
  const date = new Date(year, month - 1, day);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
};

  const monthKey = useMemo(() => {
    if (dateRange?.startDate) return getMonthKey(dateRange.startDate);
    if (dateRange?.endDate) return getMonthKey(dateRange.endDate);
    return getMonthKey(toLocalDateString(new Date()));
  }, [dateRange]);

  const previousMonthKey = useMemo(() => getPreviousMonthKey(monthKey), [monthKey]);

  const monthBounds = useMemo(() => getMonthBounds(monthKey), [monthKey]);
  const previousRange = useMemo(() => getPreviousDateRange(dateRange), [dateRange]);

  const isFullMonthView = useMemo(() => {
    if (!monthBounds) return false;
    if (!dateRange?.startDate || !dateRange?.endDate) return false;
    return dateRange.startDate === monthBounds.start && dateRange.endDate === monthBounds.end;
  }, [dateRange, monthBounds]);

  const categoryBudget = useMemo(() => getEffectiveBudgetForMonth(monthKey), [monthKey]);
  const previousCategoryBudget = useMemo(() => previousMonthKey ? getEffectiveBudgetForMonth(previousMonthKey) : null, [previousMonthKey]);

  const categoryDetails = useMemo(() => {
    const baseSummary = progressSummary || summary;
    const totals = baseSummary?.itemCategoryTotals || {};

    return CATEGORIES.map(category => {
      const spent = totals[category.id] || 0;
      const budget = categoryBudget?.[category.id] ?? 0;
      const remaining = budget - spent;

      return {
        category,
        spent,
        budget,
        remaining
      };
    });
  }, [progressSummary, summary, categoryBudget, CATEGORIES]);

  const categoryChartData = useMemo(() => {
    return categoryDetails
      .filter(detail => detail.spent > 0)
      .map(detail => ({
        name: detail.category.name,
        value: detail.spent,
        color: detail.category.color
      }));
  }, [categoryDetails]);

  const categoryColorMap = useMemo(() => {
    const map = {};
    categoryDetails.forEach(detail => {
      map[detail.category.name] = detail.category.color;
    });
    return map;
  }, [categoryDetails]);

  const totalSpent = useMemo(
    () => categoryDetails.reduce((sum, detail) => sum + detail.spent, 0),
    [categoryDetails]
  );

  const totalBudget = useMemo(
    () => categoryDetails.reduce((sum, detail) => sum + (detail.budget || 0), 0),
    [categoryDetails]
  );

  const totalRemaining = useMemo(
    () => Math.max(0, totalBudget - totalSpent),
    [totalBudget, totalSpent]
  );

  const overallBudgetDelta = totalBudget - totalSpent;

  const recentExpenses = useMemo(() => {
    if (!Array.isArray(expenses)) {
      return [];
    }

    return [...expenses]
      .filter(expense => expense?.date)
      .sort((a, b) => {
        const dateA = new Date(a.date);
        const dateB = new Date(b.date);
        return dateB - dateA;
      })
      .slice(0, 15)
      .map(expense => ({
        id: expense.id,
        merchantName: expense.merchantName,
        category: expense.category,
        totalAmount: expense.totalAmount,
        date: expense.date,
        source: expense.source || 'unknown'
      }));
  }, [expenses]);

  // Complete expense history for AI Coach analysis
  const allExpensesForCoach = useMemo(() => {
    if (!Array.isArray(expenses)) {
      return [];
    }

    return [...expenses]
      .filter(expense => expense?.date)
      .sort((a, b) => {
        const dateA = new Date(a.date);
        const dateB = new Date(b.date);
        return dateB - dateA;
      })
      .map(expense => ({
        id: expense.id,
        merchantName: expense.merchantName,
        description: expense.description,
        category: expense.category,
        totalAmount: expense.totalAmount,
        date: expense.date,
        paymentMethod: expense.paymentMethod,
        source: expense.source || 'unknown'
      }));
  }, [expenses]);

  // Spending pattern analytics for AI Coach
  const spendingPatterns = useMemo(() => {
    if (!Array.isArray(expenses) || expenses.length === 0) {
      return null;
    }

    // Merchant frequency and spending
    const merchantStats = {};
    expenses.forEach(expense => {
      const merchant = expense.merchantName || 'Unknown';
      if (!merchantStats[merchant]) {
        merchantStats[merchant] = {
          count: 0,
          totalSpent: 0,
          categories: new Set(),
          dates: []
        };
      }
      merchantStats[merchant].count += 1;
      merchantStats[merchant].totalSpent += Number(expense.totalAmount || 0);
      if (expense.category) {
        merchantStats[merchant].categories.add(expense.category);
      }
      merchantStats[merchant].dates.push(expense.date);
    });

    // Convert to sorted array
    const topMerchants = Object.entries(merchantStats)
      .map(([name, stats]) => ({
        name,
        count: stats.count,
        totalSpent: stats.totalSpent,
        avgSpent: stats.totalSpent / stats.count,
        categories: Array.from(stats.categories),
        lastVisit: stats.dates.sort().reverse()[0]
      }))
      .sort((a, b) => b.totalSpent - a.totalSpent)
      .slice(0, 10);

    // Category spending analysis
    const categoryStats = {};
    expenses.forEach(expense => {
      const category = expense.category || 'Other';
      if (!categoryStats[category]) {
        categoryStats[category] = {
          count: 0,
          totalSpent: 0,
          avgPerTransaction: 0,
          merchants: new Set()
        };
      }
      categoryStats[category].count += 1;
      categoryStats[category].totalSpent += Number(expense.totalAmount || 0);
      if (expense.merchantName) {
        categoryStats[category].merchants.add(expense.merchantName);
      }
    });

    const categoryAnalysis = Object.entries(categoryStats)
      .map(([name, stats]) => ({
        category: name,
        count: stats.count,
        totalSpent: stats.totalSpent,
        avgPerTransaction: stats.totalSpent / stats.count,
        uniqueMerchants: stats.merchants.size
      }))
      .sort((a, b) => b.totalSpent - a.totalSpent);

    // Payment method analysis
    const paymentStats = {};
    expenses.forEach(expense => {
      const method = expense.paymentMethod || 'Not specified';
      if (!paymentStats[method]) {
        paymentStats[method] = { count: 0, totalSpent: 0 };
      }
      paymentStats[method].count += 1;
      paymentStats[method].totalSpent += Number(expense.totalAmount || 0);
    });

    const paymentAnalysis = Object.entries(paymentStats)
      .map(([method, stats]) => ({
        method,
        count: stats.count,
        totalSpent: stats.totalSpent,
        percentage: (stats.count / expenses.length) * 100
      }))
      .sort((a, b) => b.totalSpent - a.totalSpent);

    // Spending frequency analysis
    const dayOfWeekStats = [0, 0, 0, 0, 0, 0, 0]; // Sun-Sat
    expenses.forEach(expense => {
      if (expense.date) {
        const [year, month, day] = expense.date.split('-').map(Number);
        const date = new Date(year, month - 1, day);
        dayOfWeekStats[date.getDay()] += 1;
      }
    });

    const mostActiveDay = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][
      dayOfWeekStats.indexOf(Math.max(...dayOfWeekStats))
    ];

    return {
      topMerchants,
      categoryAnalysis,
      paymentAnalysis,
      totalTransactions: expenses.length,
      totalSpent: expenses.reduce((sum, exp) => sum + Number(exp.totalAmount || 0), 0),
      avgTransactionValue: expenses.reduce((sum, exp) => sum + Number(exp.totalAmount || 0), 0) / expenses.length,
      mostActiveDay,
      dayOfWeekDistribution: dayOfWeekStats
    };
  }, [expenses]);

  const dailyTotals = useMemo(() => {
    const accumulator = {};

    if (Array.isArray(summary?.detailedItems)) {
      summary.detailedItems.forEach(item => {
        if (!item) return;
        const dateKey = item.date || summary.dateRange?.start;
        if (!dateKey) return;
        const amount = Number(item.totalPrice ?? item.unitPrice ?? 0);
        if (!Number.isFinite(amount)) return;
        accumulator[dateKey] = (accumulator[dateKey] || 0) + amount;
      });
    } else if (Array.isArray(expenses)) {
      expenses.forEach(expense => {
        if (!expense?.date) return;
        const amount = Number(expense.totalAmount);
        if (!Number.isFinite(amount)) return;
        accumulator[expense.date] = (accumulator[expense.date] || 0) + amount;
      });
    }

    return Object.entries(accumulator)
      .map(([date, total]) => {
        // Parse the date string (YYYY-MM-DD) using local date to avoid timezone issues
        const [year, month, day] = date.split('-').map(Number);
        const localDate = new Date(year, month - 1, day);
        return { date, total, sortDate: localDate };
      })
      .sort((a, b) => a.sortDate - b.sortDate);
  }, [summary, expenses]);

  const categoryLeaders = useMemo(() => {
    const merchantMap = new Map();
    const itemMap = new Map();

    const sourceItems = Array.isArray(summary?.detailedItems) && summary.detailedItems.length
      ? summary.detailedItems
      : Array.isArray(expenses)
        ? expenses.flatMap(expense => {
            if (!expense) return [];
            if (Array.isArray(expense.items) && expense.items.length) {
              return expense.items.map(item => ({
                date: expense.date,
                category: item.category || expense.category,
                merchantName: expense.merchantName,
                description: item.description,
                totalPrice: item.totalPrice ?? item.unitPrice ?? 0
              }));
            }
            return [{
              date: expense.date,
              category: expense.category,
              merchantName: expense.merchantName,
              description: expense.merchantName,
              totalPrice: expense.totalAmount
            }];
          })
        : [];

    const recordEntry = (map, categoryId, key, amount) => {
      if (!key) {
        key = 'Other';
      }
      const normalizedCategory = categoryId && CATEGORIES.some(cat => cat.id === categoryId)
        ? categoryId
        : 'Other';
      if (!map.has(normalizedCategory)) {
        map.set(normalizedCategory, new Map());
      }
      const bucket = map.get(normalizedCategory);
      const trimmedKey = key.trim() || 'Other';
      const entry = bucket.get(trimmedKey) || { name: trimmedKey, total: 0, count: 0 };
      entry.total += amount;
      entry.count += 1;
      bucket.set(trimmedKey, entry);
    };

    sourceItems.forEach(item => {
      if (!item) {
        return;
      }
      const categoryId = item.category || 'Other';
      const merchantName = item.merchantName || item.merchant || item.description || 'Other';
      const description = item.description || merchantName || 'Item';
      const amountCandidates = [item.totalPrice, item.unitPrice, item.totalAmount];
      let amount = 0;
      for (const candidate of amountCandidates) {
        const numeric = Number(candidate);
        if (Number.isFinite(numeric) && numeric > 0) {
          amount = numeric;
          break;
        }
      }
      if (!amount && item.quantity && item.unitPrice) {
        const product = Number(item.quantity) * Number(item.unitPrice);
        if (Number.isFinite(product) && product > 0) {
          amount = product;
        }
      }
      if (!Number.isFinite(amount) || amount <= 0) {
        return;
      }

      recordEntry(merchantMap, categoryId, merchantName, amount);
      recordEntry(itemMap, categoryId, description, amount);
    });

    const toSortedArray = (map) => {
      if (!map) {
        return [];
      }
      return Array.from(map.values())
        .sort((a, b) => b.total - a.total)
        .slice(0, 5)
        .map(entry => ({
          name: entry.name,
          total: Number(entry.total.toFixed(2)),
          count: entry.count
        }));
    };

    const result = {};
    CATEGORIES.forEach(category => {
      const catId = category.id;
      result[catId] = {
        topMerchants: toSortedArray(merchantMap.get(catId)),
        topItems: toSortedArray(itemMap.get(catId))
      };
    });

    result.Other = result.Other || {
      topMerchants: toSortedArray(merchantMap.get('Other')),
      topItems: toSortedArray(itemMap.get('Other'))
    };

    return result;
  }, [summary, expenses, CATEGORIES]);

  const categoryLookup = useMemo(() => {
    const map = {};
    CATEGORIES.forEach(category => {
      map[category.id] = category;
    });
    return map;
  }, [CATEGORIES]);

  const categorySpentMap = useMemo(() => {
    const map = {};
    categoryDetails.forEach(detail => {
      map[detail.category.id] = detail;
    });
    return map;
  }, [categoryDetails]);

  const categoryComparisons = useMemo(() => {
    const result = {};
    if (!comparisonSummary) {
      return result;
    }

    CATEGORIES.forEach(category => {
      const current = categorySpentMap[category.id]?.spent || 0;
      const previous = comparisonSummary.itemCategoryTotals?.[category.id] || 0;
      const diff = current - previous;
      let percent = null;

      if (previous > 0) {
        percent = (diff / previous) * 100;
      } else if (previous === 0 && current > 0) {
        percent = 100;
      } else if (previous === 0 && current === 0) {
        percent = 0;
      }

      result[category.id] = {
        diff,
        percent,
        previous,
        current
      };
    });

    return result;
  }, [comparisonSummary, categorySpentMap, CATEGORIES]);

  const topCategoryDetail = useMemo(() => {
    if (!categoryDetails.length) {
      return null;
    }

    return categoryDetails.reduce((winner, detail) => {
      if (!winner || detail.spent > winner.spent) {
        return detail;
      }
      return winner;
    }, null);
  }, [categoryDetails]);

  const topCategoryChange = topCategoryDetail
    ? categoryComparisons[topCategoryDetail.category.id] || null
    : null;

  const mostActiveDay = useMemo(() => {
    if (!dailyTotals.length) {
      return null;
    }

    return dailyTotals.reduce((winner, entry) => {
      if (!winner || entry.total > winner.total) {
        return entry;
      }
      return winner;
    }, null);
  }, [dailyTotals]);

  const totalBudgetUsed = useMemo(() => {
    return Math.max(0, totalBudget - totalRemaining);
  }, [totalBudget, totalRemaining]);

  const budgetUsedPercent = useMemo(() => {
    if (!totalBudget || !Number.isFinite(totalBudget) || totalBudget <= 0) {
      return 0;
    }
    const usedRatio = totalBudgetUsed / totalBudget;
    return Math.min(100, Math.max(0, usedRatio * 100));
  }, [totalBudget, totalBudgetUsed]);

  const budgetUsedPercentLabel = useMemo(() => {
    return `${Math.round(budgetUsedPercent)}%`;
  }, [budgetUsedPercent]);

  const { points: trendPoints, max: trendMax } = useMemo(() => {
    if (!dailyTotals.length) {
      return { points: [], max: 0 };
    }

    const totals = dailyTotals.map(entry => entry.total);
    const maxValue = Math.max(...totals);
    const minValue = Math.min(...totals);
    const range = maxValue - minValue || Math.max(maxValue, 1);
    const points = dailyTotals.map((entry, index) => {
      const x = dailyTotals.length === 1 ? 50 : (index / (dailyTotals.length - 1)) * 100;
      const normalized = range === 0 ? 0.5 : (entry.total - minValue) / range;
      const y = 100 - normalized * 100;
      return {
        x,
        y,
        total: entry.total,
        date: entry.date
      };
    });

    return { points, max: maxValue };
  }, [dailyTotals]);

  const trendSvgPoints = useMemo(() => {
    if (!trendPoints.length) {
      return "";
    }
    return trendPoints.map(point => `${point.x},${point.y}`).join(" ");
  }, [trendPoints]);

  const latestTrendTotal = useMemo(() => {
    if (!trendPoints.length) {
      return null;
    }
    return trendPoints[trendPoints.length - 1].total;
  }, [trendPoints]);

  const handleAskCoach = useCallback(() => {
    onCoachUnreadChange(false);
    onCoachToggle(true, 'dashboard');
  }, [onCoachToggle, onCoachUnreadChange]);

  const exportToCSV = useCallback(() => {
    const rows = [['Date', 'Merchant', 'Category', 'Amount']];
    (expenses || []).forEach(expense => {
      if (!expense) {
        return;
      }
      const category = expense.category || 'Other';
      const amount = Number(expense.totalAmount);
      rows.push([
        expense.date || '',
        expense.merchantName || 'Unknown',
        category,
        Number.isFinite(amount) ? amount.toFixed(2) : ''
      ]);
    });

    const csv = rows
      .map(row =>
        row
          .map(value => `"${String(value).replace(/"/g, '""')}"`)
          .join(',')
      )
      .join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'expense-report.csv';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }, [expenses]);

  const exportToExcelDaily = useCallback(() => {
    // Group expenses by date
    const expensesByDate = {};

    (expenses || []).forEach(expense => {
      if (!expense?.date) return;

      if (!expensesByDate[expense.date]) {
        expensesByDate[expense.date] = [];
      }

      // If expense has items, add each item separately
      if (expense.items && expense.items.length > 0) {
        expense.items.forEach(item => {
          expensesByDate[expense.date].push({
            date: expense.date,
            merchant: expense.merchantName || 'Unknown',
            product: item.description || 'Item',
            category: item.category || expense.category || 'Other',
            cost: Number(item.totalPrice) || 0
          });
        });
      } else {
        // Add whole expense as single item
        expensesByDate[expense.date].push({
          date: expense.date,
          merchant: expense.merchantName || 'Unknown',
          product: expense.description || expense.merchantName || 'Expense',
          category: expense.category || 'Other',
          cost: Number(expense.totalAmount) || 0
        });
      }
    });

    // Create daily sheets data
    const dailySheets = [];
    const sortedDates = Object.keys(expensesByDate).sort();

    sortedDates.forEach(date => {
      const items = expensesByDate[date];
      const sheetData = [];

      // Add header
      sheetData.push({
        'Date': formatDateDisplay(date),
        'Merchant': '',
        'Product': '',
        'Category': '',
        'Cost': ''
      });

      // Add all items
      let dailyTotal = 0;
      items.forEach(item => {
        sheetData.push({
          'Date': '',
          'Merchant': item.merchant,
          'Product': item.product,
          'Category': item.category,
          'Cost': item.cost.toFixed(2)
        });
        dailyTotal += item.cost;
      });

      // Add total row
      sheetData.push({
        'Date': '',
        'Merchant': '',
        'Product': '',
        'Category': 'TOTAL',
        'Cost': dailyTotal.toFixed(2)
      });

      // Add empty row for spacing
      sheetData.push({
        'Date': '',
        'Merchant': '',
        'Product': '',
        'Category': '',
        'Cost': ''
      });

      dailySheets.push({ date, data: sheetData });
    });

    // Create workbook
    const wb = XLSX.utils.book_new();

    // Create a single sheet with all daily data
    const allDailyData = [];
    dailySheets.forEach(sheet => {
      allDailyData.push(...sheet.data);
    });

    const ws = XLSX.utils.json_to_sheet(allDailyData);
    XLSX.utils.book_append_sheet(wb, ws, 'Daily Spending');

    // Generate filename with date range
    const startDate = dateRange?.startDate || 'all';
    const endDate = dateRange?.endDate || 'time';
    const filename = `expense-report-daily-${startDate}-to-${endDate}.xlsx`;

    // Download
    XLSX.writeFile(wb, filename);
  }, [expenses, dateRange]);

  const exportToExcelMonthly = useCallback(() => {
    // Group expenses by month
    const expensesByMonth = {};

    (expenses || []).forEach(expense => {
      if (!expense?.date) return;
      const monthKey = expense.date.substring(0, 7); // YYYY-MM

      if (!expensesByMonth[monthKey]) {
        expensesByMonth[monthKey] = [];
      }

      // If expense has items, add each item separately
      if (expense.items && expense.items.length > 0) {
        expense.items.forEach(item => {
          expensesByMonth[monthKey].push({
            date: expense.date,
            merchant: expense.merchantName || 'Unknown',
            product: item.description || 'Item',
            category: item.category || expense.category || 'Other',
            cost: Number(item.totalPrice) || 0
          });
        });
      } else {
        // Add whole expense as single item
        expensesByMonth[monthKey].push({
          date: expense.date,
          merchant: expense.merchantName || 'Unknown',
          product: expense.description || expense.merchantName || 'Expense',
          category: expense.category || 'Other',
          cost: Number(expense.totalAmount) || 0
        });
      }
    });

    // Create monthly sheets data
    const monthlySheets = [];
    const sortedMonths = Object.keys(expensesByMonth).sort();

    sortedMonths.forEach(month => {
      const items = expensesByMonth[month];
      const sheetData = [];

      // Add month header
      const [year, monthNum] = month.split('-');
      const monthName = new Date(year, monthNum - 1, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

      sheetData.push({
        'Month': monthName,
        'Date': '',
        'Merchant': '',
        'Product': '',
        'Category': '',
        'Cost': ''
      });

      // Add all items
      let monthlyTotal = 0;
      items.forEach(item => {
        sheetData.push({
          'Month': '',
          'Date': formatDateDisplay(item.date),
          'Merchant': item.merchant,
          'Product': item.product,
          'Category': item.category,
          'Cost': item.cost.toFixed(2)
        });
        monthlyTotal += item.cost;
      });

      // Add total row
      sheetData.push({
        'Month': '',
        'Date': '',
        'Merchant': '',
        'Product': '',
        'Category': 'TOTAL',
        'Cost': monthlyTotal.toFixed(2)
      });

      // Add empty row for spacing
      sheetData.push({
        'Month': '',
        'Date': '',
        'Merchant': '',
        'Product': '',
        'Category': '',
        'Cost': ''
      });

      monthlySheets.push({ month, data: sheetData });
    });

    // Create workbook
    const wb = XLSX.utils.book_new();

    // Create a single sheet with all monthly data
    const allMonthlyData = [];
    monthlySheets.forEach(sheet => {
      allMonthlyData.push(...sheet.data);
    });

    const ws = XLSX.utils.json_to_sheet(allMonthlyData);
    XLSX.utils.book_append_sheet(wb, ws, 'Monthly Spending');

    // Generate filename
    const filename = `expense-report-monthly-${new Date().toISOString().split('T')[0]}.xlsx`;

    // Download
    XLSX.writeFile(wb, filename);
  }, [expenses]);

  const exportToPDF = useCallback(() => {
    window.print();
  }, []);

  const budgetUsedLabel = formatCurrency(totalBudgetUsed);
  const trendMaxLabel = Number.isFinite(trendMax) && trendMax > 0 ? formatCurrency(trendMax) : null;
  const budgetRemainingLabel = formatCurrency(totalRemaining);
  const topCategoryName = topCategoryDetail?.category?.name || '—';
  const topCategoryIcon = topCategoryDetail?.category?.icon || '📂';
  const topCategorySpent = topCategoryDetail ? formatCurrency(topCategoryDetail.spent) : '—';
  const topCategoryChangeLabel = topCategoryChange?.percent != null ? formatPercent(topCategoryChange.percent) : null;
  const mostActiveDayLabel = mostActiveDay ? formatDateDisplay(mostActiveDay.date) : '—';
  const mostActiveDayAmount = mostActiveDay ? formatCurrency(mostActiveDay.total) : '—';
  const trendLatestLabel = latestTrendTotal != null ? formatCurrency(latestTrendTotal) : '—';

  const effectiveSummary = progressSummary || summary;

  const totalEntries = effectiveSummary?.expenseCount || 0;
  const totalSpendingValue = effectiveSummary?.totalSpending || 0;
  const averageExpense = effectiveSummary?.averageExpense || 0;
  const totalsSubtitle = isFullMonthView ? 'This month' : 'Month to date';

  const percentChange = useMemo(() => {
    if (!comparisonSummary || !Number.isFinite(comparisonSummary.totalSpending) || comparisonSummary.totalSpending <= 0) {
      return null;
    }
    const diff = totalSpendingValue - comparisonSummary.totalSpending;
    return (diff / comparisonSummary.totalSpending) * 100;
  }, [comparisonSummary, totalSpendingValue]);

  const percentChangeLabel = useMemo(() => {
    return percentChange == null ? null : formatPercent(percentChange);
  }, [percentChange]);

  const userDisplayName = authService.getUserDisplayName ? authService.getUserDisplayName() : 'You';
  const userInitials = (userDisplayName || 'U')
    .split(' ')
    .map(part => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase() || 'U';

  const heroStatement = `You’ve spent ${formatCurrency(totalSpendingValue)} of ${formatCurrency(totalBudget)} this month (${formatPercent(budgetUsedPercent)}).`;
  const heroProgress = Math.min(100, Math.max(0, budgetUsedPercent));
  const heroTrendLabel = percentChangeLabel
    ? `${percentChange > 0 ? '▲' : percentChange < 0 ? '▼' : '━'} ${percentChangeLabel}`
    : 'On track';
  const heroTrendState = percentChange > 0 ? 'negative' : percentChange < 0 ? 'positive' : 'neutral';

  const coachInsightText = useMemo(() => {
    const topName = topCategoryDetail?.category?.name;
    const topSpent = topCategoryDetail ? formatCurrency(topCategoryDetail.spent) : null;
    if (percentChange != null) {
      if (percentChange > 2) {
        return coachMood === 'motivator_roast'
          ? `Spending climbed ${formatPercent(percentChange)}. Want me to call out the culprits?`
          : `Spending is up ${formatPercent(percentChange)} versus last period. Let's dive into what changed.`;
      }
      if (percentChange < -2) {
        return coachMood === 'motivator_roast'
          ? `Flex alert: you trimmed ${formatPercent(Math.abs(percentChange))}. Want a victory lap breakdown?`
          : `Nice work! Spending is down ${formatPercent(Math.abs(percentChange))}. Want to see where you saved the most?`;
      }
    }

    if (topName && topSpent) {
      return coachMood === 'motivator_roast'
        ? `${topName} is eating the budget at ${topSpent}. Shall I roast the frequent flyers?`
        : `${topName} is leading at ${topSpent}. Want a deeper breakdown?`;
    }

    return coachMood === 'motivator_roast'
      ? "Want me to roast today's spending patterns? I've got zingers ready."
      : "Ready when you are—ask me to highlight today's biggest moves.";
  }, [coachMood, percentChange, topCategoryDetail]);

  const coachButtonLabel = useMemo(() => {
    return coachMood === 'motivator_roast' ? 'Roast my spending' : 'Ask AI Coach';
  }, [coachMood]);

  const quickActionHandlers = useMemo(() => ({
    logExpense: quickActions.logExpense || (() => {}),
    scanReceipt: quickActions.scanReceipt || (() => {}),
    addIncome: quickActions.addIncome || (() => {}),
    viewShopping: quickActions.viewShoppingList || quickActions.viewShopping || (() => {})
  }), [quickActions]);

  const quickActionButtons = useMemo(() => ([
    { id: 'log', icon: '➕', label: 'Log Expense', onClick: quickActionHandlers.logExpense },
    { id: 'scan', icon: '📷', label: 'Scan Receipt', onClick: quickActionHandlers.scanReceipt },
    { id: 'income', icon: '💰', label: 'Add Income', onClick: quickActionHandlers.addIncome },
    { id: 'shopping', icon: '🛒', label: 'Shopping List', onClick: quickActionHandlers.viewShopping }
  ]), [quickActionHandlers]);

  const insightsList = useMemo(() => {
    const items = [];

    if (percentChange != null && Math.abs(percentChange) >= 0.5) {
      if (percentChange > 0) {
        items.push(`Overall spending up ${formatPercent(percentChange)} versus last period.`);
      } else {
        items.push(`Overall spending down ${formatPercent(Math.abs(percentChange))} versus last period.`);
      }
    }

    const diffEntries = Object.entries(categoryComparisons)
      .map(([categoryId, data]) => ({ categoryId, ...data }))
      .filter(entry => entry.percent != null && Number.isFinite(entry.percent));

    diffEntries.sort((a, b) => Math.abs(b.percent) - Math.abs(a.percent));

    diffEntries.slice(0, 3).forEach(entry => {
      const category = categoryLookup[entry.categoryId];
      if (!category) {
        return;
      }
      const direction = entry.percent >= 0 ? 'up' : 'down';
      const magnitude = Math.abs(entry.percent).toFixed(1);
      items.push(`${category.name} spending ${direction} ${magnitude}% versus last period.`);
    });

    if (!items.length) {
      items.push('Keep logging expenses to unlock insight comparisons.');
    }

    return items;
  }, [categoryComparisons, categoryLookup, percentChange]);

  const aiCoachTips = insightsList.slice(0, 3);

  const dashboardSummaryCards = useMemo(() => [
    {
      id: 'total-spending',
      label: 'Total Spending',
      value: formatCurrency(totalSpendingValue),
      subValue: totalsSubtitle,
      delta: percentChangeLabel ? {
        direction: percentChange > 0 ? 'negative' : percentChange < 0 ? 'positive' : 'neutral',
        label: percentChangeLabel,
        icon: percentChange > 0 ? '▲' : percentChange < 0 ? '▼' : '━'
      } : null,
      footnote: `Entries logged: ${totalEntries}`
    },
    {
      id: 'top-category',
      label: 'Top Category',
      icon: topCategoryIcon,
      value: topCategoryName,
      subValue: topCategorySpent,
      delta: topCategoryChangeLabel ? {
        direction: topCategoryChange?.percent >= 0 ? 'negative' : 'positive',
        label: topCategoryChangeLabel,
        icon: topCategoryChange?.percent >= 0 ? '▲' : '▼'
      } : null
    },
    {
      id: 'active-day',
      label: 'Most Active Day',
      value: mostActiveDayLabel,
      subValue: mostActiveDayAmount,
      footnote: trendLatestLabel ? `Latest: ${trendLatestLabel}` : undefined
    },
    {
      id: 'coach',
      label: 'AI Coach Insight',
      value: coachInsightText,
      valueVariant: 'small',
      variant: 'summary-card-ai',
      action: {
        label: coachButtonLabel,
        onClick: handleAskCoach
      }
    }
  ], [
    coachButtonLabel,
    coachInsightText,
    handleAskCoach,
    mostActiveDayAmount,
    mostActiveDayLabel,
    percentChange,
    percentChangeLabel,
    topCategoryChange,
    topCategoryChangeLabel,
    topCategoryIcon,
    topCategoryName,
    topCategorySpent,
    totalEntries,
    totalSpendingValue,
    totalsSubtitle,
    trendLatestLabel
  ]);

  const recentTransactionsShort = useMemo(() => {
    return recentExpenses.slice(0, 5);
  }, [recentExpenses]);

  const analysisData = useMemo(() => {
    if (!summary) {
      return null;
    }

    const totals = {
      spending: totalSpendingValue,
      entries: totalEntries,
      average: averageExpense,
      budget: totalBudget,
      remaining: totalRemaining,
      deltaVsBudget: overallBudgetDelta
    };

    const categorySummaryPayload = categoryDetails.map(detail => ({
      categoryId: detail.category.id,
      categoryName: detail.category.name,
      icon: detail.category.icon,
      color: detail.category.color,
      spent: detail.spent,
      budget: detail.budget,
      remaining: detail.remaining,
      deltaVsBudget: detail.spent - (detail.budget || 0)
    }));

    const comparisonPayload = comparisonSummary ? {
      dateRange: comparisonSummary.dateRange || previousRange,
      totals: {
        spending: comparisonSummary.totalSpending || 0,
        entries: comparisonSummary.expenseCount || 0,
        average: comparisonSummary.averageExpense || 0,
        budget: previousCategoryBudget
          ? Object.values(previousCategoryBudget).reduce((sum, value) => sum + (value || 0), 0)
          : null
      },
      categorySummary: CATEGORIES.map(category => {
        const spent = comparisonSummary.itemCategoryTotals?.[category.id] || 0;
        const budget = previousCategoryBudget?.[category.id] ?? 0;
        return {
          categoryId: category.id,
          categoryName: category.name,
          icon: category.icon,
          color: category.color,
          spent,
          budget,
          deltaVsBudget: spent - budget
        };
      })
    } : null;

    return {
      dateRange,
      monthKey,
      previousRange,
      isFullMonthView,
      totals,
      categorySummary: categorySummaryPayload,
      budgets: categoryBudget,
      comparison: comparisonPayload,
      categoryLeaders,
      preferences: {
        mood: coachMood
      },
      recentExpenses,
      allExpenses: allExpensesForCoach,
      spendingPatterns,
      dailyTotals,
      expenseCount: totalEntries
    };
  }, [
    summary,
    categoryDetails,
    categoryBudget,
    comparisonSummary,
    previousCategoryBudget,
    dateRange,
    monthKey,
    previousRange,
    isFullMonthView,
    totalSpendingValue,
    totalEntries,
    averageExpense,
    totalBudget,
    totalRemaining,
    overallBudgetDelta,
    recentExpenses,
    allExpensesForCoach,
    spendingPatterns,
    dailyTotals,
    categoryLeaders,
    coachMood,
    CATEGORIES
  ]);

  const analysisKey = useMemo(() => {
    if (!analysisData) {
      return null;
    }

    return JSON.stringify({
      dateRange: analysisData.dateRange,
      totals: analysisData.totals,
      categorySummary: analysisData.categorySummary,
      categoryLeaders: analysisData.categoryLeaders,
      comparisonTotals: analysisData.comparison?.totals || null,
      mood: analysisData.preferences?.mood || null,
      recentExpenseIds: (analysisData.recentExpenses || []).map(item => item.id || `${item.date}:${item.merchantName}`),
      allExpenseCount: (analysisData.allExpenses || []).length,
      topMerchant: analysisData.spendingPatterns?.topMerchants?.[0]?.name || null,
      topCategory: analysisData.spendingPatterns?.categoryAnalysis?.[0]?.category || null
    });
  }, [analysisData]);

  useEffect(() => {
    if (typeof onCoachAnalysisChange === 'function') {
      onCoachAnalysisChange(analysisData, analysisKey);
    }
  }, [analysisData, analysisKey, onCoachAnalysisChange]);
  if (loading && !summary) {
    return (
      <div className="dashboard">
        <div className="dashboard-header">
          <div className="dashboard-header-text">
            <h1>Dashboard</h1>
            <p>Overview of your spending</p>
          </div>
        </div>
        <div className="dashboard-content">
          <div className="dashboard-skeleton">
            <div className="skeleton-card skeleton-summary">
              <div className="skeleton-title"></div>
              <div className="skeleton-amount"></div>
              <div className="skeleton-bar"></div>
            </div>
            <div className="skeleton-card skeleton-chart">
              <div className="skeleton-title"></div>
              <div className="skeleton-circle"></div>
            </div>
            <div className="skeleton-card skeleton-categories">
              <div className="skeleton-title"></div>
              <div className="skeleton-list">
                <div className="skeleton-item"></div>
                <div className="skeleton-item"></div>
                <div className="skeleton-item"></div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }


  return (
    <div className="dashboard">
      <div className="dashboard-hero">
        <div className="dashboard-hero-top">
          <div>
            <h1>Dashboard</h1>
            <p>Daily control center</p>
          </div>
          <div className="dashboard-hero-actions">
            <button
              type="button"
              className={`hero-icon-btn ${coachHasUnread ? 'hero-icon-btn-alert' : ''}`}
              onClick={() => onCoachToggle(prev => !prev, 'dashboard')}
            >
              🔔
              {coachHasUnread && <span className="hero-indicator" aria-hidden="true" />}
            </button>
            <button type="button" className="hero-avatar-btn">
              {userInitials}
            </button>
          </div>
        </div>
        <p className="dashboard-hero-statement">{heroStatement}</p>
        <div className="dashboard-hero-progress">
          <div className="hero-progress-track">
            <div className="hero-progress-fill" style={{ width: `${heroProgress}%` }} />
          </div>
          <span className={`hero-trend ${heroTrendState}`}>
            {heroTrendLabel}
            {percentChangeLabel ? ' vs last month' : ''}
          </span>
        </div>
      </div>

      <SummaryCards cards={dashboardSummaryCards} variant="grid" />

      <section
        className="dashboard-charts"
        onTouchStart={handleChartTouchStart}
        onTouchEnd={handleChartTouchEnd}
      >
        <div className="dashboard-chart-tabs">
          {chartTabs.map(tab => (
            <button
              type="button"
              key={tab.id}
              className={activeChartTab === tab.id ? 'active' : ''}
              onClick={() => setActiveChartTab(tab.id)}
            >
              <span className="tab-icon">{tab.icon}</span>
              {tab.label}
            </button>
          ))}
        </div>

        <div className="dashboard-chart-panel">
          {activeChartTab === 'categories' && (
            <CategoryOverview
              data={categoryChartData}
              colors={categoryColorMap}
              remainingBudget={overallBudgetDelta}
              totalBudget={totalBudget}
              budgetUsedPercent={budgetUsedPercent}
              showRemaining={isFullMonthView}
              emptyMessage="Add a few expenses to see category insights."
            />
          )}

          {activeChartTab === 'trend' && (
            trendPoints.length ? (
              <div className="trend-chart">
                <svg viewBox="0 0 100 100" preserveAspectRatio="none">
                  <defs>
                    <linearGradient id="trendGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                      <stop offset="0%" stopColor="#6366f1" />
                      <stop offset="100%" stopColor="#a855f7" />
                    </linearGradient>
                  </defs>
                  <polyline points={trendSvgPoints} />
                </svg>
                <div className="trend-chart-meta">
                  <span>Latest: {trendLatestLabel}</span>
                  {trendMaxLabel && <span>Peak: {trendMaxLabel}</span>}
                </div>
              </div>
            ) : (
              <div className="chart-empty-state">Log a few expenses to unlock your trend.</div>
            )
          )}

          {activeChartTab === 'comparison' && (
            comparisonSummary ? (
              <div style={{ padding: '20px' }}>
                <div style={{ marginBottom: '20px' }}>
                  <h4 style={{ margin: '0 0 10px 0', fontSize: '16px', color: '#1f2937' }}>
                    Period Comparison
                  </h4>
                  <p style={{ margin: 0, fontSize: '14px', color: '#6b7280' }}>
                    Comparing current period vs previous period
                  </p>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  {CATEGORIES.map(category => {
                    const current = categorySpentMap[category.id]?.spent || 0;
                    const previous = comparisonSummary.itemCategoryTotals?.[category.id] || 0;
                    const diff = current - previous;
                    const percent = previous > 0 ? ((diff / previous) * 100) : (current > 0 ? 100 : 0);

                    if (current === 0 && previous === 0) return null;

                    return (
                      <div key={category.id} style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '12px',
                        padding: '12px',
                        background: 'rgba(249, 250, 251, 0.5)',
                        borderRadius: '8px'
                      }}>
                        <span style={{ fontSize: '24px' }}>{category.icon}</span>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: '14px', fontWeight: 600, color: '#1f2937' }}>
                            {category.name}
                          </div>
                          <div style={{ fontSize: '12px', color: '#6b7280' }}>
                            {formatCurrency(current)} vs {formatCurrency(previous)}
                          </div>
                        </div>
                        <div style={{
                          fontSize: '13px',
                          fontWeight: 600,
                          color: diff > 0 ? '#ef4444' : diff < 0 ? '#10b981' : '#6b7280'
                        }}>
                          {diff > 0 ? '▲' : diff < 0 ? '▼' : '━'} {formatPercent(percent)}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : (
              <div className="chart-empty-state">Need at least two months of data for comparisons.</div>
            )
          )}
        </div>

        <div className="dashboard-chart-indicators">
          {chartTabs.map(tab => (
            <span
              key={tab.id}
              className={`chart-dot ${activeChartTab === tab.id ? 'active' : ''}`}
            />
          ))}
        </div>
      </section>

      <section className="dashboard-ai-panel">
        <div className="dashboard-ai-header">
          <div>
            <h3>💡 Your AI Coach Says</h3>
            <p>Smart nudges based on this month’s trends</p>
          </div>
          <button type="button" onClick={handleAskCoach}>
            Ask AI for More Insights
          </button>
        </div>
        <div className="dashboard-ai-tips">
          {aiCoachTips.length ? (
            aiCoachTips.map((tip, index) => (
              <div key={index} className="dashboard-ai-tip">
                <span>•</span>
                <p>{tip}</p>
              </div>
            ))
          ) : (
            <p className="dashboard-ai-empty">Keep logging expenses to unlock personalized insights.</p>
          )}
        </div>
      </section>

      <div className="dashboard-deep-dive">
        <div className="summary-trend">
          <div className="trend-card">
            <div className="trend-card-header">
              <h3>Spending trend</h3>
              <span>{totalsSubtitle}</span>
            </div>
            {trendPoints.length ? (
              <div className="trend-chart">
                <svg viewBox="0 0 100 100" preserveAspectRatio="none">
                  <polyline points={trendSvgPoints} />
                </svg>
                <div className="trend-chart-meta">
                  <span>Latest: {trendLatestLabel}</span>
                  {trendMaxLabel && <span>Peak: {trendMaxLabel}</span>}
                </div>
              </div>
            ) : (
              <div className="summary-empty">Log a few expenses to see your trend.</div>
            )}
          </div>

          <div className="trend-card">
            <div className="trend-card-header">
              <h3>Budget progress</h3>
              <span>{budgetUsedLabel} used</span>
            </div>
            <div className="summary-progress">
              <div className="summary-progress-bar">
                <div className="summary-progress-bar-fill" style={{ width: `${budgetUsedPercent}%` }} />
              </div>
              <div className="summary-progress-meta">
                <span>{budgetUsedPercentLabel} used</span>
                <span>Remaining {budgetRemainingLabel}</span>
              </div>
            </div>
            <div className="summary-actions">
              <button type="button" className="summary-export-btn" onClick={exportToCSV}>📄 CSV</button>
              <button type="button" className="summary-export-btn" onClick={exportToExcelDaily}>📊 Excel (Daily)</button>
              <button type="button" className="summary-export-btn" onClick={exportToExcelMonthly}>📈 Excel (Monthly)</button>
              <button type="button" className="summary-export-btn" onClick={exportToPDF}>🖨️ PDF</button>
            </div>
          </div>
        </div>

        <div className="summary-insights">
          <h3>Quick insights</h3>
          <ul>
            {insightsList.map((item, index) => (
              <li key={index}>{item}</li>
            ))}
          </ul>
        </div>

        <div className="summary-recent">
          <h3>Recent transactions</h3>
          {recentTransactionsShort.length ? (
            <ul className="summary-recent-list">
              {recentTransactionsShort.map(transaction => {
                const category = categoryLookup[transaction.category] || {};
                return (
                  <li key={transaction.id || `${transaction.date}-${transaction.merchantName}`}>
                    <span className="summary-recent-icon">{category.icon || '🧾'}</span>
                    <div className="summary-recent-meta">
                      <span className="summary-recent-merchant">{transaction.merchantName || 'Unknown'}</span>
                      <span className="summary-recent-date">{formatDateDisplay(transaction.date)}</span>
                    </div>
                    <span className="summary-recent-amount">{formatCurrency(transaction.totalAmount || 0)}</span>
                  </li>
                );
              })}
            </ul>
          ) : (
            <div className="summary-empty">No recent transactions logged.</div>
          )}
        </div>

        <div className="dashboard-section">
          <h2>Totals</h2>
          <div className="totals-grid">
            <div className="total-card total-card-highlight">
              <span className="total-card-label">Total Spending</span>
              <span className="total-card-value">{formatCurrency(totalSpendingValue)}</span>
              <span className="total-card-subtitle">{totalsSubtitle}</span>
            </div>
            <div className="total-card">
              <span className="total-card-label">Total Entries</span>
              <span className="total-card-value">{totalEntries}</span>
              <span className="total-card-subtitle">Entries counted</span>
            </div>
            {isFullMonthView && totalBudget > 0 && (
              <div className={`total-card ${overallBudgetDelta < 0 ? 'total-card-negative' : 'total-card-positive'}`}>
                <span className="total-card-label">Remaining Budget</span>
                <span className="total-card-value">{formatCurrency(overallBudgetDelta)}</span>
                <span className="total-card-subtitle">Across categories</span>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="dashboard-quick-actions">
        {quickActionButtons.map(button => (
          <button key={button.id} type="button" onClick={button.onClick}>
            <span className="quick-action-icon">{button.icon}</span>
            <span className="quick-action-label">{button.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

export default Dashboard;
