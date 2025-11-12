import React from 'react';
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip } from 'recharts';
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
  emptyMessage = 'No category activity yet.'
}) {
  if (!Array.isArray(data) || data.length === 0) {
    return <div className="category-overview-empty">{emptyMessage}</div>;
  }

  const remainingPercent = totalBudget && budgetUsedPercent != null
    ? Math.max(0, 100 - Math.round(budgetUsedPercent))
    : null;

  return (
    <div className="category-overview">
      <div className="category-overview-chart" style={{ height }}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              cx="50%"
              cy="50%"
              labelLine={false}
              outerRadius="80%"
              dataKey="value"
            >
              {data.map((entry, index) => (
                <Cell
                  key={`category-slice-${entry.name || index}`}
                  fill={colors[entry.name] || entry.color || '#95afc0'}
                />
              ))}
            </Pie>
            <Tooltip formatter={(value) => typeof value === 'number' ? value.toLocaleString(undefined, { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }) : value} />
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
