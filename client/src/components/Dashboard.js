import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import axios from 'axios';
import authService from '../services/authService';
import './Dashboard.css';
import AICoachPanel from './AICoachPanel';

const CATEGORIES = [
  { id: 'Food', name: 'Food', icon: '🍔', color: '#ff6b6b' },
  { id: 'Transport', name: 'Transport', icon: '🚗', color: '#4ecdc4' },
  { id: 'Shopping', name: 'Shopping', icon: '🛍️', color: '#45b7d1' },
  { id: 'Bills', name: 'Bills', icon: '💡', color: '#f9ca24' },
  { id: 'Other', name: 'Other', icon: '📦', color: '#95afc0' }
];

const DEFAULT_BUDGET = {
  Food: 500,
  Transport: 200,
  Shopping: 300,
  Bills: 400,
  Other: 100
};

const REMAINING_CATEGORY = {
  id: 'Remaining',
  name: 'Remaining Budget',
  icon: '💰',
  color: '#27ae60'
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

  CATEGORIES.forEach(category => {
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

function Dashboard({ expenses = [], dateRange, isCoachOpen = false, onCoachToggle = () => {}, coachHasUnread = false, onCoachUnreadChange = () => {}, coachMood = "motivator_serious" }) {
  const [summary, setSummary] = useState(null);
  const [progressSummary, setProgressSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [comparisonSummary, setComparisonSummary] = useState(null);
  const summaryInitializedRef = useRef(false);
  const summarySignatureRef = useRef(null);
  const isCoachOpenRef = useRef(isCoachOpen);
  const loadedDateRangeRef = useRef(null);

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
  const date = new Date(iso);
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
  }, [progressSummary, summary, categoryBudget]);

  const categoryDetailsRange = useMemo(() => {
    const totals = summary?.itemCategoryTotals || {};

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
  }, [summary, categoryBudget]);

  const totalSpent = useMemo(
    () => categoryDetails.reduce((sum, detail) => sum + detail.spent, 0),
    [categoryDetails]
  );

  const chartCategoryDetails = useMemo(
    () => (isFullMonthView ? categoryDetails : categoryDetailsRange),
    [isFullMonthView, categoryDetails, categoryDetailsRange]
  );

  const chartTotalSpent = useMemo(
    () => chartCategoryDetails.reduce((sum, detail) => sum + detail.spent, 0),
    [chartCategoryDetails]
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
      .map(([date, total]) => ({ date, total }))
      .sort((a, b) => new Date(a.date) - new Date(b.date));
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
  }, [summary, expenses]);

  const categoryLookup = useMemo(() => {
    const map = {};
    CATEGORIES.forEach(category => {
      map[category.id] = category;
    });
    return map;
  }, []);

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
  }, [comparisonSummary, categorySpentMap]);

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
    onCoachToggle(true);
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

  const renderPieChart = () => {
    const remainingForChart = isFullMonthView ? totalRemaining : 0;
    const chartTotal = chartTotalSpent + remainingForChart;

    if (chartTotalSpent <= 0 || chartTotal <= 0) {
      return <div className="dashboard-chart-empty">No spending data yet</div>;
    }

    const radius = 90;
    const center = 110;
    const segments = [];
    let currentAngle = 0;

    chartCategoryDetails.forEach(detail => {
      if (detail.spent <= 0) {
        return;
      }

      const fraction = detail.spent / chartTotal;
      const angle = fraction * 360;
      const startAngle = currentAngle;
      const endAngle = currentAngle + angle;
      currentAngle += angle;

      segments.push({
        key: detail.category.id,
        category: detail.category,
        value: detail.spent,
        fraction,
        startAngle,
        endAngle
      });
    });

    if (remainingForChart > 0) {
      const fraction = remainingForChart / chartTotal;
      const angle = fraction * 360;
      const startAngle = currentAngle;
      const endAngle = currentAngle + angle;
      currentAngle += angle;

      segments.push({
        key: REMAINING_CATEGORY.id,
        category: REMAINING_CATEGORY,
        value: remainingForChart,
        fraction,
        startAngle,
        endAngle,
        isRemaining: true
      });
    }

    return (
      <div className="dashboard-pie">
        <svg viewBox="0 0 220 220" className="dashboard-pie-chart">
          {segments.map(segment => {
            const startRadians = (segment.startAngle - 90) * Math.PI / 180;
            const endRadians = (segment.endAngle - 90) * Math.PI / 180;
            const x1 = center + radius * Math.cos(startRadians);
            const y1 = center + radius * Math.sin(startRadians);
            const x2 = center + radius * Math.cos(endRadians);
            const y2 = center + radius * Math.sin(endRadians);
            const largeArc = (segment.endAngle - segment.startAngle) > 180 ? 1 : 0;

            if (segment.endAngle - segment.startAngle >= 359.99) {
              return (
                <circle
                  key={segment.key}
                  cx={center}
                  cy={center}
                  r={radius}
                  fill={segment.category.color}
                  stroke="none"
                />
              );
            }

            const path = `M ${center} ${center} L ${x1} ${y1} A ${radius} ${radius} 0 ${largeArc} 1 ${x2} ${y2} Z`;

            return (
              <path
                key={segment.key}
                d={path}
                fill={segment.category.color}
                stroke="none"
              />
            );
          })}
        </svg>
      </div>
    );
  };

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

  const recentTransactionsShort = useMemo(() => {
    return recentExpenses.slice(0, 5);
  }, [recentExpenses]);

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
    coachMood
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
      <div className="dashboard-header">
        <div className="dashboard-header-text">
          <h1>Dashboard</h1>
          <p>Overview of your spending</p>
        </div>
        <button
          type="button"
          className={`coach-toggle ${isCoachOpen ? 'coach-toggle--active' : ''} ${coachHasUnread ? 'coach-toggle--alert' : ''}`}
          onClick={() => onCoachToggle(prev => !prev)}
        >
          <span className="coach-toggle__icon">🤖</span>
          <span className="coach-toggle__label">AI Coach</span>
          {coachHasUnread && <span className="coach-toggle__indicator" aria-hidden="true"></span>}
        </button>
      </div>

      <div className="dashboard-summary">
        <div className="summary-grid">
          <div className="summary-card summary-card-total">
            <div className="summary-card-label">Total Spending</div>
            <div className="summary-card-value">{formatCurrency(totalSpendingValue)}</div>
            <div className="summary-card-subtext">{totalsSubtitle}</div>
            {percentChangeLabel && (
              <div
                className={`summary-card-delta ${percentChange > 0 ? 'summary-card-delta-negative' : percentChange < 0 ? 'summary-card-delta-positive' : ''}`}
              >
                {percentChange > 0 ? '▲' : percentChange < 0 ? '▼' : '━'} {percentChangeLabel}
              </div>
            )}
            <div className="summary-card-footnote">Entries logged: {totalEntries}</div>
          </div>

          <div className="summary-card">
            <div className="summary-card-label">Top Category</div>
            <div className="summary-card-icon">{topCategoryIcon}</div>
            <div className="summary-card-value">{topCategoryName}</div>
            <div className="summary-card-subtext">{topCategorySpent}</div>
            {topCategoryChangeLabel && (
              <div
                className={`summary-card-delta ${topCategoryChange?.percent >= 0 ? 'summary-card-delta-negative' : 'summary-card-delta-positive'}`}
              >
                {topCategoryChange?.percent >= 0 ? '▲' : '▼'} {formatPercent(Math.abs(topCategoryChange.percent))}
              </div>
            )}
          </div>

          <div className="summary-card">
            <div className="summary-card-label">Most Active Day</div>
            <div className="summary-card-value">{mostActiveDayLabel}</div>
            <div className="summary-card-subtext">{mostActiveDayAmount}</div>
            {trendLatestLabel && (
              <div className="summary-card-footnote">Latest: {trendLatestLabel}</div>
            )}
          </div>

          <div className="summary-card summary-card-ai">
            <div className="summary-card-label">AI Coach Insight</div>
            <p className="summary-card-text">{coachInsightText}</p>
            <button type="button" className="summary-card-button" onClick={handleAskCoach}>
              {coachButtonLabel}
            </button>
          </div>
        </div>

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
              <button type="button" className="summary-export-btn" onClick={exportToCSV}>Export CSV</button>
              <button type="button" className="summary-export-btn" onClick={exportToPDF}>Export PDF</button>
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
      </div>

      <div className="dashboard-section">
        <h2>Spending by Category</h2>
        <div className="dashboard-pie-wrapper">
          {renderPieChart()}
        </div>
        <div className="category-breakdown-grid">
          {categoryDetails.map(detail => {
            const { category, spent, remaining, budget } = detail;
            const isOverBudget = remaining < 0;
            const spentPercentRaw = budget > 0 ? (spent / budget) * 100 : 0;
            const spentPercent = Math.max(0, Math.min(spentPercentRaw, 100));
            const progressPercentLabel = `${Math.max(0, Math.round(spentPercentRaw))}%`;

            return (
              <div key={category.id} className="category-card">
                <div className="category-card-title">{category.name}</div>
                <span className="category-icon" style={{ color: category.color }}>
                  {category.icon}
                </span>
                <div className="category-spent-amount">{formatCurrency(spent)}</div>
                <div
                  className={`category-remaining ${isOverBudget ? 'category-remaining-negative' : 'category-remaining-positive'}`}
                >
                  Remaining: {formatCurrency(remaining)}
                </div>
                <div className="category-progress">
                  <div className="category-progress-track">
                    <div
                      className="category-progress-fill"
                      style={{ width: `${spentPercent}%`, backgroundColor: category.color }}
                    ></div>
                  </div>
                  <div className="category-progress-percentage">
                    {spentPercentRaw > 999 ? '999%+' : progressPercentLabel}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
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

      <AICoachPanel
        isOpen={isCoachOpen}
        onClose={() => {
          onCoachToggle(false);
          onCoachUnreadChange(false);
        }}
        analysisData={analysisData}
        analysisKey={analysisKey}
        onRefreshHandled={() => {
          if (isCoachOpen) {
            onCoachUnreadChange(false);
          }
        }}
        onAssistantMessage={() => {
          if (!isCoachOpen) {
            onCoachUnreadChange(true);
          }
        }}
      />

    </div>
  );
}

export default Dashboard;
