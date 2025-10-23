import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';
import {
  updateExpenseCategory,
  updateItemCategory,
  deleteExpense,
  deleteExpenseItem,
  updateExpense,
  updateExpenseItem
} from '../services/apiService';
import './CategorizedExpenses.css';

const createEmptyBoard = () =>
  CATEGORIES.reduce((acc, category) => {
    acc[category.id] = [];
    return acc;
  }, {});

const CARD_LONG_PRESS_DELAY = 420;

const CATEGORIES = [
  { id: 'Food', name: 'Food', icon: '🍔', color: '#ff6b6b', gradient: 'linear-gradient(135deg, #ff6b6b 0%, #ff8585 100%)' },
  { id: 'Transport', name: 'Transport', icon: '🚗', color: '#4ecdc4', gradient: 'linear-gradient(135deg, #4ecdc4 0%, #76e3da 100%)' },
  { id: 'Shopping', name: 'Shopping', icon: '🛍️', color: '#45b7d1', gradient: 'linear-gradient(135deg, #45b7d1 0%, #6fd0e6 100%)' },
  { id: 'Bills', name: 'Bills', icon: '💡', color: '#f9ca24', gradient: 'linear-gradient(135deg, #f9ca24 0%, #ffd866 100%)' },
  { id: 'Other', name: 'Other', icon: '📦', color: '#95afc0', gradient: 'linear-gradient(135deg, #95afc0 0%, #b7c7d3 100%)' }
];

const DEFAULT_BUDGET = {
  Food: 500,
  Transport: 200,
  Shopping: 300,
  Bills: 400,
  Other: 100
};

function CategorizedExpenses({ expenses, onExpenseSelect, onCategoryUpdate, onRefresh, dateRange }) {
  const [categorizedExpenses, setCategorizedExpenses] = useState(createEmptyBoard);
  const [monthlyBudgets, setMonthlyBudgets] = useState({});
  const [error, setError] = useState(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [actionItem, setActionItem] = useState(null);
  const [editForm, setEditForm] = useState({ description: '', totalPrice: '', date: '', currency: 'USD' });

  const [isMobileView, setIsMobileView] = useState(false);
  const [showAiPanel, setShowAiPanel] = useState(false);
  const [aiSuggestions, setAiSuggestions] = useState([]);
  const [aiPreviewMode, setAiPreviewMode] = useState(false);
  const [aiApplying, setAiApplying] = useState(false);
  const [rememberRule, setRememberRule] = useState(true);
  const [aiCelebration, setAiCelebration] = useState(false);

  const [undoState, setUndoState] = useState(null);
  const [showUndoToast, setShowUndoToast] = useState(false);

  const [activeBottomSheetItem, setActiveBottomSheetItem] = useState(null);
  const [activeCategory, setActiveCategory] = useState(CATEGORIES[0].id);
  const [expandedCategoryId, setExpandedCategoryId] = useState(null);
  const [mobileEditItem, setMobileEditItem] = useState(null);
  const [showMobileAdjust, setShowMobileAdjust] = useState(false);
  const [mobileLongPressActive, setMobileLongPressActive] = useState(false);

  const isUpdatingRef = useRef(false);
  const categorizedExpensesRef = useRef(createEmptyBoard());
  const undoTimerRef = useRef(null);
  const longPressTimeoutRef = useRef(null);
  const columnRefs = useRef({});
  const boardWrapperRef = useRef(null);

  // Load budgets from localStorage
  useEffect(() => {
    const loadBudgets = () => {
      const saved = localStorage.getItem('monthlyBudgets');
      if (saved) {
        const parsed = JSON.parse(saved);
        setMonthlyBudgets(parsed);
      } else {
        // Initialize with default budget for current month
        const currentMonth = new Date().toISOString().substring(0, 7);
        const initialBudgets = { [currentMonth]: { ...DEFAULT_BUDGET } };
        setMonthlyBudgets(initialBudgets);
        localStorage.setItem('monthlyBudgets', JSON.stringify(initialBudgets));
      }
    };

    loadBudgets();

    // Listen for storage changes (in case budgets are updated in another tab/component)
    const handleStorageChange = (e) => {
      if (e.key === 'monthlyBudgets' && e.newValue) {
        setMonthlyBudgets(JSON.parse(e.newValue));
      }
    };

    window.addEventListener('storage', handleStorageChange);

    // Use custom event for same-tab updates instead of polling
    const handleBudgetUpdate = () => {
      loadBudgets();
    };

    window.addEventListener('budgetUpdated', handleBudgetUpdate);

    return () => {
      window.removeEventListener('storage', handleStorageChange);
      window.removeEventListener('budgetUpdated', handleBudgetUpdate);
    };
  }, []);

  useEffect(() => {
    const handleResize = () => {
      const mobile = window.matchMedia('(max-width: 768px)').matches;
      setIsMobileView(mobile);
    };

    handleResize();
    window.addEventListener('resize', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
    };
  }, []);

  const filteredExpenses = useMemo(() => {
    return expenses.filter(expense => {
      if (!dateRange?.startDate || !dateRange?.endDate) return true;
      return expense.date >= dateRange.startDate && expense.date <= dateRange.endDate;
    });
  }, [expenses, dateRange]);

  useEffect(() => {
    if (isUpdatingRef.current) {
      return;
    }

    const organized = createEmptyBoard();

    filteredExpenses.forEach(expense => {
      if (expense.items && expense.items.length > 0) {
        expense.items.forEach((item, itemIndex) => {
          const itemCategory = item.category || 'Other';
          const enrichedItem = {
            ...item,
            expenseId: expense.id,
            itemIndex,
            merchantName: expense.merchantName,
            date: expense.date,
            currency: expense.currency,
            category: itemCategory,
            uniqueId: `${expense.id}-item-${itemIndex}`
          };

          if (organized[itemCategory]) {
            organized[itemCategory].push(enrichedItem);
          } else {
            organized.Other.push(enrichedItem);
          }
        });
      } else {
        const category = expense.category || 'Other';
        const fallbackItem = {
          description: expense.merchantName,
          totalPrice: expense.totalAmount,
          quantity: 1,
          expenseId: expense.id,
          itemIndex: -1,
          merchantName: expense.merchantName,
          date: expense.date,
          currency: expense.currency,
          category,
          uniqueId: expense.id
        };

        if (organized[category]) {
          organized[category].push(fallbackItem);
        } else {
          organized.Other.push(fallbackItem);
        }
      }
    });

    setCategorizedExpenses(organized);
    categorizedExpensesRef.current = organized;
  }, [filteredExpenses]);

  useEffect(() => {
    return () => {
      if (undoTimerRef.current) {
        clearTimeout(undoTimerRef.current);
      }
      if (longPressTimeoutRef.current) {
        clearTimeout(longPressTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    categorizedExpensesRef.current = categorizedExpenses;
  }, [categorizedExpenses]);

  const keywordGroups = useMemo(() => ({
    Food: ['restaurant', 'cafe', 'coffee', 'pizza', 'burger', 'grill', 'bakery', 'deli'],
    Transport: ['uber', 'lyft', 'gas', 'fuel', 'taxi', 'metro', 'train', 'parking'],
    Shopping: ['store', 'market', 'shop', 'mall', 'outlet', 'amazon', 'purchase'],
    Bills: ['utility', 'electric', 'water', 'subscription', 'internet', 'phone', 'insurance'],
    Other: []
  }), []);

  const inferCategoryFromText = useCallback((item) => {
    const comparison = `${(item.description || '').toLowerCase()} ${(item.merchantName || '').toLowerCase()}`;
    for (const [category, keywords] of Object.entries(keywordGroups)) {
      if (keywords.some(keyword => comparison.includes(keyword))) {
        return category;
      }
    }
    return null;
  }, [keywordGroups]);

  const formatCurrency = useCallback((amount, currency = 'USD') => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency
    }).format(amount ?? 0);
  }, []);

  const formatDate = useCallback((dateString) => {
    if (!dateString) return 'No date';
    const [year, month, day] = dateString.split('-').map(Number);
    const date = new Date(year, month - 1, day);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }, []);

  const formatDateCompact = useCallback((dateString) => {
    if (!dateString) return '';
    const [year, month, day] = dateString.split('-').map(Number);
    const date = new Date(year, month - 1, day);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }, []);

  // Helper function to get budget for a category
  const getCategoryBudget = useCallback((categoryId) => {
    const currentMonth = dateRange?.startDate
      ? dateRange.startDate.substring(0, 7)
      : new Date().toISOString().substring(0, 7);

    const currentBudget = monthlyBudgets[currentMonth];
    if (currentBudget && currentBudget[categoryId] !== undefined) {
      return currentBudget[categoryId];
    }

    // Fallback to default budget
    return DEFAULT_BUDGET[categoryId] || 0;
  }, [monthlyBudgets, dateRange]);

  const getCategoryTotal = useCallback((categoryId) => {
    const items = categorizedExpenses[categoryId] || [];
    return items.reduce((sum, item) => sum + (item.totalPrice || 0), 0);
  }, [categorizedExpenses]);

  const getCategoryProgress = useCallback((categoryId) => {
    const budget = getCategoryBudget(categoryId);
    if (budget === 0) return 0;
    const total = getCategoryTotal(categoryId);
    return Math.min((total / budget) * 100, 100);
  }, [getCategoryTotal, getCategoryBudget]);

  const closeUndoToast = useCallback(() => {
    setShowUndoToast(false);
    if (undoTimerRef.current) {
      clearTimeout(undoTimerRef.current);
    }
  }, []);

  const performCategoryMove = useCallback(async (movedItem, sourceCategory, destinationCategory, options = {}) => {
    if (!movedItem || !destinationCategory || sourceCategory === destinationCategory) {
      return;
    }

    isUpdatingRef.current = true;
    const previousState = JSON.parse(JSON.stringify(categorizedExpensesRef.current));

    setCategorizedExpenses(prev => {
      const clone = CATEGORIES.reduce((acc, category) => {
        acc[category.id] = [...(prev[category.id] || [])];
        return acc;
      }, {});

      if (!clone[sourceCategory]) {
        clone[sourceCategory] = [];
      }
      if (!clone[destinationCategory]) {
        clone[destinationCategory] = [];
      }

      clone[sourceCategory] = clone[sourceCategory].filter(item => item.uniqueId !== movedItem.uniqueId);

      const updatedItem = { ...movedItem, category: destinationCategory };
      const destinationIndex = Math.max(0, Math.min(options.destinationIndex ?? clone[destinationCategory].length, clone[destinationCategory].length));
      clone[destinationCategory] = [
        ...clone[destinationCategory].slice(0, destinationIndex),
        updatedItem,
        ...clone[destinationCategory].slice(destinationIndex)
      ];

      categorizedExpensesRef.current = clone;
      return clone;
    });

    if (!options.silent) {
      setUndoState({
        item: movedItem,
        previousCategory: sourceCategory,
        previousState,
        destinationCategory
      });
      setShowUndoToast(true);

      if (undoTimerRef.current) {
        clearTimeout(undoTimerRef.current);
      }
      undoTimerRef.current = setTimeout(() => {
        setShowUndoToast(false);
        setUndoState(null);
      }, 6000);
    } else {
      closeUndoToast();
      setUndoState(null);
    }

    try {
      if (movedItem.itemIndex === -1) {
        await updateExpenseCategory(movedItem.expenseId, destinationCategory);
        if (onCategoryUpdate) {
          onCategoryUpdate(movedItem.expenseId, destinationCategory);
        }
      } else {
        await updateItemCategory(movedItem.expenseId, movedItem.itemIndex, destinationCategory);
      }

      if (onRefresh) {
        setTimeout(() => {
          onRefresh();
          setTimeout(() => {
            isUpdatingRef.current = false;
          }, 120);
        }, options.deferRefresh ?? 500);
      } else {
        setTimeout(() => {
          isUpdatingRef.current = false;
        }, 120);
      }
    } catch (err) {
      console.error('Failed to update category', err);
      setError(`Failed to update: ${err.message}`);
      setCategorizedExpenses(previousState);
      categorizedExpensesRef.current = previousState;
      isUpdatingRef.current = false;
      if (onRefresh) {
        setTimeout(() => {
          onRefresh();
        }, 400);
      }
    }
  }, [closeUndoToast, onCategoryUpdate, onRefresh]);

  const handleDragEnd = (result) => {
    const { destination, source, draggableId } = result;
    if (!destination) {
      return;
    }

    if (
      destination.droppableId === source.droppableId &&
      destination.index === source.index
    ) {
      return;
    }

    const sourceCategory = source.droppableId;
    const destinationCategory = destination.droppableId;
    const movedItem = categorizedExpenses[sourceCategory]?.find(item => item.uniqueId === draggableId);

    if (!movedItem) {
      setError('Item not found');
      return;
    }

    if (destinationCategory === 'TRASH') {
      setActionItem(movedItem);
      setShowDeleteConfirm(true);
      return;
    }

    if (destinationCategory === 'EDIT') {
      openEditModal(movedItem);
      return;
    }

    performCategoryMove(movedItem, sourceCategory, destinationCategory, {
      destinationIndex: destination.index
    });
  };

  const handleUndo = useCallback(async () => {
    if (!undoState) {
      return;
    }

    const data = undoState;
    closeUndoToast();
    setCategorizedExpenses(data.previousState);
    categorizedExpensesRef.current = data.previousState;

    try {
      if (data.item.itemIndex === -1) {
        await updateExpenseCategory(data.item.expenseId, data.previousCategory);
        if (onCategoryUpdate) {
          onCategoryUpdate(data.item.expenseId, data.previousCategory);
        }
      } else {
        await updateItemCategory(data.item.expenseId, data.item.itemIndex, data.previousCategory);
      }

      if (onRefresh) {
        onRefresh();
      }
    } catch (err) {
      console.error('Undo failed', err);
      setError(`Undo failed: ${err.message}`);
    } finally {
      setUndoState(null);
      isUpdatingRef.current = false;
    }
  }, [closeUndoToast, onCategoryUpdate, onRefresh, undoState]);

  const handleDeleteConfirm = async () => {
    if (!actionItem) return;

    try {
      if (actionItem.itemIndex === -1) {
        await deleteExpense(actionItem.expenseId);
      } else {
        await deleteExpenseItem(actionItem.expenseId, actionItem.itemIndex);
      }

      setShowDeleteConfirm(false);
      setActionItem(null);

      if (onRefresh) {
        onRefresh();
      }
    } catch (err) {
      console.error('Delete failed:', err);
      setError(`Failed to delete: ${err.message}`);
      setShowDeleteConfirm(false);
    }
  };

  const handleEditSubmit = async (e) => {
    e.preventDefault();
    if (!actionItem) return;

    try {
      if (actionItem.itemIndex === -1) {
        const updates = {
          merchantName: editForm.description,
          totalAmount: parseFloat(editForm.totalPrice),
          date: editForm.date
        };
        await updateExpense(actionItem.expenseId, updates);
      } else {
        const updates = {
          description: editForm.description,
          totalPrice: parseFloat(editForm.totalPrice),
          date: editForm.date
        };
        await updateExpenseItem(actionItem.expenseId, actionItem.itemIndex, updates);
        await updateExpense(actionItem.expenseId, { date: editForm.date });
      }

      setShowEditModal(false);
      setActionItem(null);

      if (onRefresh) {
        onRefresh();
      }
    } catch (err) {
      console.error('Update failed:', err);
      setError(`Failed to update: ${err.message}`);
      setShowEditModal(false);
    }
  };

  const openEditModal = useCallback((item) => {
    if (!item) return;
    setActionItem(item);
    setEditForm({
      description: item.description || item.merchantName,
      totalPrice: item.totalPrice || 0,
      date: item.date || '',
      currency: item.currency || 'USD'
    });
    setShowEditModal(true);
  }, []);

  const handleCardLongPressStart = (item) => {
    if (!isMobileView) return;
    if (longPressTimeoutRef.current) {
      clearTimeout(longPressTimeoutRef.current);
    }
    longPressTimeoutRef.current = setTimeout(() => {
      setActiveBottomSheetItem(item);
    }, CARD_LONG_PRESS_DELAY);
  };

  const cancelLongPressDetection = () => {
    if (longPressTimeoutRef.current) {
      clearTimeout(longPressTimeoutRef.current);
    }
  };

  const handleMoveFromBottomSheet = (item, destinationCategory) => {
    if (!item || !destinationCategory) return;
    setActiveBottomSheetItem(null);
    setMobileLongPressActive(false);
    performCategoryMove(item, item.category, destinationCategory);
  };

  const handleMobileItemClick = (item) => {
    setMobileEditItem({
      ...item,
      merchantName: item.merchantName || '',
      description: item.description || item.merchantName || '',
      totalPrice: item.totalPrice || item.totalAmount || 0,
      date: item.date || '',
      category: item.category || 'Other',
      paymentMethod: item.paymentMethod || '',
      currency: item.currency || 'USD'
    });
  };

  const handleMobileItemLongPress = (item) => {
    setMobileLongPressActive(true);
    setExpandedCategoryId(null);
    // Trigger the existing bottom sheet for drag and drop
    setTimeout(() => {
      setActiveBottomSheetItem(item);
    }, 100);
  };

  const handleMobileSaveEdit = async () => {
    if (!mobileEditItem) return;

    try {
      if (mobileEditItem.itemIndex === -1 || mobileEditItem.itemIndex === undefined) {
        const updates = {
          merchantName: mobileEditItem.merchantName || mobileEditItem.description,
          totalAmount: parseFloat(mobileEditItem.totalPrice),
          date: mobileEditItem.date,
          category: mobileEditItem.category,
          paymentMethod: mobileEditItem.paymentMethod || null
        };
        await updateExpense(mobileEditItem.expenseId, updates);
      } else {
        const itemUpdates = {
          description: mobileEditItem.description,
          totalPrice: parseFloat(mobileEditItem.totalPrice),
          category: mobileEditItem.category
        };
        await updateExpenseItem(mobileEditItem.expenseId, mobileEditItem.itemIndex, itemUpdates);

        const expenseUpdates = {
          date: mobileEditItem.date,
          merchantName: mobileEditItem.merchantName,
          paymentMethod: mobileEditItem.paymentMethod || null
        };
        await updateExpense(mobileEditItem.expenseId, expenseUpdates);
      }

      setMobileEditItem(null);
      if (onRefresh) {
        onRefresh();
      }
    } catch (err) {
      console.error('Mobile update failed:', err);
      setError(`Failed to update: ${err.message}`);
    }
  };

  const handleCardSelect = (item) => {
    if (isMobileView) {
      setActiveBottomSheetItem(item);
      return;
    }
    if (onExpenseSelect) {
      onExpenseSelect(item.expenseId);
    }
  };

  const buildAiSuggestions = useCallback(() => {
    const current = categorizedExpensesRef.current;
    const suggestions = [];

    Object.entries(current).forEach(([categoryId, items]) => {
      items.forEach(item => {
        const inferred = inferCategoryFromText(item);
        if (inferred && inferred !== categoryId) {
          suggestions.push({
            ...item,
            currentCategory: categoryId,
            suggestedCategory: inferred
          });
        } else if (item.aiSuggestedCategory && item.aiSuggestedCategory !== categoryId) {
          suggestions.push({
            ...item,
            currentCategory: categoryId,
            suggestedCategory: item.aiSuggestedCategory
          });
        }
      });
    });

    return suggestions.slice(0, 12);
  }, [inferCategoryFromText]);

  const handleAiReviewClick = () => {
    const suggestions = buildAiSuggestions();
    setAiSuggestions(suggestions);
    setAiPreviewMode(false);
    setShowAiPanel(true);
  };

  const handleApplyAiSuggestions = async () => {
    if (aiSuggestions.length === 0) {
      setShowAiPanel(false);
      return;
    }

    setAiApplying(true);
    try {
      for (const suggestion of aiSuggestions) {
        await performCategoryMove(suggestion, suggestion.currentCategory, suggestion.suggestedCategory, {
          destinationIndex: 0,
          deferRefresh: 650,
          silent: true
        });
      }

      setAiSuggestions([]);
      setShowAiPanel(false);

      if (rememberRule) {
        setAiCelebration(true);
        setTimeout(() => setAiCelebration(false), 3800);
      }
    } catch (err) {
      console.error('Failed to apply AI suggestions', err);
      setError(`Failed to apply AI suggestions: ${err.message}`);
    } finally {
      setAiApplying(false);
    }
  };

  const handleCategoryPillClick = (categoryId) => {
    if (!isMobileView) return;
    const column = columnRefs.current[categoryId];
    if (column) {
      column.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
      setActiveCategory(categoryId);
    }
  };

  const getTagForItem = (item) => {
    if (item.sourceTag) return item.sourceTag;
    if (item.itemIndex === -1) return 'Manual Entry';
    return 'Receipt Upload';
  };

  useEffect(() => {
    if (!isMobileView) {
      setActiveCategory(CATEGORIES[0].id);
      return;
    }

    const wrapper = boardWrapperRef.current;
    if (!wrapper) return;

    let animationFrame = null;

    const handleScroll = () => {
      if (animationFrame) return;
      animationFrame = window.requestAnimationFrame(() => {
        animationFrame = null;
        let closestId = activeCategory;
        let smallestOffset = Number.POSITIVE_INFINITY;

        Object.entries(columnRefs.current).forEach(([id, node]) => {
          if (!node) return;
          const rect = node.getBoundingClientRect();
          const viewportCenter = window.innerWidth / 2;
          const columnCenter = rect.left + rect.width / 2;
          const offset = Math.abs(columnCenter - viewportCenter);
          if (offset < smallestOffset) {
            smallestOffset = offset;
            closestId = id;
          }
        });

        if (closestId !== activeCategory) {
          setActiveCategory(closestId);
        }
      });
    };

    wrapper.addEventListener('scroll', handleScroll, { passive: true });
    handleScroll();

    return () => {
      wrapper.removeEventListener('scroll', handleScroll);
      if (animationFrame) {
        window.cancelAnimationFrame(animationFrame);
      }
    };
  }, [activeCategory, isMobileView]);

  return (
    <div className={`categorized-expenses ${isMobileView ? 'mobile-view' : ''}`}>
      {/* Mobile Compact Header */}
      {isMobileView ? (
        <div className="mobile-compact-header">
          <div className="mobile-header-row">
            <h2 className="mobile-title">Categories</h2>
            <button className="mobile-adjust-btn" onClick={() => setShowMobileAdjust(true)}>Adjust</button>
          </div>
          <button className="ai-chip-mobile" onClick={handleAiReviewClick}>
            💬 Review with AI
          </button>
        </div>
      ) : (
        <>
          <div className="board-top-bar">
            <div className="board-heading">
              <h2>Review &amp; Categorize</h2>
              <p className="board-subtitle">Organize spending with a responsive, AI-assisted command center.</p>
            </div>
            <button className="ai-review-button" onClick={handleAiReviewClick}>
              <span className="ai-icon">🤖</span>
              Review with AI
            </button>
          </div>

          <div className="category-pill-bar">
            {CATEGORIES.map(category => (
              <button
                key={category.id}
                className={`category-pill ${activeCategory === category.id ? 'active' : ''}`}
                onClick={() => handleCategoryPillClick(category.id)}
              >
                <span className="pill-icon">{category.icon}</span>
                {category.name}
              </button>
            ))}
          </div>
        </>
      )}

      {error && (
        <div className="error-message">
          {error}
          <button onClick={() => setError(null)}>✕</button>
        </div>
      )}

      {/* Mobile Compact 2-Column Grid */}
      {isMobileView ? (
        <div className="mobile-category-grid">
          {CATEGORIES.map(category => {
            const items = categorizedExpenses[category.id] || [];
            const total = getCategoryTotal(category.id);
            const progress = getCategoryProgress(category.id);

            return (
              <div
                key={category.id}
                className="mobile-category-card"
                onClick={() => setExpandedCategoryId(category.id)}
              >
                <div className="mobile-card-badge" style={{ backgroundColor: category.color }}>
                  {items.length}
                </div>
                <div className="mobile-card-icon">{category.icon}</div>
                <div className="mobile-card-name">{category.name}</div>
                <div className="mobile-card-amount" style={{ color: category.color }}>
                  {formatCurrency(total)}
                </div>
                <div className="mobile-card-progress-bar">
                  <div
                    className="mobile-card-progress-fill"
                    style={{
                      width: `${progress}%`,
                      background: category.gradient
                    }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <DragDropContext onDragEnd={handleDragEnd}>
          <div className="board-wrapper" ref={boardWrapperRef}>
            {CATEGORIES.map(category => {
            const items = categorizedExpenses[category.id] || [];
            return (
              <div key={category.id} className="category-row">
                <div className="category-label" style={{ backgroundImage: category.gradient }}>
                  <div className="category-label-content">
                    <span className="category-icon">{category.icon}</span>
                    <span className="category-name">{category.name}</span>
                    <span className="category-count">{items.length}</span>
                  </div>
                </div>

                <Droppable droppableId={category.id} direction="horizontal">
                  {(provided, snapshot) => (
                    <div
                      ref={provided.innerRef}
                      {...provided.droppableProps}
                      className={`products-row ${snapshot.isDraggingOver ? 'dragging-over' : ''}`}
                    >
                      {items.length === 0 ? (
                        <div className="empty-category">No {category.name.toLowerCase()} items</div>
                      ) : (
                        items.map((item, index) => (
                          <Draggable key={item.uniqueId} draggableId={item.uniqueId} index={index}>
                            {(dragProvided, dragSnapshot) => (
                              <div
                                ref={dragProvided.innerRef}
                                {...dragProvided.draggableProps}
                                {...dragProvided.dragHandleProps}
                                className={`product-card ${dragSnapshot.isDragging ? 'dragging' : ''}`}
                                onMouseDown={() => handleCardLongPressStart(item)}
                                onMouseUp={cancelLongPressDetection}
                                onMouseLeave={cancelLongPressDetection}
                                onTouchStart={() => handleCardLongPressStart(item)}
                                onTouchEnd={cancelLongPressDetection}
                                onTouchMove={cancelLongPressDetection}
                                onClick={() => handleCardSelect(item)}
                              >
                                <div className="product-card-content">
                                  <div className="product-card-header">
                                    <div className="product-card-name">
                                      {item.description || item.merchantName}
                                      {item.quantity && item.quantity > 1 && ` (×${item.quantity})`}
                                    </div>
                                    <div className="product-card-amount" style={{ color: category.color }}>
                                      {formatCurrency(item.totalPrice || 0, item.currency)}
                                    </div>
                                  </div>
                                  <div className="product-card-meta">
                                    <span>{item.merchantName}</span>
                                    <span className="meta-separator">•</span>
                                    <span>{formatDate(item.date)}</span>
                                    <span className={`meta-tag tag-${(item.category || 'Other').toLowerCase()}`}>
                                      {getTagForItem(item)}
                                    </span>
                                  </div>
                                  {item.aiRule && (
                                    <div className="product-card-caption">Auto: {item.aiRule}</div>
                                  )}
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
            );
          })}
        </div>

        <div className="action-zones">
          <Droppable droppableId="TRASH">
            {(provided, snapshot) => (
              <div
                ref={provided.innerRef}
                {...provided.droppableProps}
                className={`action-zone trash-zone ${snapshot.isDraggingOver ? 'dragging-over' : ''}`}
              >
                <span className="action-icon">🗑️</span>
                <span className="action-label">Trash</span>
                <p className="action-hint">Drag here to delete</p>
                {provided.placeholder}
              </div>
            )}
          </Droppable>

          <Droppable droppableId="EDIT">
            {(provided, snapshot) => (
              <div
                ref={provided.innerRef}
                {...provided.droppableProps}
                className={`action-zone edit-zone ${snapshot.isDraggingOver ? 'dragging-over' : ''}`}
              >
                <span className="action-icon">✏️</span>
                <span className="action-label">Edit</span>
                <p className="action-hint">Drag here to edit</p>
                {provided.placeholder}
              </div>
            )}
          </Droppable>
        </div>
      </DragDropContext>
      )}

      {/* Bottom Sheet for Expanded Category - Mobile Only */}
      {isMobileView && expandedCategoryId && (
        <div className="mobile-bottom-sheet-overlay" onClick={() => setExpandedCategoryId(null)}>
          <div className="mobile-bottom-sheet" onClick={(e) => e.stopPropagation()}>
            <div className="mobile-sheet-handle" />
            {(() => {
              const category = CATEGORIES.find(c => c.id === expandedCategoryId);
              const items = categorizedExpenses[expandedCategoryId] || [];
              const total = getCategoryTotal(expandedCategoryId);
              const progress = getCategoryProgress(expandedCategoryId);

              return (
                <>
                  <div className="mobile-sheet-header">
                    <div className="mobile-sheet-icon" style={{ color: category.color }}>
                      {category.icon}
                    </div>
                    <div className="mobile-sheet-info">
                      <h3>{category.name}</h3>
                      <div className="mobile-sheet-stats">
                        <span>Spent: <strong style={{ color: category.color }}>{formatCurrency(total)}</strong></span>
                        <span className="stat-divider">•</span>
                        <span>Budget: <strong>{formatCurrency(getCategoryBudget(category.id))}</strong></span>
                        <span className="stat-divider">•</span>
                        <span>Left: <strong>{formatCurrency(getCategoryBudget(category.id) - total)}</strong></span>
                      </div>
                      <div className="mobile-sheet-progress">
                        <div
                          className="mobile-sheet-progress-fill"
                          style={{
                            width: `${progress}%`,
                            background: category.gradient
                          }}
                        />
                      </div>
                    </div>
                  </div>

                  <div className="mobile-sheet-expenses">
                    <div className="mobile-sheet-title">
                      {items.length} Transaction{items.length !== 1 ? 's' : ''}
                    </div>
                    {items.length > 0 ? (
                      <div className="mobile-expense-list">
                        {items.map(item => {
                          let longPressTimer = null;

                          const handleTouchStart = () => {
                            longPressTimer = setTimeout(() => {
                              handleMobileItemLongPress(item);
                            }, CARD_LONG_PRESS_DELAY);
                          };

                          const handleTouchEnd = () => {
                            if (longPressTimer) {
                              clearTimeout(longPressTimer);
                              longPressTimer = null;
                            }
                          };

                          const handleClick = () => {
                            if (!mobileLongPressActive) {
                              handleMobileItemClick(item);
                            }
                          };

                          return (
                            <div
                              key={item.id}
                              className="mobile-expense-mini"
                              onClick={handleClick}
                              onTouchStart={handleTouchStart}
                              onTouchEnd={handleTouchEnd}
                              onTouchCancel={handleTouchEnd}
                              onMouseDown={handleTouchStart}
                              onMouseUp={handleTouchEnd}
                              onMouseLeave={handleTouchEnd}
                            >
                              <div className="mobile-expense-main">
                                <div className="mobile-expense-info">
                                  <div className="mobile-expense-title">{item.description || item.merchantName}</div>
                                  {item.merchantName && item.description && item.merchantName !== item.description && (
                                    <div className="mobile-expense-merchant">{item.merchantName}</div>
                                  )}
                                </div>
                                <div className="mobile-expense-amount" style={{ color: category.color }}>
                                  {formatCurrency(item.totalPrice || item.totalAmount)}
                                </div>
                              </div>
                              <div className="mobile-expense-meta">
                                <span className="mobile-expense-date">{formatDateCompact(item.date)}</span>
                                {(item.receiptUrl || item.thumbnailUrl) && (
                                  <>
                                    <span className="meta-dot">•</span>
                                    <span className="mobile-expense-tag">📎 Receipt</span>
                                  </>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="mobile-empty-expenses">No expenses in this category yet</div>
                    )}
                  </div>
                </>
              );
            })()}
          </div>
        </div>
      )}

      {/* Mobile Edit Modal */}
      {isMobileView && mobileEditItem && (
        <div className="mobile-edit-overlay" onClick={() => setMobileEditItem(null)}>
          <div className="mobile-edit-modal" onClick={(e) => e.stopPropagation()}>
            <div className="mobile-edit-header">
              <h3>Edit Expense</h3>
              <button className="mobile-edit-close" onClick={() => setMobileEditItem(null)}>×</button>
            </div>
            <div className="mobile-edit-form">
              <div className="mobile-form-field">
                <label>Merchant</label>
                <input
                  type="text"
                  value={mobileEditItem.merchantName}
                  onChange={(e) => setMobileEditItem({...mobileEditItem, merchantName: e.target.value})}
                  placeholder="Merchant name"
                />
              </div>
              <div className="mobile-form-field">
                <label>Description</label>
                <input
                  type="text"
                  value={mobileEditItem.description}
                  onChange={(e) => setMobileEditItem({...mobileEditItem, description: e.target.value})}
                  placeholder="Item description"
                />
              </div>
              <div className="mobile-form-row">
                <div className="mobile-form-field">
                  <label>Amount</label>
                  <input
                    type="number"
                    step="0.01"
                    value={mobileEditItem.totalPrice}
                    onChange={(e) => setMobileEditItem({...mobileEditItem, totalPrice: e.target.value})}
                    placeholder="0.00"
                  />
                </div>
                <div className="mobile-form-field">
                  <label>Date</label>
                  <input
                    type="date"
                    value={mobileEditItem.date}
                    onChange={(e) => setMobileEditItem({...mobileEditItem, date: e.target.value})}
                  />
                </div>
              </div>
              <div className="mobile-form-field">
                <label>Category</label>
                <select
                  value={mobileEditItem.category}
                  onChange={(e) => setMobileEditItem({...mobileEditItem, category: e.target.value})}
                >
                  {CATEGORIES.map(cat => (
                    <option key={cat.id} value={cat.id}>{cat.icon} {cat.name}</option>
                  ))}
                </select>
              </div>
              <div className="mobile-form-field">
                <label>Payment Method</label>
                <input
                  type="text"
                  value={mobileEditItem.paymentMethod}
                  onChange={(e) => setMobileEditItem({...mobileEditItem, paymentMethod: e.target.value})}
                  placeholder="e.g., Cash, Card, etc."
                />
              </div>
            </div>
            <div className="mobile-edit-actions">
              <button className="mobile-btn-cancel" onClick={() => setMobileEditItem(null)}>Cancel</button>
              <button className="mobile-btn-save" onClick={handleMobileSaveEdit}>Save</button>
            </div>
          </div>
        </div>
      )}

      {/* Mobile Adjust Modal */}
      {isMobileView && showMobileAdjust && (
        <div className="mobile-edit-overlay" onClick={() => setShowMobileAdjust(false)}>
          <div className="mobile-edit-modal mobile-adjust-modal" onClick={(e) => e.stopPropagation()}>
            <div className="mobile-edit-header">
              <h3>Adjust Budget</h3>
              <button className="mobile-edit-close" onClick={() => setShowMobileAdjust(false)}>×</button>
            </div>
            <div className="mobile-adjust-content">
              <p className="mobile-adjust-description">
                View and manage your category budgets. Tap a category card to see detailed spending.
              </p>
              <div className="mobile-adjust-categories">
                {CATEGORIES.map(category => {
                  const total = getCategoryTotal(category.id);
                  const progress = getCategoryProgress(category.id);
                  return (
                    <div key={category.id} className="mobile-adjust-category">
                      <div className="mobile-adjust-cat-header">
                        <span className="mobile-adjust-cat-icon">{category.icon}</span>
                        <span className="mobile-adjust-cat-name">{category.name}</span>
                      </div>
                      <div className="mobile-adjust-cat-info">
                        <div className="mobile-adjust-cat-row">
                          <span>Budget:</span>
                          <strong>{formatCurrency(getCategoryBudget(category.id))}</strong>
                        </div>
                        <div className="mobile-adjust-cat-row">
                          <span>Spent:</span>
                          <strong style={{color: category.color}}>{formatCurrency(total)}</strong>
                        </div>
                        <div className="mobile-adjust-cat-progress">
                          <div
                            className="mobile-adjust-cat-fill"
                            style={{
                              width: `${progress}%`,
                              background: category.gradient
                            }}
                          />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}

      {showUndoToast && undoState && (
        <div className="undo-snackbar">
          <span>
            Moved {undoState.item.description || undoState.item.merchantName} → {undoState.destinationCategory}
          </span>
          <button onClick={handleUndo}>Undo</button>
        </div>
      )}

      {aiCelebration && (
        <div className="ai-toast">AI learned this pattern for next time 🎉</div>
      )}

      {activeBottomSheetItem && (
        <div className="bottom-sheet-overlay" onClick={() => {
          setActiveBottomSheetItem(null);
          setMobileLongPressActive(false);
        }}>
          <div className="bottom-sheet" onClick={(event) => event.stopPropagation()}>
            <div className="bottom-sheet-handle" />
            <div className="bottom-sheet-header">
              <div className="bottom-sheet-title">Quick actions</div>
              <div className="bottom-sheet-subtitle">
                {activeBottomSheetItem.description || activeBottomSheetItem.merchantName}
              </div>
            </div>
            <div className="bottom-sheet-section">
              <div className="section-label">Move to category</div>
              <div className="category-chip-grid">
                {CATEGORIES.map(category => (
                  <button
                    key={category.id}
                    className={`category-chip ${category.id === activeBottomSheetItem.category ? 'active' : ''}`}
                    style={{ borderColor: category.color }}
                    onClick={() => {
                      handleMoveFromBottomSheet(activeBottomSheetItem, category.id);
                      setMobileLongPressActive(false);
                    }}
                  >
                    <span className="chip-icon">{category.icon}</span>
                    {category.name}
                  </button>
                ))}
              </div>
            </div>
            <div className="bottom-sheet-actions">
              <button
                className="sheet-btn"
                onClick={() => {
                  setActiveBottomSheetItem(null);
                  setMobileLongPressActive(false);
                  openEditModal(activeBottomSheetItem);
                }}
              >
                ✏️ Edit
              </button>
              <button
                className="sheet-btn destructive"
                onClick={() => {
                  setActiveBottomSheetItem(null);
                  setMobileLongPressActive(false);
                  setActionItem(activeBottomSheetItem);
                  setShowDeleteConfirm(true);
                }}
              >
                🗑️ Delete
              </button>
            </div>
          </div>
        </div>
      )}

      <button className="floating-add-button" onClick={() => onExpenseSelect && onExpenseSelect(null)}>
        ＋ Add Expense
      </button>

      {showAiPanel && (
        <>
          <div className="ai-panel-backdrop" onClick={() => setShowAiPanel(false)} />
          <aside className="ai-panel">
            <div className="ai-panel-header">
              <h3>AI Review</h3>
              <button className="ai-panel-close" onClick={() => setShowAiPanel(false)}>✕</button>
            </div>
            <p className="ai-panel-subtitle">
              {aiSuggestions.length > 0
                ? `AI found ${aiSuggestions.length} item${aiSuggestions.length > 1 ? 's' : ''} possibly miscategorized.`
                : 'Everything looks organized. No miscategorized items detected.'}
            </p>

            {aiSuggestions.length > 0 && (
              <div className="ai-panel-controls">
                <button
                  className={`ai-panel-btn ${aiPreviewMode ? 'secondary' : 'primary'}`}
                  onClick={() => setAiPreviewMode(prev => !prev)}
                >
                  {aiPreviewMode ? 'Hide Preview' : 'Preview Fixes'}
                </button>
                <button
                  className="ai-panel-btn primary"
                  onClick={handleApplyAiSuggestions}
                  disabled={aiApplying}
                >
                  {aiApplying ? 'Applying…' : 'Apply'}
                </button>
              </div>
            )}

            {aiPreviewMode && aiSuggestions.length > 0 && (
              <div className="ai-suggestion-list">
                {aiSuggestions.map(suggestion => (
                  <div key={suggestion.uniqueId} className="ai-suggestion-card">
                    <div className="ai-suggestion-title">{suggestion.description || suggestion.merchantName}</div>
                    <div className="ai-suggestion-meta">
                      <span>{suggestion.merchantName}</span>
                      <span>·</span>
                      <span>{formatDate(suggestion.date)}</span>
                    </div>
                    <div className="ai-suggestion-move">
                      Move {formatCurrency(suggestion.totalPrice || 0, suggestion.currency)}
                      <span className="badge badge-current">{suggestion.currentCategory}</span>
                      →
                      <span className="badge badge-next">{suggestion.suggestedCategory}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <label className="remember-toggle">
              <input
                type="checkbox"
                checked={rememberRule}
                onChange={(event) => setRememberRule(event.target.checked)}
              />
              <span>✅ Remember this rule next time</span>
            </label>
          </aside>
        </>
      )}

      {showDeleteConfirm && (
        <div className="modal-overlay" onClick={() => setShowDeleteConfirm(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h3>Confirm Delete</h3>
            <p>
              Are you sure you want to delete{' '}
              <strong>{actionItem?.description || actionItem?.merchantName}</strong>?
            </p>
            <div className="modal-actions">
              <button className="btn btn-cancel" onClick={() => setShowDeleteConfirm(false)}>
                Cancel
              </button>
              <button className="btn btn-delete" onClick={handleDeleteConfirm}>
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {showEditModal && (
        <div className="modal-overlay" onClick={() => setShowEditModal(false)}>
          <div className="modal-content edit-modal" onClick={(e) => e.stopPropagation()}>
            <h3>Edit Item</h3>
            <form onSubmit={handleEditSubmit}>
              <div className="form-group">
                <label htmlFor="description">Description</label>
                <input
                  type="text"
                  id="description"
                  value={editForm.description}
                  onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                  required
                />
              </div>

              <div className="form-group">
                <label htmlFor="totalPrice">Price</label>
                <input
                  type="number"
                  id="totalPrice"
                  step="0.01"
                  value={editForm.totalPrice}
                  onChange={(e) => setEditForm({ ...editForm, totalPrice: e.target.value })}
                  required
                />
              </div>

              <div className="form-group">
                <label htmlFor="date">Date</label>
                <input
                  type="date"
                  id="date"
                  value={editForm.date}
                  onChange={(e) => setEditForm({ ...editForm, date: e.target.value })}
                  required
                />
              </div>

              <div className="modal-actions">
                <button
                  type="button"
                  className="btn btn-cancel"
                  onClick={() => setShowEditModal(false)}
                >
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary">
                  Save Changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default CategorizedExpenses;
