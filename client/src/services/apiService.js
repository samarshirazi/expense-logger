import axios from 'axios';

const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000/api';

const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 60000,
});

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

export const checkServerHealth = async () => {
  try {
    const response = await axios.get('/health');
    return response.data;
  } catch (error) {
    throw new Error('Server is not responding');
  }
};

export default api;
