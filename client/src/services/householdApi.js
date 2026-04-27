/**
 * API helpers for households, members, invites, shopping lists, items.
 * Uses the same axios instance as apiService (which already injects Bearer
 * tokens via its request interceptor).
 */

import axios from 'axios';
import authService from './authService';

const api = axios.create({ baseURL: '/api', timeout: 60000 });

api.interceptors.request.use((config) => {
  const token = authService.getAccessToken();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

function unwrap(promise, fallback = 'Request failed') {
  return promise
    .then((r) => r.data)
    .catch((err) => {
      const msg = err?.response?.data?.error || err?.message || fallback;
      const e = new Error(msg);
      e.status = err?.response?.status;
      throw e;
    });
}

// ---------- Households ----------

export const listHouseholds = () => unwrap(api.get('/households'), 'Failed to load households');
export const createHousehold = (name) =>
  unwrap(api.post('/households', { name }), 'Failed to create household');
export const updateHousehold = (id, patch) =>
  unwrap(api.patch(`/households/${id}`, patch), 'Failed to update household');
export const deleteHousehold = (id) =>
  unwrap(api.delete(`/households/${id}`), 'Failed to delete household');

// ---------- Members ----------

export const listMembers = (householdId) =>
  unwrap(api.get(`/households/${householdId}/members`), 'Failed to load members');
export const updateMemberRole = (householdId, userId, role) =>
  unwrap(api.patch(`/households/${householdId}/members/${userId}`, { role }), 'Failed to update role');
export const removeMember = (householdId, userId) =>
  unwrap(api.delete(`/households/${householdId}/members/${userId}`), 'Failed to remove member');

// ---------- Invites ----------

export const listInvites = (householdId) =>
  unwrap(api.get(`/households/${householdId}/invites`), 'Failed to load invites');
export const createInvite = (householdId, { email, role = 'member' }) =>
  unwrap(api.post(`/households/${householdId}/invites`, { email, role }), 'Failed to send invite');
export const revokeInvite = (householdId, inviteId) =>
  unwrap(api.delete(`/households/${householdId}/invites/${inviteId}`), 'Failed to revoke invite');
export const previewInvite = (code) =>
  unwrap(api.get(`/invites/${encodeURIComponent(code)}`), 'Invite not found');
export const acceptInvite = (code) =>
  unwrap(api.post(`/invites/${encodeURIComponent(code)}/accept`), 'Failed to accept invite');

// ---------- Shopping lists ----------

const householdHeaders = (householdId) => ({ headers: { 'X-Household-Id': householdId } });

export const listShoppingLists = (householdId, { archived = false } = {}) =>
  unwrap(
    api.get(`/shopping-lists${archived ? '?archived=true' : ''}`, householdHeaders(householdId)),
    'Failed to load shopping lists'
  );

export const createShoppingList = (householdId, payload) =>
  unwrap(
    api.post('/shopping-lists', payload, householdHeaders(householdId)),
    'Failed to create list'
  );

export const getShoppingList = (listId) =>
  unwrap(api.get(`/shopping-lists/${listId}`), 'Failed to load list');

export const updateShoppingList = (listId, patch) =>
  unwrap(api.patch(`/shopping-lists/${listId}`, patch), 'Failed to update list');

export const deleteShoppingList = (listId) =>
  unwrap(api.delete(`/shopping-lists/${listId}`), 'Failed to delete list');

// ---------- Items ----------

export const addShoppingItems = (listId, items) =>
  unwrap(
    api.post(`/shopping-lists/${listId}/items`, { items: Array.isArray(items) ? items : [items] }),
    'Failed to add items'
  );

export const updateShoppingItem = (itemId, patch) =>
  unwrap(api.patch(`/shopping-list-items/${itemId}`, patch), 'Failed to update item');

export const deleteShoppingItem = (itemId) =>
  unwrap(api.delete(`/shopping-list-items/${itemId}`), 'Failed to delete item');

// ---------- Voice ----------

export const transcribeShoppingVoice = (householdId, audioBlob, filename = 'voice.webm') => {
  const fd = new FormData();
  fd.append('audio', audioBlob, filename);
  return unwrap(
    api.post('/shopping-lists/voice', fd, {
      headers: { 'X-Household-Id': householdId, 'Content-Type': 'multipart/form-data' },
    }),
    'Voice transcription failed'
  );
};

// ---------- In-store mode (push) ----------

export const setInStoreMode = ({ endpoint, active, listId }) =>
  unwrap(
    api.post('/push/in-store-mode', { endpoint, active, listId }),
    'Failed to update in-store mode'
  );
