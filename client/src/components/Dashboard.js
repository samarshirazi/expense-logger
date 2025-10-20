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

  const loadSummary = useCallback(async () => {
    try {
      setLoading(true);
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
  }, [dateRange]);

  useEffect(() => {
    loadSummary();
  }, [loadSummary]);

  useEffect(() => {
    if (!summary) {
      return;
    }

    if (summaryInitializedRef.current) {
      if (!isCoachOpen) {
        onCoachUnreadChange(true);
      }
    }

    summaryInitializedRef.current = true;
  }, [summary, isCoachOpen, onCoachUnreadChange]);

  useEffect(() => {
    if (isCoachOpen) {
      onCoachUnreadChange(false);
    }
  }, [isCoachOpen, onCoachUnreadChange]);

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    }).format(amount);
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
      recentExpenseIds: (analysisData.recentExpenses || []).map(item => item.id || `${item.date}:${item.merchantName}`)
    });
  }, [analysisData]);
  if (loading && !summary) {
    return (
      <div className="dashboard-loading">
        <div className="spinner"></div>
        <p>Loading dashboard...</p>
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
        onClose={() => onCoachToggle(false)}
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
