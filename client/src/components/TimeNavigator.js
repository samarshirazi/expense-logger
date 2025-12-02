import React, { useState, useEffect, useRef, useCallback } from 'react';
import './TimeNavigator.css';

// Helper function to format date in local timezone (avoids timezone shift)
const toLocalDateString = (date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

function TimeNavigator({
  onRangeChange,
  expenses = [],
  initialDate,
  timelineState,
  onTimelineStateChange,
  adjustEnabled = true
}) {
  // Use external state if provided, otherwise use internal state
  const [internalViewMode, setInternalViewMode] = useState('month');
  const [internalCurrentDate, setInternalCurrentDate] = useState(() => initialDate || new Date());

  const viewMode = adjustEnabled ? (timelineState?.viewMode || internalViewMode) : 'month';
  const currentDate = timelineState?.currentDate || internalCurrentDate;

  const setViewMode = useCallback((mode) => {
    if (onTimelineStateChange) {
      onTimelineStateChange(prevState => ({
        ...(prevState || timelineState || {}),
        viewMode: mode
      }));
    } else {
      setInternalViewMode(mode);
    }
  }, [onTimelineStateChange, timelineState]);

  const setCurrentDate = (date) => {
    if (onTimelineStateChange) {
      onTimelineStateChange(prevState => ({
        ...(prevState || timelineState || {}),
        currentDate: date
      }));
    } else {
      setInternalCurrentDate(date);
    }
  };

  const [showCalendar, setShowCalendar] = useState(false);
  const [showViewModeMenu, setShowViewModeMenu] = useState(false);
  const [selectedMonth, setSelectedMonth] = useState(() => initialDate || new Date());
  const isFirstRender = useRef(true);
  const viewModeMenuRef = useRef(null);
  const adjustButtonRef = useRef(null);
  const calendarPopupRef = useRef(null);
  const periodToggleRef = useRef(null);

  useEffect(() => {
    if (!adjustEnabled) {
      setShowViewModeMenu(false);
      if (timelineState?.viewMode !== 'month') {
        setViewMode('month');
      }
    }
  }, [adjustEnabled, setViewMode, timelineState?.viewMode]);

  useEffect(() => {
    if (!showViewModeMenu) {
      return;
    }

    const handleOutside = (event) => {
      if (viewModeMenuRef.current?.contains(event.target)) {
        return;
      }
      if (adjustButtonRef.current?.contains(event.target)) {
        return;
      }
      setShowViewModeMenu(false);
    };

    document.addEventListener('pointerdown', handleOutside);
    return () => {
      document.removeEventListener('pointerdown', handleOutside);
    };
  }, [showViewModeMenu]);

  useEffect(() => {
    if (!showCalendar) {
      return;
    }

    const handleOutside = (event) => {
      if (calendarPopupRef.current?.contains(event.target)) {
        return;
      }
      if (periodToggleRef.current?.contains(event.target)) {
        return;
      }
      setShowCalendar(false);
    };

    document.addEventListener('pointerdown', handleOutside);
    return () => {
      document.removeEventListener('pointerdown', handleOutside);
    };
  }, [showCalendar]);

  const effectiveViewMode = adjustEnabled ? viewMode : 'month';

  useEffect(() => {
    // Skip the first render to prevent resetting the date on mount
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }

    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    const day = currentDate.getDate();

    if (effectiveViewMode === 'month') {
      const startOfMonth = new Date(year, month, 1);
      const endOfMonth = new Date(year, month + 1, 0);
      onRangeChange({
        startDate: toLocalDateString(startOfMonth),
        endDate: toLocalDateString(endOfMonth)
      });
    } else if (effectiveViewMode === 'week') {
      // Week view (Sunday to Saturday)
      const dayOfWeek = currentDate.getDay();
      const startOfWeek = new Date(year, month, day - dayOfWeek);
      const endOfWeek = new Date(year, month, day + (6 - dayOfWeek));
      onRangeChange({
        startDate: toLocalDateString(startOfWeek),
        endDate: toLocalDateString(endOfWeek)
      });
    } else if (effectiveViewMode === 'day') {
      // Single day view
      const selectedDay = new Date(year, month, day);
      onRangeChange({
        startDate: toLocalDateString(selectedDay),
        endDate: toLocalDateString(selectedDay)
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentDate, effectiveViewMode]);

  const navigatePrevious = () => {
    const newDate = new Date(currentDate);
    if (effectiveViewMode === 'month') {
      newDate.setMonth(newDate.getMonth() - 1);
    } else if (effectiveViewMode === 'week') {
      newDate.setDate(newDate.getDate() - 7);
    } else if (effectiveViewMode === 'day') {
      newDate.setDate(newDate.getDate() - 1);
    }
    setCurrentDate(newDate);
  };

  const navigateNext = () => {
    const newDate = new Date(currentDate);
    if (effectiveViewMode === 'month') {
      newDate.setMonth(newDate.getMonth() + 1);
    } else if (effectiveViewMode === 'week') {
      newDate.setDate(newDate.getDate() + 7);
    } else if (effectiveViewMode === 'day') {
      newDate.setDate(newDate.getDate() + 1);
    }
    setCurrentDate(newDate);
  };

  const formatCurrentPeriod = () => {
    if (effectiveViewMode === 'month') {
      return currentDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    } else if (effectiveViewMode === 'week') {
      const year = currentDate.getFullYear();
      const month = currentDate.getMonth();
      const day = currentDate.getDate();
      const dayOfWeek = currentDate.getDay();
      const startOfWeek = new Date(year, month, day - dayOfWeek);
      const endOfWeek = new Date(year, month, day + (6 - dayOfWeek));

      return `${startOfWeek.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - ${endOfWeek.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`;
    } else if (effectiveViewMode === 'day') {
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
    if (adjustEnabled) {
      setViewMode('day');
      setShowCalendar(false);
    } else {
      setShowCalendar(false);
    }
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
        <div className="period-controls">
          <button className="nav-btn" onClick={navigatePrevious} title="Previous">
            ◀
          </button>

          <div
            className="current-period"
            onClick={() => setShowCalendar(!showCalendar)}
            ref={periodToggleRef}
          >
            <span className="period-icon">🗓️</span>
            <span className="period-text">{formatCurrentPeriod()}</span>
          </div>

          <button className="nav-btn" onClick={navigateNext} title="Next">
            ▶
          </button>
        </div>

        <div className="adjust-btn-container">
          {adjustEnabled && (
            <>
              <button
                className="adjust-btn"
                onClick={() => setShowViewModeMenu(!showViewModeMenu)}
                ref={adjustButtonRef}
              >
                Adjust
              </button>

              {showViewModeMenu && (
                <div className="view-mode-menu" ref={viewModeMenuRef}>
                  <button
                    className={viewMode === 'month' ? 'active' : ''}
                    onClick={() => {
                      setViewMode('month');
                      setShowViewModeMenu(false);
                    }}
                  >
                    📅 Month
                  </button>
                  <button
                    className={viewMode === 'week' ? 'active' : ''}
                    onClick={() => {
                      setViewMode('week');
                      setShowViewModeMenu(false);
                    }}
                  >
                    📆 Week
                  </button>
                  <button
                    className={viewMode === 'day' ? 'active' : ''}
                    onClick={() => {
                      setViewMode('day');
                      setShowViewModeMenu(false);
                    }}
                  >
                    📆 Day
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {showCalendar && (
        <div className="calendar-popup" ref={calendarPopupRef}>
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
