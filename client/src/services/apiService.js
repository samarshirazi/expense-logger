import axios from 'axios';
import authService from './authService';

// Use relative path for production (works with Vercel), localhost for development
const API_BASE_URL = process.env.NODE_ENV === 'production'
  ? '/api'
  : 'http://localhost:5000/api';

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

// Add auth token to requests
api.interceptors.request.use(
  (config) => {
    const token = authService.getAccessToken();
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Handle auth errors
api.interceptors.response.use(
  (response) => response,
  (error) => {
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

export const checkServerHealth = async () => {
  try {
    const healthUrl = process.env.NODE_ENV === 'production'
      ? '/api/health'
      : 'http://localhost:5000/health';
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

export default api;
