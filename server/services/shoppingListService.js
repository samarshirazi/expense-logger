/**
 * Shopping list + item operations, scoped to a household. All mutations
 * verify the actor is a member of the target household before proceeding.
 */

const { getAdminClient } = require('./supabaseAdmin');
const { requireMember } = require('./householdService');

function httpError(status, message) {
  const e = new Error(message);
  e.status = status;
  return e;
}

// ---------- lists ----------

async function listListsForHousehold(userId, householdId, { includeArchived = false } = {}) {
  await requireMember(householdId, userId);
  const sb = getAdminClient();
  let q = sb
    .from('shopping_lists')
    .select('*')
    .eq('household_id', householdId)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true });
  if (!includeArchived) q = q.eq('is_archived', false);
  const { data, error } = await q;
  if (error) throw error;

  // Tack on item counts
  const ids = (data || []).map((l) => l.id);
  if (ids.length === 0) return [];
  const { data: items } = await sb
    .from('shopping_list_items')
    .select('list_id, purchased')
    .in('list_id', ids);
  const counts = {};
  for (const it of items || []) {
    counts[it.list_id] = counts[it.list_id] || { total: 0, purchased: 0 };
    counts[it.list_id].total += 1;
    if (it.purchased) counts[it.list_id].purchased += 1;
  }
  return data.map((l) => ({
    ...l,
    item_count: counts[l.id]?.total || 0,
    purchased_count: counts[l.id]?.purchased || 0,
  }));
}

async function getListWithItems(userId, listId) {
  const sb = getAdminClient();
  const { data: list, error } = await sb
    .from('shopping_lists')
    .select('*')
    .eq('id', listId)
    .maybeSingle();
  if (error) throw error;
  if (!list) throw httpError(404, 'List not found');
  await requireMember(list.household_id, userId);

  const { data: items, error: iErr } = await sb
    .from('shopping_list_items')
    .select('*')
    .eq('list_id', listId)
    .order('purchased', { ascending: true })
    .order('created_at', { ascending: true });
  if (iErr) throw iErr;
  return { ...list, items: items || [] };
}

async function createList(userId, householdId, payload) {
  await requireMember(householdId, userId);
  if (!payload?.name?.trim()) throw httpError(400, 'name is required');
  const sb = getAdminClient();
  const { data, error } = await sb
    .from('shopping_lists')
    .insert({
      household_id: householdId,
      name: payload.name.trim(),
      store_name: payload.store_name || null,
      store_icon: payload.store_icon || null,
      sort_order: payload.sort_order ?? 0,
      created_by: userId,
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

async function updateList(userId, listId, patch) {
  const sb = getAdminClient();
  const { data: list, error } = await sb
    .from('shopping_lists')
    .select('household_id')
    .eq('id', listId)
    .maybeSingle();
  if (error) throw error;
  if (!list) throw httpError(404, 'List not found');
  await requireMember(list.household_id, userId);

  const allowed = {};
  for (const k of ['name', 'store_name', 'store_icon', 'is_archived', 'sort_order']) {
    if (k in patch) allowed[k] = patch[k];
  }
  if (Object.keys(allowed).length === 0) throw httpError(400, 'No valid fields to update');

  const { data, error: uErr } = await sb
    .from('shopping_lists')
    .update(allowed)
    .eq('id', listId)
    .select()
    .single();
  if (uErr) throw uErr;
  return data;
}

async function deleteList(userId, listId) {
  const sb = getAdminClient();
  const { data: list, error } = await sb
    .from('shopping_lists')
    .select('household_id')
    .eq('id', listId)
    .maybeSingle();
  if (error) throw error;
  if (!list) throw httpError(404, 'List not found');
  await requireMember(list.household_id, userId);

  const { error: dErr } = await sb.from('shopping_lists').delete().eq('id', listId);
  if (dErr) throw dErr;
  return true;
}

// ---------- items ----------

function sanitizeItem(input) {
  const out = {};
  if (typeof input.name === 'string' && input.name.trim()) out.name = input.name.trim();
  if (input.quantity !== undefined && input.quantity !== null) {
    const q = Number(input.quantity);
    if (!Number.isFinite(q) || q < 0) throw httpError(400, 'quantity must be a non-negative number');
    out.quantity = q;
  }
  if (typeof input.unit === 'string') out.unit = input.unit.trim() || null;
  if (typeof input.notes === 'string') out.notes = input.notes.trim() || null;
  if (input.price !== undefined && input.price !== null) {
    const p = Number(input.price);
    if (!Number.isFinite(p) || p < 0) throw httpError(400, 'price must be a non-negative number');
    out.price = p;
  }
  if (typeof input.planned_date === 'string') out.planned_date = input.planned_date || null;
  if (typeof input.source === 'string') out.source = input.source;
  if (typeof input.purchased === 'boolean') out.purchased = input.purchased;
  return out;
}

async function addItems(userId, listId, rawItems) {
  if (!Array.isArray(rawItems) || rawItems.length === 0) {
    throw httpError(400, 'items must be a non-empty array');
  }
  const sb = getAdminClient();
  const { data: list, error } = await sb
    .from('shopping_lists')
    .select('household_id')
    .eq('id', listId)
    .maybeSingle();
  if (error) throw error;
  if (!list) throw httpError(404, 'List not found');
  await requireMember(list.household_id, userId);

  const rows = rawItems.map((raw) => {
    const clean = sanitizeItem(raw);
    if (!clean.name) throw httpError(400, 'Each item needs a name');
    return {
      list_id: listId,
      household_id: list.household_id,
      added_by: userId,
      source: clean.source || 'manual',
      ...clean,
    };
  });

  const { data, error: iErr } = await sb
    .from('shopping_list_items')
    .insert(rows)
    .select();
  if (iErr) throw iErr;
  return data || [];
}

async function updateItem(userId, itemId, patch) {
  const sb = getAdminClient();
  const { data: item, error } = await sb
    .from('shopping_list_items')
    .select('household_id')
    .eq('id', itemId)
    .maybeSingle();
  if (error) throw error;
  if (!item) throw httpError(404, 'Item not found');
  await requireMember(item.household_id, userId);

  const clean = sanitizeItem(patch);
  if (Object.keys(clean).length === 0) throw httpError(400, 'No valid fields to update');

  // Track who/when checked off
  if (clean.purchased === true) {
    clean.purchased_at = new Date().toISOString();
    clean.purchased_by = userId;
  } else if (clean.purchased === false) {
    clean.purchased_at = null;
    clean.purchased_by = null;
  }

  const { data, error: uErr } = await sb
    .from('shopping_list_items')
    .update(clean)
    .eq('id', itemId)
    .select()
    .single();
  if (uErr) throw uErr;
  return data;
}

async function deleteItem(userId, itemId) {
  const sb = getAdminClient();
  const { data: item, error } = await sb
    .from('shopping_list_items')
    .select('household_id')
    .eq('id', itemId)
    .maybeSingle();
  if (error) throw error;
  if (!item) throw httpError(404, 'Item not found');
  await requireMember(item.household_id, userId);

  const { error: dErr } = await sb.from('shopping_list_items').delete().eq('id', itemId);
  if (dErr) throw dErr;
  return true;
}

module.exports = {
  listListsForHousehold,
  getListWithItems,
  createList,
  updateList,
  deleteList,
  addItems,
  updateItem,
  deleteItem,
};
