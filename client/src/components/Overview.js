import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { LineChart, Line, BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import './Overview.css';
import { getAllCategories } from '../services/categoryService';
import SummaryCards from './analytics/SummaryCards';
import CategoryOverview from './analytics/CategoryOverview';
import { CATEGORY_COLORS, CATEGORY_ICONS } from './analytics/categoryConstants';
import { normalizeBudgets } from '../constants/defaultBudgets';

const CHART_TABS = [
  { id: 'pie', label: 'Categories', icon: '🥧' },
  { id: 'line', label: 'Trend', icon: '📈' },
  { id: 'bars', label: 'Comparisons', icon: '📊' }
];

const formatCurrency = (amount) => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  }).format(amount || 0);
};

const formatPercent = (value) => `${Number.isFinite(value) ? Math.round(value) : 0}%`;

const MOBILE_BREAKPOINT = 900;

const RADIAN = Math.PI / 180;

const getIsMobileViewport = () => {
  if (typeof window === 'undefined') {
    return false;
  }
  return window.innerWidth <= MOBILE_BREAKPOINT;
};

function Overview({ expenses = [], dateRange, categoryBudgets = {} }) {

  // Debug: Log dateRange changes
  console.log('📊 Overview dateRange:', dateRange);
  console.log('📊 Overview expenses count:', expenses.length);


  const [isMobileLayout, setIsMobileLayout] = useState(() => getIsMobileViewport());
  const [categories, setCategories] = useState(() => getAllCategories());
  const [activeChartTab, setActiveChartTab] = useState('pie');
  const [barChartView, setBarChartView] = useState('daily');
  const [expandedCard, setExpandedCard] = useState(null);
  const touchStartRef = useRef(null);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return undefined;
    }
    const handleResize = () => setIsMobileLayout(getIsMobileViewport());
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    const handleCategoriesUpdated = () => {
      setCategories(getAllCategories());
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

  // Listen for expense data changes to auto-refresh
  // The Overview component will automatically re-render when expenses prop changes
  // since expenses are already passed from parent and updated there

  // Calculate current and previous period data based on timeline
  const { currentMonthExpenses, previousMonthExpenses, currentMonthTotal, previousMonthTotal } = useMemo(() => {
    // Use dateRange if provided, otherwise default to current month
    let currentStart, currentEnd, prevStart, prevEnd;

    if (dateRange?.startDate && dateRange?.endDate) {
      currentStart = new Date(dateRange.startDate);
      currentEnd = new Date(dateRange.endDate);

      console.log('📊 Using dateRange:', {
        start: currentStart.toLocaleDateString(),
        end: currentEnd.toLocaleDateString()
      });

      // Calculate previous period of same length
      const periodLength = currentEnd - currentStart;
      prevEnd = new Date(currentStart.getTime() - 1); // Day before current period
      prevStart = new Date(prevEnd.getTime() - periodLength);
    } else {
      // Default to current month
      const now = new Date();
      const currentYear = now.getFullYear();
      const currentMonth = now.getMonth();

      currentStart = new Date(currentYear, currentMonth, 1);
      currentEnd = new Date(currentYear, currentMonth + 1, 0);
      prevStart = new Date(currentYear, currentMonth - 1, 1);
      prevEnd = new Date(currentYear, currentMonth, 0);

      console.log('📊 Using default current month:', {
        start: currentStart.toLocaleDateString(),
        end: currentEnd.toLocaleDateString()
      });
    }

    // Parse dates as local dates to avoid timezone issues
    const parseLocalDate = (dateStr) => {
      if (!dateStr) return null;
      const [year, month, day] = dateStr.split('-').map(Number);
      return new Date(year, month - 1, day);
    };

    const currentMonthExpenses = expenses.filter(exp => {
      const date = parseLocalDate(exp.date);
      if (!date) return false;
      return date >= currentStart && date <= currentEnd;
    });

    console.log('📊 Filtered expenses:', currentMonthExpenses.length, 'out of', expenses.length);

    const previousMonthExpenses = expenses.filter(exp => {
      const date = parseLocalDate(exp.date);
      if (!date) return false;
      return date >= prevStart && date <= prevEnd;
    });

    const currentMonthTotal = currentMonthExpenses.reduce((sum, exp) => sum + (exp.totalAmount || exp.amount || 0), 0);
    const previousMonthTotal = previousMonthExpenses.reduce((sum, exp) => sum + (exp.totalAmount || exp.amount || 0), 0);

    return { currentMonthExpenses, previousMonthExpenses, currentMonthTotal, previousMonthTotal };
  }, [expenses, dateRange]);

  // Calculate category spending
  const categoryMetaMap = useMemo(() => {
    return categories.reduce((map, category) => {
      const key = category.id || category.name;
      if (!key) {
        return map;
      }
      map[key] = category;
      return map;
    }, {});
  }, [categories]);

  const categoryIdLookup = useMemo(() => {
    const lookup = {};
    categories.forEach(category => {
      const id = category.id || category.name;
      if (!id) {
        return;
      }
      lookup[id.toLowerCase()] = id;
      if (category.name) {
        lookup[category.name.toLowerCase()] = id;
      }
    });
    return lookup;
  }, [categories]);

  const normalizeCategoryId = useCallback((rawCategory) => {
    if (!rawCategory || typeof rawCategory !== 'string') {
      return 'Other';
    }
    const trimmed = rawCategory.trim();
    if (!trimmed) {
      return 'Other';
    }
    const lookupKey = trimmed.toLowerCase();
    return categoryIdLookup[lookupKey] || trimmed;
  }, [categoryIdLookup]);

  const getItemAmount = useCallback((item) => {
    if (!item) {
      return 0;
    }
    const candidates = [item.totalPrice, item.totalAmount, item.unitPrice];
    for (const candidate of candidates) {
      const numeric = Number(candidate);
      if (Number.isFinite(numeric) && numeric > 0) {
        return numeric;
      }
    }
    if (item.quantity && item.unitPrice) {
      const computed = Number(item.quantity) * Number(item.unitPrice);
      if (Number.isFinite(computed) && computed > 0) {
        return computed;
      }
    }
    return 0;
  }, []);

  const buildCategoryTotals = useCallback((expenseList = []) => {
    const totals = {};

    const applyAmount = (rawCategory, amount) => {
      const numericAmount = Number(amount) || 0;
      if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
        return;
      }
      const categoryId = normalizeCategoryId(rawCategory || 'Other');
      totals[categoryId] = (totals[categoryId] || 0) + numericAmount;
    };

    expenseList.forEach(expense => {
      if (!expense) {
        return;
      }
      if (Array.isArray(expense.items) && expense.items.length > 0) {
        expense.items.forEach(item => {
          applyAmount(item?.category || expense.category, getItemAmount(item));
        });
      } else {
        applyAmount(expense.category, expense.totalAmount || expense.amount || 0);
      }
    });

    return totals;
  }, [getItemAmount, normalizeCategoryId]);

  const categorySpending = useMemo(() => {
    return buildCategoryTotals(currentMonthExpenses);
  }, [buildCategoryTotals, currentMonthExpenses]);

  // Previous month category spending
  const previousCategorySpending = useMemo(() => {
    return buildCategoryTotals(previousMonthExpenses);
  }, [buildCategoryTotals, previousMonthExpenses]);

  // Build dynamic color map including custom categories
  const categoryColorMap = useMemo(() => {
    // Start with base category colors - these are already defined
    const colorMap = { ...CATEGORY_COLORS };

    // Ensure the core categories all have colors (they should from CATEGORY_COLORS)
    const FIXED_CATEGORIES = ['Food', 'Transport', 'Shopping', 'Bills', 'Entertainment', 'Health', 'Other'];
    const extendedColors = [
      '#ff6b6b', '#4ecdc4', '#45b7d1', '#f9ca24', '#a29bfe',
      '#fd79a8', '#95afc0', '#e17055', '#74b9ff', '#6c5ce7',
      '#55efc4', '#ffeaa7', '#fab1a0', '#ff7675', '#fdcb6e',
      '#00b894', '#0984e3', '#b2bec3', '#e84393', '#fd79a8'
    ];

    // Make sure all fixed categories have colors
    FIXED_CATEGORIES.forEach((categoryName, index) => {
      if (!colorMap[categoryName]) {
        colorMap[categoryName] = extendedColors[index % extendedColors.length];
      }
    });

    // Add colors from custom categories defined by user
    categories.forEach(cat => {
      const categoryKey = cat.id || cat.name;
      if (categoryKey && cat.color) {
        colorMap[categoryKey] = cat.color;
      }
    });

    // Get all unique categories from current and previous spending
    const allCategories = new Set([
      ...FIXED_CATEGORIES,
      ...Object.keys(categorySpending),
      ...Object.keys(previousCategorySpending)
    ]);

    // Assign colors to any additional categories that don't have one yet
    let colorIndex = FIXED_CATEGORIES.length;
    allCategories.forEach(categoryName => {
      if (!colorMap[categoryName]) {
        colorMap[categoryName] = extendedColors[colorIndex % extendedColors.length];
        colorIndex++;
      }
    });

    console.log('📊 Category Color Map:', colorMap);
    console.log('📊 Fixed Categories:', FIXED_CATEGORIES);

    return colorMap;
  }, [categories, categorySpending, previousCategorySpending]);

  // Top spending category
  const topCategory = useMemo(() => {
    const entries = Object.entries(categorySpending);
    if (entries.length === 0) return { id: 'N/A', name: 'N/A', amount: 0 };
    const [categoryId, amount] = entries.reduce((max, curr) => (curr[1] > max[1] ? curr : max));
    const displayName = categoryMetaMap[categoryId]?.name || categoryId;
    return { id: categoryId, name: displayName, amount };
  }, [categoryMetaMap, categorySpending]);

  // Calculate savings (mock data - would integrate with Income & Savings)
  const savings = useMemo(() => {
    const assumedIncome = 3000; // Mock - should come from Income & Savings
    return assumedIncome - currentMonthTotal;
  }, [currentMonthTotal]);

  // Spending trend calculation
  const spendingTrend = useMemo(() => {
    if (previousMonthTotal === 0) return 0;
    return ((currentMonthTotal - previousMonthTotal) / previousMonthTotal) * 100;
  }, [currentMonthTotal, previousMonthTotal]);

  const mergedBudgets = useMemo(
    () => normalizeBudgets(categoryBudgets, categories),
    [categoryBudgets, categories]
  );

  const totalBudget = useMemo(() => {
    return Object.values(mergedBudgets || {}).reduce((sum, value) => sum + (value || 0), 0);
  }, [mergedBudgets]);

  const remainingBudget = totalBudget - currentMonthTotal;

  // Build unified category list so charts always see every tracked category
  const allCategoryIds = useMemo(() => {
    const idsFromConfig = categories
      .map(category => category.id || category.name)
      .filter(Boolean);
    const idsFromBudget = Object.keys(mergedBudgets || {});
    const idsFromCurrent = Object.keys(categorySpending || {});
    const idsFromPrevious = Object.keys(previousCategorySpending || {});

    return Array.from(new Set([
      ...idsFromConfig,
      ...idsFromBudget,
      ...idsFromCurrent,
      ...idsFromPrevious
    ])).filter(Boolean);
  }, [categories, mergedBudgets, categorySpending, previousCategorySpending]);

  // Pie chart data - now mirrors every known category with consistent coloring
  const pieChartData = useMemo(() => {
    const fallbackColor = '#dfe6e9';

    const chartData = allCategoryIds.map(categoryId => {
      const spent = categorySpending[categoryId] || 0;
      const percentage = currentMonthTotal > 0
        ? Number(((spent / currentMonthTotal) * 100).toFixed(1))
        : 0;

      const configuredCategory = categoryMetaMap[categoryId];
      const displayName = configuredCategory?.name || categoryId;

      return {
        id: categoryId,
        name: displayName,
        value: spent,
        percentage,
        color: categoryColorMap[categoryId]
          || configuredCategory?.color
          || CATEGORY_COLORS[categoryId]
          || CATEGORY_COLORS[displayName]
          || fallbackColor
      };
    });

    console.log('📊 Unified Categories:', allCategoryIds);
    console.log('📊 Category Spending:', categorySpending);
    console.log('📊 Pie Chart Data (all categories):', chartData);

    return chartData;
  }, [allCategoryIds, categoryColorMap, categoryMetaMap, categorySpending, currentMonthTotal]);

  const pieChartHasData = useMemo(
    () => pieChartData.some(entry => entry.value > 0),
    [pieChartData]
  );

  const pieChartLegend = useMemo(() => {
    return pieChartData.map(entry => ({
      id: entry.id,
      label: entry.name,
      value: entry.value,
      percentage: entry.percentage,
      color: entry.color
    }));
  }, [pieChartData]);

  const pieLabelRenderer = useCallback(
    ({ cx, cy, midAngle, outerRadius, percent, payload }) => {
      if (!Number.isFinite(percent) || percent < 0.01) {
        return null;
      }

      const sliceColor = payload?.color || '#667eea';
      const angle = -midAngle * RADIAN;
      const startRadius = outerRadius + 4;
      const endRadius = outerRadius + (isMobileLayout ? 18 : 28);
      const startX = cx + startRadius * Math.cos(angle);
      const startY = cy + startRadius * Math.sin(angle);
      const endX = cx + endRadius * Math.cos(angle);
      const endY = cy + endRadius * Math.sin(angle);
      const textAnchor = endX > cx ? 'start' : 'end';
      const offset = textAnchor === 'start' ? 8 : -8;

      const rawName = payload?.name || 'Category';
      const normalizedName = isMobileLayout && rawName.length > 12
        ? `${rawName.slice(0, 11)}…`
        : rawName;
      const displayPercent = `${(percent * 100).toFixed(1)}%`;
      const labelText = `${normalizedName} ${displayPercent}`;

      return (
        <g>
          <line
            x1={startX}
            y1={startY}
            x2={endX}
            y2={endY}
            stroke={sliceColor}
            strokeWidth={2}
            strokeLinecap="round"
          />
          <text
            x={endX + offset}
            y={endY}
            fill={sliceColor}
            fontSize={isMobileLayout ? 11 : 13}
            fontWeight="600"
            textAnchor={textAnchor}
            dominantBaseline="central"
          >
            {labelText}
          </text>
        </g>
      );
    },
    [isMobileLayout]
  );

  // Line chart + daily bar data (daily spending for current period)
  const { lineChartData, dailySpendingData } = useMemo(() => {
    const parseLocalDate = (dateStr) => {
      if (!dateStr) return null;
      const [year, month, day] = dateStr.split('-').map(Number);
      return new Date(year, month - 1, day);
    };

    const normalize = (date) => new Date(date.getFullYear(), date.getMonth(), date.getDate());
    const formatKey = (date) => {
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    };

    const now = new Date();
    let rangeStart;
    let rangeEnd;

    if (dateRange?.startDate && dateRange?.endDate) {
      const [startYear, startMonth, startDay] = dateRange.startDate.split('-').map(Number);
      const [endYear, endMonth, endDay] = dateRange.endDate.split('-').map(Number);
      rangeStart = new Date(startYear, startMonth - 1, startDay);
      rangeEnd = new Date(endYear, endMonth - 1, endDay);
    } else if (currentMonthExpenses.length > 0) {
      const expenseDates = currentMonthExpenses.map(exp => parseLocalDate(exp.date)).filter(Boolean);
      if (expenseDates.length > 0) {
        rangeStart = new Date(Math.min(...expenseDates));
        rangeEnd = new Date(Math.max(...expenseDates));
      } else {
        rangeStart = new Date(now.getFullYear(), now.getMonth(), 1);
        rangeEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);
      }
    } else {
      rangeStart = new Date(now.getFullYear(), now.getMonth(), 1);
      rangeEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    }

    rangeStart = normalize(rangeStart);
    rangeEnd = normalize(rangeEnd);

    if (rangeStart > rangeEnd) {
      return { lineChartData: [], dailySpendingData: [] };
    }

    const today = normalize(now);
    const isCurrentPeriod = today >= rangeStart && today <= rangeEnd;
    const effectiveEnd = isCurrentPeriod ? today : rangeEnd;

    const dailyTotals = {};
    for (let d = new Date(rangeStart); d <= effectiveEnd; d.setDate(d.getDate() + 1)) {
      dailyTotals[formatKey(d)] = 0;
    }

    currentMonthExpenses.forEach(exp => {
      const expDate = parseLocalDate(exp.date);
      if (!expDate) return;
      const normalizedExpDate = normalize(expDate);
      if (normalizedExpDate < rangeStart || normalizedExpDate > effectiveEnd) {
        return;
      }
      const key = formatKey(normalizedExpDate);
      dailyTotals[key] = (dailyTotals[key] || 0) + (exp.totalAmount || exp.amount || 0);
    });

    const orderedKeys = Object.keys(dailyTotals).sort();
    let cumulative = 0;
    const cumulativeData = orderedKeys.map(key => {
      cumulative += dailyTotals[key];
      return {
        day: parseInt(key.split('-')[2], 10),
        amount: cumulative
      };
    });

    const perDayData = orderedKeys.map(key => ({
      day: parseInt(key.split('-')[2], 10),
      amount: dailyTotals[key]
    }));

    return { lineChartData: cumulativeData, dailySpendingData: perDayData };
  }, [currentMonthExpenses, dateRange]);

  // Bar chart data (category comparison)
  const barChartData = useMemo(() => {
    const categoriesSet = new Set([...Object.keys(categorySpending), ...Object.keys(previousCategorySpending)]);
    return Array.from(categoriesSet).map(categoryId => ({
      categoryId,
      category: categoryMetaMap[categoryId]?.name || categoryId,
      thisMonth: categorySpending[categoryId] || 0,
      lastMonth: previousCategorySpending[categoryId] || 0
    }));
  }, [categoryMetaMap, categorySpending, previousCategorySpending]);


  // Projected period-end spending
  const projectedSpending = useMemo(() => {
    const DAY_IN_MS = 1000 * 60 * 60 * 24;
    const normalize = (date) => new Date(date.getFullYear(), date.getMonth(), date.getDate());
    const now = new Date();

    let startDate;
    let endDate;
    if (dateRange?.startDate && dateRange?.endDate) {
      startDate = new Date(dateRange.startDate);
      endDate = new Date(dateRange.endDate);
    } else {
      const currentYear = now.getFullYear();
      const currentMonth = now.getMonth();
      startDate = new Date(currentYear, currentMonth, 1);
      endDate = new Date(currentYear, currentMonth + 1, 0);
    }

    startDate = normalize(startDate);
    endDate = normalize(endDate);

    if (startDate > endDate) {
      return currentMonthTotal;
    }

    const normalizedNow = normalize(now);
    const effectiveNow = normalizedNow < startDate
      ? startDate
      : (normalizedNow > endDate ? endDate : normalizedNow);

    const daysElapsed = Math.max(1, Math.floor((effectiveNow - startDate) / DAY_IN_MS) + 1);
    const totalDays = Math.max(1, Math.floor((endDate - startDate) / DAY_IN_MS) + 1);

    const dailyAverage = currentMonthTotal / daysElapsed;
    return dailyAverage * totalDays;
  }, [currentMonthTotal, dateRange]);

  const chartTabs = CHART_TABS;
  const budgetUsedPercent = totalBudget ? Math.min(100, (currentMonthTotal / totalBudget) * 100) : 0;
  const summaryLine = `${formatCurrency(currentMonthTotal)} spent of ${formatCurrency(totalBudget)} (${formatPercent(budgetUsedPercent)})`;
  const savingsLine = remainingBudget >= 0
    ? `You're on track to save ${formatCurrency(remainingBudget)} this month.`
    : `You're trending ${formatCurrency(Math.abs(remainingBudget))} over budget.`;
  const averageDailySpend = dailySpendingData.length
    ? currentMonthTotal / dailySpendingData.length
    : 0;

  const summaryCards = useMemo(() => {
    const normalizedTrend = Number.isFinite(spendingTrend) ? Math.abs(spendingTrend).toFixed(1) : '0.0';
    const topShare = currentMonthTotal > 0
      ? (topCategory.amount / currentMonthTotal) * 100
      : 0;

    return [
      {
        id: 'total',
        icon: '💸',
        label: 'Total Spent',
        value: formatCurrency(currentMonthTotal),
        subValue: `${formatPercent(budgetUsedPercent)} of ${formatCurrency(totalBudget)}`,
        trendDirection: spendingTrend >= 0 ? 'up' : 'down',
        trend: `${spendingTrend >= 0 ? '↑' : '↓'} ${normalizedTrend}% vs last month`,
        detail: Number.isFinite(spendingTrend)
          ? `${spendingTrend >= 0 ? 'Above' : 'Below'} your usual pace`
          : 'Not enough data to compare yet.'
      },
      {
        id: 'totalBudget',
        icon: '💰',
        label: 'Total Budget',
        value: formatCurrency(totalBudget),
        subValue: remainingBudget >= 0 ? `${formatCurrency(remainingBudget)} remaining` : `${formatCurrency(Math.abs(remainingBudget))} over`,
        trendDirection: remainingBudget >= 0 ? 'down' : 'up',
        trend: remainingBudget >= 0 ? 'Under budget' : 'Over budget',
        detail: remainingBudget >= 0
          ? 'You\'re staying within your limits.'
          : 'Consider adjusting your spending.'
      },
      {
        id: 'remaining',
        icon: '🎯',
        label: 'Remaining',
        value: formatCurrency(Math.abs(remainingBudget)),
        subValue: remainingBudget >= 0 ? 'left to spend' : 'over budget',
        trendDirection: remainingBudget >= 0 ? 'down' : 'up',
        trend: remainingBudget >= 0 ? 'On track' : 'Over budget',
        detail: remainingBudget >= 0
          ? `${formatPercent(100 - budgetUsedPercent)} budget remaining`
          : 'Tighten spending to avoid overruns.'
      },
      {
        id: 'category',
        icon: CATEGORY_ICONS[topCategory.name] || '📊',
        label: 'Top Category',
        value: topCategory.name,
        valueVariant: 'small',
        amount: formatCurrency(topCategory.amount),
        trendDirection: 'up',
        detail: `${formatPercent(topShare)} of this period`
      }
    ];
  }, [currentMonthTotal, remainingBudget, spendingTrend, budgetUsedPercent, topCategory, totalBudget]);

  const activeSummaryCard = summaryCards.find(card => card.id === expandedCard);

  const chartTip = useMemo(() => {
    if (activeChartTab === 'pie') {
      const share = currentMonthTotal > 0 ? (topCategory.amount / currentMonthTotal) * 100 : 0;
      return `${topCategory.name} is ${formatPercent(share)} of your spending.`;
    }

    if (activeChartTab === 'line') {
      if (!Number.isFinite(spendingTrend)) {
        return 'Log more history to unlock spending comparisons.';
      }
      return spendingTrend >= 0
        ? `Spending is ${Math.abs(spendingTrend).toFixed(0)}% higher than last period.`
        : `Spending is ${Math.abs(spendingTrend).toFixed(0)}% lower than last period.`;
    }

    if (barChartView === 'daily') {
      return `Average daily spend is ${formatCurrency(averageDailySpend || 0)}.`;
    }

    const deltaCategory = barChartData.reduce((acc, entry) => {
      const delta = (entry.thisMonth || 0) - (entry.lastMonth || 0);
      if (Math.abs(delta) > Math.abs(acc.delta)) {
        return { label: entry.category, delta };
      }
      return acc;
    }, { label: null, delta: 0 });

    if (!deltaCategory.label) {
      return 'Compare categories month over month to spot shifts.';
    }

    const direction = deltaCategory.delta >= 0 ? 'up' : 'down';
    return `${deltaCategory.label} is ${direction} ${formatCurrency(Math.abs(deltaCategory.delta))} vs last month.`;
  }, [activeChartTab, topCategory, currentMonthTotal, spendingTrend, barChartView, averageDailySpend, barChartData]);

  const handleCardExpand = (cardId) => {
    setExpandedCard(cardId);
  };

  const closeExpandedCard = () => {
    setExpandedCard(null);
  };

  const handleAIBubbleClick = () => {
    if (typeof document === 'undefined') {
      return;
    }
    const panel = document.getElementById('overview-ai-panel');
    if (panel && typeof panel.scrollIntoView === 'function') {
      panel.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  };

  const handleChartTouchStart = (event) => {
    if (!event.touches?.length) {
      return;
    }
    touchStartRef.current = event.touches[0].clientX;
  };

  const handleChartTouchEnd = (event) => {
    if (!event.changedTouches?.length || touchStartRef.current == null) {
      return;
    }

    const deltaX = event.changedTouches[0].clientX - touchStartRef.current;
    touchStartRef.current = null;

    if (Math.abs(deltaX) < 50) {
      return;
    }

    const direction = deltaX > 0 ? -1 : 1;
    const currentIndex = chartTabs.findIndex(tab => tab.id === activeChartTab);
    const nextIndex = Math.min(chartTabs.length - 1, Math.max(0, currentIndex + direction));
    setActiveChartTab(chartTabs[nextIndex].id);
  };

  const renderMobileLayout = () => (
    <div className="m-overview-screen">
      <div className="overview-header">
        <div className="overview-title-row">
          <div>
            <h1>Overview <span className="overview-title-glow">✨</span></h1>
            <p className="overview-summary-line">{summaryLine}</p>
            <p className="overview-subtext">{savingsLine}</p>
          </div>
          <button
            type="button"
            className="overview-ai-bubble"
            aria-label="Jump to AI insights"
            onClick={handleAIBubbleClick}
          >
            💬
          </button>
        </div>
      </div>

      <SummaryCards
        cards={summaryCards}
        interactive
        variant="mobile"
        onCardSelect={handleCardExpand}
      />

      {expandedCard && activeSummaryCard && (
        <div className="summary-sheet-backdrop" onClick={closeExpandedCard}>
          <div className="summary-bottom-sheet" onClick={(event) => event.stopPropagation()}>
            <div className="sheet-handle" />
            <h3>{activeSummaryCard.label}</h3>
            <p className="sheet-value">{activeSummaryCard.value}</p>
            {activeSummaryCard.subValue && <p className="sheet-subvalue">{activeSummaryCard.subValue}</p>}
            <p className="sheet-detail">{activeSummaryCard.detail}</p>
            <button type="button" className="sheet-close-btn" onClick={closeExpandedCard}>
              Close
            </button>
          </div>
        </div>
      )}

      <section className="charts-section" onTouchStart={handleChartTouchStart} onTouchEnd={handleChartTouchEnd}>
        <div className="chart-tabs">
          {chartTabs.map(tab => (
            <button
              type="button"
              key={tab.id}
              className={`chart-tab ${activeChartTab === tab.id ? 'active' : ''}`}
              onClick={() => setActiveChartTab(tab.id)}
            >
              <span className="chart-tab-icon">{tab.icon}</span>
              <span>{tab.label}</span>
            </button>
          ))}
        </div>
        <div className="chart-tab-indicators">
          {chartTabs.map(tab => (
            <span key={tab.id} className={`chart-dot ${activeChartTab === tab.id ? 'active' : ''}`} />
          ))}
        </div>

        <div className={`chart-panel active-${activeChartTab}`}>
          {activeChartTab === 'pie' && (
            <>
              <h3 className="chart-title">Spending by Category</h3>
              {pieChartHasData ? (
                <div className="pie-chart-layout">
                  <div className="pie-chart-visual">
                    <ResponsiveContainer width="100%" height={isMobileLayout ? 300 : 320}>
                      <PieChart>
                        <Pie
                          data={pieChartData}
                          dataKey="value"
                          nameKey="name"
                          cx="50%"
                          cy="50%"
                          innerRadius={isMobileLayout ? 50 : 80}
                          outerRadius={isMobileLayout ? 85 : 120}
                          paddingAngle={2}
                          labelLine={false}
                          label={pieLabelRenderer}
                        >
                          {pieChartData.map((entry) => (
                            <Cell key={`pie-slice-${entry.id}`} fill={entry.color} />
                          ))}
                        </Pie>
                        <Tooltip
                          formatter={(value, name, { payload }) => {
                            const percent = Number(payload?.percentage);
                            const percentLabel = Number.isFinite(percent) ? `${percent.toFixed(1)}%` : '';
                            return [formatCurrency(value), percentLabel ? `${name} (${percentLabel})` : name];
                          }}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="pie-chart-legend">
                    {pieChartLegend.map(item => (
                      <div key={item.id || item.label} className="pie-legend-item">
                        <div className="pie-legend-label">
                          <span className="pie-legend-dot" style={{ backgroundColor: item.color }} />
                          <div>
                            <p className="pie-legend-name">{item.label}</p>
                            <p className="pie-legend-sub">
                              {formatCurrency(item.value)} · {item.percentage.toFixed(1)}%
                            </p>
                          </div>
                        </div>
                        <div className="pie-legend-bar">
                          <span style={{ width: `${Math.min(100, item.percentage)}%`, backgroundColor: item.color }} />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="chart-empty-state">Log a few expenses to unlock this view.</div>
              )}

            </>
          )}

          {activeChartTab === 'line' && (
            lineChartData.length ? (
              <ResponsiveContainer width="100%" height={320}>
                <LineChart data={lineChartData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis
                    dataKey="day"
                    label={{ value: 'Day of Month', position: 'insideBottom', offset: -5 }}
                    interval="preserveStartEnd"
                    minTickGap={20}
                  />
                  <YAxis label={{ value: 'Amount ($)', angle: -90, position: 'insideLeft' }} />
                  <Tooltip formatter={(value) => formatCurrency(value)} />
                  <Line type="monotone" dataKey="amount" stroke="#667eea" strokeWidth={3} dot={{ r: 3 }} activeDot={{ r: 5 }} />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div className="chart-empty-state">Spending trend will appear once you add expenses.</div>
            )
          )}

          {activeChartTab === 'bars' && (
            <>
              <div className="bar-mode-toggle">
                <button
                  type="button"
                  className={barChartView === 'daily' ? 'active' : ''}
                  onClick={() => setBarChartView('daily')}
                >
                  Daily Spend
                </button>
                <button
                  type="button"
                  className={barChartView === 'category' ? 'active' : ''}
                  onClick={() => setBarChartView('category')}
                >
                  Category Compare
                </button>
              </div>
              {barChartView === 'daily' ? (
                dailySpendingData.length ? (
                  <ResponsiveContainer width="100%" height={320}>
                    <BarChart data={dailySpendingData}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis
                        dataKey="day"
                        label={{ value: 'Day of Month', position: 'insideBottom', offset: -5 }}
                        interval="preserveStartEnd"
                        minTickGap={20}
                      />
                      <YAxis label={{ value: 'Amount ($)', angle: -90, position: 'insideLeft' }} />
                      <Tooltip formatter={(value) => formatCurrency(value)} />
                      <Bar dataKey="amount" fill="#ff6b6b" radius={[6, 6, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="chart-empty-state">Daily activity will appear after a few logs.</div>
                )
              ) : barChartData.length ? (
                <ResponsiveContainer width="100%" height={320}>
                  <BarChart data={barChartData} layout="horizontal" margin={{ left: 20, right: 20, top: 10, bottom: 20 }}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis
                      dataKey="category"
                      angle={barChartData.length > 5 ? -45 : 0}
                      textAnchor={barChartData.length > 5 ? "end" : "middle"}
                      height={barChartData.length > 5 ? 80 : 60}
                      interval={0}
                      tick={{ fontSize: 11 }}
                    />
                    <YAxis label={{ value: 'Amount ($)', angle: -90, position: 'insideLeft' }} />
                    <Tooltip formatter={(value) => formatCurrency(value)} />
                    <Legend />
                    <Bar dataKey="thisMonth" fill="#667eea" name="This Month" radius={[6, 6, 0, 0]} />
                    <Bar dataKey="lastMonth" fill="#c3aed6" name="Last Month" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="chart-empty-state">Need at least two months of data for comparisons.</div>
              )}
            </>
          )}

          <div className="chart-ai-tip">
            <span className="chart-ai-icon">🤖</span>
            <p>{chartTip}</p>
          </div>
        </div>
      </section>

      <div className="forecast-sticky">
        <div className="forecast-card compact">
          <div className="forecast-header">
            <div>
              <p className="forecast-label">Projected Month-End Spending</p>
              <p className="forecast-amount">
                {formatCurrency(projectedSpending)} <span>of {formatCurrency(totalBudget)}</span>
              </p>
            </div>
            <span className={`forecast-chip ${projectedSpending <= totalBudget ? 'positive' : 'warning'}`}>
              {projectedSpending <= totalBudget ? '3% under budget 🎉' : 'Needs attention ⚠️'}
            </span>
          </div>
          <div className="forecast-progress">
            <div
              className="forecast-progress-fill"
              style={{
                width: `${Math.min(100, (projectedSpending / totalBudget) * 100)}%`,
                backgroundColor: projectedSpending > totalBudget ? '#ff6b6b' : '#4ecdc4'
              }}
            />
          </div>
          <div className="forecast-footer">
            <span>{projectedSpending <= totalBudget ? 'Forecast: under budget 🎉' : 'Forecast: over budget ⚠️'}</span>
          </div>
        </div>
      </div>
    </div>
  );

  const renderDesktopLayout = () => (
    <div className="overview-screen">
      <div className="overview-header">
        <h1>📈 Overview</h1>
        <p className="overview-subtitle">Your financial insights at a glance</p>
      </div>

      <div className="summary-cards">
        <div className="summary-card">
          <div className="card-icon">💸</div>
          <div className="card-content">
            <div className="card-label">Total Spent</div>
            <div className="card-value">{formatCurrency(currentMonthTotal)}</div>
            <div className={`card-trend ${spendingTrend > 0 ? 'up' : 'down'}`}>
              {spendingTrend > 0 ? '↑' : '↓'} {Math.abs(spendingTrend).toFixed(1)}% vs last month
            </div>
            <div className="card-ai-tip">
              {spendingTrend > 12 ? `You're ${spendingTrend.toFixed(0)}% above usual pace.` : 'On track with last month.'}
            </div>
          </div>
        </div>

        <div className="summary-card">
          <div className="card-icon">💰</div>
          <div className="card-content">
            <div className="card-label">Remaining Budget</div>
            <div className="card-value">{formatCurrency(remainingBudget)}</div>
            <div className={`card-trend ${remainingBudget > 0 ? 'positive' : 'negative'}`}>
              {remainingBudget > 0 ? 'Under budget' : 'Over budget'}
            </div>
            <div className="card-ai-tip">
              {remainingBudget > 0 ? `${((remainingBudget / totalBudget) * 100).toFixed(0)}% remaining` : 'Reduce spending'}
            </div>
          </div>
        </div>

        <div className="summary-card">
          <div className="card-icon">🎯</div>
          <div className="card-content">
            <div className="card-label">Top Category</div>
            <div className="card-value-small">{topCategory.name}</div>
            <div className="card-amount">{formatCurrency(topCategory.amount)}</div>
            <div className="card-ai-tip">
              {currentMonthTotal > 0 ? `${((topCategory.amount / currentMonthTotal) * 100).toFixed(0)}% of total spending` : 'Keep logging expenses'}
            </div>
          </div>
        </div>

        <div className="summary-card">
          <div className="card-icon">🏦</div>
          <div className="card-content">
            <div className="card-label">Savings</div>
            <div className="card-value">{formatCurrency(savings)}</div>
            <div className={`card-trend ${savings > 0 ? 'positive' : 'negative'}`}>
              {savings > 0 ? 'On track' : 'Over spending'}
            </div>
            <div className="card-ai-tip">
              {savings > 0 ? `${((savings / 3000) * 100).toFixed(0)}% saved` : 'Increase income'}
            </div>
          </div>
        </div>
      </div>

      <div className="analytics-section">
        <h2 className="section-title">📊 Visual Analytics</h2>

        <div className="charts-grid">
          <div className="chart-card">
            <h3 className="chart-title">Spending by Category</h3>
            <CategoryOverview
              data={pieChartData}
              colors={categoryColorMap}
              showRemaining={false}
              height={300}
              emptyMessage="Log a few expenses to unlock this view."
              isMobile={false}
            />
          </div>

          <div className="chart-card">
            <h3 className="chart-title">Spending Trend (Cumulative)</h3>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={lineChartData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis
                  dataKey="day"
                  label={{ value: 'Day of Month', position: 'insideBottom', offset: -5 }}
                  interval="preserveStartEnd"
                  minTickGap={30}
                />
                <YAxis label={{ value: 'Amount ($)', angle: -90, position: 'insideLeft' }} />
                <Tooltip formatter={(value) => formatCurrency(value)} />
                <Line type="monotone" dataKey="amount" stroke="#667eea" strokeWidth={2} dot={{ r: 2 }} activeDot={{ r: 4 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>

          <div className="chart-card">
            <h3 className="chart-title">Daily Spending</h3>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={dailySpendingData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis
                  dataKey="day"
                  label={{ value: 'Day of Month', position: 'insideBottom', offset: -5 }}
                  interval="preserveStartEnd"
                  minTickGap={30}
                />
                <YAxis label={{ value: 'Amount ($)', angle: -90, position: 'insideLeft' }} />
                <Tooltip formatter={(value) => formatCurrency(value)} />
                <Bar dataKey="amount" fill="#ff6b6b" name="Spent" />
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="chart-card chart-card-wide">
            <h3 className="chart-title">Category Comparison: This Month vs Last Month</h3>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={barChartData} margin={{ bottom: barChartData.length > 5 ? 60 : 20 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis
                  dataKey="category"
                  angle={barChartData.length > 5 ? -45 : 0}
                  textAnchor={barChartData.length > 5 ? "end" : "middle"}
                  height={barChartData.length > 5 ? 80 : 50}
                  interval={0}
                  tick={{ fontSize: 12 }}
                />
                <YAxis label={{ value: 'Amount ($)', angle: -90, position: 'insideLeft' }} />
                <Tooltip formatter={(value) => formatCurrency(value)} />
                <Legend />
                <Bar dataKey="thisMonth" fill="#667eea" name="This Month" />
                <Bar dataKey="lastMonth" fill="#a29bfe" name="Last Month" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div className="forecast-section">
        <h2 className="section-title">🔮 Spending Forecast</h2>

        <div className="forecast-card">
          <h3 className="forecast-title">Projected Month-End Spending</h3>
          <div className="forecast-amount">
            {formatCurrency(projectedSpending)} <span className="forecast-budget">of {formatCurrency(totalBudget)}</span>
          </div>
          <div className="forecast-progress">
            <div
              className="forecast-progress-fill"
              style={{
                width: `${Math.min(100, (projectedSpending / totalBudget) * 100)}%`,
                backgroundColor: projectedSpending > totalBudget ? '#ff6b6b' : projectedSpending > totalBudget * 0.9 ? '#f9ca24' : '#4ecdc4'
              }}
            />
          </div>
          <div className="forecast-status">
            {projectedSpending > totalBudget ? (
              <span className="forecast-warning">⚠️ Projected to exceed budget by {formatCurrency(projectedSpending - totalBudget)}</span>
            ) : (
              <span className="forecast-good">✅ On track to stay within budget</span>
            )}
          </div>
        </div>
      </div>
    </div>
  );

  return isMobileLayout ? renderMobileLayout() : renderDesktopLayout();
}
export default Overview;
