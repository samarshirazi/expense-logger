import React, { useState } from 'react';
import './DateRangePicker.css';

function DateRangePicker({ onRangeChange, initialRange = 'thisMonth' }) {
  const [selectedRange, setSelectedRange] = useState(initialRange);
  const [showCustomPicker, setShowCustomPicker] = useState(false);
  const [customStartDate, setCustomStartDate] = useState('');
  const [customEndDate, setCustomEndDate] = useState('');

  const getDateRange = (rangeType) => {
    const today = new Date();
    const year = today.getFullYear();
    const month = today.getMonth();
    const day = today.getDate();

    switch (rangeType) {
      case 'thisWeek': {
        const dayOfWeek = today.getDay();
        const startOfWeek = new Date(year, month, day - dayOfWeek);
        const endOfWeek = new Date(year, month, day + (6 - dayOfWeek));
        return {
          startDate: startOfWeek.toISOString().split('T')[0],
          endDate: endOfWeek.toISOString().split('T')[0]
        };
      }
      case 'lastWeek': {
        const dayOfWeek = today.getDay();
        const startOfLastWeek = new Date(year, month, day - dayOfWeek - 7);
        const endOfLastWeek = new Date(year, month, day - dayOfWeek - 1);
        return {
          startDate: startOfLastWeek.toISOString().split('T')[0],
          endDate: endOfLastWeek.toISOString().split('T')[0]
        };
      }
      case 'thisMonth': {
        const startOfMonth = new Date(year, month, 1);
        const endOfMonth = new Date(year, month + 1, 0);
        return {
          startDate: startOfMonth.toISOString().split('T')[0],
          endDate: endOfMonth.toISOString().split('T')[0]
        };
      }
      case 'lastMonth': {
        const startOfLastMonth = new Date(year, month - 1, 1);
        const endOfLastMonth = new Date(year, month, 0);
        return {
          startDate: startOfLastMonth.toISOString().split('T')[0],
          endDate: endOfLastMonth.toISOString().split('T')[0]
        };
      }
      case 'last30Days': {
        const startDate = new Date(year, month, day - 30);
        return {
          startDate: startDate.toISOString().split('T')[0],
          endDate: today.toISOString().split('T')[0]
        };
      }
      case 'last3Months': {
        const startDate = new Date(year, month - 3, day);
        return {
          startDate: startDate.toISOString().split('T')[0],
          endDate: today.toISOString().split('T')[0]
        };
      }
      case 'thisYear': {
        const startOfYear = new Date(year, 0, 1);
        return {
          startDate: startOfYear.toISOString().split('T')[0],
          endDate: today.toISOString().split('T')[0]
        };
      }
      case 'allTime': {
        return {
          startDate: null,
          endDate: null
        };
      }
      default:
        return {
          startDate: null,
          endDate: null
        };
    }
  };

  const handleRangeSelect = (rangeType) => {
    setSelectedRange(rangeType);
    setShowCustomPicker(false);
    const range = getDateRange(rangeType);
    onRangeChange(range);
  };

  const handleCustomRangeApply = () => {
    if (customStartDate && customEndDate) {
      setSelectedRange('custom');
      onRangeChange({
        startDate: customStartDate,
        endDate: customEndDate
      });
      setShowCustomPicker(false);
    }
  };

  const presetRanges = [
    { id: 'thisWeek', label: 'This Week', icon: '📅' },
    { id: 'lastWeek', label: 'Last Week', icon: '📆' },
    { id: 'thisMonth', label: 'This Month', icon: '🗓️' },
    { id: 'lastMonth', label: 'Last Month', icon: '📋' },
    { id: 'last30Days', label: 'Last 30 Days', icon: '📊' },
    { id: 'last3Months', label: 'Last 3 Months', icon: '📈' },
    { id: 'thisYear', label: 'This Year', icon: '🗂️' },
    { id: 'allTime', label: 'All Time', icon: '♾️' }
  ];

  const getRangeLabel = () => {
    if (selectedRange === 'custom') {
      return `${customStartDate} to ${customEndDate}`;
    }
    const preset = presetRanges.find(r => r.id === selectedRange);
    return preset ? preset.label : 'Select Range';
  };

  return (
    <div className="date-range-picker">
      <div className="date-range-header">
        <span className="range-label">📅 Time Period:</span>
        <span className="current-range">{getRangeLabel()}</span>
      </div>

      <div className="preset-ranges">
        {presetRanges.map(range => (
          <button
            key={range.id}
            className={`preset-btn ${selectedRange === range.id ? 'active' : ''}`}
            onClick={() => handleRangeSelect(range.id)}
          >
            <span className="preset-icon">{range.icon}</span>
            <span className="preset-label">{range.label}</span>
          </button>
        ))}
        <button
          className={`preset-btn custom ${selectedRange === 'custom' ? 'active' : ''}`}
          onClick={() => setShowCustomPicker(!showCustomPicker)}
        >
          <span className="preset-icon">🎯</span>
          <span className="preset-label">Custom Range</span>
        </button>
      </div>

      {showCustomPicker && (
        <div className="custom-range-picker">
          <div className="custom-inputs">
            <div className="input-group">
              <label>Start Date</label>
              <input
                type="date"
                value={customStartDate}
                onChange={(e) => setCustomStartDate(e.target.value)}
              />
            </div>
            <div className="input-group">
              <label>End Date</label>
              <input
                type="date"
                value={customEndDate}
                onChange={(e) => setCustomEndDate(e.target.value)}
              />
            </div>
          </div>
          <button
            className="apply-custom-btn"
            onClick={handleCustomRangeApply}
            disabled={!customStartDate || !customEndDate}
          >
            Apply Custom Range
          </button>
        </div>
      )}
    </div>
  );
}

export default DateRangePicker;
