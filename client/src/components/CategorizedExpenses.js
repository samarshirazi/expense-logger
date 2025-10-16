import React, { useState, useEffect } from 'react';
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';
import { updateExpenseCategory } from '../services/apiService';
import TimeNavigator from './TimeNavigator';
import './CategorizedExpenses.css';

const CATEGORIES = [
  { id: 'Food', name: 'Food', icon: '🍔', color: '#ff6b6b' },
  { id: 'Transport', name: 'Transport', icon: '🚗', color: '#4ecdc4' },
  { id: 'Shopping', name: 'Shopping', icon: '🛍️', color: '#45b7d1' },
  { id: 'Bills', name: 'Bills', icon: '💡', color: '#f9ca24' },
  { id: 'Other', name: 'Other', icon: '📦', color: '#95afc0' }
];

function CategorizedExpenses({ expenses, onExpenseSelect, onCategoryUpdate, onRefresh }) {
  const [categorizedExpenses, setCategorizedExpenses] = useState({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [dateRange, setDateRange] = useState(() => {
    // Default to this month
    const today = new Date();
    const year = today.getFullYear();
    const month = today.getMonth();
    const startOfMonth = new Date(year, month, 1);
    const endOfMonth = new Date(year, month + 1, 0);
    return {
      startDate: startOfMonth.toISOString().split('T')[0],
      endDate: endOfMonth.toISOString().split('T')[0]
    };
  });

  // Filter expenses by date range
  const filteredExpenses = expenses.filter(expense => {
    if (!dateRange.startDate || !dateRange.endDate) return true;
    const expenseDate = new Date(expense.date);
    const start = new Date(dateRange.startDate);
    const end = new Date(dateRange.endDate);
    return expenseDate >= start && expenseDate <= end;
  });

  // Organize expenses by category
  useEffect(() => {
    const organized = {
      Food: [],
      Transport: [],
      Shopping: [],
      Bills: [],
      Other: []
    };

    filteredExpenses.forEach(expense => {
      const category = expense.category || 'Other';
      if (organized[category]) {
        organized[category].push(expense);
      } else {
        organized['Other'].push(expense);
      }
    });

    setCategorizedExpenses(organized);
  }, [filteredExpenses]);

  const handleDragEnd = async (result) => {
    const { destination, source, draggableId } = result;

    // Dropped outside a valid droppable
    if (!destination) {
      return;
    }

    // Dropped in same position
    if (
      destination.droppableId === source.droppableId &&
      destination.index === source.index
    ) {
      return;
    }

    const sourceCategory = source.droppableId;
    const destinationCategory = destination.droppableId;

    // Category didn't change
    if (sourceCategory === destinationCategory) {
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // Update category on server
      await updateExpenseCategory(draggableId, destinationCategory);

      // Update local state optimistically
      const newCategorized = { ...categorizedExpenses };
      const [movedExpense] = newCategorized[sourceCategory].filter(
        expense => expense.id === draggableId
      );

      // Remove from source
      newCategorized[sourceCategory] = newCategorized[sourceCategory].filter(
        expense => expense.id !== draggableId
      );

      // Add to destination with updated category
      const updatedExpense = { ...movedExpense, category: destinationCategory };
      newCategorized[destinationCategory] = [
        ...newCategorized[destinationCategory].slice(0, destination.index),
        updatedExpense,
        ...newCategorized[destinationCategory].slice(destination.index)
      ];

      setCategorizedExpenses(newCategorized);

      // Notify parent component
      if (onCategoryUpdate) {
        onCategoryUpdate(draggableId, destinationCategory);
      }

    } catch (err) {
      console.error('Failed to update category:', err);
      setError('Failed to update category. Please try again.');

      // Revert on error by refreshing
      if (onRefresh) {
        onRefresh();
      }
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (amount, currency = 'USD') => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency
    }).format(amount);
  };

  const formatDate = (dateString) => {
    if (!dateString) return 'No date';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  };

  const getCategoryTotal = (category) => {
    return categorizedExpenses[category]?.reduce(
      (sum, expense) => sum + (expense.totalAmount || 0),
      0
    ) || 0;
  };

  const handleDateRangeChange = (range) => {
    setDateRange(range);
  };

  return (
    <div className="categorized-expenses">
      <div className="categorized-header">
        <h2>Expenses by Category</h2>
        <p className="categorized-hint">
          Expenses are grouped in sticky notes. Drag individual items to move them between categories
        </p>
      </div>

      <TimeNavigator onRangeChange={handleDateRangeChange} expenses={expenses} />

      {error && (
        <div className="error-message">
          {error}
          <button onClick={() => setError(null)}>✕</button>
        </div>
      )}

      <DragDropContext onDragEnd={handleDragEnd}>
        <div className="categories-grid">
          {CATEGORIES.map(category => (
            <div key={category.id} className="category-column">
              <div
                className="category-header"
                style={{ backgroundColor: category.color }}
              >
                <span className="category-icon">{category.icon}</span>
                <span className="category-name">{category.name}</span>
                <span className="category-count">
                  {categorizedExpenses[category.id]?.length || 0}
                </span>
              </div>

              <div className="category-total">
                {formatCurrency(getCategoryTotal(category.id))}
              </div>

              <Droppable droppableId={category.id}>
                {(provided, snapshot) => (
                  <div
                    ref={provided.innerRef}
                    {...provided.droppableProps}
                    className={`category-list ${
                      snapshot.isDraggingOver ? 'dragging-over' : ''
                    }`}
                  >
                    {categorizedExpenses[category.id]?.length === 0 ? (
                      <div className="empty-category">
                        No {category.name.toLowerCase()} expenses
                      </div>
                    ) : (
                      <div className="category-sticky-note">
                        <div className="sticky-note-header">
                          <span className="sticky-note-icon">{category.icon}</span>
                          <span className="sticky-note-title">{category.name} Expenses</span>
                        </div>
                        <div className="sticky-note-items">
                          {categorizedExpenses[category.id]?.map((expense, index) => (
                            <Draggable
                              key={expense.id}
                              draggableId={expense.id}
                              index={index}
                              isDragDisabled={loading}
                            >
                              {(provided, snapshot) => (
                                <div
                                  ref={provided.innerRef}
                                  {...provided.draggableProps}
                                  {...provided.dragHandleProps}
                                  className={`stacked-expense-item ${
                                    snapshot.isDragging ? 'dragging' : ''
                                  }`}
                                  onClick={() => onExpenseSelect && onExpenseSelect(expense)}
                                >
                                  <div className="stacked-item-left">
                                    <div className="stacked-item-merchant">
                                      {expense.merchantName}
                                    </div>
                                    <div className="stacked-item-date">
                                      {formatDate(expense.date)}
                                    </div>
                                    {expense.items && expense.items.length > 0 && (
                                      <div className="stacked-item-products">
                                        {expense.items.map((item, idx) => (
                                          <div key={idx} className="product-line">
                                            <span className="product-name">
                                              {item.description || 'Item'}
                                              {item.quantity && item.quantity > 1 && ` (×${item.quantity})`}
                                            </span>
                                            {item.totalPrice && (
                                              <span className="product-price">
                                                {formatCurrency(item.totalPrice, expense.currency)}
                                              </span>
                                            )}
                                          </div>
                                        ))}
                                      </div>
                                    )}
                                  </div>
                                  <div className="stacked-item-amount">
                                    {formatCurrency(expense.totalAmount, expense.currency)}
                                  </div>
                                </div>
                              )}
                            </Draggable>
                          ))}
                        </div>
                      </div>
                    )}
                    {provided.placeholder}
                  </div>
                )}
              </Droppable>
            </div>
          ))}
        </div>
      </DragDropContext>

      {loading && (
        <div className="loading-overlay">
          <div className="loading-spinner"></div>
          <p>Updating category...</p>
        </div>
      )}
    </div>
  );
}

export default CategorizedExpenses;
