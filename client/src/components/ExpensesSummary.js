import React, { useEffect, useMemo, useState } from 'react';
import './ExpensesSummary.css';
import { updateExpense } from '../services/apiService';

const CATEGORY_META = {
  Food: { icon: '🍔', color: '#ff6b6b' },
  Transport: { icon: '🚗', color: '#4ecdc4' },
  Shopping: { icon: '🛍️', color: '#45b7d1' },
  Bills: { icon: '💡', color: '#f9ca24' },
  Other: { icon: '📦', color: '#95afc0' }
};

const getCategoryMeta = (category) => CATEGORY_META[category] || CATEGORY_META.Other;

const formatCurrency = (amount, currency = 'USD') => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency
  }).format(amount || 0);
};

const formatDate = (iso) => {
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  });
};

const formatDateShort = (iso) => {
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric'
  });
};

const deriveTags = (expense) => {
  if (Array.isArray(expense.tags) && expense.tags.length) {
    return expense.tags;
  }

  const tags = [];

  if (expense.source) {
    tags.push(expense.source.replace(/_/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase()));
  }

  if (expense.paymentMethod) {
    tags.push(expense.paymentMethod);
  }

  if (expense.notes) {
    tags.push('Notes');
  }

  return tags;
};

const getReceiptPreview = (expense) => {
  return expense.thumbnailUrl || expense.receiptThumbnail || expense.receiptUrl || expense.receiptImageUrl || null;
};

const sourceOptionsFromExpenses = (expenses) => {
  const set = new Set();
  expenses.forEach(expense => {
    if (expense?.source) {
      set.add(expense.source);
    }
  });
  return Array.from(set);
};

function ExpensesSummary({
  expenses = [],
  onAddExpense,
  onFiltersToggle,
  onExport,
  onExpenseUpdated = () => {}
}) {
  const defaultFilters = {
    search: '',
    category: 'all',
    source: 'all',
    minAmount: '',
    maxAmount: '',
    startDate: '',
    endDate: ''
  };

  const [filters, setFilters] = useState(() => ({ ...defaultFilters }));

  const [sortConfig, setSortConfig] = useState({ key: 'date', direction: 'desc' });
  const [showFilters, setShowFilters] = useState(() => {
    if (typeof window === 'undefined') {
      return true;
    }
    return window.innerWidth > 768;
  });
  const [selectedExpense, setSelectedExpense] = useState(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState({
    merchantName: '',
    date: '',
    totalAmount: '',
    category: 'Other',
    paymentMethod: ''
  });
  const [isSaving, setIsSaving] = useState(false);
  const [editError, setEditError] = useState('');

  const handleFilterChange = (field, value) => {
    setFilters(prev => ({ ...prev, [field]: value }));
  };

  const resetFilters = () => {
    setFilters(() => ({ ...defaultFilters }));
  };

  const parsedExpenses = useMemo(() => {
    return (expenses || []).map(expense => ({
      ...expense,
      dateObj: expense.date ? new Date(expense.date) : null,
      amount: Number(expense.totalAmount || expense.total_price || 0)
    }));
  }, [expenses]);

  const filteredExpenses = useMemo(() => {
    return parsedExpenses.filter(expense => {
      if (filters.category !== 'all' && (expense.category || 'Other') !== filters.category) {
        return false;
      }

      if (filters.source !== 'all' && expense.source !== filters.source) {
        return false;
      }

      if (filters.minAmount && expense.amount < Number(filters.minAmount)) {
        return false;
      }

      if (filters.maxAmount && expense.amount > Number(filters.maxAmount)) {
        return false;
      }

      if (filters.startDate) {
        const start = new Date(filters.startDate);
        if (expense.dateObj && expense.dateObj < start) {
          return false;
        }
      }

      if (filters.endDate) {
        const end = new Date(filters.endDate);
        if (expense.dateObj && expense.dateObj > end) {
          return false;
        }
      }

      if (filters.search) {
        const haystack = `${expense.merchantName || ''} ${(expense.category || '')} ${(expense.notes || '')}`.toLowerCase();
        if (!haystack.includes(filters.search.toLowerCase())) {
          return false;
        }
      }

      return true;
    });
  }, [parsedExpenses, filters]);

  const sortedExpenses = useMemo(() => {
    const sorted = [...filteredExpenses];
    sorted.sort((a, b) => {
      const direction = sortConfig.direction === 'asc' ? 1 : -1;
      if (sortConfig.key === 'amount') {
        return (a.amount - b.amount) * direction;
      }
      const timeA = a.dateObj ? a.dateObj.getTime() : 0;
      const timeB = b.dateObj ? b.dateObj.getTime() : 0;
      return (timeA - timeB) * direction;
    });
    return sorted;
  }, [filteredExpenses, sortConfig]);

  const totals = useMemo(() => {
    const count = sortedExpenses.length;
    const totalAmount = sortedExpenses.reduce((sum, expense) => sum + (expense.amount || 0), 0);
    return {
      count,
      totalAmount,
      average: count ? totalAmount / count : 0
    };
  }, [sortedExpenses]);

  const activeFilterLabels = useMemo(() => {
    const labels = [];

    if (filters.search) {
      labels.push(`Search: "${filters.search}"`);
    }

    if (filters.category !== 'all') {
      labels.push(`Category: ${filters.category}`);
    }

    if (filters.source !== 'all') {
      labels.push(`Source: ${filters.source}`);
    }

    if (filters.minAmount || filters.maxAmount) {
      const parts = [];
      if (filters.minAmount) {
        parts.push(`>= ${formatCurrency(Number(filters.minAmount))}`);
      }
      if (filters.maxAmount) {
        parts.push(`<= ${formatCurrency(Number(filters.maxAmount))}`);
      }
      labels.push(`Amount ${parts.join(' ')}`);
    }

    if (filters.startDate || filters.endDate) {
      const startLabel = filters.startDate ? formatDate(filters.startDate) : 'Any';
      const endLabel = filters.endDate ? formatDate(filters.endDate) : 'Any';
      labels.push(`Date ${startLabel} -> ${endLabel}`);
    }

    return labels;
  }, [filters]);

  const hasActiveFilters = activeFilterLabels.length > 0;

  const resultsLabel = useMemo(() => {
    if (!sortedExpenses.length) {
      return 'No results';
    }
    if (sortedExpenses.length === parsedExpenses.length && !hasActiveFilters) {
      return `${sortedExpenses.length} result${sortedExpenses.length === 1 ? '' : 's'}`;
    }
    return `${sortedExpenses.length} of ${parsedExpenses.length} result${sortedExpenses.length === 1 ? '' : 's'}`;
  }, [sortedExpenses, parsedExpenses, hasActiveFilters]);

  const sources = useMemo(() => sourceOptionsFromExpenses(expenses), [expenses]);

  const buildEditFormState = (expense) => {
    if (!expense) {
      return {
        merchantName: '',
        date: '',
        totalAmount: '',
        category: 'Other',
        paymentMethod: ''
      };
    }

    let normalizedDate = '';
    if (expense.date) {
      if (typeof expense.date === 'string' && expense.date.length >= 10) {
        normalizedDate = expense.date.substring(0, 10);
      } else {
        const parsedDate = new Date(expense.date);
        if (!Number.isNaN(parsedDate.getTime())) {
          normalizedDate = parsedDate.toISOString().substring(0, 10);
        }
      }
    }

    const amountValue = expense.totalAmount ?? expense.amount ?? '';

    return {
      merchantName: expense.merchantName || '',
      date: normalizedDate,
      totalAmount: amountValue === '' ? '' : String(amountValue),
      category: expense.category || 'Other',
      paymentMethod: expense.paymentMethod || ''
    };
  };

  useEffect(() => {
    const nextFormState = buildEditFormState(selectedExpense);
    setEditForm(nextFormState);
    setIsEditing(false);
    setIsSaving(false);
    setEditError('');
  }, [selectedExpense]);

  const selectedExpenseMeta = useMemo(() => {
    if (!selectedExpense) {
      return null;
    }

    return {
      category: getCategoryMeta(selectedExpense.category),
      tags: deriveTags(selectedExpense)
    };
  }, [selectedExpense]);

  const handleSort = (key) => {
    setSortConfig(prev => {
      if (prev.key === key) {
        return {
          key,
          direction: prev.direction === 'asc' ? 'desc' : 'asc'
        };
      }
      return {
        key,
        direction: key === 'date' ? 'desc' : 'asc'
      };
    });
  };

  const exportToCSV = () => {
    const rows = [
      ['Date', 'Merchant', 'Category', 'Amount', 'Source', 'Notes']
    ];

    sortedExpenses.forEach(expense => {
      rows.push([
        formatDate(expense.date),
        expense.merchantName || 'Unknown',
        expense.category || 'Other',
        (expense.amount || 0).toFixed(2),
        expense.source || '-',
        expense.notes || ''
      ]);
    });

    const csv = rows
      .map(row => row.map(value => `"${String(value).replace(/"/g, '""')}"`).join(','))
      .join('\n');

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'expenses.csv';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleAddExpense = () => {
    if (onAddExpense) {
      onAddExpense();
    } else {
      window.alert('Hook up the add expense flow to enable this action.');
    }
  };

  const handleExport = () => {
    if (onExport) {
      onExport(sortedExpenses);
    } else {
      exportToCSV();
    }
  };

  const toggleFilters = () => {
    setShowFilters(prev => !prev);
    if (onFiltersToggle) {
      onFiltersToggle(!showFilters);
    }
  };

  const handleEditFieldChange = (field, value) => {
    setEditForm(prev => ({ ...prev, [field]: value }));
  };

  const handleStartEdit = () => {
    if (!selectedExpense) {
      return;
    }
    setIsEditing(true);
    setEditError('');
  };

  const handleCancelEdit = () => {
    setIsEditing(false);
    setEditError('');
    setEditForm(buildEditFormState(selectedExpense));
  };

  const handleSaveEdit = async (event) => {
    event.preventDefault();
    if (!selectedExpense || !selectedExpense.id) {
      setEditError('Unable to update this expense.');
      return;
    }

    const trimmedMerchant = editForm.merchantName.trim();
    if (!trimmedMerchant) {
      setEditError('Merchant name is required.');
      return;
    }

    if (!editForm.date) {
      setEditError('Date is required.');
      return;
    }

    const parsedAmount = Number(editForm.totalAmount);
    if (!Number.isFinite(parsedAmount) || parsedAmount < 0) {
      setEditError('Enter a valid amount.');
      return;
    }

    const updates = {
      merchantName: trimmedMerchant,
      date: editForm.date,
      totalAmount: Number(parsedAmount.toFixed(2)),
      category: editForm.category || 'Other',
      paymentMethod: editForm.paymentMethod.trim() || null,
      currency: selectedExpense.currency
    };

    setIsSaving(true);
    setEditError('');

    try {
      const updated = await updateExpense(selectedExpense.id, updates);

      const normalizedTotal = updated?.totalAmount ?? updates.totalAmount;
      const normalizedPayment = updated?.paymentMethod ?? updates.paymentMethod ?? null;

      const mergedExpense = {
        ...selectedExpense,
        ...updated,
        totalAmount: normalizedTotal,
        amount: normalizedTotal,
        paymentMethod: normalizedPayment
      };

      setSelectedExpense(mergedExpense);
      setIsEditing(false);
      setEditForm(buildEditFormState(mergedExpense));

      onExpenseUpdated(mergedExpense);
    } catch (error) {
      console.error('Failed to update expense:', error);
      setEditError(error.message || 'Failed to update expense');
    } finally {
      setIsSaving(false);
    }
  };

  const modalTitle = isEditing
    ? (editForm.merchantName || selectedExpense?.merchantName || 'Expense detail')
    : (selectedExpense?.merchantName || 'Expense detail');

  return (
    <div className="expenses-summary">
      <div className="expenses-header">
        <div className="expenses-header-text">
          <h1>Expenses</h1>
          <p>Monitor your spending and drill into every transaction at a glance.</p>
        </div>
        <div className="expenses-header-actions">
          <button type="button" className="expenses-btn primary" onClick={handleAddExpense}>
            + Add Expense
          </button>
          <button type="button" className="expenses-btn ghost" onClick={toggleFilters}>
            {showFilters ? 'Hide Filters' : 'Filters'}
          </button>
          <button type="button" className="expenses-btn ghost" onClick={handleExport}>
            Export
          </button>
        </div>
      </div>

      <div className={`expenses-filters ${showFilters ? 'is-open' : 'is-collapsed'}`}>
        <div className="filter-row">
          <div className="filter-field filter-search">
            <label htmlFor="search">Search</label>
            <div className="input-with-icon">
              <span className="input-icon" aria-hidden="true">🔍</span>
              <input
                id="search"
                type="text"
                value={filters.search}
                placeholder="Search by merchant, notes, category..."
                onChange={(event) => handleFilterChange('search', event.target.value)}
              />
            </div>
          </div>
          <div className="filter-field">
            <label htmlFor="category">Category</label>
            <select
              id="category"
              value={filters.category}
              onChange={(event) => handleFilterChange('category', event.target.value)}
            >
              <option value="all">All</option>
              {Object.keys(CATEGORY_META).map(category => (
                <option key={category} value={category}>{category}</option>
              ))}
            </select>
          </div>
          <div className="filter-field">
            <label htmlFor="source">Source</label>
            <select
              id="source"
              value={filters.source}
              onChange={(event) => handleFilterChange('source', event.target.value)}
            >
              <option value="all">All</option>
              {sources.map(source => (
                <option key={source} value={source}>{source}</option>
              ))}
            </select>
          </div>
          <div className="filter-field range-field">
            <label htmlFor="minAmount">Amount Range</label>
            <div className="range-inputs">
              <input
                id="minAmount"
                type="number"
                value={filters.minAmount}
                placeholder="Min"
                onChange={(event) => handleFilterChange('minAmount', event.target.value)}
              />
              <span className="range-separator">to</span>
              <input
                id="maxAmount"
                type="number"
                value={filters.maxAmount}
                placeholder="Max"
                onChange={(event) => handleFilterChange('maxAmount', event.target.value)}
              />
            </div>
          </div>
          <div className="filter-field range-field">
            <label htmlFor="startDate">Date Range</label>
            <div className="range-inputs">
              <input
                id="startDate"
                type="date"
                value={filters.startDate}
                onChange={(event) => handleFilterChange('startDate', event.target.value)}
              />
              <span className="range-separator">to</span>
              <input
                id="endDate"
                type="date"
                value={filters.endDate}
                onChange={(event) => handleFilterChange('endDate', event.target.value)}
              />
            </div>
          </div>
        </div>
        <div className="filter-actions">
          <div className="filter-summary">
            <span className="filter-results">{resultsLabel}</span>
            {activeFilterLabels.map(label => (
              <span key={label} className="filter-chip">{label}</span>
            ))}
          </div>
          <button type="button" className="expenses-btn ghost" onClick={resetFilters}>
            Reset filters
          </button>
        </div>
      </div>

      <div className="expenses-table-wrapper">
        <table className="expenses-table">
          <thead>
            <tr>
              <th>
                <button type="button" onClick={() => handleSort('date')}>
                  Date
                  {sortConfig.key === 'date' && (
                    <span className={`sort-indicator ${sortConfig.direction}`} />
                  )}
                </button>
              </th>
              <th>Merchant</th>
              <th>Category</th>
              <th>
                <button type="button" onClick={() => handleSort('amount')}>
                  Amount
                  {sortConfig.key === 'amount' && (
                    <span className={`sort-indicator ${sortConfig.direction}`} />
                  )}
                </button>
              </th>
              <th>Tags</th>
              <th>Receipt</th>
            </tr>
          </thead>
          <tbody>
            {sortedExpenses.length ? (
              sortedExpenses.map(expense => {
                const categoryMeta = getCategoryMeta(expense.category);
                const tags = deriveTags(expense);
                const receiptPreview = getReceiptPreview(expense);

                return (
                  <tr key={expense.id || `${expense.date}-${expense.merchantName}`} onClick={() => setSelectedExpense(expense)}>
                    <td>{formatDate(expense.date)}</td>
                    <td>
                      <div className="cell-merchant">{expense.merchantName || 'Unknown merchant'}</div>
                      {expense.notes && <div className="cell-notes">{expense.notes}</div>}
                    </td>
                    <td>
                      <span className="category-pill" style={{ backgroundColor: categoryMeta.color + '1f', color: categoryMeta.color }}>
                        <span className="category-icon" role="img" aria-label={expense.category || 'Other'}>{categoryMeta.icon}</span>
                        {expense.category || 'Other'}
                      </span>
                    </td>
                    <td className="cell-amount">{formatCurrency(expense.amount, expense.currency)}</td>
                    <td>
                      {tags.length ? (
                        <div className="tags">
                          {tags.map(tag => (
                            <span key={tag} className="tag">{tag}</span>
                          ))}
                        </div>
                      ) : (
                        <span className="tag tag-empty">No tags</span>
                      )}
                    </td>
                    <td>
                      {receiptPreview ? (
                        <img src={receiptPreview} alt="Receipt preview" className="receipt-thumb" />
                      ) : (
                        <span className="tag tag-empty">No receipt</span>
                      )}
                    </td>
                  </tr>
                );
              })
            ) : (
              <tr>
                <td colSpan={6} className="empty-state">
                  No expenses match your filters yet. Try broadening the range or add a new transaction.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="expenses-mobile-list">
        {sortedExpenses.map(expense => {
          const categoryMeta = getCategoryMeta(expense.category);
          const tags = deriveTags(expense);
          const formattedDate = formatDateShort(expense.date);

          return (
            <button
              type="button"
              key={expense.id || `${expense.date}-${expense.merchantName}-mobile`}
              className="expense-card"
              onClick={() => setSelectedExpense(expense)}
            >
              <div className="expense-card-header">
                <span className="expense-card-merchant">{expense.merchantName || 'Unknown merchant'}</span>
                <span className="card-bullet" aria-hidden="true">&bull;</span>
                <span className="expense-card-amount">{formatCurrency(expense.amount, expense.currency)}</span>
              </div>
              <div className="expense-card-meta">
                <span className="category-pill" style={{ backgroundColor: categoryMeta.color + '1f', color: categoryMeta.color }}>
                  <span className="category-icon" role="img" aria-label={expense.category || 'Other'}>{categoryMeta.icon}</span>
                  {expense.category || 'Other'}
                </span>
                <span className="card-bullet" aria-hidden="true">&bull;</span>
                <span className="expense-card-date">{formattedDate}</span>
                <span className="card-bullet" aria-hidden="true">&bull;</span>
                <div className="card-tags">
                  {tags.length ? (
                    tags.map(tag => (
                      <span key={tag} className="tag">{tag}</span>
                    ))
                  ) : (
                    <span className="tag tag-empty">No tags</span>
                  )}
                </div>
              </div>
            </button>
          );
        })}
      </div>

      <footer className="expenses-footer">
        <div className="footer-summary">
          <span>Total</span>
          <strong>{formatCurrency(totals.totalAmount)}</strong>
        </div>
        <div className="footer-summary">
          <span>Transactions</span>
          <strong>{totals.count}</strong>
        </div>
        <div className="footer-summary">
          <span>Average</span>
          <strong>{formatCurrency(totals.average)}</strong>
        </div>
      </footer>

      {selectedExpense && (
        <div className="expense-modal" role="dialog" aria-modal="true">
          <div className="expense-modal-backdrop" onClick={() => setSelectedExpense(null)} />
          <div className="expense-modal-content">
            <button type="button" className="modal-close" onClick={() => setSelectedExpense(null)} aria-label="Close">
              ×
            </button>
            <h2>{modalTitle}</h2>
            {isEditing ? (
              <form id="expense-edit-form" className="modal-form" onSubmit={handleSaveEdit}>
                <div className="form-grid">
                  <div className="form-field">
                    <label htmlFor="edit-merchant">Merchant</label>
                    <input
                      id="edit-merchant"
                      type="text"
                      value={editForm.merchantName}
                      onChange={(event) => handleEditFieldChange('merchantName', event.target.value)}
                      disabled={isSaving}
                    />
                  </div>
                  <div className="form-field">
                    <label htmlFor="edit-date">Date</label>
                    <input
                      id="edit-date"
                      type="date"
                      value={editForm.date}
                      onChange={(event) => handleEditFieldChange('date', event.target.value)}
                      disabled={isSaving}
                    />
                  </div>
                  <div className="form-field">
                    <label htmlFor="edit-amount">Amount</label>
                    <input
                      id="edit-amount"
                      type="number"
                      step="0.01"
                      min="0"
                      value={editForm.totalAmount}
                      onChange={(event) => handleEditFieldChange('totalAmount', event.target.value)}
                      disabled={isSaving}
                    />
                  </div>
                  <div className="form-field">
                    <label htmlFor="edit-category">Category</label>
                    <select
                      id="edit-category"
                      value={editForm.category}
                      onChange={(event) => handleEditFieldChange('category', event.target.value)}
                      disabled={isSaving}
                    >
                      {Object.keys(CATEGORY_META).map(category => (
                        <option key={category} value={category}>{category}</option>
                      ))}
                    </select>
                  </div>
                  <div className="form-field form-field-full">
                    <label htmlFor="edit-payment">Payment method</label>
                    <input
                      id="edit-payment"
                      type="text"
                      value={editForm.paymentMethod}
                      onChange={(event) => handleEditFieldChange('paymentMethod', event.target.value)}
                      disabled={isSaving}
                    />
                  </div>
                </div>
                {editError && (
                  <div className="modal-error">
                    {editError}
                  </div>
                )}
              </form>
            ) : (
              <div className="modal-details">
                <div className="modal-detail">
                  <span>Date</span>
                  <strong>{formatDate(selectedExpense.date)}</strong>
                </div>
                <div className="modal-detail">
                  <span>Amount</span>
                  <strong>{formatCurrency(selectedExpense.totalAmount ?? selectedExpense.amount, selectedExpense.currency)}</strong>
                </div>
                {selectedExpenseMeta?.category && (
                  <div className="modal-detail category-detail">
                    <span>Category</span>
                    <span
                      className="category-pill"
                      style={{
                        backgroundColor: selectedExpenseMeta.category.color + '1f',
                        color: selectedExpenseMeta.category.color
                      }}
                    >
                      <span
                        className="category-icon"
                        role="img"
                        aria-label={selectedExpense.category || 'Other'}
                      >
                        {selectedExpenseMeta.category.icon}
                      </span>
                      {selectedExpense.category || 'Other'}
                    </span>
                  </div>
                )}
                {selectedExpense.source && (
                  <div className="modal-detail">
                    <span>Source</span>
                    <strong>{selectedExpense.source}</strong>
                  </div>
                )}
                {selectedExpenseMeta?.tags?.length ? (
                  <div className="modal-detail">
                    <span>Tags</span>
                    <div className="modal-tags">
                      {selectedExpenseMeta.tags.map(tag => (
                        <span key={tag} className="tag">{tag}</span>
                      ))}
                    </div>
                  </div>
                ) : null}
                {selectedExpense.notes && (
                  <div className="modal-detail">
                    <span>Notes</span>
                    <p>{selectedExpense.notes}</p>
                  </div>
                )}
              </div>
            )}
            {getReceiptPreview(selectedExpense) ? (
              <div className="modal-receipt">
                <img src={getReceiptPreview(selectedExpense)} alt="Receipt detail" />
              </div>
            ) : (
              <div className="modal-receipt placeholder">No receipt available</div>
            )}
            <div className="modal-actions">
              {isEditing ? (
                <>
                  <button
                    type="button"
                    className="expenses-btn ghost"
                    onClick={handleCancelEdit}
                    disabled={isSaving}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    form="expense-edit-form"
                    className="expenses-btn primary"
                    disabled={isSaving}
                  >
                    {isSaving ? 'Saving...' : 'Save changes'}
                  </button>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    className="expenses-btn primary"
                    onClick={handleStartEdit}
                    disabled={!selectedExpense.id}
                  >
                    Edit expense
                  </button>
                  <button type="button" className="expenses-btn ghost" onClick={() => setSelectedExpense(null)}>
                    Close
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default ExpensesSummary;
