import React, { useMemo } from 'react';
import { PieChart, Pie, Cell, LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import './Overview.css';

const CATEGORY_COLORS = {
  Food: '#ff6b6b',
  Transport: '#4ecdc4',
  Shopping: '#45b7d1',
  Bills: '#f9ca24',
  Entertainment: '#a29bfe',
  Health: '#fd79a8',
  Other: '#95afc0'
};

const formatCurrency = (amount) => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  }).format(amount || 0);
};

function Overview({ expenses = [], dateRange }) {

  // Debug: Log dateRange changes
  console.log('📊 Overview dateRange:', dateRange);
  console.log('📊 Overview expenses count:', expenses.length);

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

    const currentMonthExpenses = expenses.filter(exp => {
      const date = new Date(exp.date);
      return date >= currentStart && date <= currentEnd;
    });

    console.log('📊 Filtered expenses:', currentMonthExpenses.length, 'out of', expenses.length);

    const previousMonthExpenses = expenses.filter(exp => {
      const date = new Date(exp.date);
      return date >= prevStart && date <= prevEnd;
    });

    const currentMonthTotal = currentMonthExpenses.reduce((sum, exp) => sum + (exp.totalAmount || exp.amount || 0), 0);
    const previousMonthTotal = previousMonthExpenses.reduce((sum, exp) => sum + (exp.totalAmount || exp.amount || 0), 0);

    return { currentMonthExpenses, previousMonthExpenses, currentMonthTotal, previousMonthTotal };
  }, [expenses, dateRange]);

  // Calculate category spending
  const categorySpending = useMemo(() => {
    const spending = {};
    currentMonthExpenses.forEach(exp => {
      const category = exp.category || 'Other';
      spending[category] = (spending[category] || 0) + (exp.totalAmount || exp.amount || 0);
    });
    return spending;
  }, [currentMonthExpenses]);

  // Previous month category spending
  const previousCategorySpending = useMemo(() => {
    const spending = {};
    previousMonthExpenses.forEach(exp => {
      const category = exp.category || 'Other';
      spending[category] = (spending[category] || 0) + (exp.totalAmount || exp.amount || 0);
    });
    return spending;
  }, [previousMonthExpenses]);

  // Top spending category
  const topCategory = useMemo(() => {
    const entries = Object.entries(categorySpending);
    if (entries.length === 0) return { name: 'N/A', amount: 0 };
    const [name, amount] = entries.reduce((max, curr) => curr[1] > max[1] ? curr : max);
    return { name, amount };
  }, [categorySpending]);

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

  // Remaining budget (mock - should integrate with budgets)
  const totalBudget = 2000; // Mock budget
  const remainingBudget = totalBudget - currentMonthTotal;

  // Pie chart data
  const pieChartData = useMemo(() => {
    return Object.entries(categorySpending).map(([name, value]) => ({
      name,
      value,
      percentage: ((value / currentMonthTotal) * 100).toFixed(1)
    }));
  }, [categorySpending, currentMonthTotal]);

  // Line chart data (daily spending for current period)
  const lineChartData = useMemo(() => {
    if (currentMonthExpenses.length === 0) return [];

    // Get the date range
    const dates = currentMonthExpenses.map(exp => new Date(exp.date));
    const minDate = new Date(Math.min(...dates));
    const maxDate = new Date(Math.max(...dates));

    // If dateRange is provided, use it
    let startDate = dateRange?.startDate ? new Date(dateRange.startDate) : minDate;
    let endDate = dateRange?.endDate ? new Date(dateRange.endDate) : maxDate;

    const dailySpending = {};

    // Initialize all days in the range
    for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
      const day = d.getDate();
      dailySpending[day] = 0;
    }

    // Aggregate spending by day
    currentMonthExpenses.forEach(exp => {
      const day = new Date(exp.date).getDate();
      dailySpending[day] = (dailySpending[day] || 0) + (exp.totalAmount || exp.amount || 0);
    });

    // Convert to cumulative spending
    let cumulative = 0;
    return Object.entries(dailySpending).map(([day, amount]) => {
      cumulative += amount;
      return {
        day: parseInt(day),
        amount: cumulative
      };
    });
  }, [currentMonthExpenses, dateRange]);

  // Bar chart data (category comparison)
  const barChartData = useMemo(() => {
    const categories = new Set([...Object.keys(categorySpending), ...Object.keys(previousCategorySpending)]);
    return Array.from(categories).map(category => ({
      category,
      thisMonth: categorySpending[category] || 0,
      lastMonth: previousCategorySpending[category] || 0
    }));
  }, [categorySpending, previousCategorySpending]);

  // AI Insights
  const aiInsights = useMemo(() => {
    const insights = [];

    // Top category insight
    if (topCategory.amount > 0) {
      const percentage = ((topCategory.amount / currentMonthTotal) * 100).toFixed(0);
      insights.push(`You're spending ${percentage}% of your budget on ${topCategory.name}. ${
        percentage > 40 ? 'Consider reducing this category.' : 'This seems balanced.'
      }`);
    }

    // Spending trend insight
    if (Math.abs(spendingTrend) > 10) {
      insights.push(`Your spending is ${spendingTrend > 0 ? 'up' : 'down'} ${Math.abs(spendingTrend).toFixed(0)}% compared to last month.`);
    }

    // Category-specific insights
    Object.entries(categorySpending).forEach(([category, amount]) => {
      const previousAmount = previousCategorySpending[category] || 0;
      if (previousAmount > 0) {
        const change = ((amount - previousAmount) / previousAmount) * 100;
        if (Math.abs(change) > 20) {
          insights.push(`${category} spending ${change > 0 ? 'increased' : 'decreased'} by ${Math.abs(change).toFixed(0)}%.`);
        }
      }
    });

    // Budget insight
    if (remainingBudget < 0) {
      insights.push(`You're over budget by ${formatCurrency(Math.abs(remainingBudget))}. Try to reduce spending in high categories.`);
    } else if (remainingBudget < totalBudget * 0.2) {
      insights.push(`You have ${formatCurrency(remainingBudget)} left this month. Be mindful of your spending.`);
    }

    return insights.slice(0, 3);
  }, [topCategory, spendingTrend, categorySpending, previousCategorySpending, remainingBudget, currentMonthTotal, totalBudget]);

  // Projected period-end spending
  const projectedSpending = useMemo(() => {
    if (!dateRange || !dateRange.start || !dateRange.end) {
      // Default behavior for current month
      const now = new Date();
      const dayOfMonth = now.getDate();
      const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
      const dailyAverage = currentMonthTotal / dayOfMonth;
      return dailyAverage * daysInMonth;
    }

    // Calculate based on dateRange
    const startDate = new Date(dateRange.start);
    const endDate = new Date(dateRange.end);
    const now = new Date();

    // Days elapsed in the period
    const daysElapsed = Math.max(1, Math.ceil((now - startDate) / (1000 * 60 * 60 * 24)));
    const totalDays = Math.ceil((endDate - startDate) / (1000 * 60 * 60 * 24)) + 1;

    const dailyAverage = currentMonthTotal / daysElapsed;
    return dailyAverage * totalDays;
  }, [currentMonthTotal, dateRange]);

  return (
    <div className="overview-screen">
      <div className="overview-header">
        <h1>📈 Overview</h1>
        <p className="overview-subtitle">Your financial insights at a glance</p>
        {dateRange && (
          <p className="overview-period" style={{ fontSize: '14px', color: '#6b7280', marginTop: '8px' }}>
            Period: {new Date(dateRange.start).toLocaleDateString()} - {new Date(dateRange.end).toLocaleDateString()}
          </p>
        )}
      </div>

      {/* Smart Summary Cards */}
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
              {((topCategory.amount / currentMonthTotal) * 100).toFixed(0)}% of total spending
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

      {/* Visual Analytics */}
      <div className="analytics-section">
        <h2 className="section-title">📊 Visual Analytics</h2>

        <div className="charts-grid">
          {/* Pie Chart */}
          <div className="chart-card">
            <h3 className="chart-title">Spending by Category</h3>
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={pieChartData}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={({ name, percentage }) => `${name} ${percentage}%`}
                  outerRadius={80}
                  fill="#8884d8"
                  dataKey="value"
                >
                  {pieChartData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={CATEGORY_COLORS[entry.name] || '#95afc0'} />
                  ))}
                </Pie>
                <Tooltip formatter={(value) => formatCurrency(value)} />
              </PieChart>
            </ResponsiveContainer>
          </div>

          {/* Line Chart */}
          <div className="chart-card">
            <h3 className="chart-title">Spending Trend (Cumulative)</h3>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={lineChartData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="day" label={{ value: 'Day of Month', position: 'insideBottom', offset: -5 }} />
                <YAxis label={{ value: 'Amount ($)', angle: -90, position: 'insideLeft' }} />
                <Tooltip formatter={(value) => formatCurrency(value)} />
                <Line type="monotone" dataKey="amount" stroke="#667eea" strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          </div>

          {/* Bar Chart */}
          <div className="chart-card chart-card-wide">
            <h3 className="chart-title">Category Comparison: This Month vs Last Month</h3>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={barChartData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="category" />
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

      {/* AI Insights Panel */}
      <div className="ai-insights-panel">
        <div className="ai-insights-header">
          <div className="ai-icon-large">🤖</div>
          <div>
            <h2 className="ai-insights-title">💡 AI Coach Insights</h2>
            <p className="ai-insights-subtitle">Smart recommendations based on your spending</p>
          </div>
        </div>
        <div className="ai-insights-content">
          {aiInsights.map((insight, index) => (
            <div key={index} className="insight-item">
              <span className="insight-bullet">•</span>
              <p>{insight}</p>
            </div>
          ))}
        </div>
        <button className="ask-ai-btn">
          💬 Ask AI Coach
        </button>
      </div>

      {/* Forecast & Suggestions */}
      <div className="forecast-section">
        <h2 className="section-title">🔮 Forecast & Suggestions</h2>

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

        <button className="smart-plan-btn">
          💡 Get Smart Plan
        </button>
      </div>
    </div>
  );
}

export default Overview;
