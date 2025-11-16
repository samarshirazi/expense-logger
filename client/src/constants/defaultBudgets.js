export const DEFAULT_CATEGORY_BUDGETS = {
  Food: 500,
  Transport: 200,
  Shopping: 300,
  Bills: 400,
  Entertainment: 250,
  Health: 200,
  Other: 150
};

export const normalizeBudgets = (overrides = {}, validCategories = null) => {
  // Only use budgets that are explicitly set in the database
  // Don't merge with defaults - only return what's actually configured
  // If validCategories is provided, filter to only include those categories
  const shaped = {};

  // Create a set of valid category names if provided
  const validCategoryNames = validCategories
    ? new Set(validCategories.map(cat => cat.name || cat.id))
    : null;

  Object.entries(overrides || {}).forEach(([name, value]) => {
    if (!name) {
      return;
    }

    // Skip if category doesn't exist in valid categories list
    if (validCategoryNames && !validCategoryNames.has(name)) {
      return;
    }

    const numeric = Number(value);
    shaped[name] = Number.isFinite(numeric) ? numeric : 0;
  });
  return shaped;
};

export const buildBudgetLookup = (budgets = {}) => {
  const lookup = {};
  Object.entries(budgets || {}).forEach(([name, value]) => {
    if (!name) {
      return;
    }
    const numeric = Number(value);
    const amount = Number.isFinite(numeric) ? numeric : 0;
    const normalized = name.replace(/\s+/g, '');
    lookup[name] = amount;
    lookup[name.toLowerCase()] = amount;
    if (normalized && normalized !== name) {
      lookup[normalized] = amount;
      lookup[normalized.toLowerCase()] = amount;
    }
  });
  return lookup;
};

export default DEFAULT_CATEGORY_BUDGETS;
