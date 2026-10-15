'use strict';

const { randomBytes, randomUUID } = require('node:crypto');
const { configuration, requiredConfiguration, EmetError } = require('./emet-config');
const { createClient } = require('./emet-supabase');
const http = require('./emet-http');

const capabilities = ready => ({ authentication: ready, invitations: ready, profile: ready,
  businessData: false, googleCalendar: false, gmail: false, payments: false, eSignature: false });
const escape = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

async function authenticated(req, client) {
  const token = http.cookieValue(req, client.config, http.COOKIE.access);
  if (!token) throw new EmetError(401, 'authentication_required');
  const user = await client.auth('user', { token });
  if (!user?.id || !user.email) throw new EmetError(401, 'authentication_required');
  return { user, token };
}

async function account(client, auth) {
  const state = await client.rpc('emet_account_state', {}, auth.token);
  let avatarUrl = null;
  if (state.profile?.avatar_path) {
    try {
      const result = await client.request('/storage/v1/object/sign/emet-avatars/' + state.profile.avatar_path, {
        method: 'POST', token: auth.token, publicKey: true, data: { expiresIn: 300 }
      });
      if (result.signedURL?.startsWith('/object/sign/emet-avatars/')) avatarUrl = client.config.supabase + '/storage/v1' + result.signedURL;
    } catch { /* An unavailable avatar must not grant or block account access. */ }
  }
  return { user: { id: auth.user.id, email: auth.user.email, displayName: state.profile?.display_name || '', avatarUrl },
    memberships: state.memberships || [] };
}

async function mail(fetcher, config, { to, subject, text, id }) {
  let response, result;
  try {
    response = await fetcher('https://api.resend.com/emails', { method: 'POST', headers: {
      Authorization: `Bearer ${config.mailKey}`, 'Content-Type': 'application/json', 'Idempotency-Key': `emet-${id}`
    }, body: JSON.stringify({ from: config.from, to: [to], subject, text,
      html: `<div style="font-family:Arial,sans-serif;white-space:pre-wrap">${escape(text)}</div>` }),
    signal: AbortSignal.timeout(10000), redirect: 'error' });
    result = await response.json();
  } catch { return { status: 'failed' }; }
  return response.ok && typeof result.id === 'string' ? { status: 'accepted', providerId: result.id } : { status: 'failed' };
}

async function sendVerification(client, fetcher, userEmail, requestId, type = 'magiclink') {
  const generated = await client.auth('admin/generate_link', { method: 'POST', data: {
    type, email: userEmail, options: { redirectTo: client.config.origin + '/emet.html' }
  } });
  const tokenHash = generated.hashed_token || generated.properties?.hashed_token;
  if (typeof tokenHash !== 'string' || !/^[A-Za-z0-9_-]{20,512}$/.test(tokenHash)) throw new EmetError(502, 'verification_link_unavailable');
  const link = new URL('/emet.html', client.config.origin);
  link.hash = new URLSearchParams({ token_hash: tokenHash, type }).toString();
  return mail(fetcher, client.config, { to: userEmail, id: requestId, subject: type === 'recovery' ? 'Emet · Reset your password' : 'Emet · Verify your email',
    text: `${type === 'recovery' ? 'Reset your Emet password' : 'Verify your email for Emet'} using this one-time link:\n\n${link.href}\n\nThe link expires according to the configured Auth email-token lifetime. If you did not request it, ignore this email. Account access also requires organization approval.` });
}

async function registrationEmail(client, fetcher, userId, requestId) {
  const context = await client.rpc('emet_delivery_context', { p_user_id: userId, p_request_id: requestId });
  const results = { verification: 'failed', approval: 'failed' };
  for (const kind of ['verification', 'approval']) {
    const item = context[kind];
    if (!item) continue;
    try {
      const claimed = await client.rpc('emet_claim_email', { p_id: item.id });
      if (!claimed) { results[kind] = 'already_queued'; continue; }
      let result;
      if (kind === 'verification') result = await sendVerification(client, fetcher, context.user_email, item.id);
      else {
        const link = new URL('/emet.html', client.config.origin);
        link.search = new URLSearchParams({ view: 'approval', organizationId: context.organization_id, userId, requestId }).toString();
        result = await mail(fetcher, client.config, { to: context.manager_email, id: item.id,
          subject: `Emet · Approval requested for ${context.organization_name}`,
          text: `${context.display_name} (${context.user_email}) requested ${context.role} access to ${context.organization_name}${context.project_title ? ' · ' + context.project_title : ''}.\n\nSign in with your authorized manager account and review the request:\n${link.href}\n\nOpening this link does not approve anything. Approval requires an authenticated POST from the Emet account page.` });
      }
      results[kind] = result.status;
      await client.rpc('emet_finish_email', { p_id: item.id, p_sent: result.status === 'accepted', p_provider_id: result.providerId || null });
    } catch { results[kind] = 'failed'; }
  }
  return results;
}

async function lookupInvitation(client, code, userEmail, clientOnly = false) {
  return client.rpc('emet_invitation_preview', { p_token_hash: http.invitationHash(code), p_email: userEmail, p_client_only: clientOnly });
}

function handler(route, options = {}) {
  const fetcher = options.fetcher || globalThis.fetch;
  const env = options.env || process.env;
  return async function emetHandler(req, res) {
    try {
      http.method(req, res, route === 'status' ? ['GET'] : ['session', 'profile', 'approvals'].includes(route) ? ['GET', 'POST'] : ['POST']);
      if (route === 'status') {
        const config = configuration(env);
        if (!config.ready) return http.json(res, 503, { status: 'provisioning_required', platform: 'Emet', error: 'provisioning_required', capabilities: capabilities(false) });
        const client = createClient(config, fetcher);
        let schema;
        try { schema = await client.rpc('emet_capabilities'); } catch { throw new EmetError(503, 'provisioning_required'); }
        if (schema?.schema_version !== 1) throw new EmetError(503, 'provisioning_required');
        await http.rateLimit(req, client, 'status', 60);
        return http.json(res, 200, { status: 'ready', platform: 'Emet', csrfToken: http.csrf(req, res, config), capabilities: capabilities(true) });
      }
      const config = requiredConfiguration(env), client = createClient(config, fetcher);
      if (req.method === 'POST') http.requireCsrf(req, config);
      await http.rateLimit(req, client, route, route === 'session' ? 12 : 20);
      const input = req.method === 'POST' ? await http.body(req) : {};

      if (route === 'session') {
        if (req.method === 'GET') {
          const auth = await authenticated(req, client);
          return http.json(res, 200, { status: 'authenticated', csrfToken: http.csrf(req, res, config), ...await account(client, auth) });
        }
        http.fields(input, ['action', 'email', 'password']);
        if (input.action === 'logout') {
          const token = http.cookieValue(req, config, http.COOKIE.access);
          if (token) await client.auth('logout', { method: 'POST', token, allowedError: true });
          http.clearSession(res, config);
          return http.json(res, 200, { status: 'signed_out' });
        }
        let session;
        if (input.action === 'refresh') {
          const refresh = http.cookieValue(req, config, http.COOKIE.refresh);
          if (!refresh) throw new EmetError(401, 'authentication_required');
          session = await client.auth('token?grant_type=refresh_token', { method: 'POST', data: { refresh_token: refresh }, allowedError: true });
        } else if (input.action === 'login') {
          const userEmail = http.email(input.email);
          if (typeof input.password !== 'string' || input.password.length > 128 || !input.password.length) throw new EmetError(400, 'invalid_credentials');
          await http.rateLimit(req, client, 'login-email', 8, 900, userEmail);
          session = await client.auth('token?grant_type=password', { method: 'POST', data: { email: userEmail, password: input.password }, allowedError: true });
        } else throw new EmetError(400, 'invalid_action');
        if (session.error || !session.user?.email_confirmed_at) { http.clearSession(res, config); throw new EmetError(401, 'invalid_credentials_or_unverified_email'); }
        http.sessionCookies(res, config, session);
        return http.json(res, 200, { status: 'authenticated', csrfToken: http.csrf(req, res, config), ...await account(client, { user: session.user, token: session.access_token }) });
      }

      if (route === 'invitations') {
        if (input.action === 'accept') {
          http.fields(input, ['action', 'code']);
          const auth = await authenticated(req, client);
          const preview = await lookupInvitation(client, input.code, auth.user.email);
          await client.rpc('emet_consume_invitation', { p_token_hash: http.invitationHash(input.code), p_user_id: auth.user.id });
          const delivery = await registrationEmail(client, fetcher, auth.user.id, preview.invitation_id);
          return http.json(res, 202, { status: 'pending_manager_approval', requestId: preview.invitation_id, delivery });
        }
        if (input.action === 'preview') {
          http.fields(input, ['action', 'code', 'email']);
          const preview = await lookupInvitation(client, input.code, http.email(input.email));
          return http.json(res, 200, { status: 'invitation_available', invitation: {
            id: preview.invitation_id, organizationId: preview.organization_id, organizationName: preview.organization_name,
            role: preview.role, projectId: preview.project_id, projectTitle: preview.project_title, expiresAt: preview.expires_at
          } });
        }
        http.fields(input, ['action', 'organizationId', 'email', 'role', 'projectId', 'expiresHours']);
        if (input.action && input.action !== 'create') throw new EmetError(400, 'invalid_action');
        const auth = await authenticated(req, client), org = http.uuid(input.organizationId), userEmail = http.email(input.email);
        const role = input.role;
        if (!['admin', 'manager', 'office', 'crew', 'client'].includes(role)) throw new EmetError(400, 'invalid_role');
        const project = role === 'client' ? http.uuid(input.projectId) : null;
        if (role !== 'client' && input.projectId) throw new EmetError(400, 'unexpected_project');
        const hours = input.expiresHours === undefined ? 48 : input.expiresHours;
        if (!Number.isInteger(hours) || hours < 1 || hours > 168) throw new EmetError(400, 'invalid_expiration');
        const code = 'emt_' + randomBytes(32).toString('base64url');
        const invitation = await client.rpc('emet_create_invitation', { p_organization_id: org, p_email: userEmail,
          p_role: role, p_project_id: project, p_token_hash: http.hash(code), p_expires_hours: hours }, auth.token);
        if (!invitation?.id) throw new EmetError(502, 'invalid_database_response');
        return http.json(res, 201, { status: 'invitation_created', invitation, code, delivery: { status: 'not_sent' } });
      }

      if (route === 'register' || route === 'client-access') {
        http.fields(input, route === 'register' ? ['code', 'email', 'password', 'displayName'] : ['code', 'email']);
        const userEmail = http.email(input.email), digest = http.invitationHash(input.code);
        await http.rateLimit(req, client, 'registration-email', 3, 3600, userEmail);
        const preview = await lookupInvitation(client, input.code, userEmail, route === 'client-access');
        let userId = preview.existing_user_id;
        if (route === 'register') {
          http.password(input.password);
          if (typeof input.displayName !== 'string' || input.displayName.trim().length < 1 || input.displayName.trim().length > 100) throw new EmetError(400, 'invalid_display_name');
          if (userId) throw new EmetError(409, 'account_exists_sign_in', 'Sign in to your existing account before accepting another invitation.');
        }
        if (userId) {
          await client.rpc('emet_consume_invitation', { p_token_hash: digest, p_user_id: userId });
        } else {
          const user = await client.auth('admin/users', { method: 'POST', data: {
            email: userEmail, password: route === 'register' ? input.password : randomBytes(48).toString('base64url'), email_confirm: false,
            app_metadata: { emet_invitation_hash: digest }, user_metadata: { display_name: route === 'register' ? input.displayName.trim() : 'Client' }
          } });
          userId = user.id || user.user?.id;
          if (!userId) throw new EmetError(502, 'invalid_auth_response');
        }
        const delivery = await registrationEmail(client, fetcher, userId, preview.invitation_id);
        return http.json(res, 202, { status: 'pending_verification_and_approval', requestId: preview.invitation_id, delivery,
          message: 'Account access requires verified email and manager approval. Email API acceptance does not confirm inbox delivery.' });
      }

      if (route === 'verify') {
        http.fields(input, ['tokenHash', 'type', 'newPassword']);
        if (!['magiclink', 'recovery'].includes(input.type) || typeof input.tokenHash !== 'string' || !/^[A-Za-z0-9_-]{20,512}$/.test(input.tokenHash)) throw new EmetError(400, 'invalid_verification');
        if (input.type === 'recovery') http.password(input.newPassword);
        else if (input.newPassword !== undefined) throw new EmetError(400, 'unexpected_password');
        const session = await client.auth('verify', { method: 'POST', data: { token_hash: input.tokenHash, type: input.type }, allowedError: true });
        if (session.error || !session.user?.email_confirmed_at) throw new EmetError(400, 'verification_invalid_or_expired');
        if (input.type === 'recovery') {
          await client.auth('user', { method: 'PUT', token: session.access_token, data: { password: input.newPassword } });
          await client.auth('logout?scope=others', { method: 'POST', token: session.access_token });
        }
        http.sessionCookies(res, config, session);
        return http.json(res, 200, { status: 'email_verified', csrfToken: http.csrf(req, res, config), ...await account(client, { user: session.user, token: session.access_token }) });
      }

      if (route === 'approvals') {
        const auth = await authenticated(req, client);
        if (req.method === 'GET') {
          const org = http.uuid(new URL(req.url, config.origin).searchParams.get('organizationId'));
          return http.json(res, 200, { requests: await client.rpc('emet_pending_approvals', { p_organization_id: org }, auth.token) });
        }
        http.fields(input, ['organizationId', 'userId', 'requestId', 'decision']);
        if (!['approve', 'reject'].includes(input.decision)) throw new EmetError(400, 'invalid_decision');
        const result = await client.rpc('emet_review_access', { p_organization_id: http.uuid(input.organizationId), p_user_id: http.uuid(input.userId),
          p_request_id: http.uuid(input.requestId), p_decision: input.decision }, auth.token);
        return http.json(res, 200, { status: input.decision === 'approve' ? 'approved' : 'rejected', request: result });
      }

      if (route === 'profile') {
        const auth = await authenticated(req, client);
        if (req.method === 'POST') {
          http.fields(input, ['displayName', 'avatarPath']);
          if (typeof input.displayName !== 'string' || !input.displayName.trim() || input.displayName.length > 100) throw new EmetError(400, 'invalid_display_name');
          if (input.avatarPath !== undefined && input.avatarPath !== null && (typeof input.avatarPath !== 'string' || !new RegExp(`^${auth.user.id}/[a-f0-9-]{36}\\.(jpg|png|webp)$`).test(input.avatarPath))) throw new EmetError(400, 'invalid_avatar_path');
          await client.rpc('emet_update_profile', { p_display_name: input.displayName.trim(), p_avatar_path: input.avatarPath ?? null,
            p_set_avatar: input.avatarPath !== undefined }, auth.token);
        }
        return http.json(res, 200, { ...(req.method === 'POST' ? { status: 'profile_updated' } : {}), ...await account(client, auth) });
      }

      if (route === 'avatar') {
        http.fields(input, ['contentType']);
        const auth = await authenticated(req, client), extensions = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
        if (!extensions[input.contentType]) throw new EmetError(400, 'invalid_image_type');
        const avatarPath = `${auth.user.id}/${randomUUID()}.${extensions[input.contentType]}`;
        const upload = await client.request('/storage/v1/object/upload/sign/emet-avatars/' + avatarPath, { method: 'POST',
          token: auth.token, publicKey: true, data: { upsert: false } });
        if (!upload.url?.startsWith('/object/upload/sign/emet-avatars/')) throw new EmetError(502, 'invalid_storage_response');
        return http.json(res, 200, { status: 'upload_authorized', avatarPath, uploadUrl: config.supabase + '/storage/v1' + upload.url, maxBytes: 2097152, contentType: input.contentType });
      }

      if (route === 'credentials') {
        http.fields(input, ['currentPassword', 'newPassword', 'newEmail']);
        const auth = await authenticated(req, client);
        if (typeof input.currentPassword !== 'string' || input.currentPassword.length > 128 || !input.currentPassword) throw new EmetError(400, 'current_password_required');
        if ((input.newPassword === undefined) === (input.newEmail === undefined)) throw new EmetError(400, 'choose_one_credential_change');
        const reauth = await client.auth('token?grant_type=password', { method: 'POST', data: { email: auth.user.email, password: input.currentPassword }, allowedError: true });
        if (reauth.error || reauth.user?.id !== auth.user.id) throw new EmetError(401, 'current_password_invalid');
        const data = input.newPassword !== undefined ? { password: http.password(input.newPassword) } : { email: http.email(input.newEmail) };
        if (input.newEmail !== undefined && env.EMET_SECURE_EMAIL_CHANGE_CONFIGURED !== 'true') throw new EmetError(503, 'secure_email_change_setup_required');
        await client.auth('user', { method: 'PUT', token: reauth.access_token, data });
        if (input.newPassword !== undefined) await client.auth('logout?scope=others', { method: 'POST', token: reauth.access_token });
        http.sessionCookies(res, config, reauth);
        return http.json(res, 200, { status: input.newPassword !== undefined ? 'password_updated' : 'email_change_requested',
          message: input.newPassword !== undefined ? 'Password updated; other refresh sessions were revoked.' : 'Verify the email-change messages before the new address becomes active.' });
      }

      if (route === 'recovery') {
        http.fields(input, ['email']);
        const userEmail = http.email(input.email);
        await http.rateLimit(req, client, 'recovery-email', 3, 3600, userEmail);
        const existing = await client.rpc('emet_recovery_user', { p_email: userEmail });
        if (existing) { try { await sendVerification(client, fetcher, userEmail, randomUUID(), 'recovery'); } catch { /* Generic response prevents account enumeration. */ } }
        return http.json(res, 202, { status: 'recovery_requested_if_account_exists' });
      }
      throw new EmetError(404, 'not_found');
    } catch (error) {
      if (error.status === 429) res.setHeader('Retry-After', '60');
      const known = error instanceof EmetError;
      const code = known ? error.code : 'server_operation_failed';
      return http.json(res, known ? error.status : 500, { status: code === 'provisioning_required' ? 'provisioning_required' : 'error', error: code,
        ...(route === 'status' ? { platform: 'Emet', capabilities: capabilities(false) } : {}),
        message: known ? error.message : 'Account services could not complete this request.' });
    }
  };
}

module.exports = { handler };
