import React, { useEffect, useMemo, useState } from 'react';
import * as XLSX from 'xlsx';
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

const formatDate = (dateString) => {
  if (!dateString) return '—';
  try {
    // Parse date string as local date to avoid timezone shift
    const [year, month, day] = dateString.split('-').map(Number);
    const date = new Date(year, month - 1, day);
    if (Number.isNaN(date.getTime())) return '—';
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  } catch {
    return '—';
  }
};

const formatDateShort = (dateString) => {
  if (!dateString) return '—';
  try {
    // Parse date string as local date to avoid timezone shift
    const [year, month, day] = dateString.split('-').map(Number);
    const date = new Date(year, month - 1, day);
    if (Number.isNaN(date.getTime())) return '—';
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric'
    });
  } catch {
    return '—';
  }
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
  dateRange,
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
      dateStr: expense.date ? expense.date.substring(0, 10) : null,
      amount: Number(expense.totalAmount || expense.total_price || 0)
    }));
  }, [expenses]);

  const filteredExpenses = useMemo(() => {
    // Apply the global dateRange filter first if it exists
    let filtered = parsedExpenses;

    if (dateRange?.startDate && dateRange?.endDate) {
      filtered = filtered.filter(expense => {
        if (!expense.dateStr) return false;
        return expense.dateStr >= dateRange.startDate && expense.dateStr <= dateRange.endDate;
      });
    }

    // Then apply user-selected filters
    return filtered.filter(expense => {
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
        if (!expense.dateStr || expense.dateStr < filters.startDate) {
          return false;
        }
      }

      if (filters.endDate) {
        if (!expense.dateStr || expense.dateStr > filters.endDate) {
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
  }, [parsedExpenses, filters, dateRange]);

  const sortedExpenses = useMemo(() => {
    const sorted = [...filteredExpenses];
    sorted.sort((a, b) => {
      const direction = sortConfig.direction === 'asc' ? 1 : -1;
      if (sortConfig.key === 'amount') {
        return (a.amount - b.amount) * direction;
      }
      // Sort by date string (YYYY-MM-DD format sorts correctly as strings)
      const dateA = a.dateStr || '';
      const dateB = b.dateStr || '';
      return dateA.localeCompare(dateB) * direction;
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

  const exportToExcelDaily = () => {
    // Group expenses by date
    const expensesByDate = {};

    sortedExpenses.forEach(expense => {
      if (!expense?.date) return;

      if (!expensesByDate[expense.date]) {
        expensesByDate[expense.date] = [];
      }

      // If expense has items, add each item separately
      if (expense.items && expense.items.length > 0) {
        expense.items.forEach(item => {
          expensesByDate[expense.date].push({
            merchant: expense.merchantName || 'Unknown',
            product: item.description || 'Item',
            category: item.category || expense.category || 'Other',
            cost: Number(item.totalPrice) || 0
          });
        });
      } else {
        // Add whole expense as single item
        expensesByDate[expense.date].push({
          merchant: expense.merchantName || 'Unknown',
          product: expense.description || expense.merchantName || 'Expense',
          category: expense.category || 'Other',
          cost: Number(expense.totalAmount) || 0
        });
      }
    });

    // Create daily sheets data
    const sheetData = [];
    const sortedDates = Object.keys(expensesByDate).sort();

    sortedDates.forEach(date => {
      const items = expensesByDate[date];

      // Add date header
      sheetData.push({
        'Date': formatDate(date),
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
    });

    // Create workbook
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(sheetData);
    XLSX.utils.book_append_sheet(wb, ws, 'Daily Spending');

    const filename = `expenses-daily-${new Date().toISOString().split('T')[0]}.xlsx`;
    XLSX.writeFile(wb, filename);
  };

  const exportToExcelMonthly = () => {
    // Group expenses by month
    const expensesByMonth = {};

    sortedExpenses.forEach(expense => {
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
    const sheetData = [];
    const sortedMonths = Object.keys(expensesByMonth).sort();

    sortedMonths.forEach(month => {
      const items = expensesByMonth[month];

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
          'Date': formatDateShort(item.date),
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
    });

    // Create workbook
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(sheetData);
    XLSX.utils.book_append_sheet(wb, ws, 'Monthly Spending');

    const filename = `expenses-monthly-${new Date().toISOString().split('T')[0]}.xlsx`;
    XLSX.writeFile(wb, filename);
  };

  const handleAddExpense = () => {
    if (onAddExpense) {
      onAddExpense();
    } else {
      window.alert('Hook up the add expense flow to enable this action.');
    }
  };

  const [showExportMenu, setShowExportMenu] = useState(false);

  const handleExport = () => {
    if (onExport) {
      onExport(sortedExpenses);
    } else {
      setShowExportMenu(!showExportMenu);
    }
  };

  const handleExportOption = (type) => {
    setShowExportMenu(false);
    if (type === 'csv') {
      exportToCSV();
    } else if (type === 'excel-daily') {
      exportToExcelDaily();
    } else if (type === 'excel-monthly') {
      exportToExcelMonthly();
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
      const response = await updateExpense(selectedExpense.id, updates);
      const updated = response.expense;

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
          <div style={{ position: 'relative' }}>
            <button type="button" className="expenses-btn ghost" onClick={handleExport}>
              Export {showExportMenu ? '▲' : '▼'}
            </button>
            {showExportMenu && (
              <div style={{
                position: 'absolute',
                right: 0,
                top: '100%',
                marginTop: '4px',
                backgroundColor: 'white',
                border: '1px solid #ddd',
                borderRadius: '8px',
                boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
                minWidth: '180px',
                zIndex: 1000
              }}>
                <button
                  onClick={() => handleExportOption('csv')}
                  style={{
                    display: 'block',
                    width: '100%',
                    padding: '12px 16px',
                    border: 'none',
                    background: 'none',
                    textAlign: 'left',
                    cursor: 'pointer',
                    fontSize: '14px',
                    borderBottom: '1px solid #eee'
                  }}
                  onMouseOver={(e) => e.target.style.backgroundColor = '#f5f5f5'}
                  onMouseOut={(e) => e.target.style.backgroundColor = 'transparent'}
                >
                  📄 Export as CSV
                </button>
                <button
                  onClick={() => handleExportOption('excel-daily')}
                  style={{
                    display: 'block',
                    width: '100%',
                    padding: '12px 16px',
                    border: 'none',
                    background: 'none',
                    textAlign: 'left',
                    cursor: 'pointer',
                    fontSize: '14px',
                    borderBottom: '1px solid #eee'
                  }}
                  onMouseOver={(e) => e.target.style.backgroundColor = '#f5f5f5'}
                  onMouseOut={(e) => e.target.style.backgroundColor = 'transparent'}
                >
                  📊 Excel (Daily)
                </button>
                <button
                  onClick={() => handleExportOption('excel-monthly')}
                  style={{
                    display: 'block',
                    width: '100%',
                    padding: '12px 16px',
                    border: 'none',
                    background: 'none',
                    textAlign: 'left',
                    cursor: 'pointer',
                    fontSize: '14px'
                  }}
                  onMouseOver={(e) => e.target.style.backgroundColor = '#f5f5f5'}
                  onMouseOut={(e) => e.target.style.backgroundColor = 'transparent'}
                >
                  📈 Excel (Monthly)
                </button>
              </div>
            )}
          </div>
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
              <th>Payment Method</th>
              <th>Receipt</th>
            </tr>
          </thead>
          <tbody>
            {sortedExpenses.length ? (
              sortedExpenses.map(expense => {
                const categoryMeta = getCategoryMeta(expense.category);
                const receiptPreview = getReceiptPreview(expense);

                return (
                  <tr key={expense.id || `${expense.date}-${expense.merchantName}`} onClick={() => setSelectedExpense(expense)}>
                    <td>{formatDate(expense.date)}</td>
                    <td>
                      <div className="cell-merchant">{expense.merchantName || 'Unknown merchant'}</div>
                      {expense.items && expense.items.length > 0 && (
                        <div className="cell-items">
                          {expense.items.map((item, idx) => (
                            <div key={idx} className="item-compact">
                              <span className="item-compact-desc">{item.description}</span>
                              {item.quantity > 1 && <span className="item-compact-qty">×{item.quantity}</span>}
                              <span className="item-compact-price">{formatCurrency(item.totalPrice || item.price, expense.currency)}</span>
                            </div>
                          ))}
                        </div>
                      )}
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
                      {expense.paymentMethod ? (
                        <span className="tag">{expense.paymentMethod}</span>
                      ) : (
                        <span className="tag tag-empty">—</span>
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
                  <span>Total Amount</span>
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
                {selectedExpense.paymentMethod && (
                  <div className="modal-detail">
                    <span>Payment Method</span>
                    <strong>{selectedExpense.paymentMethod}</strong>
                  </div>
                )}
                {selectedExpense.source && (
                  <div className="modal-detail">
                    <span>Source</span>
                    <strong>{selectedExpense.source}</strong>
                  </div>
                )}
                {selectedExpense.items && selectedExpense.items.length > 0 && (
                  <div className="modal-detail modal-items">
                    <span>Items ({selectedExpense.items.length})</span>
                    <div className="items-list">
                      {selectedExpense.items.map((item, index) => (
                        <div key={index} className="item-row">
                          <div className="item-description">
                            {item.description}
                            {item.quantity > 1 && <span className="item-quantity"> ×{item.quantity}</span>}
                          </div>
                          <div className="item-price">
                            {formatCurrency(item.totalPrice || item.price, selectedExpense.currency)}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
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
