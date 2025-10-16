import React, { useState, useEffect, useRef } from 'react';
import './TimeNavigator.css';

// Helper function to format date in local timezone (avoids timezone shift)
const toLocalDateString = (date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

function TimeNavigator({ onRangeChange, expenses = [], initialDate }) {
  const [viewMode, setViewMode] = useState('month'); // 'month', 'week', or 'day'
  const [currentDate, setCurrentDate] = useState(() => initialDate || new Date());
  const [showCalendar, setShowCalendar] = useState(false);
  const [selectedMonth, setSelectedMonth] = useState(() => initialDate || new Date());
  const isFirstRender = useRef(true);

  useEffect(() => {
    // Skip the first render to prevent resetting the date on mount
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }

    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    const day = currentDate.getDate();

    if (viewMode === 'month') {
      const startOfMonth = new Date(year, month, 1);
      const endOfMonth = new Date(year, month + 1, 0);
      onRangeChange({
        startDate: toLocalDateString(startOfMonth),
        endDate: toLocalDateString(endOfMonth)
      });
    } else if (viewMode === 'week') {
      // Week view (Sunday to Saturday)
      const dayOfWeek = currentDate.getDay();
      const startOfWeek = new Date(year, month, day - dayOfWeek);
      const endOfWeek = new Date(year, month, day + (6 - dayOfWeek));
      onRangeChange({
        startDate: toLocalDateString(startOfWeek),
        endDate: toLocalDateString(endOfWeek)
      });
    } else if (viewMode === 'day') {
      // Single day view
      const selectedDay = new Date(year, month, day);
      onRangeChange({
        startDate: toLocalDateString(selectedDay),
        endDate: toLocalDateString(selectedDay)
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentDate, viewMode]);

  const navigatePrevious = () => {
    const newDate = new Date(currentDate);
    if (viewMode === 'month') {
      newDate.setMonth(newDate.getMonth() - 1);
    } else if (viewMode === 'week') {
      newDate.setDate(newDate.getDate() - 7);
    } else if (viewMode === 'day') {
      newDate.setDate(newDate.getDate() - 1);
    }
    setCurrentDate(newDate);
  };

  const navigateNext = () => {
    const newDate = new Date(currentDate);
    if (viewMode === 'month') {
      newDate.setMonth(newDate.getMonth() + 1);
    } else if (viewMode === 'week') {
      newDate.setDate(newDate.getDate() + 7);
    } else if (viewMode === 'day') {
      newDate.setDate(newDate.getDate() + 1);
    }
    setCurrentDate(newDate);
  };

  const goToToday = () => {
    setCurrentDate(new Date());
  };

  const formatCurrentPeriod = () => {
    if (viewMode === 'month') {
      return currentDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    } else if (viewMode === 'week') {
      const year = currentDate.getFullYear();
      const month = currentDate.getMonth();
      const day = currentDate.getDate();
      const dayOfWeek = currentDate.getDay();
      const startOfWeek = new Date(year, month, day - dayOfWeek);
      const endOfWeek = new Date(year, month, day + (6 - dayOfWeek));

      return `${startOfWeek.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - ${endOfWeek.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`;
    } else if (viewMode === 'day') {
      return currentDate.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
    }
  };

  // Get expenses for a specific date
  const getExpensesForDate = (date) => {
    const dateStr = toLocalDateString(date);
    return expenses.filter(expense => expense.date === dateStr);
  };

  // Calculate total for a date
  const getTotalForDate = (date) => {
    const dayExpenses = getExpensesForDate(date);
    return dayExpenses.reduce((sum, exp) => sum + (exp.totalAmount || 0), 0);
  };

  // Generate calendar days for the selected month
  const generateCalendarDays = () => {
    const year = selectedMonth.getFullYear();
    const month = selectedMonth.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const daysInMonth = lastDay.getDate();
    const startingDayOfWeek = firstDay.getDay();

    const days = [];

    // Add empty cells for days before month starts
    for (let i = 0; i < startingDayOfWeek; i++) {
      days.push(null);
    }

    // Add all days of the month
    for (let day = 1; day <= daysInMonth; day++) {
      days.push(new Date(year, month, day));
    }

    return days;
  };

  const handleDateClick = (date) => {
    setCurrentDate(new Date(date));
    setViewMode('day'); // Switch to day view when a specific date is clicked
    setShowCalendar(false);
  };

  const navigateCalendarMonth = (direction) => {
    const newMonth = new Date(selectedMonth);
    newMonth.setMonth(newMonth.getMonth() + direction);
    setSelectedMonth(newMonth);
  };

  const isToday = (date) => {
    const today = new Date();
    return date.toDateString() === today.toDateString();
  };

  const isSelected = (date) => {
    return date.toDateString() === currentDate.toDateString();
  };

  const getIntensityClass = (total) => {
    if (total === 0) return 'intensity-none';
    if (total < 50) return 'intensity-low';
    if (total < 150) return 'intensity-medium';
    if (total < 300) return 'intensity-high';
    return 'intensity-very-high';
  };

  return (
    <div className="time-navigator">
      <div className="navigator-header">
        <div className="view-mode-selector">
          <button
            className={viewMode === 'month' ? 'active' : ''}
            onClick={() => setViewMode('month')}
          >
            📅 Month
          </button>
          <button
            className={viewMode === 'week' ? 'active' : ''}
            onClick={() => setViewMode('week')}
          >
            📆 Week
          </button>
          <button
            className={viewMode === 'day' ? 'active' : ''}
            onClick={() => setViewMode('day')}
          >
            📆 Day
          </button>
        </div>

        <div className="period-controls">
          <button className="nav-btn" onClick={navigatePrevious} title="Previous">
            ◀
          </button>

          <div className="current-period" onClick={() => setShowCalendar(!showCalendar)}>
            <span className="period-icon">🗓️</span>
            <span className="period-text">{formatCurrentPeriod()}</span>
          </div>

          <button className="nav-btn" onClick={navigateNext} title="Next">
            ▶
          </button>
        </div>

        <button className="today-btn" onClick={goToToday}>
          Today
        </button>
      </div>

      {showCalendar && (
        <div className="calendar-popup">
          <div className="calendar-header">
            <button className="cal-nav-btn" onClick={() => navigateCalendarMonth(-1)}>
              ◀
            </button>
            <h3>
              {selectedMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
            </h3>
            <button className="cal-nav-btn" onClick={() => navigateCalendarMonth(1)}>
              ▶
            </button>
          </div>

          <div className="calendar-grid">
            <div className="calendar-weekdays">
              {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
                <div key={day} className="weekday">{day}</div>
              ))}
            </div>

            <div className="calendar-days">
              {generateCalendarDays().map((date, index) => {
                if (!date) {
                  return <div key={`empty-${index}`} className="calendar-day empty"></div>;
                }

                const total = getTotalForDate(date);
                const expenseCount = getExpensesForDate(date).length;

                return (
                  <div
                    key={index}
                    className={`calendar-day ${isToday(date) ? 'today' : ''} ${isSelected(date) ? 'selected' : ''} ${getIntensityClass(total)}`}
                    onClick={() => handleDateClick(date)}
                  >
                    <span className="day-number">{date.getDate()}</span>
                    {expenseCount > 0 && (
                      <div className="expense-indicator">
                        <span className="expense-dot"></span>
                        <span className="expense-count">{expenseCount}</span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          <div className="calendar-legend">
            <span className="legend-title">Spending:</span>
            <div className="legend-items">
              <span className="legend-item">
                <span className="legend-dot intensity-none"></span>
                None
              </span>
              <span className="legend-item">
                <span className="legend-dot intensity-low"></span>
                Low
              </span>
              <span className="legend-item">
                <span className="legend-dot intensity-medium"></span>
                Medium
              </span>
              <span className="legend-item">
                <span className="legend-dot intensity-high"></span>
                High
              </span>
              <span className="legend-item">
                <span className="legend-dot intensity-very-high"></span>
                Very High
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default TimeNavigator;
