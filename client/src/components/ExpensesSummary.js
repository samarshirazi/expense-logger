import React, { useEffect, useMemo, useState } from 'react';
import * as XLSX from 'xlsx';
import './ExpensesSummary.css';
import { updateExpense, deleteExpense } from '../services/apiService';
import { getAllCategories } from '../services/categoryService';

const CATEGORY_META = {
  Food: { icon: '🍔', color: '#ff6b6b' },
  Transport: { icon: '🚗', color: '#4ecdc4' },
  Shopping: { icon: '🛍️', color: '#45b7d1' },
  Bills: { icon: '💡', color: '#f9ca24' },
  Other: { icon: '📦', color: '#95afc0' }
};

const getCategoryMeta = (category, allCategories = []) => {
  // First check custom categories
  const customCategory = allCategories.find(cat => cat.name === category || cat.id === category);
  if (customCategory) {
    return { icon: customCategory.icon, color: customCategory.color };
  }
  // Fall back to hardcoded categories
  return CATEGORY_META[category] || CATEGORY_META.Other;
};

const formatCurrency = (amount, currency = 'USD') => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency
  }).format(amount || 0);
};

const normalizeDateString = (input) => {
  if (!input) {
    return null;
  }

  const handleDate = (date) => {
    if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
      return null;
    }
    return date.toISOString().substring(0, 10);
  };

  if (typeof input === 'string') {
    const trimmed = input.trim();
    if (!trimmed) return null;
    if (/^\d{4}-\d{2}-\d{2}/.test(trimmed)) {
      return trimmed.substring(0, 10);
    }
    const parsed = new Date(trimmed);
    return handleDate(parsed);
  }

  return handleDate(new Date(input));
};

const resolveExpenseDateString = (expense) => {
  if (!expense) {
    return null;
  }
  const candidates = [
    expense.date,
    expense.uploadDate,
    expense.createdAt,
    expense.updatedAt
  ];
  for (const candidate of candidates) {
    const normalized = normalizeDateString(candidate);
    if (normalized) {
      return normalized;
    }
  }
  return null;
};

const formatUndatedLabel = () => 'Undated';

const formatDate = (value) => {
  const normalized = normalizeDateString(value);
  if (!normalized) {
    if (value === 'No date') {
      return formatUndatedLabel();
    }
    return '—';
  }
  const [year, month, day] = normalized.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  });
};

const formatDateShort = (value) => {
  const normalized = normalizeDateString(value);
  if (!normalized) {
    if (value === 'No date') {
      return formatUndatedLabel();
    }
    return '—';
  }
  const [year, month, day] = normalized.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric'
  });
};

const formatMonthYear = (value) => {
  const normalized = normalizeDateString(value);
  if (!normalized) return null;
  const [year, month] = normalized.split('-').map(Number);
  const date = new Date(year, month - 1, 1);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString('en-US', {
    month: 'short',
    year: 'numeric'
  });
};

const getDateSortValue = (dateStr) => {
  if (!dateStr) {
    return Number.NEGATIVE_INFINITY;
  }
  const timestamp = new Date(dateStr).getTime();
  if (!Number.isFinite(timestamp)) {
    return Number.NEGATIVE_INFINITY;
  }
  return timestamp;
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
  onExpenseUpdated = () => {},
  onOpenShoppingList = () => {},
  onOpenRecurring = () => {},
  categoryBudgets = {}
}) {
  const defaultFilters = {
    search: '',
    category: 'all',
    source: 'all',
    minAmount: '',
    maxAmount: '',
    startDate: '',
    endDate: '',
    allTime: false
  };

  const [filters, setFilters] = useState(() => ({ ...defaultFilters }));

  const sortConfig = useMemo(() => ({ key: 'date', direction: 'desc' }), []);
  const [selectedExpense, setSelectedExpense] = useState(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState({
    merchantName: '',
    date: '',
    totalAmount: '',
    category: 'Other',
    paymentMethod: '',
    items: []
  });
  const [isSaving, setIsSaving] = useState(false);
  const [editError, setEditError] = useState('');
  const [allCategories, setAllCategories] = useState([]);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  // Load all categories (default + custom)
  useEffect(() => {
    const loadCategories = () => {
      const categories = getAllCategories();
      setAllCategories(categories);
    };

    loadCategories();

    // Listen for category updates
    const handleCategoriesUpdate = () => {
      loadCategories();
    };

    window.addEventListener('categoriesUpdated', handleCategoriesUpdate);
    return () => {
      window.removeEventListener('categoriesUpdated', handleCategoriesUpdate);
    };
  }, []);

  const handleFilterChange = (field, value) => {
    setFilters(prev => ({ ...prev, [field]: value }));
  };

  const resetFilters = () => {
    setFilters(() => ({ ...defaultFilters }));
  };

  const toggleAllTimeFilter = () => {
    setFilters(prev => ({ ...prev, allTime: !prev.allTime }));
  };

  const parsedExpenses = useMemo(() => {
    return (expenses || []).map(expense => ({
      ...expense,
      dateStr: resolveExpenseDateString(expense),
      amount: Number(expense.totalAmount || expense.total_price || 0)
    }));
  }, [expenses]);

  const overallDateRange = useMemo(() => {
    const dated = parsedExpenses
      .map(expense => expense.dateStr)
      .filter(Boolean)
      .sort();
    if (!dated.length) {
      return null;
    }
    return {
      start: dated[0],
      end: dated[dated.length - 1]
    };
  }, [parsedExpenses]);

  const allTimeRangeLabel = useMemo(() => {
    if (!overallDateRange) {
      return null;
    }
    const startLabel = formatMonthYear(overallDateRange.start);
    const endLabel = formatMonthYear(overallDateRange.end);
    if (startLabel && endLabel) {
      return startLabel === endLabel ? startLabel : `${startLabel} → ${endLabel}`;
    }
    if (startLabel) {
      return `${startLabel} → Present`;
    }
    if (endLabel) {
      return `Up to ${endLabel}`;
    }
    return null;
  }, [overallDateRange]);

  const filteredExpenses = useMemo(() => {
    const useAllTime = Boolean(filters.allTime);
    const hasCustomRange = !useAllTime && Boolean(filters.startDate || filters.endDate);
    const effectiveStart = useAllTime
      ? null
      : normalizeDateString(
        hasCustomRange ? filters.startDate : dateRange?.startDate
      );
    const effectiveEnd = useAllTime
      ? null
      : normalizeDateString(
        hasCustomRange ? filters.endDate : dateRange?.endDate
      );

    return parsedExpenses.filter(expense => {
      if (effectiveStart) {
        if (!expense.dateStr || expense.dateStr < effectiveStart) {
          return false;
        }
      }

      if (effectiveEnd) {
        if (!expense.dateStr || expense.dateStr > effectiveEnd) {
          return false;
        }
      }

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
      const dateA = getDateSortValue(a.dateStr);
      const dateB = getDateSortValue(b.dateStr);
      if (dateA === dateB) {
        const createdA = a.createdAt || '';
        const createdB = b.createdAt || '';
        return createdA.localeCompare(createdB) * direction;
      }
      return (dateA - dateB) * direction;
    });
    return sorted;
  }, [filteredExpenses, sortConfig]);

  const dateGroups = useMemo(() => {
    const groups = [];
    const map = new Map();
    sortedExpenses.forEach(expense => {
      const key = expense.dateStr || 'No date';
      if (!map.has(key)) {
        const group = {
          key,
          label: key === 'No date' ? formatUndatedLabel() : formatDate(key),
          expenses: []
        };
        map.set(key, group);
        groups.push(group);
      }
      map.get(key).expenses.push(expense);
    });
    return groups;
  }, [sortedExpenses]);

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

    if (filters.allTime) {
      labels.push('All Time');
    }

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

    if (!filters.allTime && (filters.startDate || filters.endDate)) {
      const startLabel = filters.startDate ? formatDate(filters.startDate) : 'Any';
      const endLabel = filters.endDate ? formatDate(filters.endDate) : 'Any';
      labels.push(`Date ${startLabel} -> ${endLabel}`);
    }

    return labels;
  }, [filters]);

  const hasMeaningfulFilters = useMemo(
    () => activeFilterLabels.some(label => label !== 'All Time'),
    [activeFilterLabels]
  );

  const resultsLabel = useMemo(() => {
    if (!sortedExpenses.length) {
      return 'No results';
    }
    if (sortedExpenses.length === parsedExpenses.length && !hasMeaningfulFilters) {
      return `${sortedExpenses.length} result${sortedExpenses.length === 1 ? '' : 's'}`;
    }
    return `${sortedExpenses.length} of ${parsedExpenses.length} result${sortedExpenses.length === 1 ? '' : 's'}`;
  }, [sortedExpenses, parsedExpenses, hasMeaningfulFilters]);

  const sources = useMemo(() => sourceOptionsFromExpenses(expenses), [expenses]);

  const buildEditFormState = (expense) => {
    if (!expense) {
      return {
        merchantName: '',
        date: '',
        totalAmount: '',
        category: 'Other',
        paymentMethod: '',
        items: []
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
      paymentMethod: expense.paymentMethod || '',
      items: expense.items ? JSON.parse(JSON.stringify(expense.items)) : []
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
      category: getCategoryMeta(selectedExpense.category, allCategories),
      tags: deriveTags(selectedExpense)
    };
  }, [selectedExpense, allCategories]);

  const exportToCSV = () => {
    const rows = [
      ['Date', 'Merchant', 'Category', 'Amount', 'Source', 'Notes']
    ];

    sortedExpenses.forEach(expense => {
      rows.push([
        formatDate(expense.dateStr || expense.date || expense.createdAt || expense.uploadDate),
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

  const [showExportMenu, setShowExportMenu] = useState(false);
  const [showFiltersModal, setShowFiltersModal] = useState(false);

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

  const handleEditFieldChange = (field, value) => {
    setEditForm(prev => ({ ...prev, [field]: value }));
  };

  const handleItemFieldChange = (itemIndex, field, value) => {
    setEditForm(prev => {
      const newItems = [...prev.items];
      newItems[itemIndex] = {
        ...newItems[itemIndex],
        [field]: value
      };
      return { ...prev, items: newItems };
    });
  };

  const handleDeleteItem = (itemIndex) => {
    setEditForm(prev => {
      const newItems = prev.items.filter((_, idx) => idx !== itemIndex);
      return { ...prev, items: newItems };
    });
  };

  const handleAddItem = () => {
    setEditForm(prev => ({
      ...prev,
      items: [
        ...prev.items,
        {
          description: '',
          quantity: 1,
          totalPrice: 0,
          category: 'Other'
        }
      ]
    }));
  };

  const handleDeleteExpense = async () => {
    if (!selectedExpense || !selectedExpense.id) {
      return;
    }

    setIsDeleting(true);
    setEditError('');

    try {
      await deleteExpense(selectedExpense.id);
      setSelectedExpense(null);
      setShowDeleteConfirm(false);
      // Notify parent to refresh
      onExpenseUpdated(null);
      // Refresh the page to update the list
      window.location.reload();
    } catch (error) {
      console.error('Failed to delete expense:', error);
      setEditError(error.message || 'Failed to delete expense');
    } finally {
      setIsDeleting(false);
    }
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

    // Check if all items have been deleted - if so, delete the entire receipt
    if (editForm.items && editForm.items.length === 0 && selectedExpense.items && selectedExpense.items.length > 0) {
      setShowDeleteConfirm(true);
      return;
    }

    // Calculate total from items if they exist, otherwise use existing total
    let totalAmount = selectedExpense.totalAmount || 0;
    if (editForm.items && editForm.items.length > 0) {
      totalAmount = editForm.items.reduce((sum, item) => {
        return sum + (Number(item.totalPrice || item.price) || 0);
      }, 0);
    }

    const updates = {
      merchantName: trimmedMerchant,
      date: editForm.date,
      totalAmount: Number(totalAmount.toFixed(2)),
      category: editForm.category || 'Other',
      paymentMethod: editForm.paymentMethod.trim() || null,
      currency: selectedExpense.currency,
      items: editForm.items
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
        <div className="expenses-header-actions" style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
          <button
            type="button"
            className="expenses-btn-icon"
            onClick={() => setShowFiltersModal(true)}
            style={{
              background: 'white',
              border: '1px solid #ddd',
              borderRadius: '8px',
              width: '40px',
              height: '40px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              fontSize: '1.2rem',
              transition: 'all 0.2s ease',
              boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
            }}
            onMouseOver={(e) => {
              e.currentTarget.style.borderColor = '#4a90e2';
              e.currentTarget.style.boxShadow = '0 2px 6px rgba(74, 144, 226, 0.2)';
            }}
            onMouseOut={(e) => {
              e.currentTarget.style.borderColor = '#ddd';
              e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.1)';
            }}
            title="Filters"
          >
            🔍
          </button>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
            <button
              type="button"
              onClick={toggleAllTimeFilter}
              aria-pressed={filters.allTime}
              style={{
                background: filters.allTime
                  ? 'linear-gradient(135deg, #ff9a9e 0%, #fad0c4 100%)'
                  : 'white',
                color: filters.allTime ? '#4a1c40' : '#333',
                border: filters.allTime ? 'none' : '1px solid #ddd',
                borderRadius: '8px',
                padding: '0.6rem 1rem',
                cursor: 'pointer',
                fontSize: '0.9rem',
                fontWeight: '600',
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                boxShadow: filters.allTime
                  ? '0 4px 12px rgba(255, 154, 158, 0.35)'
                  : '0 1px 3px rgba(0,0,0,0.1)',
                transition: 'all 0.2s ease'
              }}
              title={filters.allTime ? 'Showing every expense' : 'Show every expense across all time'}
            >
              ♾️ {filters.allTime ? 'All Time On' : 'All Time'}
            </button>
            {filters.allTime && (
              <span
                style={{
                  fontSize: '0.75rem',
                  color: '#5c5f77',
                  fontWeight: 600,
                  paddingLeft: '0.25rem'
                }}
              >
                {allTimeRangeLabel || 'All dated receipts'}
              </span>
            )}
          </div>

          <button
            type="button"
            onClick={onOpenShoppingList}
            style={{
              background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
              color: 'white',
              border: 'none',
              borderRadius: '8px',
              padding: '0.6rem 1.2rem',
              cursor: 'pointer',
              fontSize: '0.95rem',
              fontWeight: '500',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              transition: 'all 0.2s ease',
              boxShadow: '0 2px 6px rgba(102, 126, 234, 0.3)'
            }}
            onMouseOver={(e) => {
              e.currentTarget.style.transform = 'translateY(-2px)';
              e.currentTarget.style.boxShadow = '0 4px 12px rgba(102, 126, 234, 0.4)';
            }}
            onMouseOut={(e) => {
              e.currentTarget.style.transform = 'translateY(0)';
              e.currentTarget.style.boxShadow = '0 2px 6px rgba(102, 126, 234, 0.3)';
            }}
          >
            🛒 Shopping List
          </button>

          <button
            type="button"
            onClick={onOpenRecurring}
            style={{
              background: 'linear-gradient(135deg, #11998e 0%, #38ef7d 100%)',
              color: 'white',
              border: 'none',
              borderRadius: '8px',
              padding: '0.6rem 1.2rem',
              cursor: 'pointer',
              fontSize: '0.95rem',
              fontWeight: '500',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              transition: 'all 0.2s ease',
              boxShadow: '0 2px 6px rgba(17, 153, 142, 0.3)'
            }}
            onMouseOver={(e) => {
              e.currentTarget.style.transform = 'translateY(-2px)';
              e.currentTarget.style.boxShadow = '0 4px 12px rgba(17, 153, 142, 0.4)';
            }}
            onMouseOut={(e) => {
              e.currentTarget.style.transform = 'translateY(0)';
              e.currentTarget.style.boxShadow = '0 2px 6px rgba(17, 153, 142, 0.3)';
            }}
          >
            🔄 Recurring
          </button>

          <div style={{ position: 'relative' }}>
            <button
              type="button"
              onClick={handleExport}
              style={{
                background: 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)',
                color: 'white',
                border: 'none',
                borderRadius: '8px',
                padding: '0.6rem 1.2rem',
                cursor: 'pointer',
                fontSize: '0.95rem',
                fontWeight: '500',
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                transition: 'all 0.2s ease',
                boxShadow: '0 2px 6px rgba(240, 147, 251, 0.3)'
              }}
              onMouseOver={(e) => {
                e.currentTarget.style.transform = 'translateY(-2px)';
                e.currentTarget.style.boxShadow = '0 4px 12px rgba(240, 147, 251, 0.4)';
              }}
              onMouseOut={(e) => {
                e.currentTarget.style.transform = 'translateY(0)';
                e.currentTarget.style.boxShadow = '0 2px 6px rgba(240, 147, 251, 0.3)';
              }}
            >
              📊 Export {showExportMenu ? '▲' : '▼'}
            </button>
            {showExportMenu && (
              <div style={{
                position: 'absolute',
                right: 0,
                top: 'calc(100% + 12px)',
                background: 'rgba(8, 9, 28, 0.95)',
                border: '1px solid rgba(255,255,255,0.15)',
                borderRadius: '14px',
                boxShadow: '0 30px 65px rgba(0,0,0,0.55)',
                minWidth: '220px',
                zIndex: 2000,
                overflow: 'hidden',
                backdropFilter: 'blur(16px)',
                color: '#f5f6ff'
              }}>
                <button
                  onClick={() => handleExportOption('csv')}
                  style={{
                    width: '100%',
                    padding: '12px 16px',
                    border: 'none',
                    background: 'transparent',
                    textAlign: 'left',
                    cursor: 'pointer',
                    fontSize: '14px',
                    borderBottom: '1px solid rgba(255,255,255,0.08)',
                    transition: 'background 0.2s ease, color 0.2s ease',
                    color: '#f5f6ff',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px'
                  }}
                  onMouseOver={(e) => {
                    e.target.style.backgroundColor = 'rgba(255,255,255,0.08)';
                  }}
                  onMouseOut={(e) => {
                    e.target.style.backgroundColor = 'transparent';
                  }}
                >
                  <span style={{ fontSize: '1rem' }}>📄</span>
                  <span>Export as CSV</span>
                </button>
                <button
                  onClick={() => handleExportOption('excel-daily')}
                  style={{
                    width: '100%',
                    padding: '12px 16px',
                    border: 'none',
                    background: 'transparent',
                    textAlign: 'left',
                    cursor: 'pointer',
                    fontSize: '14px',
                    borderBottom: '1px solid rgba(255,255,255,0.08)',
                    transition: 'background 0.2s ease, color 0.2s ease',
                    color: '#f5f6ff',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px'
                  }}
                  onMouseOver={(e) => {
                    e.target.style.backgroundColor = 'rgba(255,255,255,0.08)';
                  }}
                  onMouseOut={(e) => {
                    e.target.style.backgroundColor = 'transparent';
                  }}
                >
                  <span style={{ fontSize: '1rem' }}>📊</span>
                  <span>Excel (Daily)</span>
                </button>
                <button
                  onClick={() => handleExportOption('excel-monthly')}
                  style={{
                    width: '100%',
                    padding: '12px 16px',
                    border: 'none',
                    background: 'transparent',
                    textAlign: 'left',
                    cursor: 'pointer',
                    fontSize: '14px',
                    transition: 'background 0.2s ease, color 0.2s ease',
                    color: '#f5f6ff',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px'
                  }}
                  onMouseOver={(e) => {
                    e.target.style.backgroundColor = 'rgba(255,255,255,0.08)';
                  }}
                  onMouseOut={(e) => {
                    e.target.style.backgroundColor = 'transparent';
                  }}
                >
                  <span style={{ fontSize: '1rem' }}>📈</span>
                  <span>Excel (Monthly)</span>
                </button>
              </div>
            )}
          </div>
      </div>
    </div>

      <div className={`expenses-filters`} style={{ display: 'none' }}>
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
              {allCategories.map(category => (
                <option key={category.id} value={category.name}>{category.name}</option>
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

      <div className="expenses-grouped-view">
        {dateGroups.length > 0 ? (
          dateGroups.map(group => (
            <div key={group.key} className="date-group">
              <div className="date-header">
                {group.label}
              </div>
              <div className="date-expenses">
                {group.expenses.map(expense => (
                  <div key={expense.id || `${expense.date}-${expense.merchantName}`} className="merchant-group">
                    <div className="merchant-header">
                      {expense.merchantName ? (
                        <span className="merchant-name">{expense.merchantName}</span>
                      ) : (
                          <span
                            className="merchant-name placeholder-link"
                            onClick={() => setSelectedExpense(expense)}
                            style={{
                              color: '#999',
                              fontStyle: 'italic',
                              cursor: 'pointer',
                              textDecoration: 'underline'
                            }}
                            title="Click to add merchant name"
                          >
                            + Add Store/Merchant
                          </span>
                        )}
                        <div className="merchant-meta">
                          {expense.paymentMethod ? (
                            <span className="tag">{expense.paymentMethod}</span>
                          ) : (
                            <span
                              className="tag placeholder-link"
                              onClick={() => setSelectedExpense(expense)}
                              style={{
                                color: '#999',
                                fontStyle: 'italic',
                                cursor: 'pointer',
                                backgroundColor: '#f5f5f5',
                                border: '1px dashed #ccc'
                              }}
                              title="Click to add payment method"
                            >
                              + Add Payment Method
                            </span>
                          )}
                          {getReceiptPreview(expense) && (
                            <img src={getReceiptPreview(expense)} alt="Receipt" className="receipt-thumb-small" />
                          )}
                        </div>
                      </div>
                      {expense.items && expense.items.length > 0 ? (
                        <div className="product-list">
                          {expense.items.map((item, idx) => {
                            const itemCategory = item.category || expense.category;
                            const categoryMeta = getCategoryMeta(itemCategory, allCategories);
                            return (
                              <div
                                key={idx}
                                className="product-item"
                                onClick={() => setSelectedExpense(expense)}
                              >
                                <div className="product-main">
                                  <span className="product-name">{item.description}</span>
                                  {item.quantity > 1 && <span className="product-qty">×{item.quantity}</span>}
                                </div>
                                <div className="product-details">
                                  <span
                                    className="category-pill-compact"
                                    style={{ backgroundColor: categoryMeta.color + '1f', color: categoryMeta.color }}
                                  >
                                    <span className="category-icon" role="img" aria-label={itemCategory}>{categoryMeta.icon}</span>
                                    {itemCategory || 'Other'}
                                  </span>
                                  <span className="product-price">{formatCurrency(item.totalPrice || item.price, expense.currency)}</span>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <div className="product-list">
                          <div
                            className="product-item"
                            onClick={() => setSelectedExpense(expense)}
                          >
                            <div className="product-main">
                              <span className="product-name">{expense.description || expense.merchantName}</span>
                            </div>
                            <div className="product-details">
                              <span
                                className="category-pill-compact"
                                style={{ backgroundColor: getCategoryMeta(expense.category, allCategories).color + '1f', color: getCategoryMeta(expense.category, allCategories).color }}
                              >
                                <span className="category-icon" role="img" aria-label={expense.category}>{getCategoryMeta(expense.category, allCategories).icon}</span>
                                {expense.category || 'Other'}
                              </span>
                              <span className="product-price">{formatCurrency(expense.amount, expense.currency)}</span>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                ))}
              </div>
            </div>
          ))
        ) : (
          <div className="empty-state-grouped">
            No expenses match your filters yet. Try broadening the range or add a new transaction.
          </div>
        )}
      </div>

      <div className="expenses-mobile-list">
        {sortedExpenses.map(expense => {
          const categoryMeta = getCategoryMeta(expense.category, allCategories);
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

                {/* Items Section */}
                <div className="edit-items-section" style={{ marginTop: '1.5rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                    <h3 style={{ fontSize: '1rem', margin: 0, color: '#333' }}>Receipt Items</h3>
                    <button
                      type="button"
                      onClick={handleAddItem}
                      disabled={isSaving}
                      style={{
                        background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                        color: 'white',
                        border: 'none',
                        borderRadius: '6px',
                        padding: '0.5rem 1rem',
                        cursor: isSaving ? 'not-allowed' : 'pointer',
                        fontSize: '0.9rem',
                        fontWeight: '500',
                        opacity: isSaving ? 0.6 : 1,
                        transition: 'all 0.2s ease'
                      }}
                      onMouseOver={(e) => !isSaving && (e.currentTarget.style.transform = 'translateY(-1px)')}
                      onMouseOut={(e) => (e.currentTarget.style.transform = 'translateY(0)')}
                      title="Add new item"
                    >
                      + Add Item
                    </button>
                  </div>
                  {editForm.items && editForm.items.length > 0 && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                      {editForm.items.map((item, index) => (
                        <div key={index} style={{
                          border: '1px solid #e0e0e0',
                          borderRadius: '8px',
                          padding: '0.75rem',
                          backgroundColor: '#f9f9f9'
                        }}>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                            <div className="form-field" style={{ margin: 0 }}>
                              <label htmlFor={`item-desc-${index}`} style={{ fontSize: '0.85rem', marginBottom: '0.25rem', display: 'block' }}>Description</label>
                              <input
                                id={`item-desc-${index}`}
                                type="text"
                                value={item.description || ''}
                                onChange={(e) => handleItemFieldChange(index, 'description', e.target.value)}
                                disabled={isSaving}
                                style={{ fontSize: '0.9rem', width: '100%', color: 'black' }}
                              />
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                              <div className="form-field" style={{ margin: 0 }}>
                                <label htmlFor={`item-price-${index}`} style={{ fontSize: '0.85rem', marginBottom: '0.25rem', display: 'block' }}>Price</label>
                                <input
                                  id={`item-price-${index}`}
                                  type="number"
                                  step="0.01"
                                  min="0"
                                  value={item.totalPrice || item.price || ''}
                                  onChange={(e) => handleItemFieldChange(index, 'totalPrice', e.target.value)}
                                  disabled={isSaving}
                                  style={{ fontSize: '0.9rem', width: '100%', color: 'black' }}
                                />
                              </div>
                              <div className="form-field" style={{ margin: 0 }}>
                                <label htmlFor={`item-cat-${index}`} style={{ fontSize: '0.85rem', marginBottom: '0.25rem', display: 'block' }}>Category</label>
                                <select
                                  id={`item-cat-${index}`}
                                  value={item.category || 'Other'}
                                  onChange={(e) => handleItemFieldChange(index, 'category', e.target.value)}
                                  disabled={isSaving}
                                  style={{ fontSize: '0.9rem', width: '100%', padding: '0.5rem' }}
                                >
                                  {allCategories.map(category => (
                                    <option key={category.id} value={category.name}>{category.name}</option>
                                  ))}
                                </select>
                              </div>
                            </div>
                            <button
                              type="button"
                              onClick={() => handleDeleteItem(index)}
                              disabled={isSaving}
                              style={{
                                background: '#dc3545',
                                color: 'white',
                                border: 'none',
                                borderRadius: '4px',
                                padding: '0.5rem',
                                cursor: isSaving ? 'not-allowed' : 'pointer',
                                fontSize: '0.9rem',
                                opacity: isSaving ? 0.6 : 1,
                                width: '100%'
                              }}
                              title="Delete item"
                            >
                              🗑️ Delete Item
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  {editForm.items && editForm.items.length === 0 && (
                    <p style={{ color: '#999', fontStyle: 'italic', textAlign: 'center', padding: '1rem' }}>
                      No items yet. Click "Add Item" to add products to this receipt.
                    </p>
                  )}
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
                  <strong>{formatDate(selectedExpense.date || selectedExpense.createdAt || selectedExpense.uploadDate)}</strong>
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
                      {selectedExpense.items.map((item, index) => {
                        const itemCategory = item.category || selectedExpense.category;
                        const categoryMeta = getCategoryMeta(itemCategory, allCategories);
                        return (
                          <div key={index} className="item-row">
                            <div className="item-description">
                              {item.description}
                              {item.quantity > 1 && <span className="item-quantity"> ×{item.quantity}</span>}
                              <span
                                className="category-pill-compact"
                                style={{ backgroundColor: categoryMeta.color + '1f', color: categoryMeta.color, marginLeft: '8px' }}
                              >
                                <span className="category-icon" role="img" aria-label={itemCategory}>{categoryMeta.icon}</span>
                                {itemCategory || 'Other'}
                              </span>
                            </div>
                            <div className="item-price">
                              {formatCurrency(item.totalPrice || item.price, selectedExpense.currency)}
                            </div>
                          </div>
                        );
                      })}
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
                  <button
                    type="button"
                    className="expenses-btn"
                    onClick={() => setShowDeleteConfirm(true)}
                    disabled={!selectedExpense.id}
                    style={{
                      background: '#dc3545',
                      color: 'white',
                      border: 'none'
                    }}
                  >
                    Delete Receipt
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

      {/* Filters Modal */}
      {showFiltersModal && (
        <div className="expense-modal" role="dialog" aria-modal="true">
          <div className="expense-modal-backdrop" onClick={() => setShowFiltersModal(false)} />
          <div className="expense-modal-content" style={{ maxWidth: '800px' }}>
            <button type="button" className="modal-close" onClick={() => setShowFiltersModal(false)} aria-label="Close">
              ×
            </button>
            <h2>Filter Expenses</h2>

            <div className="modal-form" style={{ padding: '1rem 0' }}>
              <div className="form-grid">
                <div className="form-field form-field-full">
                  <label htmlFor="modal-search">Search</label>
                  <div className="input-with-icon">
                    <span className="input-icon" aria-hidden="true">🔍</span>
                    <input
                      id="modal-search"
                      type="text"
                      value={filters.search}
                      placeholder="Search by merchant, notes, category..."
                      onChange={(event) => handleFilterChange('search', event.target.value)}
                    />
                  </div>
                </div>

                <div className="form-field">
                  <label htmlFor="modal-category">Category</label>
                  <select
                    id="modal-category"
                    value={filters.category}
                    onChange={(event) => handleFilterChange('category', event.target.value)}
                  >
                    <option value="all">All</option>
                    {allCategories.map(category => (
                      <option key={category.id} value={category.name}>{category.name}</option>
                    ))}
                  </select>
                </div>

                <div className="form-field">
                  <label htmlFor="modal-source">Source</label>
                  <select
                    id="modal-source"
                    value={filters.source}
                    onChange={(event) => handleFilterChange('source', event.target.value)}
                  >
                    <option value="all">All</option>
                    {sources.map(source => (
                      <option key={source} value={source}>{source}</option>
                    ))}
                  </select>
                </div>

                <div className="form-field">
                  <label htmlFor="modal-minAmount">Min Amount</label>
                  <input
                    id="modal-minAmount"
                    type="number"
                    value={filters.minAmount}
                    placeholder="Min"
                    onChange={(event) => handleFilterChange('minAmount', event.target.value)}
                  />
                </div>

                <div className="form-field">
                  <label htmlFor="modal-maxAmount">Max Amount</label>
                  <input
                    id="modal-maxAmount"
                    type="number"
                    value={filters.maxAmount}
                    placeholder="Max"
                    onChange={(event) => handleFilterChange('maxAmount', event.target.value)}
                  />
                </div>

                <div className="form-field">
                  <label htmlFor="modal-startDate">Start Date</label>
                  <input
                    id="modal-startDate"
                    type="date"
                    value={filters.startDate}
                    onChange={(event) => handleFilterChange('startDate', event.target.value)}
                  />
                </div>

                <div className="form-field">
                  <label htmlFor="modal-endDate">End Date</label>
                  <input
                    id="modal-endDate"
                    type="date"
                    value={filters.endDate}
                    onChange={(event) => handleFilterChange('endDate', event.target.value)}
                  />
                </div>
              </div>

              <div
                style={{
                  marginTop: '1rem',
                  padding: '1rem',
                  borderRadius: '12px',
                  border: filters.allTime ? '1px solid #fdba74' : '1px solid #e0e6f0',
                  backgroundColor: filters.allTime ? '#fff7ed' : '#f5f7fb',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0.5rem'
                }}
              >
                <div style={{ fontSize: '1rem', fontWeight: 600, color: '#333' }}>Timeline</div>
                <div style={{ fontSize: '0.9rem', color: '#555', lineHeight: 1.4 }}>
                  Ignore the shared dashboard date range and show every expense you've ever logged.
                </div>
                {filters.allTime && (
                  <div style={{ fontSize: '0.85rem', color: '#aa5200', fontWeight: 600 }}>
                    {allTimeRangeLabel ? `Covering ${allTimeRangeLabel}` : 'Covering every dated receipt'}
                  </div>
                )}
                <button
                  type="button"
                  onClick={toggleAllTimeFilter}
                  style={{
                    alignSelf: 'flex-start',
                    padding: '0.5rem 1rem',
                    borderRadius: '999px',
                    border: 'none',
                    cursor: 'pointer',
                    fontWeight: 600,
                    background: filters.allTime
                      ? 'linear-gradient(135deg, #f97316 0%, #fb923c 100%)'
                      : 'linear-gradient(135deg, #8ec5fc 0%, #e0c3fc 100%)',
                    color: '#fff',
                    boxShadow: '0 6px 14px rgba(0,0,0,0.15)',
                    transition: 'transform 0.2s ease'
                  }}
                >
                  {filters.allTime ? 'Disable All Time' : 'Show All Time'}
                </button>
              </div>

              {/* Active Filters Summary */}
              {activeFilterLabels.length > 0 && (
                <div style={{ marginTop: '1.5rem', padding: '1rem', backgroundColor: '#f8f9fa', borderRadius: '8px' }}>
                  <div style={{ fontSize: '0.9rem', color: '#666', marginBottom: '0.5rem' }}>Active Filters:</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                    {activeFilterLabels.map(label => (
                      <span key={label} style={{
                        padding: '0.25rem 0.75rem',
                        backgroundColor: '#4a90e2',
                        color: 'white',
                        borderRadius: '12px',
                        fontSize: '0.85rem'
                      }}>
                        {label}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              <div style={{ marginTop: '1.5rem', padding: '1rem', backgroundColor: '#e8f4fd', borderRadius: '8px', textAlign: 'center' }}>
                <div style={{ fontSize: '1.1rem', fontWeight: '600', color: '#333' }}>{resultsLabel}</div>
              </div>
            </div>

            <div className="modal-actions">
              <button
                type="button"
                className="expenses-btn ghost"
                onClick={resetFilters}
              >
                Reset All
              </button>
              <button
                type="button"
                className="expenses-btn primary"
                onClick={() => setShowFiltersModal(false)}
              >
                Apply Filters
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && (
        <div className="expense-modal" role="dialog" aria-modal="true">
          <div className="expense-modal-backdrop" onClick={() => setShowDeleteConfirm(false)} />
          <div className="expense-modal-content" style={{ maxWidth: '500px' }}>
            <button type="button" className="modal-close" onClick={() => setShowDeleteConfirm(false)} aria-label="Close">
              ×
            </button>
            <h2>Delete Receipt?</h2>
            <div className="modal-details">
              <p style={{ fontSize: '1rem', color: '#666', marginBottom: '1.5rem' }}>
                Are you sure you want to delete this entire receipt? This action cannot be undone.
              </p>
              {selectedExpense && (
                <div style={{ padding: '1rem', backgroundColor: '#f8f9fa', borderRadius: '8px', marginBottom: '1rem' }}>
                  <div style={{ fontWeight: '600', marginBottom: '0.5rem' }}>{selectedExpense.merchantName}</div>
                  <div style={{ color: '#666', fontSize: '0.9rem' }}>{formatDate(selectedExpense.date || selectedExpense.createdAt || selectedExpense.uploadDate)}</div>
                  <div style={{ fontSize: '1.2rem', fontWeight: '600', marginTop: '0.5rem', color: '#dc3545' }}>
                    {formatCurrency(selectedExpense.totalAmount || selectedExpense.amount, selectedExpense.currency)}
                  </div>
                </div>
              )}
              {editError && (
                <div className="modal-error">
                  {editError}
                </div>
              )}
            </div>
            <div className="modal-actions">
              <button
                type="button"
                className="expenses-btn ghost"
                onClick={() => setShowDeleteConfirm(false)}
                disabled={isDeleting}
              >
                Cancel
              </button>
              <button
                type="button"
                className="expenses-btn"
                onClick={handleDeleteExpense}
                disabled={isDeleting}
                style={{
                  background: '#dc3545',
                  color: 'white',
                  border: 'none'
                }}
              >
                {isDeleting ? 'Deleting...' : 'Delete Receipt'}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

export default ExpensesSummary;
