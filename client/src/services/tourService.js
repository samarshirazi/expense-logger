// Tour Service - Manages app tour state and progress tracking

const TOUR_STORAGE_KEY = 'expense_logger_tour';

// All tour areas that can be viewed
export const TOUR_AREAS = {
  OVERVIEW: 'overview',
  QUICK_ADD: 'quickAdd',
  RECEIPT_UPLOAD: 'receiptUpload',
  EXPENSES_LIST: 'expensesList',
  CATEGORIES: 'categories',
  BUDGETS: 'budgets',
  SETTINGS: 'settings'
};

// Default tour state
const getDefaultTourState = () => ({
  hasCompletedTour: false,
  hasSeenTour: false,
  viewedAreas: {
    [TOUR_AREAS.OVERVIEW]: false,
    [TOUR_AREAS.QUICK_ADD]: false,
    [TOUR_AREAS.RECEIPT_UPLOAD]: false,
    [TOUR_AREAS.EXPENSES_LIST]: false,
    [TOUR_AREAS.CATEGORIES]: false,
    [TOUR_AREAS.BUDGETS]: false,
    [TOUR_AREAS.SETTINGS]: false
  },
  lastTourDate: null
});

// Get tour state from localStorage
export const getTourState = () => {
  try {
    const stored = localStorage.getItem(TOUR_STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      // Merge with defaults to handle new areas added later
      return {
        ...getDefaultTourState(),
        ...parsed,
        viewedAreas: {
          ...getDefaultTourState().viewedAreas,
          ...(parsed.viewedAreas || {})
        }
      };
    }
  } catch (e) {
    console.error('Error reading tour state:', e);
  }
  return getDefaultTourState();
};

// Save tour state to localStorage
export const saveTourState = (state) => {
  try {
    localStorage.setItem(TOUR_STORAGE_KEY, JSON.stringify(state));
    // Dispatch event so components can react
    window.dispatchEvent(new CustomEvent('tourStateChanged', { detail: state }));
  } catch (e) {
    console.error('Error saving tour state:', e);
  }
};

// Check if this is user's first time (should show tour)
export const isFirstTimeUser = () => {
  const state = getTourState();
  return !state.hasSeenTour;
};

// Mark that user has seen the tour (even if skipped)
export const markTourSeen = () => {
  const state = getTourState();
  state.hasSeenTour = true;
  state.lastTourDate = new Date().toISOString();
  saveTourState(state);
};

// Mark tour as completed (all steps finished)
export const markTourCompleted = () => {
  const state = getTourState();
  state.hasCompletedTour = true;
  state.hasSeenTour = true;
  state.lastTourDate = new Date().toISOString();
  // Mark all areas as viewed when tour is completed
  Object.keys(state.viewedAreas).forEach(key => {
    state.viewedAreas[key] = true;
  });
  saveTourState(state);
};

// Mark a specific area as viewed
export const markAreaViewed = (areaKey) => {
  const state = getTourState();
  if (state.viewedAreas.hasOwnProperty(areaKey)) {
    state.viewedAreas[areaKey] = true;
    saveTourState(state);
  }
};

// Get progress info (how many areas viewed)
export const getTourProgress = () => {
  const state = getTourState();
  const areas = Object.entries(state.viewedAreas);
  const viewedCount = areas.filter(([_, viewed]) => viewed).length;
  const totalCount = areas.length;

  return {
    viewedCount,
    totalCount,
    percentage: Math.round((viewedCount / totalCount) * 100),
    isComplete: viewedCount === totalCount,
    viewedAreas: state.viewedAreas
  };
};

// Reset all tour progress
export const resetTourProgress = () => {
  const freshState = getDefaultTourState();
  saveTourState(freshState);
  return freshState;
};

// Area display names and descriptions for the checklist
export const AREA_INFO = {
  [TOUR_AREAS.OVERVIEW]: {
    name: 'Overview',
    description: 'Analytics and spending insights',
    icon: '📊'
  },
  [TOUR_AREAS.QUICK_ADD]: {
    name: 'Quick Add',
    description: 'Fast expense entry by typing',
    icon: '⚡'
  },
  [TOUR_AREAS.RECEIPT_UPLOAD]: {
    name: 'Receipt Upload',
    description: 'Scan receipts with AI',
    icon: '📷'
  },
  [TOUR_AREAS.EXPENSES_LIST]: {
    name: 'Expenses List',
    description: 'View and manage all expenses',
    icon: '📋'
  },
  [TOUR_AREAS.CATEGORIES]: {
    name: 'Categories',
    description: 'Organize expenses by category',
    icon: '🏷️'
  },
  [TOUR_AREAS.BUDGETS]: {
    name: 'Budgets',
    description: 'Set spending limits',
    icon: '💰'
  },
  [TOUR_AREAS.SETTINGS]: {
    name: 'Settings',
    description: 'App preferences and notifications',
    icon: '⚙️'
  }
};

const tourService = {
  TOUR_AREAS,
  AREA_INFO,
  getTourState,
  saveTourState,
  isFirstTimeUser,
  markTourSeen,
  markTourCompleted,
  markAreaViewed,
  getTourProgress,
  resetTourProgress
};

export default tourService;
