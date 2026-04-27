/**
 * Transactional email via Resend (https://resend.com).
 *
 * If RESEND_API_KEY is not set, sendInviteEmail() resolves successfully
 * but logs a warning — useful in dev. The invite code is still stored in
 * the DB so the admin can copy/share the link manually.
 */

let _resend = null;

function getResend() {
  if (_resend) return _resend;
  const key = process.env.RESEND_API_KEY;
  if (!key) return null;
  const { Resend } = require('resend');
  _resend = new Resend(key);
  return _resend;
}

function buildInviteUrl(code) {
  const base = process.env.APP_URL || 'http://localhost:3000';
  return `${base.replace(/\/$/, '')}/invite/${encodeURIComponent(code)}`;
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

async function sendInviteEmail({ to, householdName, inviterEmail, code, role }) {
  const resend = getResend();
  const url = buildInviteUrl(code);

  if (!resend) {
    console.warn(
      `⚠️  RESEND_API_KEY not set — invite email NOT sent to ${to}. ` +
      `Share this link manually: ${url}`
    );
    return { delivered: false, url };
  }

  const from = process.env.INVITE_FROM_EMAIL || 'invites@example.com';
  const safeHousehold = escapeHtml(householdName);
  const safeInviter = escapeHtml(inviterEmail || 'A teammate');
  const safeRole = escapeHtml(role);

  try {
    await resend.emails.send({
      from,
      to,
      subject: `You're invited to ${householdName} on Expense Logger`,
      html: `
        <div style="font-family:system-ui,sans-serif;max-width:520px;margin:0 auto;padding:24px;color:#222">
          <h2>You're invited to join "${safeHousehold}"</h2>
          <p>${safeInviter} invited you to join their household on Expense Logger as a <strong>${safeRole}</strong>.</p>
          <p>Click the button below to accept. The link expires in 7 days.</p>
          <p style="margin:24px 0">
            <a href="${url}" style="background:#2563eb;color:white;padding:12px 20px;border-radius:8px;text-decoration:none;display:inline-block">
              Accept invite
            </a>
          </p>
          <p style="color:#666;font-size:12px">
            Or paste this link into your browser:<br>${url}
          </p>
        </div>
      `,
    });
    console.log(`✉️  Invite email sent to ${to}`);
    return { delivered: true, url };
  } catch (err) {
    console.error('❌ Failed to send invite email:', err.message);
    return { delivered: false, url, error: err.message };
  }
}

module.exports = { sendInviteEmail, buildInviteUrl };
