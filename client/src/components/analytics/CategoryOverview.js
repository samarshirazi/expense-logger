import React from 'react';
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip, Legend } from 'recharts';
import { CATEGORY_COLORS } from './categoryConstants';
import './CategoryOverview.css';

function CategoryOverview({
  data = [],
  colors = CATEGORY_COLORS,
  remainingBudget,
  totalBudget,
  budgetUsedPercent,
  height = 300,
  showRemaining = true,
  emptyMessage = 'No category activity yet.',
  isMobile = false
}) {
  if (!Array.isArray(data) || data.length === 0) {
    return <div className="category-overview-empty">{emptyMessage}</div>;
  }

  const remainingPercent = totalBudget && budgetUsedPercent != null
    ? Math.max(0, 100 - Math.round(budgetUsedPercent))
    : null;

  // Fallback colors if a category doesn't have one
  const fallbackColors = [
    '#ff6b6b', '#4ecdc4', '#45b7d1', '#f9ca24', '#a29bfe',
    '#fd79a8', '#95afc0', '#e17055', '#74b9ff', '#6c5ce7',
    '#55efc4', '#ffeaa7', '#fab1a0', '#ff7675', '#fdcb6e',
    '#00b894', '#0984e3', '#b2bec3', '#e84393', '#fd79a8'
  ];

  // Get color for a category with multiple fallbacks
  const getColorForCategory = (entry, index) => {
    // Try entry.color first (from category object)
    if (entry && entry.color) {
      return entry.color;
    }
    const categoryName = entry?.name || '';
    // Try colors prop
    if (colors && colors[categoryName]) {
      return colors[categoryName];
    }
    // Try CATEGORY_COLORS
    if (CATEGORY_COLORS[categoryName]) {
      return CATEGORY_COLORS[categoryName];
    }
    // Use fallback color based on index
    return fallbackColors[index % fallbackColors.length];
  };

  // Custom label renderer for pie chart - only show percentage on mobile
  const renderLabel = (entry) => {
    const percent = entry.percentage || 0;
    // On mobile, only show percentage if it's significant (>8%)
    if (isMobile && parseFloat(percent) < 8) {
      return '';
    }
    // On mobile, show shorter labels
    if (isMobile) {
      return `${parseFloat(percent).toFixed(0)}%`;
    }
    // On desktop, show full label if percentage is significant
    if (parseFloat(percent) < 5) {
      return '';
    }
    return `${entry.name} ${parseFloat(percent).toFixed(0)}%`;
  };

  // Filter data for pie - only show categories with actual values
  const pieData = data.filter(entry => entry.value > 0);

  // Create custom legend payload to show all categories (including 0 values)
  const legendPayload = data.map((entry, index) => ({
    value: entry.name,
    type: 'square',
    color: getColorForCategory(entry, index),
    payload: entry
  }));

  console.log('🎨 CategoryOverview received data:', data);
  console.log('🎨 Pie data (non-zero only):', pieData);
  console.log('🎨 Legend payload (all categories):', legendPayload);

  return (
    <div className="category-overview">
      <div className="category-overview-chart" style={{ height }}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={pieData}
              cx="50%"
              cy="50%"
              labelLine={!isMobile}
              label={renderLabel}
              outerRadius={isMobile ? "65%" : "70%"}
              dataKey="value"
              style={{ fontSize: isMobile ? '10px' : '12px' }}
            >
              {pieData.map((entry, index) => {
                // Find the original index in the full data array for consistent colors
                const originalIndex = data.findIndex(d => d.name === entry.name);
                const originalEntry = data[originalIndex] || entry;
                const color = getColorForCategory(originalEntry, originalIndex);
                console.log(`🎨 Category: ${entry.name}, Color: ${color}, Value: ${entry.value}`);
                return (
                  <Cell
                    key={`category-slice-${entry.name || index}`}
                    fill={color}
                  />
                );
              })}
            </Pie>
            <Tooltip
              formatter={(value) => typeof value === 'number' ? value.toLocaleString(undefined, { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }) : value}
            />
            <Legend
              payload={legendPayload}
              verticalAlign="bottom"
              height={isMobile ? 60 : 40}
              wrapperStyle={{ fontSize: isMobile ? '11px' : '12px', paddingTop: '10px' }}
              formatter={(value, entry) => {
                const amount = entry.payload?.value || 0;
                const percent = entry.payload?.percentage || 0;
                if (isMobile) {
                  // Shorter format for mobile
                  return `${value}: $${amount.toFixed(0)}`;
                }
                return `${value}: $${amount.toFixed(0)} (${percent}%)`;
              }}
            />
          </PieChart>
        </ResponsiveContainer>
      </div>

      {showRemaining && totalBudget ? (
        <div className="category-remaining-pill">
          <p className="mini-label">Remaining Budget</p>
          <h3>{(remainingBudget ?? 0).toLocaleString(undefined, { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })}</h3>
          <p className={`mini-remaining-status ${(remainingBudget ?? 0) >= 0 ? 'positive' : 'negative'}`}>
            {(remainingBudget ?? 0) >= 0
              ? `${remainingPercent != null ? `${remainingPercent}% of ` : ''}${totalBudget.toLocaleString(undefined, { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })} left`
              : `Over by ${Math.abs(remainingBudget).toLocaleString(undefined, { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })}`}
          </p>
        </div>
      ) : null}
    </div>
  );
}

export default CategoryOverview;
