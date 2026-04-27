/**
 * Household + member + invite operations.
 *
 * All functions take a `userId` (the actor) as the first argument and
 * enforce role checks before mutating. Reads are scoped to households the
 * user belongs to.
 */

const crypto = require('crypto');
const { getAdminClient } = require('./supabaseAdmin');

const INVITE_CODE_BYTES = 24;
const INVITE_TTL_DAYS = 7;

// ---------- helpers ----------

async function getMembership(householdId, userId) {
  const sb = getAdminClient();
  const { data, error } = await sb
    .from('household_members')
    .select('role')
    .eq('household_id', householdId)
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw error;
  return data; // { role } | null
}

async function requireMember(householdId, userId) {
  const m = await getMembership(householdId, userId);
  if (!m) throw httpError(403, 'Not a member of this household');
  return m;
}

async function requireAdmin(householdId, userId) {
  const m = await getMembership(householdId, userId);
  if (!m || m.role !== 'admin') throw httpError(403, 'Admin role required');
  return m;
}

function httpError(status, message) {
  const e = new Error(message);
  e.status = status;
  return e;
}

function generateInviteCode() {
  return crypto.randomBytes(INVITE_CODE_BYTES).toString('base64url');
}

// ---------- households ----------

async function listHouseholdsForUser(userId) {
  const sb = getAdminClient();
  const { data, error } = await sb
    .from('household_members')
    .select('role, joined_at, household:households(id, name, created_by, created_at)')
    .eq('user_id', userId);
  if (error) throw error;
  return (data || []).map((row) => ({
    ...row.household,
    role: row.role,
    joined_at: row.joined_at,
  }));
}

async function createHousehold(userId, name) {
  if (!name || !name.trim()) throw httpError(400, 'Household name is required');
  const sb = getAdminClient();

  const { data: household, error: hErr } = await sb
    .from('households')
    .insert({ name: name.trim(), created_by: userId })
    .select()
    .single();
  if (hErr) throw hErr;

  const { error: mErr } = await sb
    .from('household_members')
    .insert({
      household_id: household.id,
      user_id: userId,
      role: 'admin',
      invited_by: userId,
    });
  if (mErr) throw mErr;

  // Seed three default lists so the user has something to work with.
  const starter = [
    { name: 'Walmart', store_name: 'Walmart', store_icon: '🛒', sort_order: 0 },
    { name: 'Costco', store_name: 'Costco', store_icon: '📦', sort_order: 1 },
    { name: 'Local Grocery', store_name: 'Local Grocery', store_icon: '🥬', sort_order: 2 },
  ].map((l) => ({ ...l, household_id: household.id, created_by: userId }));
  await sb.from('shopping_lists').insert(starter);

  return { ...household, role: 'admin' };
}

async function updateHousehold(userId, householdId, patch) {
  await requireAdmin(householdId, userId);
  const allowed = {};
  if (typeof patch.name === 'string' && patch.name.trim()) {
    allowed.name = patch.name.trim();
  }
  if (Object.keys(allowed).length === 0) {
    throw httpError(400, 'No valid fields to update');
  }
  const sb = getAdminClient();
  const { data, error } = await sb
    .from('households')
    .update(allowed)
    .eq('id', householdId)
    .select()
    .single();
  if (error) throw error;
  return data;
}

async function deleteHousehold(userId, householdId) {
  await requireAdmin(householdId, userId);
  const sb = getAdminClient();
  const { error } = await sb.from('households').delete().eq('id', householdId);
  if (error) throw error;
  return true;
}

// ---------- members ----------

async function listMembers(userId, householdId) {
  await requireMember(householdId, userId);
  const sb = getAdminClient();
  const { data, error } = await sb
    .from('household_members')
    .select('user_id, role, joined_at, invited_by')
    .eq('household_id', householdId);
  if (error) throw error;

  // Enrich with auth user emails (admin-only path)
  const ids = (data || []).map((m) => m.user_id);
  let emailMap = {};
  if (ids.length) {
    const { data: users } = await sb.auth.admin.listUsers({ perPage: 200 });
    if (users && users.users) {
      const allowed = new Set(ids);
      for (const u of users.users) {
        if (allowed.has(u.id)) emailMap[u.id] = u.email;
      }
    }
  }
  return (data || []).map((m) => ({
    ...m,
    email: emailMap[m.user_id] || null,
  }));
}

async function updateMemberRole(userId, householdId, targetUserId, role) {
  await requireAdmin(householdId, userId);
  if (!['admin', 'member'].includes(role)) {
    throw httpError(400, 'role must be "admin" or "member"');
  }

  // Don't allow demoting the last admin.
  if (role !== 'admin') {
    const sb = getAdminClient();
    const { count } = await sb
      .from('household_members')
      .select('*', { count: 'exact', head: true })
      .eq('household_id', householdId)
      .eq('role', 'admin');
    const isTargetAdmin = (await getMembership(householdId, targetUserId))?.role === 'admin';
    if (isTargetAdmin && (count || 0) <= 1) {
      throw httpError(400, 'Cannot demote the last admin');
    }
  }

  const sb = getAdminClient();
  const { data, error } = await sb
    .from('household_members')
    .update({ role })
    .eq('household_id', householdId)
    .eq('user_id', targetUserId)
    .select()
    .single();
  if (error) throw error;
  return data;
}

async function removeMember(userId, householdId, targetUserId) {
  // Self-leave OR admin removing someone else
  if (userId !== targetUserId) {
    await requireAdmin(householdId, userId);
  } else {
    await requireMember(householdId, userId);
  }

  // Don't allow removing the last admin.
  const sb = getAdminClient();
  const target = await getMembership(householdId, targetUserId);
  if (!target) throw httpError(404, 'Member not found');
  if (target.role === 'admin') {
    const { count } = await sb
      .from('household_members')
      .select('*', { count: 'exact', head: true })
      .eq('household_id', householdId)
      .eq('role', 'admin');
    if ((count || 0) <= 1) {
      throw httpError(400, 'Cannot remove the last admin');
    }
  }

  const { error } = await sb
    .from('household_members')
    .delete()
    .eq('household_id', householdId)
    .eq('user_id', targetUserId);
  if (error) throw error;
  return true;
}

// ---------- invites ----------

async function listInvites(userId, householdId) {
  await requireAdmin(householdId, userId);
  const sb = getAdminClient();
  const { data, error } = await sb
    .from('household_invites')
    .select('id, email, role, code, expires_at, used_at, used_by, created_at')
    .eq('household_id', householdId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data || [];
}

async function createInvite(userId, householdId, email, role = 'member') {
  await requireAdmin(householdId, userId);
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw httpError(400, 'Valid email is required');
  }
  if (!['admin', 'member'].includes(role)) {
    throw httpError(400, 'role must be "admin" or "member"');
  }

  const sb = getAdminClient();

  // If the email is already a member, short-circuit.
  const { data: users } = await sb.auth.admin.listUsers({ perPage: 200 });
  const existing = users?.users?.find(
    (u) => u.email?.toLowerCase() === email.toLowerCase()
  );
  if (existing) {
    const m = await getMembership(householdId, existing.id);
    if (m) throw httpError(409, 'This user is already a member');
  }

  const code = generateInviteCode();
  const expiresAt = new Date(Date.now() + INVITE_TTL_DAYS * 86400_000);

  const { data, error } = await sb
    .from('household_invites')
    .insert({
      household_id: householdId,
      email: email.toLowerCase(),
      role,
      code,
      invited_by: userId,
      expires_at: expiresAt.toISOString(),
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

async function revokeInvite(userId, householdId, inviteId) {
  await requireAdmin(householdId, userId);
  const sb = getAdminClient();
  const { error } = await sb
    .from('household_invites')
    .delete()
    .eq('household_id', householdId)
    .eq('id', inviteId);
  if (error) throw error;
  return true;
}

async function previewInvite(code) {
  const sb = getAdminClient();
  const { data, error } = await sb
    .from('household_invites')
    .select('id, email, role, expires_at, used_at, household:households(id, name)')
    .eq('code', code)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw httpError(404, 'Invite not found');
  if (data.used_at) throw httpError(410, 'Invite already used');
  if (new Date(data.expires_at) < new Date()) throw httpError(410, 'Invite expired');
  return {
    email: data.email,
    role: data.role,
    household: data.household,
    expires_at: data.expires_at,
  };
}

async function acceptInvite(userId, userEmail, code) {
  const sb = getAdminClient();

  const { data: invite, error: fetchErr } = await sb
    .from('household_invites')
    .select('*')
    .eq('code', code)
    .maybeSingle();
  if (fetchErr) throw fetchErr;
  if (!invite) throw httpError(404, 'Invite not found');
  if (invite.used_at) throw httpError(410, 'Invite already used');
  if (new Date(invite.expires_at) < new Date()) throw httpError(410, 'Invite expired');
  if (
    userEmail &&
    invite.email.toLowerCase() !== userEmail.toLowerCase()
  ) {
    throw httpError(403, 'This invite was sent to a different email');
  }

  // Already a member? mark used and return household.
  const existing = await getMembership(invite.household_id, userId);
  if (existing) {
    await sb
      .from('household_invites')
      .update({ used_at: new Date().toISOString(), used_by: userId })
      .eq('id', invite.id);
    return { household_id: invite.household_id, role: existing.role, alreadyMember: true };
  }

  const { error: insErr } = await sb.from('household_members').insert({
    household_id: invite.household_id,
    user_id: userId,
    role: invite.role,
    invited_by: invite.invited_by,
  });
  if (insErr) throw insErr;

  await sb
    .from('household_invites')
    .update({ used_at: new Date().toISOString(), used_by: userId })
    .eq('id', invite.id);

  return { household_id: invite.household_id, role: invite.role, alreadyMember: false };
}

module.exports = {
  // households
  listHouseholdsForUser,
  createHousehold,
  updateHousehold,
  deleteHousehold,
  // members
  getMembership,
  requireMember,
  requireAdmin,
  listMembers,
  updateMemberRole,
  removeMember,
  // invites
  listInvites,
  createInvite,
  revokeInvite,
  previewInvite,
  acceptInvite,
};
