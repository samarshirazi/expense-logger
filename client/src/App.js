import React, { useState, useEffect } from 'react';
import Sidebar from './components/Sidebar';
import Dashboard from './components/Dashboard';
import ReceiptUpload from './components/ReceiptUpload';
import ManualEntry from './components/ManualEntry';
import ExpenseDetails from './components/ExpenseDetails';
import CategorizedExpenses from './components/CategorizedExpenses';
import ExpensesSummary from './components/ExpensesSummary';
import BudgetManage from './components/BudgetManage';
import SpendingSummary from './components/SpendingSummary';
import Auth from './components/Auth';
import NotificationPrompt from './components/NotificationPrompt';
import { getExpenses } from './services/apiService';
import authService from './services/authService';
import './AppLayout.css';

function App() {
  const [expenses, setExpenses] = useState([]);
  const [selectedExpense, setSelectedExpense] = useState(null);
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [showNotificationPrompt, setShowNotificationPrompt] = useState(false);
  const [activeView, setActiveView] = useState('dashboard'); // 'dashboard', 'expenses', 'categories', 'upload', 'manual'
  const [showSummary, setShowSummary] = useState(false);

  // Separate timeline states for each section
  const [timelineStates, setTimelineStates] = useState({
    dashboard: { viewMode: 'month', currentDate: new Date() },
    expenses: { viewMode: 'month', currentDate: new Date() },
    categories: { viewMode: 'month', currentDate: new Date() },
    manage: { viewMode: 'month', currentDate: new Date() }
  });

  useEffect(() => {
    // Initialize auth state
    const initAuth = async () => {
      setAuthLoading(true);
      const currentUser = authService.getCurrentUser();
      setUser(currentUser);
      setAuthLoading(false);

      if (currentUser) {
        loadExpenses();
      }
    };

    initAuth();

    // Subscribe to auth changes
    const unsubscribe = authService.subscribe((user, session) => {
      setUser(user);
      if (user) {
        loadExpenses();
      } else {
        setExpenses([]);
        setSelectedExpense(null);
      }
    });

    return unsubscribe;
  }, []);

  const loadExpenses = async () => {
    try {
      const data = await getExpenses();
      setExpenses(data);
    } catch (error) {
      console.error('Failed to load expenses:', error);
    }
  };

  const handleExpenseAdded = async (newExpense) => {
    // Add to local state for immediate feedback
    setExpenses(prev => [newExpense, ...prev]);
    // Only show the expense details if in upload or manual entry view
    if (activeView === 'upload' || activeView === 'manual') {
      setSelectedExpense(newExpense);
    }
    // Refresh expenses from server immediately to ensure data is in sync
    // This is especially important for camera uploads
    await loadExpenses();
  };

  const handleExpenseSelect = (expense) => {
    setSelectedExpense(expense);
  };

  const handleCategoryUpdate = (expenseId, newCategory) => {
    // Update the expense in the local state
    setExpenses(prev => prev.map(expense =>
      expense.id === expenseId
        ? { ...expense, category: newCategory }
        : expense
    ));

    // Update selected expense if it's the one being updated
    if (selectedExpense && selectedExpense.id === expenseId) {
      setSelectedExpense({ ...selectedExpense, category: newCategory });
    }
  };

  const handleAuthSuccess = () => {
    // Auth service will automatically trigger the subscriber
    // which will update the user state and load expenses

    // Show notification prompt after successful login
    // Check if user hasn't already granted or denied permission
    if (Notification.permission === 'default') {
      setTimeout(() => setShowNotificationPrompt(true), 2000);
    }
  };

  const handleSignOut = async () => {
    try {
      await authService.signOut();
      // Auth service subscriber will handle state cleanup
    } catch (error) {
      console.error('Sign out error:', error);
    }
  };

  // Handler to update timeline state for a specific section
  const handleTimelineStateChange = (section, newState) => {
    setTimelineStates(prev => ({
      ...prev,
      [section]: newState
    }));
  };

  // Close expense details when navigating away from upload/manual views
  useEffect(() => {
    if (activeView !== 'upload' && activeView !== 'manual') {
      setSelectedExpense(null);
    }
  }, [activeView]);

  if (authLoading) {
    return (
      <div className="container">
        <div style={{ textAlign: 'center', padding: '50px' }}>
          <h2>Loading...</h2>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="container">
        <header className="header">
          <h1>🧾 Expense Receipt Logger</h1>
          <p>Upload receipts, extract data with AI, and store in Google Drive</p>
        </header>
        <Auth onAuthSuccess={handleAuthSuccess} />
      </div>
    );
  }

  return (
    <div className="app-layout">
      <Sidebar
        activeView={activeView}
        onViewChange={setActiveView}
        onSignOut={handleSignOut}
        userName={authService.getUserDisplayName()}
      />

      <main className="main-content">
        {showNotificationPrompt && (
          <NotificationPrompt
            user={user}
            onComplete={() => setShowNotificationPrompt(false)}
          />
        )}

        {selectedExpense && (activeView === 'upload' || activeView === 'manual') && (
          <ExpenseDetails
            expense={selectedExpense}
            onClose={() => setSelectedExpense(null)}
          />
        )}

        {activeView === 'dashboard' && (
          <Dashboard
            expenses={expenses}
            timelineState={timelineStates.dashboard}
            onTimelineStateChange={(newState) => handleTimelineStateChange('dashboard', newState)}
          />
        )}

        {activeView === 'expenses' && (
          <div className="view-container">
            <ExpensesSummary
              expenses={expenses}
              timelineState={timelineStates.expenses}
              onTimelineStateChange={(newState) => handleTimelineStateChange('expenses', newState)}
            />
          </div>
        )}

        {activeView === 'categories' && (
          <div className="view-container">
            <CategorizedExpenses
              expenses={expenses}
              onExpenseSelect={handleExpenseSelect}
              onCategoryUpdate={handleCategoryUpdate}
              onRefresh={loadExpenses}
              timelineState={timelineStates.categories}
              onTimelineStateChange={(newState) => handleTimelineStateChange('categories', newState)}
            />
          </div>
        )}

        {activeView === 'manage' && (
          <div className="view-container">
            <BudgetManage
              expenses={expenses}
              timelineState={timelineStates.manage}
              onTimelineStateChange={(newState) => handleTimelineStateChange('manage', newState)}
            />
          </div>
        )}

        {activeView === 'upload' && (
          <div className="view-container">
            <div className="view-header">
              <h1>Upload Receipt</h1>
              <p>Upload a photo of your receipt to extract data with AI</p>
            </div>
            <ReceiptUpload onExpenseAdded={handleExpenseAdded} />
          </div>
        )}

        {activeView === 'manual' && (
          <div className="view-container">
            <div className="view-header">
              <h1>Manual Entry</h1>
              <p>Quickly add expenses by typing naturally</p>
            </div>
            <ManualEntry onExpensesAdded={handleExpenseAdded} />
          </div>
        )}

        {showSummary && (
          <SpendingSummary onClose={() => setShowSummary(false)} expenses={expenses} />
        )}
      </main>
    </div>
  );
}

export default App;