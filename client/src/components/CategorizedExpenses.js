import React, { useState, useEffect } from 'react';
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';
import { updateExpenseCategory, updateItemCategory } from '../services/apiService';
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

  // Organize individual items by their category
  useEffect(() => {
    const organized = {
      Food: [],
      Transport: [],
      Shopping: [],
      Bills: [],
      Other: []
    };

    filteredExpenses.forEach(expense => {
      // If expense has items, add each item separately
      if (expense.items && expense.items.length > 0) {
        expense.items.forEach((item, itemIndex) => {
          const itemCategory = item.category || 'Other';
          const itemWithMetadata = {
            ...item,
            expenseId: expense.id,
            itemIndex: itemIndex,
            merchantName: expense.merchantName,
            date: expense.date,
            currency: expense.currency,
            // Create unique ID for dragging
            uniqueId: `${expense.id}-item-${itemIndex}`
          };

          if (organized[itemCategory]) {
            organized[itemCategory].push(itemWithMetadata);
          } else {
            organized['Other'].push(itemWithMetadata);
          }
        });
      } else {
        // If no items, show the expense itself
        const category = expense.category || 'Other';
        const expenseAsItem = {
          description: expense.merchantName,
          totalPrice: expense.totalAmount,
          quantity: 1,
          expenseId: expense.id,
          itemIndex: -1, // -1 indicates whole expense, not individual item
          merchantName: expense.merchantName,
          date: expense.date,
          currency: expense.currency,
          uniqueId: expense.id
        };

        if (organized[category]) {
          organized[category].push(expenseAsItem);
        } else {
          organized['Other'].push(expenseAsItem);
        }
      }
    });

    setCategorizedExpenses(organized);
  }, [filteredExpenses]);

  const handleDragEnd = async (result) => {
    console.log('🔄 Drag ended:', result);

    const { destination, source, draggableId } = result;

    // Dropped outside a valid droppable
    if (!destination) {
      console.log('❌ Dropped outside droppable area');
      return;
    }

    // Dropped in same position
    if (
      destination.droppableId === source.droppableId &&
      destination.index === source.index
    ) {
      console.log('❌ Dropped in same position');
      return;
    }

    const sourceCategory = source.droppableId;
    const destinationCategory = destination.droppableId;

    console.log(`📦 Moving from ${sourceCategory} to ${destinationCategory}`);

    // Category didn't change (shouldn't happen with different droppables)
    if (sourceCategory === destinationCategory) {
      console.log('❌ Same category');
      return;
    }

    setError(null);

    // Find the moved item
    const movedItem = categorizedExpenses[sourceCategory]?.find(
      item => item.uniqueId === draggableId
    );

    if (!movedItem) {
      console.error('❌ Item not found:', draggableId);
      setError('Item not found');
      return;
    }

    console.log('✅ Found item:', movedItem);

    // Save previous state for potential revert
    const previousState = JSON.parse(JSON.stringify(categorizedExpenses));

    // Update local state IMMEDIATELY (optimistic update)
    const newCategorized = {};

    // Deep clone to avoid mutations
    Object.keys(categorizedExpenses).forEach(key => {
      newCategorized[key] = [...categorizedExpenses[key]];
    });

    // Remove from source
    newCategorized[sourceCategory] = newCategorized[sourceCategory].filter(
      item => item.uniqueId !== draggableId
    );

    // Add to destination with updated category
    const updatedItem = { ...movedItem, category: destinationCategory };
    newCategorized[destinationCategory] = [
      ...newCategorized[destinationCategory].slice(0, destination.index),
      updatedItem,
      ...newCategorized[destinationCategory].slice(destination.index)
    ];

    console.log('🔄 Updating UI optimistically...');
    // Update UI immediately
    setCategorizedExpenses(newCategorized);

    // Now update server in background
    setLoading(true);

    try {
      console.log('📡 Sending to server...');

      // Update category on server
      if (movedItem.itemIndex === -1) {
        console.log('🔧 Updating whole expense category');
        await updateExpenseCategory(movedItem.expenseId, destinationCategory);
      } else {
        console.log('🔧 Updating item category:', {
          expenseId: movedItem.expenseId,
          itemIndex: movedItem.itemIndex,
          newCategory: destinationCategory
        });
        await updateItemCategory(movedItem.expenseId, movedItem.itemIndex, destinationCategory);
      }

      console.log('✅ Server update successful!');

      // Notify parent component if it's a whole expense
      if (onCategoryUpdate && movedItem.itemIndex === -1) {
        onCategoryUpdate(movedItem.expenseId, destinationCategory);
      }

    } catch (err) {
      console.error('❌ Server update failed:', err);
      setError(`Failed to update: ${err.message}`);

      // Revert to previous state on error
      console.log('🔄 Reverting to previous state...');
      setCategorizedExpenses(previousState);

      // Also refresh from server to ensure consistency
      if (onRefresh) {
        setTimeout(() => {
          console.log('🔄 Refreshing from server...');
          onRefresh();
        }, 500);
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
      (sum, item) => sum + (item.totalPrice || 0),
      0
    ) || 0;
  };

  const handleDateRangeChange = (range) => {
    setDateRange(range);
  };

  return (
    <div className="categorized-expenses">
      <div className="categorized-header">
        <h2>Products by Category</h2>
        <p className="categorized-hint">
          Each product is displayed separately. Drag items to recategorize them
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
                        No {category.name.toLowerCase()} items
                      </div>
                    ) : (
                      categorizedExpenses[category.id]?.map((item, index) => (
                        <Draggable
                          key={item.uniqueId}
                          draggableId={item.uniqueId}
                          index={index}
                          isDragDisabled={loading}
                        >
                          {(provided, snapshot) => (
                            <div
                              ref={provided.innerRef}
                              {...provided.draggableProps}
                              {...provided.dragHandleProps}
                              className={`product-card ${
                                snapshot.isDragging ? 'dragging' : ''
                              }`}
                            >
                              <div className="product-card-left">
                                <div className="product-card-name">
                                  {item.description || item.merchantName}
                                  {item.quantity && item.quantity > 1 && ` (×${item.quantity})`}
                                </div>
                                <div className="product-card-meta">
                                  {item.merchantName} • {formatDate(item.date)}
                                </div>
                              </div>
                              <div className="product-card-amount">
                                {formatCurrency(item.totalPrice || 0, item.currency)}
                              </div>
                            </div>
                          )}
                        </Draggable>
                      ))
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
