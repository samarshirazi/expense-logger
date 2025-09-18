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
    if (error.response) {
      const serverMessage = error.response.data?.error;
      const serverDetails = error.response.data?.details;
      const combinedMessage = [serverMessage, serverDetails]
        .filter(Boolean)
        .join(': ');

      throw new Error(combinedMessage || 'Upload failed');
    } else if (error.request) {
      throw new Error('Network error - please check your connection');
    } else {
      throw new Error('Upload failed');
    }
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
    if (error.response) {
      const serverMessage = error.response.data?.error;
      const serverDetails = error.response.data?.details;
      const combinedMessage = [serverMessage, serverDetails]
        .filter(Boolean)
        .join(': ');

      throw new Error(combinedMessage || 'Delete failed');
    } else if (error.request) {
      throw new Error('Network error - please check your connection');
    } else {
      throw new Error('Delete failed');
    }
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
    if (error.response) {
      const serverMessage = error.response.data?.error;
      const serverDetails = error.response.data?.details;
      const combinedMessage = [serverMessage, serverDetails]
        .filter(Boolean)
        .join(': ');

      throw new Error(combinedMessage || 'Signup failed');
    } else if (error.request) {
      throw new Error('Network error - please check your connection');
    } else {
      throw new Error('Signup failed');
    }
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
    if (error.response) {
      const serverMessage = error.response.data?.error;
      const serverDetails = error.response.data?.details;
      const combinedMessage = [serverMessage, serverDetails]
        .filter(Boolean)
        .join(': ');

      throw new Error(combinedMessage || 'Login failed');
    } else if (error.request) {
      throw new Error('Network error - please check your connection');
    } else {
      throw new Error('Login failed');
    }
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
