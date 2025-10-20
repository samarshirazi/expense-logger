import React, { useState, useEffect, useCallback, useMemo } from 'react';
import axios from 'axios';
import authService from '../services/authService';
import './Dashboard.css';

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

function Dashboard({ dateRange }) {
  const [summary, setSummary] = useState(null);
  const [progressSummary, setProgressSummary] = useState(null);
  const [loading, setLoading] = useState(true);

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

      const [rangeResponse, progressResponse] = await Promise.all([
        summaryRequest,
        safeProgressPromise
      ]);

      setSummary(rangeResponse.data);
      setProgressSummary(progressResponse?.data || rangeResponse.data);
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

  const monthBounds = useMemo(() => getMonthBounds(monthKey), [monthKey]);

  const isFullMonthView = useMemo(() => {
    if (!monthBounds) return false;
    if (!dateRange?.startDate || !dateRange?.endDate) return false;
    return dateRange.startDate === monthBounds.start && dateRange.endDate === monthBounds.end;
  }, [dateRange, monthBounds]);

  const categoryBudget = useMemo(() => getEffectiveBudgetForMonth(monthKey), [monthKey]);

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

  if (loading && !summary) {
    return (
      <div className="dashboard-loading">
        <div className="spinner"></div>
        <p>Loading dashboard...</p>
      </div>
    );
  }

  const totalEntries = effectiveSummary?.expenseCount || 0;
  const totalSpendingValue = effectiveSummary?.totalSpending || 0;
  const totalsSubtitle = isFullMonthView ? 'This month' : 'Month to date';

  return (
    <div className="dashboard">
      <div className="dashboard-header">
        <h1>Dashboard</h1>
        <p>Overview of your spending</p>
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

    </div>
  );
}

export default Dashboard;
