import React, { useState, useEffect } from 'react';
import {
  getIncomeSources,
  createIncomeSource,
  updateIncomeSource,
  deleteIncomeSource,
  getExtraIncome,
  createExtraIncome,
  deleteExtraIncome,
  getSavingsBalance,
  getSavingsTransactions,
  createSavingsTransaction,
  getSavingsGoals,
  createSavingsGoal,
  updateSavingsGoal,
  deleteSavingsGoal
} from '../services/apiService';
import './IncomeSavings.css';

function IncomeSavings() {
  const [activeTab, setActiveTab] = useState('income'); // 'income', 'savings', 'goals'
  const [incomeSources, setIncomeSources] = useState([]);
  const [extraIncome, setExtraIncome] = useState([]);
  const [savingsBalance, setSavingsBalance] = useState({ totalBalance: 0, transactionCount: 0 });
  const [savingsTransactions, setSavingsTransactions] = useState([]);
  const [savingsGoals, setSavingsGoals] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Current month for income sources
  const [currentMonth, setCurrentMonth] = useState(() => {
    const today = new Date();
    return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-01`;
  });

  // Form states
  const [showIncomeForm, setShowIncomeForm] = useState(false);
  const [showExtraIncomeForm, setShowExtraIncomeForm] = useState(false);
  const [showSavingsTransactionForm, setShowSavingsTransactionForm] = useState(false);
  const [showGoalForm, setShowGoalForm] = useState(false);

  const [incomeFormData, setIncomeFormData] = useState({
    sourceName: '',
    amount: '',
    month: currentMonth
  });

  const [extraIncomeFormData, setExtraIncomeFormData] = useState({
    description: '',
    amount: '',
    date: new Date().toISOString().split('T')[0],
    destination: 'savings', // Default to savings
    notes: ''
  });

  const [savingsTransactionFormData, setSavingsTransactionFormData] = useState({
    amount: '',
    transactionType: 'deposit',
    description: '',
    date: new Date().toISOString().split('T')[0]
  });

  const [goalFormData, setGoalFormData] = useState({
    goalName: '',
    targetAmount: '',
    targetDate: '',
    description: ''
  });

  // Load data on mount and tab change
  useEffect(() => {
    loadData();
  }, [activeTab, currentMonth]);

  const loadData = async () => {
    setLoading(true);
    setError('');
    try {
      if (activeTab === 'income') {
        const sources = await getIncomeSources(currentMonth);
        setIncomeSources(sources);
        const extra = await getExtraIncome();
        setExtraIncome(extra);
      } else if (activeTab === 'savings') {
        const balance = await getSavingsBalance();
        setSavingsBalance(balance);
        const transactions = await getSavingsTransactions(50, 0);
        setSavingsTransactions(transactions);
      } else if (activeTab === 'goals') {
        const goals = await getSavingsGoals(false);
        setSavingsGoals(goals);
        const balance = await getSavingsBalance();
        setSavingsBalance(balance);
      }
    } catch (err) {
      setError(err.message || 'Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  // Income Source handlers
  const handleAddIncomeSource = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    try {
      await createIncomeSource({
        ...incomeFormData,
        amount: parseFloat(incomeFormData.amount)
      });
      setSuccess('Income source added successfully!');
      setShowIncomeForm(false);
      setIncomeFormData({ sourceName: '', amount: '', month: currentMonth });
      loadData();
    } catch (err) {
      setError(err.message || 'Failed to add income source');
    }
  };

  const handleDeleteIncomeSource = async (id) => {
    if (!window.confirm('Are you sure you want to delete this income source?')) return;

    setError('');
    setSuccess('');
    try {
      await deleteIncomeSource(id);
      setSuccess('Income source deleted successfully!');
      loadData();
    } catch (err) {
      setError(err.message || 'Failed to delete income source');
    }
  };

  // Extra Income handlers
  const handleAddExtraIncome = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    try {
      await createExtraIncome({
        ...extraIncomeFormData,
        amount: parseFloat(extraIncomeFormData.amount)
      });
      setSuccess(`Extra income added to ${extraIncomeFormData.destination === 'budget' ? 'current budget' : 'savings'}!`);
      setShowExtraIncomeForm(false);
      setExtraIncomeFormData({
        description: '',
        amount: '',
        date: new Date().toISOString().split('T')[0],
        destination: 'savings',
        notes: ''
      });
      loadData();
    } catch (err) {
      setError(err.message || 'Failed to add extra income');
    }
  };

  // Savings Transaction handlers
  const handleAddSavingsTransaction = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    try {
      await createSavingsTransaction({
        ...savingsTransactionFormData,
        amount: parseFloat(savingsTransactionFormData.amount),
        source: 'manual'
      });
      setSuccess(`${savingsTransactionFormData.transactionType === 'deposit' ? 'Deposit' : 'Withdrawal'} recorded successfully!`);
      setShowSavingsTransactionForm(false);
      setSavingsTransactionFormData({
        amount: '',
        transactionType: 'deposit',
        description: '',
        date: new Date().toISOString().split('T')[0]
      });
      loadData();
    } catch (err) {
      setError(err.message || 'Failed to record transaction');
    }
  };

  // Savings Goal handlers
  const handleAddGoal = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    try {
      await createSavingsGoal({
        ...goalFormData,
        targetAmount: parseFloat(goalFormData.targetAmount),
        targetDate: goalFormData.targetDate || null
      });
      setSuccess('Savings goal created successfully!');
      setShowGoalForm(false);
      setGoalFormData({ goalName: '', targetAmount: '', targetDate: '', description: '' });
      loadData();
    } catch (err) {
      setError(err.message || 'Failed to create goal');
    }
  };

  const handleDeleteGoal = async (id) => {
    if (!window.confirm('Are you sure you want to delete this goal?')) return;

    setError('');
    setSuccess('');
    try {
      await deleteSavingsGoal(id);
      setSuccess('Goal deleted successfully!');
      loadData();
    } catch (err) {
      setError(err.message || 'Failed to delete goal');
    }
  };

  const handleAllocateToGoal = async (goalId, currentAmount, allocateAmount) => {
    setError('');
    setSuccess('');

    try {
      const newAmount = currentAmount + allocateAmount;
      await updateSavingsGoal(goalId, { currentAmount: newAmount });
      setSuccess('Amount allocated to goal!');
      loadData();
    } catch (err) {
      setError(err.message || 'Failed to allocate to goal');
    }
  };

  // Calculate total monthly income
  const totalMonthlyIncome = incomeSources.reduce((sum, source) => sum + source.amount, 0);

  // Calculate unallocated savings
  const totalAllocated = savingsGoals.reduce((sum, goal) => sum + goal.currentAmount, 0);
  const unallocatedSavings = savingsBalance.totalBalance - totalAllocated;

  return (
    <div className="income-savings-container">
      <div className="income-savings-header">
        <h1>Income & Savings</h1>
        <div className="tab-buttons">
          <button
            className={`tab-button ${activeTab === 'income' ? 'active' : ''}`}
            onClick={() => setActiveTab('income')}
          >
            Income
          </button>
          <button
            className={`tab-button ${activeTab === 'savings' ? 'active' : ''}`}
            onClick={() => setActiveTab('savings')}
          >
            Savings
          </button>
          <button
            className={`tab-button ${activeTab === 'goals' ? 'active' : ''}`}
            onClick={() => setActiveTab('goals')}
          >
            Goals
          </button>
        </div>
      </div>

      {error && <div className="error-message">{error}</div>}
      {success && <div className="success-message">{success}</div>}

      {/* INCOME TAB */}
      {activeTab === 'income' && (
        <div className="income-tab">
          <div className="section">
            <div className="section-header">
              <h2>Monthly Income</h2>
              <div className="month-selector">
                <input
                  type="month"
                  value={currentMonth.substring(0, 7)}
                  onChange={(e) => setCurrentMonth(`${e.target.value}-01`)}
                />
              </div>
            </div>

            <div className="total-income-card">
              <div className="total-label">Total Monthly Income</div>
              <div className="total-amount">${totalMonthlyIncome.toFixed(2)}</div>
            </div>

            {incomeSources.length === 0 && !showIncomeForm && (
              <p className="empty-state">No income sources for this month. Add your first source below.</p>
            )}

            <div className="income-sources-list">
              {incomeSources.map(source => (
                <div key={source.id} className="income-source-item">
                  <div className="source-info">
                    <span className="source-name">{source.sourceName}</span>
                    <span className="source-amount">${source.amount.toFixed(2)}</span>
                  </div>
                  <button
                    className="delete-button"
                    onClick={() => handleDeleteIncomeSource(source.id)}
                  >
                    Delete
                  </button>
                </div>
              ))}
            </div>

            {!showIncomeForm && (
              <button
                className="add-button"
                onClick={() => setShowIncomeForm(true)}
              >
                + Add Income Source
              </button>
            )}

            {showIncomeForm && (
              <form className="income-form" onSubmit={handleAddIncomeSource}>
                <input
                  type="text"
                  placeholder="Source name (e.g., Salary, Rent Income)"
                  value={incomeFormData.sourceName}
                  onChange={(e) => setIncomeFormData({...incomeFormData, sourceName: e.target.value})}
                  required
                />
                <input
                  type="number"
                  step="0.01"
                  placeholder="Amount"
                  value={incomeFormData.amount}
                  onChange={(e) => setIncomeFormData({...incomeFormData, amount: e.target.value})}
                  required
                />
                <div className="form-buttons">
                  <button type="submit" className="submit-button">Add Source</button>
                  <button
                    type="button"
                    className="cancel-button"
                    onClick={() => setShowIncomeForm(false)}
                  >
                    Cancel
                  </button>
                </div>
              </form>
            )}
          </div>

          <div className="section">
            <div className="section-header">
              <h2>Extra Income</h2>
            </div>

            {extraIncome.length === 0 && !showExtraIncomeForm && (
              <p className="empty-state">No extra income recorded yet.</p>
            )}

            <div className="extra-income-list">
              {extraIncome.slice(0, 10).map(income => (
                <div key={income.id} className="extra-income-item">
                  <div className="income-info">
                    <span className="income-desc">{income.description}</span>
                    <span className="income-date">{new Date(income.date).toLocaleDateString()}</span>
                  </div>
                  <div className="income-details">
                    <span className="income-amount">${income.amount.toFixed(2)}</span>
                    <span className={`income-destination ${income.destination}`}>
                      → {income.destination === 'budget' ? 'Budget' : 'Savings'}
                    </span>
                  </div>
                </div>
              ))}
            </div>

            {!showExtraIncomeForm && (
              <button
                className="add-button"
                onClick={() => setShowExtraIncomeForm(true)}
              >
                + Add Extra Income
              </button>
            )}

            {showExtraIncomeForm && (
              <form className="extra-income-form" onSubmit={handleAddExtraIncome}>
                <input
                  type="text"
                  placeholder="Description (e.g., Freelance Project, Gift)"
                  value={extraIncomeFormData.description}
                  onChange={(e) => setExtraIncomeFormData({...extraIncomeFormData, description: e.target.value})}
                  required
                />
                <input
                  type="number"
                  step="0.01"
                  placeholder="Amount"
                  value={extraIncomeFormData.amount}
                  onChange={(e) => setExtraIncomeFormData({...extraIncomeFormData, amount: e.target.value})}
                  required
                />
                <input
                  type="date"
                  value={extraIncomeFormData.date}
                  onChange={(e) => setExtraIncomeFormData({...extraIncomeFormData, date: e.target.value})}
                  required
                />
                <div className="destination-selector">
                  <label>Where should this go?</label>
                  <div className="radio-group">
                    <label className="radio-option">
                      <input
                        type="radio"
                        value="budget"
                        checked={extraIncomeFormData.destination === 'budget'}
                        onChange={(e) => setExtraIncomeFormData({...extraIncomeFormData, destination: e.target.value})}
                      />
                      <span>Add to Current Budget</span>
                    </label>
                    <label className="radio-option">
                      <input
                        type="radio"
                        value="savings"
                        checked={extraIncomeFormData.destination === 'savings'}
                        onChange={(e) => setExtraIncomeFormData({...extraIncomeFormData, destination: e.target.value})}
                      />
                      <span>Add to Savings</span>
                    </label>
                  </div>
                </div>
                <div className="form-buttons">
                  <button type="submit" className="submit-button">Add Income</button>
                  <button
                    type="button"
                    className="cancel-button"
                    onClick={() => setShowExtraIncomeForm(false)}
                  >
                    Cancel
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* SAVINGS TAB */}
      {activeTab === 'savings' && (
        <div className="savings-tab">
          <div className="savings-balance-card">
            <h2>Total Savings</h2>
            <div className="balance-amount">${savingsBalance.totalBalance.toFixed(2)}</div>
            <div className="balance-info">
              {savingsBalance.transactionCount} transactions
            </div>
          </div>

          <div className="section">
            <div className="section-header">
              <h2>Transactions</h2>
            </div>

            {!showSavingsTransactionForm && (
              <button
                className="add-button"
                onClick={() => setShowSavingsTransactionForm(true)}
              >
                + Add Transaction
              </button>
            )}

            {showSavingsTransactionForm && (
              <form className="savings-transaction-form" onSubmit={handleAddSavingsTransaction}>
                <div className="radio-group">
                  <label className="radio-option">
                    <input
                      type="radio"
                      value="deposit"
                      checked={savingsTransactionFormData.transactionType === 'deposit'}
                      onChange={(e) => setSavingsTransactionFormData({...savingsTransactionFormData, transactionType: e.target.value})}
                    />
                    <span>Deposit</span>
                  </label>
                  <label className="radio-option">
                    <input
                      type="radio"
                      value="withdrawal"
                      checked={savingsTransactionFormData.transactionType === 'withdrawal'}
                      onChange={(e) => setSavingsTransactionFormData({...savingsTransactionFormData, transactionType: e.target.value})}
                    />
                    <span>Withdrawal</span>
                  </label>
                </div>
                <input
                  type="number"
                  step="0.01"
                  placeholder="Amount"
                  value={savingsTransactionFormData.amount}
                  onChange={(e) => setSavingsTransactionFormData({...savingsTransactionFormData, amount: e.target.value})}
                  required
                />
                <input
                  type="text"
                  placeholder="Description (optional)"
                  value={savingsTransactionFormData.description}
                  onChange={(e) => setSavingsTransactionFormData({...savingsTransactionFormData, description: e.target.value})}
                />
                <input
                  type="date"
                  value={savingsTransactionFormData.date}
                  onChange={(e) => setSavingsTransactionFormData({...savingsTransactionFormData, date: e.target.value})}
                  required
                />
                <div className="form-buttons">
                  <button type="submit" className="submit-button">Add Transaction</button>
                  <button
                    type="button"
                    className="cancel-button"
                    onClick={() => setShowSavingsTransactionForm(false)}
                  >
                    Cancel
                  </button>
                </div>
              </form>
            )}

            <div className="transactions-list">
              {savingsTransactions.map(transaction => (
                <div key={transaction.id} className={`transaction-item ${transaction.transactionType}`}>
                  <div className="transaction-info">
                    <span className="transaction-type">
                      {transaction.transactionType === 'deposit' ? '↑' : '↓'}
                      {transaction.transactionType === 'deposit' ? 'Deposit' : 'Withdrawal'}
                    </span>
                    <span className="transaction-desc">{transaction.description || transaction.source}</span>
                    <span className="transaction-date">{new Date(transaction.date).toLocaleDateString()}</span>
                  </div>
                  <span className={`transaction-amount ${transaction.transactionType}`}>
                    {transaction.transactionType === 'deposit' ? '+' : '-'}
                    ${Math.abs(transaction.amount).toFixed(2)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* GOALS TAB */}
      {activeTab === 'goals' && (
        <div className="goals-tab">
          <div className="unallocated-savings-card">
            <h3>Unallocated Savings</h3>
            <div className="unallocated-amount">${unallocatedSavings.toFixed(2)}</div>
            <p className="unallocated-info">Available to allocate to goals</p>
          </div>

          <div className="section">
            <div className="section-header">
              <h2>Savings Goals</h2>
            </div>

            {savingsGoals.length === 0 && !showGoalForm && (
              <p className="empty-state">No savings goals yet. Create your first goal below!</p>
            )}

            <div className="goals-list">
              {savingsGoals.map(goal => {
                const progress = (goal.currentAmount / goal.targetAmount) * 100;
                const isCompleted = progress >= 100;

                return (
                  <div key={goal.id} className={`goal-item ${isCompleted ? 'completed' : ''}`}>
                    <div className="goal-header">
                      <h3>{goal.goalName}</h3>
                      <button
                        className="delete-button-small"
                        onClick={() => handleDeleteGoal(goal.id)}
                      >
                        ×
                      </button>
                    </div>
                    {goal.description && <p className="goal-description">{goal.description}</p>}
                    <div className="goal-progress">
                      <div className="progress-bar">
                        <div
                          className="progress-fill"
                          style={{ width: `${Math.min(progress, 100)}%` }}
                        ></div>
                      </div>
                      <div className="progress-text">
                        ${goal.currentAmount.toFixed(2)} / ${goal.targetAmount.toFixed(2)}
                        <span className="progress-percentage">({progress.toFixed(0)}%)</span>
                      </div>
                    </div>
                    {goal.targetDate && (
                      <div className="goal-date">
                        Target: {new Date(goal.targetDate).toLocaleDateString()}
                      </div>
                    )}
                    {!isCompleted && unallocatedSavings > 0 && (
                      <button
                        className="allocate-button"
                        onClick={() => {
                          const amount = parseFloat(prompt('How much would you like to allocate to this goal?', '0'));
                          if (amount && amount > 0 && amount <= unallocatedSavings) {
                            handleAllocateToGoal(goal.id, goal.currentAmount, amount);
                          } else if (amount > unallocatedSavings) {
                            alert('Amount exceeds unallocated savings!');
                          }
                        }}
                      >
                        Allocate Funds
                      </button>
                    )}
                    {isCompleted && (
                      <div className="goal-completed-badge">✓ Goal Reached!</div>
                    )}
                  </div>
                );
              })}
            </div>

            {!showGoalForm && (
              <button
                className="add-button"
                onClick={() => setShowGoalForm(true)}
              >
                + Create Goal
              </button>
            )}

            {showGoalForm && (
              <form className="goal-form" onSubmit={handleAddGoal}>
                <input
                  type="text"
                  placeholder="Goal name (e.g., New Laptop, Vacation)"
                  value={goalFormData.goalName}
                  onChange={(e) => setGoalFormData({...goalFormData, goalName: e.target.value})}
                  required
                />
                <input
                  type="number"
                  step="0.01"
                  placeholder="Target amount"
                  value={goalFormData.targetAmount}
                  onChange={(e) => setGoalFormData({...goalFormData, targetAmount: e.target.value})}
                  required
                />
                <input
                  type="date"
                  placeholder="Target date (optional)"
                  value={goalFormData.targetDate}
                  onChange={(e) => setGoalFormData({...goalFormData, targetDate: e.target.value})}
                />
                <textarea
                  placeholder="Description (optional)"
                  value={goalFormData.description}
                  onChange={(e) => setGoalFormData({...goalFormData, description: e.target.value})}
                  rows="3"
                />
                <div className="form-buttons">
                  <button type="submit" className="submit-button">Create Goal</button>
                  <button
                    type="button"
                    className="cancel-button"
                    onClick={() => setShowGoalForm(false)}
                  >
                    Cancel
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default IncomeSavings;
