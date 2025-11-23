import React, { useEffect } from 'react';
import Joyride, { STATUS, EVENTS } from 'react-joyride';
import {
  markTourSeen,
  markTourCompleted,
  markAreaViewed,
  TOUR_AREAS
} from '../services/tourService';

// Custom tooltip component for better styling
const CustomTooltip = ({
  continuous,
  index,
  step,
  backProps,
  closeProps,
  primaryProps,
  tooltipProps,
  isLastStep,
  size
}) => (
  <div {...tooltipProps} className="tour-tooltip">
    <div className="tour-tooltip-header">
      {step.title && <h3 className="tour-tooltip-title">{step.title}</h3>}
      <button {...closeProps} className="tour-tooltip-close">×</button>
    </div>
    <div className="tour-tooltip-content">{step.content}</div>
    <div className="tour-tooltip-footer">
      <span className="tour-tooltip-progress">
        {index + 1} of {size}
      </span>
      <div className="tour-tooltip-buttons">
        {index > 0 && (
          <button {...backProps} className="tour-btn tour-btn-back">
            Back
          </button>
        )}
        <button {...primaryProps} className="tour-btn tour-btn-primary">
          {isLastStep ? 'Finish' : 'Next'}
        </button>
      </div>
    </div>
  </div>
);

// Tour steps configuration
const getTourSteps = (activeView) => [
  {
    target: '.sidebar, .bottom-nav',
    title: 'Welcome to Expense Logger! 👋',
    content: (
      <div>
        <p>Let's take a quick tour to help you get started!</p>
        <p style={{ marginTop: '10px', fontSize: '14px', color: '#6b7280' }}>
          You can replay this tour anytime from Settings.
        </p>
      </div>
    ),
    placement: 'center',
    disableBeacon: true,
    areaKey: null // Welcome doesn't mark any area
  },
  {
    target: '[data-tour="overview"]',
    title: 'Overview 📊',
    content: (
      <div>
        <p><strong>Your spending dashboard!</strong></p>
        <p style={{ marginTop: '8px' }}>See charts and insights about your spending patterns:</p>
        <ul style={{ marginTop: '8px', paddingLeft: '20px', fontSize: '14px' }}>
          <li>Spending by category (pie chart)</li>
          <li>Monthly trends</li>
          <li>Top expenses</li>
        </ul>
      </div>
    ),
    placement: 'right',
    disableBeacon: true,
    areaKey: TOUR_AREAS.OVERVIEW
  },
  {
    target: '[data-tour="log-expense"]',
    title: 'Log Expense 📝',
    content: (
      <div>
        <p><strong>Add expenses here!</strong></p>
        <p style={{ marginTop: '8px' }}>Three ways to log expenses:</p>
        <ul style={{ marginTop: '8px', paddingLeft: '20px', fontSize: '14px' }}>
          <li><strong>Quick Add:</strong> Type "coffee $5" or "2 apples for $3"</li>
          <li><strong>Receipt Upload:</strong> Take a photo or drag & drop</li>
          <li><strong>Manual Form:</strong> Fill in details yourself</li>
        </ul>
      </div>
    ),
    placement: 'right',
    disableBeacon: true,
    areaKey: TOUR_AREAS.QUICK_ADD
  },
  {
    target: '[data-tour="expenses"]',
    title: 'Expenses List 📋',
    content: (
      <div>
        <p><strong>View all your expenses!</strong></p>
        <p style={{ marginTop: '8px' }}>Here you can:</p>
        <ul style={{ marginTop: '8px', paddingLeft: '20px', fontSize: '14px' }}>
          <li>See all logged expenses</li>
          <li>Click to edit or delete</li>
          <li>Filter by date range</li>
        </ul>
      </div>
    ),
    placement: 'right',
    disableBeacon: true,
    areaKey: TOUR_AREAS.EXPENSES_LIST
  },
  {
    target: '[data-tour="categories"]',
    title: 'Categories 🏷️',
    content: (
      <div>
        <p><strong>Organize by category!</strong></p>
        <p style={{ marginTop: '8px' }}>See expenses grouped by:</p>
        <ul style={{ marginTop: '8px', paddingLeft: '20px', fontSize: '14px' }}>
          <li>Food & Dining</li>
          <li>Transport</li>
          <li>Shopping</li>
          <li>Bills & more</li>
        </ul>
      </div>
    ),
    placement: 'right',
    disableBeacon: true,
    areaKey: TOUR_AREAS.CATEGORIES
  },
  {
    target: '[data-tour="budgets"]',
    title: 'Budgets 💰',
    content: (
      <div>
        <p><strong>Set spending limits!</strong></p>
        <p style={{ marginTop: '8px' }}>Control your spending:</p>
        <ul style={{ marginTop: '8px', paddingLeft: '20px', fontSize: '14px' }}>
          <li>Set monthly budgets per category</li>
          <li>Get alerts when approaching limits</li>
          <li>Track progress visually</li>
        </ul>
      </div>
    ),
    placement: 'right',
    disableBeacon: true,
    areaKey: TOUR_AREAS.BUDGETS
  },
  {
    target: '[data-tour="settings"]',
    title: 'Settings ⚙️',
    content: (
      <div>
        <p><strong>Customize your experience!</strong></p>
        <p style={{ marginTop: '8px' }}>Configure:</p>
        <ul style={{ marginTop: '8px', paddingLeft: '20px', fontSize: '14px' }}>
          <li>Push notifications</li>
          <li>Notification preferences</li>
          <li>Reset this tour anytime</li>
        </ul>
      </div>
    ),
    placement: 'right',
    disableBeacon: true,
    areaKey: TOUR_AREAS.SETTINGS
  },
  {
    target: 'body',
    title: "You're all set! 🎉",
    content: (
      <div>
        <p><strong>Start tracking your expenses!</strong></p>
        <p style={{ marginTop: '10px' }}>
          Try adding your first expense using Quick Add or by uploading a receipt.
        </p>
        <p style={{ marginTop: '10px', fontSize: '14px', color: '#6b7280' }}>
          You can replay this tour anytime from Settings → App Guide.
        </p>
      </div>
    ),
    placement: 'center',
    disableBeacon: true,
    areaKey: null
  }
];

// Joyride styling
const joyrideStyles = {
  options: {
    primaryColor: '#667eea',
    backgroundColor: '#ffffff',
    textColor: '#1f2937',
    overlayColor: 'rgba(0, 0, 0, 0.6)',
    spotlightShadow: '0 0 20px rgba(102, 126, 234, 0.5)',
    zIndex: 10000
  },
  spotlight: {
    borderRadius: 12
  },
  overlay: {
    backgroundColor: 'rgba(0, 0, 0, 0.6)'
  }
};

function AppTour({ run, onComplete, activeView, setMobileMenuOpen }) {
  const steps = getTourSteps(activeView);

  // Check if we're on mobile
  const isMobile = () => window.innerWidth <= 768;

  const handleJoyrideCallback = (data) => {
    const { status, type, step } = data;

    // Mark area as viewed when step is shown
    if (type === EVENTS.STEP_AFTER && step?.areaKey) {
      markAreaViewed(step.areaKey);
    }

    // On mobile, open sidebar before steps that target sidebar-only items
    if (type === EVENTS.STEP_BEFORE && isMobile() && setMobileMenuOpen) {
      const sidebarOnlyAreas = [TOUR_AREAS.CATEGORIES, TOUR_AREAS.BUDGETS, TOUR_AREAS.SETTINGS];
      if (step?.areaKey && sidebarOnlyAreas.includes(step.areaKey)) {
        // Open mobile menu so the target element is visible
        setMobileMenuOpen(true);
      } else if (step?.areaKey && !sidebarOnlyAreas.includes(step.areaKey)) {
        // Close mobile menu for other steps
        setMobileMenuOpen(false);
      }
    }

    // Handle tour completion or skip
    if ([STATUS.FINISHED, STATUS.SKIPPED].includes(status)) {
      if (status === STATUS.FINISHED) {
        markTourCompleted();
      } else {
        markTourSeen();
      }
      // Close mobile menu when tour ends
      if (setMobileMenuOpen) {
        setMobileMenuOpen(false);
      }
      if (onComplete) {
        onComplete(status);
      }
    }
  };

  // Reset when tour starts
  useEffect(() => {
    // Tour started
  }, [run]);

  return (
    <>
      <style>{`
        .tour-tooltip {
          background: white;
          border-radius: 16px;
          padding: 0;
          max-width: 360px;
          box-shadow: 0 20px 40px rgba(0, 0, 0, 0.2);
          overflow: hidden;
        }

        .tour-tooltip-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 16px 20px;
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          color: white;
        }

        .tour-tooltip-title {
          margin: 0;
          font-size: 18px;
          font-weight: 600;
        }

        .tour-tooltip-close {
          background: rgba(255, 255, 255, 0.2);
          border: none;
          color: white;
          width: 28px;
          height: 28px;
          border-radius: 50%;
          font-size: 20px;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: background 0.2s;
        }

        .tour-tooltip-close:hover {
          background: rgba(255, 255, 255, 0.3);
        }

        .tour-tooltip-content {
          padding: 20px;
          color: #374151;
          line-height: 1.6;
        }

        .tour-tooltip-content p {
          margin: 0;
        }

        .tour-tooltip-content ul {
          margin: 0;
          color: #6b7280;
        }

        .tour-tooltip-content li {
          margin-bottom: 4px;
        }

        .tour-tooltip-footer {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 16px 20px;
          background: #f9fafb;
          border-top: 1px solid #e5e7eb;
        }

        .tour-tooltip-progress {
          font-size: 13px;
          color: #9ca3af;
          font-weight: 500;
        }

        .tour-tooltip-buttons {
          display: flex;
          gap: 8px;
        }

        .tour-btn {
          padding: 10px 20px;
          border-radius: 8px;
          font-size: 14px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s;
          border: none;
        }

        .tour-btn-back {
          background: #f3f4f6;
          color: #4b5563;
        }

        .tour-btn-back:hover {
          background: #e5e7eb;
        }

        .tour-btn-primary {
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          color: white;
        }

        .tour-btn-primary:hover {
          transform: translateY(-1px);
          box-shadow: 0 4px 12px rgba(102, 126, 234, 0.4);
        }

        /* Help button styling */
        .tour-help-btn {
          position: fixed;
          bottom: 80px;
          right: 20px;
          width: 50px;
          height: 50px;
          border-radius: 50%;
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          color: white;
          border: none;
          font-size: 24px;
          cursor: pointer;
          box-shadow: 0 4px 15px rgba(102, 126, 234, 0.4);
          z-index: 999;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: all 0.3s ease;
        }

        .tour-help-btn:hover {
          transform: scale(1.1);
          box-shadow: 0 6px 20px rgba(102, 126, 234, 0.5);
        }

        @media (max-width: 768px) {
          .tour-tooltip {
            max-width: 300px;
          }

          .tour-help-btn {
            bottom: 100px;
            right: 15px;
            width: 45px;
            height: 45px;
            font-size: 20px;
          }
        }
      `}</style>

      <Joyride
        steps={steps}
        run={run}
        continuous
        showProgress
        showSkipButton
        disableOverlayClose
        disableCloseOnEsc={false}
        spotlightClicks={false}
        callback={handleJoyrideCallback}
        styles={joyrideStyles}
        tooltipComponent={CustomTooltip}
        locale={{
          back: 'Back',
          close: 'Close',
          last: 'Finish',
          next: 'Next',
          skip: 'Skip Tour'
        }}
      />
    </>
  );
}

export default AppTour;
