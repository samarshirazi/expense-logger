import React, { useEffect, useState } from 'react';
import { useHousehold } from '../../contexts/HouseholdContext';
import {
  listMembers,
  updateMemberRole,
  removeMember,
  listInvites,
  createInvite,
  revokeInvite,
} from '../../services/householdApi';

export default function HouseholdMembers() {
  const { activeHousehold, activeHouseholdId, isAdmin } = useHousehold();
  const [members, setMembers] = useState([]);
  const [invites, setInvites] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState('member');
  const [inviting, setInviting] = useState(false);
  const [lastInviteUrl, setLastInviteUrl] = useState(null);

  async function refresh() {
    if (!activeHouseholdId) return;
    setLoading(true);
    setError(null);
    try {
      const [m, i] = await Promise.all([
        listMembers(activeHouseholdId),
        isAdmin ? listInvites(activeHouseholdId) : Promise.resolve([]),
      ]);
      setMembers(m);
      setInvites(i);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeHouseholdId]);

  async function handleInvite(e) {
    e.preventDefault();
    if (!inviteEmail.trim()) return;
    setInviting(true);
    setError(null);
    setLastInviteUrl(null);
    try {
      const res = await createInvite(activeHouseholdId, {
        email: inviteEmail.trim(),
        role: inviteRole,
      });
      setInvites((prev) => [res.invite, ...prev]);
      setInviteEmail('');
      if (!res.email_delivered) {
        setLastInviteUrl(res.url);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setInviting(false);
    }
  }

  async function handleRoleChange(member, role) {
    try {
      const updated = await updateMemberRole(activeHouseholdId, member.user_id, role);
      setMembers((prev) =>
        prev.map((m) => (m.user_id === member.user_id ? { ...m, ...updated } : m))
      );
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleRemove(member) {
    if (!window.confirm(`Remove ${member.email || member.user_id} from this household?`)) return;
    try {
      await removeMember(activeHouseholdId, member.user_id);
      setMembers((prev) => prev.filter((m) => m.user_id !== member.user_id));
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleRevoke(invite) {
    try {
      await revokeInvite(activeHouseholdId, invite.id);
      setInvites((prev) => prev.filter((i) => i.id !== invite.id));
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div className="household-members">
      <header className="members-header">
        <h2>Members of "{activeHousehold?.name || 'this household'}"</h2>
        <p className="muted">Admins manage the household; members add and check off items.</p>
      </header>

      {error && <div className="error-banner">{error}</div>}

      {isAdmin && (
        <section className="invite-section">
          <h3>Invite by email</h3>
          <form onSubmit={handleInvite} className="invite-form">
            <input
              type="email"
              placeholder="someone@example.com"
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              required
            />
            <select value={inviteRole} onChange={(e) => setInviteRole(e.target.value)}>
              <option value="member">Member</option>
              <option value="admin">Admin</option>
            </select>
            <button type="submit" className="primary" disabled={inviting || !inviteEmail.trim()}>
              {inviting ? 'Sending…' : 'Send invite'}
            </button>
          </form>
          {lastInviteUrl && (
            <p className="muted small">
              Email sending is not configured — share this link manually:&nbsp;
              <code>{lastInviteUrl}</code>
            </p>
          )}
        </section>
      )}

      <section className="members-section">
        <h3>People ({members.length})</h3>
        {loading && <p className="muted">Loading…</p>}
        <ul className="member-list">
          {members.map((m) => (
            <li key={m.user_id} className="member-row">
              <div className="member-info">
                <strong>{m.email || m.user_id}</strong>
                <span className={`role-badge ${m.role}`}>{m.role}</span>
              </div>
              {isAdmin && (
                <div className="member-actions">
                  {m.role !== 'admin' ? (
                    <button type="button" onClick={() => handleRoleChange(m, 'admin')}>
                      Promote to admin
                    </button>
                  ) : (
                    <button type="button" onClick={() => handleRoleChange(m, 'member')}>
                      Demote
                    </button>
                  )}
                  <button type="button" className="danger" onClick={() => handleRemove(m)}>
                    Remove
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      </section>

      {isAdmin && invites.filter((i) => !i.used_at).length > 0 && (
        <section className="invites-section">
          <h3>Pending invites</h3>
          <ul className="invite-list">
            {invites
              .filter((i) => !i.used_at)
              .map((i) => (
                <li key={i.id} className="invite-row">
                  <div>
                    <strong>{i.email}</strong>
                    <span className={`role-badge ${i.role}`}>{i.role}</span>
                    <span className="muted small">
                      &nbsp;expires {new Date(i.expires_at).toLocaleDateString()}
                    </span>
                  </div>
                  <button type="button" className="danger" onClick={() => handleRevoke(i)}>
                    Revoke
                  </button>
                </li>
              ))}
          </ul>
        </section>
      )}
    </div>
  );
}
