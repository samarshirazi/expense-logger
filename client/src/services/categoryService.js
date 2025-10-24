// Default categories
const DEFAULT_CATEGORIES = [
  { id: 'Food', name: 'Food', icon: '🍔', color: '#ff6b6b', gradient: 'linear-gradient(135deg, #ff6b6b 0%, #ff8585 100%)' },
  { id: 'Transport', name: 'Transport', icon: '🚗', color: '#4ecdc4', gradient: 'linear-gradient(135deg, #4ecdc4 0%, #76e3da 100%)' },
  { id: 'Shopping', name: 'Shopping', icon: '🛍️', color: '#45b7d1', gradient: 'linear-gradient(135deg, #45b7d1 0%, #6fd0e6 100%)' },
  { id: 'Bills', name: 'Bills', icon: '💡', color: '#f9ca24', gradient: 'linear-gradient(135deg, #f9ca24 0%, #ffd866 100%)' },
  { id: 'Other', name: 'Other', icon: '📦', color: '#95afc0', gradient: 'linear-gradient(135deg, #95afc0 0%, #b7c7d3 100%)' }
];

// Color palette for random assignment
const COLOR_PALETTE = [
  '#667eea', '#764ba2', '#f093fb', '#f5576c',
  '#fa709a', '#fee140', '#30cfd0', '#38f9d7',
  '#43e97b', '#fa8231', '#a8edea', '#fed6e3',
  '#ffecd2', '#fcb69f', '#ff9a9e', '#fecfef',
  '#fe9090', '#f6d365', '#fda085', '#f3904f',
  '#3eadcf', '#abe9cd', '#5ee7df', '#b490ca',
  '#d299c2', '#fef9d7', '#d69aaa', '#fbc2eb'
];

// Get a random color from palette
const getRandomColor = () => {
  return COLOR_PALETTE[Math.floor(Math.random() * COLOR_PALETTE.length)];
};

// Load custom categories from localStorage
const loadCustomCategories = () => {
  try {
    const saved = localStorage.getItem('customCategories');
    return saved ? JSON.parse(saved) : [];
  } catch (error) {
    console.error('Failed to load custom categories:', error);
    return [];
  }
};

// Save custom categories to localStorage
const saveCustomCategories = (categories) => {
  try {
    localStorage.setItem('customCategories', JSON.stringify(categories));
    // Dispatch custom event so other components can listen
    window.dispatchEvent(new Event('categoriesUpdated'));
  } catch (error) {
    console.error('Failed to save custom categories:', error);
  }
};

// Get all categories (default + custom)
export const getAllCategories = () => {
  const customCategories = loadCustomCategories();
  return [...DEFAULT_CATEGORIES, ...customCategories];
};

// Get custom categories only
export const getCustomCategories = () => {
  return loadCustomCategories();
};

// Add a new category
export const addCategory = (name, icon) => {
  const color = getRandomColor();
  const newCategory = {
    id: name.replace(/\s+/g, ''),
    name: name,
    icon: icon,
    color: color,
    gradient: `linear-gradient(135deg, ${color} 0%, ${color}cc 100%)`,
    isCustom: true
  };

  const customCategories = loadCustomCategories();
  const updated = [...customCategories, newCategory];
  saveCustomCategories(updated);

  return newCategory;
};

// Update a category
export const updateCategory = (categoryId, updates) => {
  const customCategories = loadCustomCategories();
  const color = updates.color || getRandomColor();
  const updated = customCategories.map(cat =>
    cat.id === categoryId
      ? { ...cat, ...updates, color: color, gradient: `linear-gradient(135deg, ${color} 0%, ${color}cc 100%)` }
      : cat
  );
  saveCustomCategories(updated);
};

// Delete a category
export const deleteCategory = (categoryId) => {
  const customCategories = loadCustomCategories();
  const updated = customCategories.filter(cat => cat.id !== categoryId);
  saveCustomCategories(updated);
};

// Check if a category is custom
export const isCustomCategory = (categoryId) => {
  const customCategories = loadCustomCategories();
  return customCategories.some(cat => cat.id === categoryId);
};

// Get category by ID
export const getCategoryById = (categoryId) => {
  const allCategories = getAllCategories();
  return allCategories.find(cat => cat.id === categoryId);
};

// Get default categories
export const getDefaultCategories = () => {
  return DEFAULT_CATEGORIES;
};
