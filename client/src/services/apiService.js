import axios from 'axios';
import authService from './authService';

// Use relative path for production (works with Vercel), localhost for development
// For mobile testing on local network, use the host's IP address
const getApiBaseUrl = () => {
  if (process.env.NODE_ENV === 'production') {
    return '/api';
  }

  // In development, check if we're accessing from network (not localhost)
  if (typeof window !== 'undefined') {
    const hostname = window.location.hostname;
    console.log('🔍 Detected hostname:', hostname);
    console.log('🔍 Location:', window.location.href);

    if (hostname !== 'localhost' && hostname !== '127.0.0.1') {
      // Access from network, use the same hostname with port 5000
      const networkUrl = `http://${hostname}:5000/api`;
      console.log('🌐 Using network URL:', networkUrl);
      return networkUrl;
    }
  }

  console.log('🏠 Using localhost URL');
  return 'http://localhost:5000/api';
};

const API_BASE_URL = getApiBaseUrl();

console.log('✅ Final API Base URL:', API_BASE_URL);

const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 60000,
});

const normalizeErrorMessage = (value) => {
  if (!value) {
    return '';
  }

  if (typeof value === 'string') {
    return value;
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }

  if (Array.isArray(value)) {
    return value.map(normalizeErrorMessage).filter(Boolean).join(', ');
  }

  if (typeof value === 'object') {
    if (value.message) {
      return normalizeErrorMessage(value.message);
    }

    if (value.error) {
      return normalizeErrorMessage(value.error);
    }

    try {
      return JSON.stringify(value);
    } catch (jsonError) {
      console.warn('Failed to stringify error payload:', jsonError);
    }
  }

  return '';
};

const extractApiError = (error, fallbackMessage) => {
  if (error.response) {
    const data = error.response.data;
    const serverMessage = normalizeErrorMessage(data?.error ?? data?.message ?? data);
    const serverDetails = normalizeErrorMessage(data?.details);
    const combined = [serverMessage, serverDetails].filter(Boolean).join(': ');
    return combined || fallbackMessage;
  }

  if (error.request) {
    return 'Network error - please check your connection';
  }

  return error.message || fallbackMessage;
};

// Add auth token and logging to requests
api.interceptors.request.use(
  (config) => {
    // Log request for debugging
    console.log('📤 API Request:', config.method?.toUpperCase(), config.url, 'to', config.baseURL);

    // Add auth token
    const token = authService.getAccessToken();
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    console.error('❌ Request setup error:', error);
    return Promise.reject(error);
  }
);

// Handle auth errors
api.interceptors.response.use(
  (response) => {
    console.log('✅ API Response:', response.config.method?.toUpperCase(), response.config.url, response.status);
    return response;
  },
  (error) => {
    console.error('❌ API Error:', error.config?.method?.toUpperCase(), error.config?.url, error.response?.status, error.message);
    if (error.response) {
      console.error('Response data:', error.response.data);
    }

    if (error.response?.status === 401) {
      // Token expired or invalid - sign out user
      authService.signOut();
    }
    return Promise.reject(error);
  }
);

export const uploadReceipt = async (file, onProgress) => {
  const formData = new FormData();
  formData.append('receipt', file);

  try {
    const response = await api.post('/upload-receipt', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
      onUploadProgress: onProgress ? (progressEvent) => {
        const percentCompleted = Math.round((progressEvent.loaded * 100) / progressEvent.total);
        onProgress(percentCompleted);
      } : undefined,
    });

    return response.data;
  } catch (error) {
    throw new Error(extractApiError(error, 'Upload failed'));
  }
};

export const getExpenses = async (limit = 50, offset = 0) => {
  try {
    const response = await api.get('/expenses', {
      params: { limit, offset }
    });
    return response.data;
  } catch (error) {
    console.error('Failed to fetch expenses:', error);
    throw new Error('Failed to fetch expenses');
  }
};

export const deleteExpense = async (id) => {
  try {
    const response = await api.delete(`/expenses/${id}`);
    return response.data;
  } catch (error) {
    throw new Error(extractApiError(error, 'Delete failed'));
  }
};

export const updateExpenseCategory = async (id, category) => {
  try {
    const response = await api.patch(`/expenses/${id}/category`, { category });
    return response.data;
  } catch (error) {
    throw new Error(extractApiError(error, 'Category update failed'));
  }
};

export const updateItemCategory = async (expenseId, itemIndex, category) => {
  try {
    const response = await api.patch(`/expenses/${expenseId}/items/${itemIndex}/category`, { category });
    return response.data;
  } catch (error) {
    throw new Error(extractApiError(error, 'Item category update failed'));
  }
};

export const createExpense = async (expenseData) => {
  try {
    const response = await api.post('/expenses', expenseData);
    return response.data;
  } catch (error) {
    throw new Error(extractApiError(error, 'Failed to create expense'));
  }
};

export const updateExpense = async (id, updates) => {
  try {
    const response = await api.patch(`/expenses/${id}`, updates);
    return response.data;
  } catch (error) {
    throw new Error(extractApiError(error, 'Expense update failed'));
  }
};

export const updateExpenseItem = async (expenseId, itemIndex, updates) => {
  try {
    const response = await api.patch(`/expenses/${expenseId}/items/${itemIndex}`, updates);
    return response.data;
  } catch (error) {
    throw new Error(extractApiError(error, 'Item update failed'));
  }
};

export const deleteExpenseItem = async (expenseId, itemIndex) => {
  try {
    const response = await api.delete(`/expenses/${expenseId}/items/${itemIndex}`);
    return response.data;
  } catch (error) {
    throw new Error(extractApiError(error, 'Item delete failed'));
  }
};

export const requestCoachInsights = async ({ conversation = [], analysis }) => {
  try {
    const response = await api.post('/ai/coach', {
      conversation,
      analysis
    });
    return response.data;
  } catch (error) {
    throw new Error(extractApiError(error, 'Failed to generate AI coach response'));
  }
};

export const checkServerHealth = async () => {
  try {
    let healthUrl = '/api/health';
    if (process.env.NODE_ENV !== 'production') {
      if (typeof window !== 'undefined') {
        const hostname = window.location.hostname;
        if (hostname !== 'localhost' && hostname !== '127.0.0.1') {
          healthUrl = `http://${hostname}:5000/health`;
        } else {
          healthUrl = 'http://localhost:5000/health';
        }
      } else {
        healthUrl = 'http://localhost:5000/health';
      }
    }
    const response = await axios.get(healthUrl);
    return response.data;
  } catch (error) {
    throw new Error('Server is not responding');
  }
};

// Authentication API methods
export const signUp = async (email, password, fullName) => {
  try {
    const response = await api.post('/auth/signup', {
      email,
      password,
      fullName
    });
    return response.data;
  } catch (error) {
    throw new Error(extractApiError(error, 'Signup failed'));
  }
};

export const signIn = async (email, password) => {
  try {
    const response = await api.post('/auth/signin', {
      email,
      password
    });
    return response.data;
  } catch (error) {
    throw new Error(extractApiError(error, 'Login failed'));
  }
};

export const signOut = async () => {
  try {
    const response = await api.post('/auth/signout');
    return response.data;
  } catch (error) {
    console.warn('Signout API failed:', error);
    // Don't throw error - signout should always succeed locally
  }
};

export const learnCategoryCorrection = async (merchantName, description, category) => {
  try {
    const response = await api.post('/category-learning', {
      merchantName,
      description,
      category
    });
    return response.data;
  } catch (error) {
    console.warn('Category learning failed:', error);
    // Don't throw error - learning is a background operation
  }
};

// ============================================================
// INCOME AND SAVINGS API METHODS
// ============================================================

// Income Sources
export const getIncomeSources = async (month = null) => {
  try {
    const params = month ? { month } : {};
    const response = await api.get('/income-sources', { params });
    return response.data;
  } catch (error) {
    throw new Error(extractApiError(error, 'Failed to fetch income sources'));
  }
};

export const createIncomeSource = async (incomeData) => {
  try {
    const response = await api.post('/income-sources', incomeData);
    return response.data;
  } catch (error) {
    throw new Error(extractApiError(error, 'Failed to create income source'));
  }
};

export const updateIncomeSource = async (id, updates) => {
  try {
    const response = await api.patch(`/income-sources/${id}`, updates);
    return response.data;
  } catch (error) {
    throw new Error(extractApiError(error, 'Failed to update income source'));
  }
};

export const deleteIncomeSource = async (id) => {
  try {
    const response = await api.delete(`/income-sources/${id}`);
    return response.data;
  } catch (error) {
    throw new Error(extractApiError(error, 'Failed to delete income source'));
  }
};

// Extra Income
export const getExtraIncome = async (startDate = null, endDate = null) => {
  try {
    const params = {};
    if (startDate) params.startDate = startDate;
    if (endDate) params.endDate = endDate;
    const response = await api.get('/extra-income', { params });
    return response.data;
  } catch (error) {
    throw new Error(extractApiError(error, 'Failed to fetch extra income'));
  }
};

export const createExtraIncome = async (incomeData) => {
  try {
    const response = await api.post('/extra-income', incomeData);
    return response.data;
  } catch (error) {
    throw new Error(extractApiError(error, 'Failed to create extra income'));
  }
};

export const deleteExtraIncome = async (id) => {
  try {
    const response = await api.delete(`/extra-income/${id}`);
    return response.data;
  } catch (error) {
    throw new Error(extractApiError(error, 'Failed to delete extra income'));
  }
};

// Savings
export const getSavingsBalance = async () => {
  try {
    const response = await api.get('/savings/balance');
    return response.data;
  } catch (error) {
    throw new Error(extractApiError(error, 'Failed to fetch savings balance'));
  }
};

export const getSavingsTransactions = async (limit = 50, offset = 0) => {
  try {
    const response = await api.get('/savings/transactions', {
      params: { limit, offset }
    });
    return response.data;
  } catch (error) {
    throw new Error(extractApiError(error, 'Failed to fetch savings transactions'));
  }
};

export const createSavingsTransaction = async (transactionData) => {
  try {
    const response = await api.post('/savings/transactions', transactionData);
    return response.data;
  } catch (error) {
    throw new Error(extractApiError(error, 'Failed to create savings transaction'));
  }
};

// Savings Goals
export const getSavingsGoals = async (includeCompleted = false) => {
  try {
    const response = await api.get('/savings/goals', {
      params: { includeCompleted }
    });
    return response.data;
  } catch (error) {
    throw new Error(extractApiError(error, 'Failed to fetch savings goals'));
  }
};

export const createSavingsGoal = async (goalData) => {
  try {
    const response = await api.post('/savings/goals', goalData);
    return response.data;
  } catch (error) {
    throw new Error(extractApiError(error, 'Failed to create savings goal'));
  }
};

export const updateSavingsGoal = async (id, updates) => {
  try {
    const response = await api.patch(`/savings/goals/${id}`, updates);
    return response.data;
  } catch (error) {
    throw new Error(extractApiError(error, 'Failed to update savings goal'));
  }
};

export const deleteSavingsGoal = async (id) => {
  try {
    const response = await api.delete(`/savings/goals/${id}`);
    return response.data;
  } catch (error) {
    throw new Error(extractApiError(error, 'Failed to delete savings goal'));
  }
};

export default api;
