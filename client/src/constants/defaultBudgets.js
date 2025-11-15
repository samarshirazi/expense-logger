export const DEFAULT_CATEGORY_BUDGETS = {
  Food: 500,
  Transport: 200,
  Shopping: 300,
  Bills: 400,
  Entertainment: 250,
  Health: 200,
  Other: 150
};

export const normalizeBudgets = (overrides = {}) => {
  const shaped = { ...DEFAULT_CATEGORY_BUDGETS };
  Object.entries(overrides || {}).forEach(([name, value]) => {
    if (!name) {
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
