'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { handler } = require('../server/emet-auth');

const ORG = '11111111-1111-4111-8111-111111111111';
const USER = '22222222-2222-4222-8222-222222222222';
const REQUEST = '33333333-3333-4333-8333-333333333333';
const PROJECT = '44444444-4444-4444-8444-444444444444';
const EMAIL_EVENT = '55555555-5555-4555-8555-555555555555';
const CSRF = 'c'.repeat(43);
const CODE = 'emt_' + 'k'.repeat(43);
const env = { EMET_AUTH_ENABLED: 'true', EMET_APP_ORIGIN: 'https://emet.example', SUPABASE_URL: 'https://test-project.supabase.co',
  SUPABASE_ANON_KEY: 'mock-public-key', SUPABASE_SERVICE_ROLE_KEY: 'mock-service-key-never-a-real-secret',
  EMET_RATE_LIMIT_SECRET: 'mock-rate-limit-secret-at-least-thirty-two-characters',
  RESEND_API_KEY: 'mock-mail-key', EMET_FROM_EMAIL: 'Emet <accounts@emet.example>' };
const user = { id: USER, email: 'new.user@example.test', email_confirmed_at: '2026-10-15T12:00:00Z' };
const session = { user, access_token: 'mock-access-token-private', refresh_token: 'mock-refresh-token-private', expires_in: 3600 };
const response = (status, data) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });

function network(override = () => undefined) {
  const calls = [];
  const fetcher = async (url, options = {}) => {
    const parsed = new URL(url), data = options.body ? JSON.parse(options.body) : undefined;
    const call = { path: parsed.pathname + parsed.search, origin: parsed.origin, options, data };
    calls.push(call);
    const custom = await override(call);
    if (custom !== undefined) return custom;
    if (parsed.origin === 'https://api.resend.com') return response(200, { id: 'mock-provider-message-id' });
    const rpc = parsed.pathname.split('/rpc/')[1];
    if (rpc === 'emet_capabilities') return response(200, { schema_version: 1 });
    if (rpc === 'emet_rate_limit') return response(200, true);
    if (rpc === 'emet_account_state') return response(200, { profile: { display_name: 'Test User', avatar_path: null },
      memberships: [{ organizationId: ORG, organizationName: 'Example Floors', role: 'office', status: 'pending_approval' }] });
    if (rpc === 'emet_create_invitation') return response(200, { id: REQUEST, organizationId: data.p_organization_id,
      email: data.p_email, role: data.p_role, projectId: data.p_project_id, expiresAt: '2026-10-17T12:00:00Z' });
    if (rpc === 'emet_invitation_preview') return response(200, { invitation_id: REQUEST, organization_id: ORG,
      organization_name: 'Example Floors', role: data.p_client_only ? 'client' : 'office', project_id: data.p_client_only ? PROJECT : null,
      project_title: data.p_client_only ? 'Flooring project' : null, expires_at: '2026-10-17T12:00:00Z', existing_user_id: null });
    if (rpc === 'emet_consume_invitation') return response(200, REQUEST);
    if (rpc === 'emet_delivery_context') return response(200, { user_email: user.email, display_name: 'Test User',
      organization_id: ORG, organization_name: 'Example Floors', manager_email: 'manager@example.test', role: 'office',
      verification: { id: EMAIL_EVENT, status: 'queued' }, approval: { id: REQUEST, status: 'queued' } });
    if (rpc === 'emet_claim_email') return response(200, true);
    if (rpc === 'emet_finish_email' || rpc === 'emet_update_profile') return response(200, null);
    if (rpc === 'emet_pending_approvals') return response(200, [{ requestId: REQUEST, organizationId: ORG, userId: USER, role: 'office', status: 'pending' }]);
    if (rpc === 'emet_review_access') return response(200, { requestId: REQUEST, membershipStatus: 'pending_email' });
    if (rpc === 'emet_recovery_user') return response(200, USER);
    if (call.path === '/auth/v1/user') return response(200, user);
    if (call.path.startsWith('/auth/v1/token?') || call.path === '/auth/v1/verify') return response(200, session);
    if (call.path === '/auth/v1/admin/users') return response(200, { ...user, email_confirmed_at: null });
    if (call.path === '/auth/v1/admin/generate_link') return response(200, { hashed_token: 'd'.repeat(64) });
    if (call.path.startsWith('/auth/v1/logout')) return response(200, {});
    if (call.path.startsWith('/storage/v1/object/upload/sign/')) return response(200, { url: '/object/upload/sign/emet-avatars/mock?token=single-upload-token' });
    throw new Error('Unexpected mocked request: ' + call.path);
  };
  return { fetcher, calls };
}

async function invoke(route, { method = 'POST', input = {}, config = env, authenticated = false,
  origin = env.EMET_APP_ORIGIN, csrf = CSRF, cookieCsrf = CSRF, override } = {}) {
  const net = network(override);
  const req = { method, url: '/api/emet/' + route, headers: { 'content-type': 'application/json', origin,
    ...(csrf ? { 'x-emet-csrf': csrf } : {}), cookie: `__Host-emet-csrf=${cookieCsrf}${authenticated ? '; __Host-emet-access=mock-current-token; __Host-emet-refresh=mock-refresh' : ''}` },
    body: input, socket: { remoteAddress: '127.0.0.1' } };
  const headers = {};
  let raw;
  const res = { statusCode: 200, setHeader: (name, value) => { headers[name] = value; }, getHeader: name => headers[name], end: text => { raw = text; } };
  await handler(route, { env: config, fetcher: net.fetcher })(req, res);
  return { status: res.statusCode, body: JSON.parse(raw), raw, headers, calls: net.calls };
}

test('missing activation/secrets returns 503 and makes no provider calls', async () => {
  const result = await invoke('status', { method: 'GET', config: {} });
  assert.equal(result.status, 503);
  assert.equal(result.body.status, 'provisioning_required');
  assert.ok(Object.values(result.body.capabilities).every(value => value === false));
  assert.equal(result.calls.length, 0);
  const registration = await invoke('register', { config: {}, input: { code: CODE } });
  assert.equal(registration.status, 503);
  assert.equal(registration.calls.length, 0);
});

test('configured health requires schema handshake and never marks business integrations ready', async () => {
  const result = await invoke('status', { method: 'GET' });
  assert.equal(result.status, 200);
  assert.equal(result.body.capabilities.authentication, true);
  for (const name of ['businessData', 'googleCalendar', 'gmail', 'payments', 'eSignature']) assert.equal(result.body.capabilities[name], false);
  assert.equal(result.headers['Cache-Control'], 'no-store');
  assert.equal(result.body.csrfToken, CSRF);
  const missingSchema = await invoke('status', { method: 'GET', override: call => call.path.endsWith('emet_capabilities') ? response(404, {}) : undefined });
  assert.equal(missingSchema.status, 503);
  assert.equal(missingSchema.body.status, 'provisioning_required');
});

test('all mutation routes reject GET approvals, foreign origin, missing CSRF, and malformed CSRF', async () => {
  const wrongMethod = await invoke('register', { method: 'GET' });
  assert.equal(wrongMethod.status, 405);
  assert.equal(wrongMethod.calls.length, 0);
  for (const input of [{ origin: 'https://attacker.example' }, { csrf: null }, { csrf: 'é'.repeat(43) }]) {
    const rejected = await invoke('approvals', { ...input, input: { organizationId: ORG, userId: USER, requestId: REQUEST, decision: 'approve' } });
    assert.equal(rejected.status, 403);
    assert.equal(rejected.calls.length, 0);
  }
  const get = await invoke('approvals', { method: 'GET', authenticated: true });
  assert.equal(get.status, 400); // No organization identifier; still no approval RPC.
  assert.ok(!get.calls.some(call => call.path.endsWith('emet_review_access')));
});

test('distributed limiter fails closed instead of falling back to process memory', async () => {
  const limited = await invoke('session', { input: { action: 'login', email: user.email, password: 'safe-test-password' },
    override: call => call.path.endsWith('emet_rate_limit') ? response(200, false) : undefined });
  assert.equal(limited.status, 429);
  assert.equal(limited.headers['Retry-After'], '60');
  assert.ok(!limited.calls.some(call => call.path.startsWith('/auth/')));
  const unavailable = await invoke('register', { override: call => call.path.endsWith('emet_rate_limit') ? response(503, {}) : undefined });
  assert.equal(unavailable.status, 503);
  assert.ok(!unavailable.calls.some(call => call.path.startsWith('/auth/')));
});

test('manager invitation returns a random one-time code; database receives only its hash', async () => {
  const input = { action: 'create', organizationId: ORG, email: 'Crew@Example.test', role: 'crew' };
  const first = await invoke('invitations', { authenticated: true, input });
  const second = await invoke('invitations', { authenticated: true, input });
  assert.equal(first.status, 201);
  assert.match(first.body.code, /^emt_[A-Za-z0-9_-]{43}$/);
  assert.notEqual(first.body.code, second.body.code);
  assert.equal(first.body.delivery.status, 'not_sent');
  const write = first.calls.find(call => call.path.endsWith('emet_create_invitation'));
  assert.match(write.data.p_token_hash, /^[a-f0-9]{64}$/);
  assert.ok(!JSON.stringify(write.data).includes(first.body.code));
  assert.equal(write.data.p_email, 'crew@example.test');
  assert.equal(write.options.headers.apikey, env.SUPABASE_ANON_KEY);
  assert.equal(write.options.headers.Authorization, 'Bearer mock-current-token');
});

test('unauthorized manager, owner role escalation, and cross-project requests cannot create invitations', async () => {
  const common = { action: 'create', organizationId: ORG, email: user.email, role: 'admin' };
  const denied = await invoke('invitations', { authenticated: true, input: common,
    override: call => call.path.endsWith('emet_create_invitation') ? response(403, { code: 'EM403', message: 'private database information' }) : undefined });
  assert.equal(denied.status, 403);
  assert.ok(!denied.raw.includes('private database information'));
  const owner = await invoke('invitations', { authenticated: true, input: { ...common, role: 'owner' } });
  assert.equal(owner.status, 400);
  const badProject = await invoke('invitations', { authenticated: true, input: { ...common, role: 'client' } });
  assert.equal(badProject.status, 400);
});

test('signup rejects self-selected role or organization before Auth account creation', async () => {
  for (const extra of [{ role: 'owner' }, { organizationId: ORG }, { isActive: true }]) {
    const result = await invoke('register', { input: { code: CODE, email: user.email, password: 'a-long-test-password', displayName: 'Test User', ...extra } });
    assert.equal(result.status, 400);
    assert.ok(!result.calls.some(call => call.path === '/auth/v1/admin/users'));
  }
});

test('registration passes trusted hashed invitation metadata and reports pending approval, without sessions', async () => {
  const result = await invoke('register', { input: { code: CODE, email: user.email, password: 'a-long-test-password', displayName: 'Test User' } });
  assert.equal(result.status, 202);
  assert.equal(result.body.status, 'pending_verification_and_approval');
  assert.equal(result.body.delivery.verification, 'accepted');
  assert.equal(result.body.delivery.approval, 'accepted');
  const create = result.calls.find(call => call.path === '/auth/v1/admin/users');
  assert.equal(create.data.email_confirm, false);
  assert.match(create.data.app_metadata.emet_invitation_hash, /^[a-f0-9]{64}$/);
  assert.equal(create.options.headers.apikey, env.SUPABASE_SERVICE_ROLE_KEY);
  assert.ok(!result.raw.includes('a-long-test-password'));
  assert.ok(!result.headers['Set-Cookie']);
  const emails = result.calls.filter(call => call.origin === 'https://api.resend.com');
  const verification = emails.find(call => call.data.subject.includes('Verify'));
  assert.match(verification.data.text, /https:\/\/emet\.example\/emet\.html#token_hash=/);
  assert.ok(!verification.data.text.includes('access_token='));
  const approval = emails.find(call => call.data.subject.includes('Approval'));
  assert.match(approval.data.text, /view=approval&organizationId=/);
  assert.match(approval.data.text, /requestId=/);
  assert.ok(!result.calls.some(call => call.path.endsWith('emet_review_access')));
});

test('invalid or consumed invitation creates no Auth user', async () => {
  const result = await invoke('register', { input: { code: CODE, email: user.email, password: 'a-long-test-password', displayName: 'Test' },
    override: call => call.path.endsWith('emet_invitation_preview') ? response(409, { code: 'EM409' }) : undefined });
  assert.equal(result.status, 409);
  assert.ok(!result.calls.some(call => call.path === '/auth/v1/admin/users'));
});

test('failed email API is recorded and never reported as sent or active', async () => {
  const result = await invoke('register', { input: { code: CODE, email: user.email, password: 'a-long-test-password', displayName: 'Test' },
    override: call => call.origin === 'https://api.resend.com' ? response(500, { message: 'provider secret details' }) : undefined });
  assert.equal(result.status, 202);
  assert.deepEqual(result.body.delivery, { verification: 'failed', approval: 'failed' });
  const records = result.calls.filter(call => call.path.endsWith('emet_finish_email'));
  assert.equal(records.length, 2);
  assert.ok(records.every(call => call.data.p_sent === false));
  assert.ok(!result.raw.includes('provider secret details'));
});

test('login verifies provider email and stores tokens only in Secure HttpOnly same-site cookies', async () => {
  const result = await invoke('session', { input: { action: 'login', email: user.email, password: 'a-long-test-password' } });
  assert.equal(result.status, 200);
  assert.equal(result.body.status, 'authenticated');
  assert.equal(result.body.memberships[0].status, 'pending_approval');
  assert.ok(result.headers['Set-Cookie'].every(value => value.includes('HttpOnly; SameSite=Strict') && value.includes('; Secure') && value.includes('Path=/')));
  assert.ok(!result.raw.includes(session.access_token));
  assert.ok(!result.raw.includes(session.refresh_token));
  assert.ok(!result.raw.includes(env.SUPABASE_SERVICE_ROLE_KEY));
  const unverified = await invoke('session', { input: { action: 'login', email: user.email, password: 'a-long-test-password' },
    override: call => call.path.startsWith('/auth/v1/token?') ? response(200, { ...session, user: { ...user, email_confirmed_at: null } }) : undefined });
  assert.equal(unverified.status, 401);
  assert.ok(unverified.headers['Set-Cookie'].every(value => value.includes('Max-Age=0')));
});

test('authenticated account exposes verified state and rejects unverified or currently banned users', async () => {
  const verified = await invoke('session', { method: 'GET', authenticated: true });
  assert.equal(verified.status, 200);
  assert.equal(verified.body.user.emailVerified, true);
  for (const change of [{ email_confirmed_at: null }, { banned_until: '2099-01-01T00:00:00Z' }]) {
    const denied = await invoke('profile', { method: 'GET', authenticated: true,
      override: call => call.path === '/auth/v1/user' ? response(200, { ...user, ...change }) : undefined });
    assert.equal(denied.status, 401);
    assert.ok(!denied.calls.some(call => call.path.endsWith('emet_account_state')));
  }
});

test('login and verification reject a currently banned identity without issuing session cookies', async () => {
  for (const route of ['session', 'verify']) {
    const result = await invoke(route, { input: route === 'session'
      ? { action: 'login', email: user.email, password: 'a-long-test-password' }
      : { tokenHash: 'd'.repeat(64), type: 'magiclink' },
      override: call => call.path.startsWith('/auth/v1/token?') || call.path === '/auth/v1/verify'
        ? response(200, { ...session, user: { ...user, banned_until: '2099-01-01T00:00:00Z' } }) : undefined });
    assert.equal(result.status, route === 'session' ? 401 : 400);
    assert.ok(!JSON.stringify(result.headers).includes(session.access_token));
    assert.ok(!result.calls.some(call => call.path.endsWith('emet_account_state')));
  }
});

test('client link requests are restricted to the invited project and return no bearer session', async () => {
  const result = await invoke('client-access', { input: { code: CODE, email: user.email } });
  assert.equal(result.status, 202);
  const preview = result.calls.find(call => call.path.endsWith('emet_invitation_preview'));
  assert.equal(preview.data.p_client_only, true);
  assert.ok(!result.raw.includes('access_token'));
  assert.ok(!result.headers['Set-Cookie']);
});

test('manager approval requires exact requestId and a verified authenticated session', async () => {
  const missingId = await invoke('approvals', { authenticated: true, input: { organizationId: ORG, userId: USER, decision: 'approve' } });
  assert.equal(missingId.status, 400);
  assert.ok(!missingId.calls.some(call => call.path.endsWith('emet_review_access')));
  const anonymous = await invoke('approvals', { input: { organizationId: ORG, userId: USER, requestId: REQUEST, decision: 'approve' } });
  assert.equal(anonymous.status, 401);
  const approved = await invoke('approvals', { authenticated: true, input: { organizationId: ORG, userId: USER, requestId: REQUEST, decision: 'approve' } });
  assert.equal(approved.status, 200);
  assert.equal(approved.body.request.membershipStatus, 'pending_email');
  assert.equal(approved.calls.find(call => call.path.endsWith('emet_review_access')).data.p_request_id, REQUEST);
});

test('email verification uses the provider proof and pending membership is never promoted in JavaScript', async () => {
  const result = await invoke('verify', { input: { type: 'magiclink', tokenHash: 'e'.repeat(64) } });
  assert.equal(result.status, 200);
  assert.equal(result.body.memberships[0].status, 'pending_approval');
  assert.ok(!result.raw.includes(session.access_token));
  assert.ok(!result.calls.some(call => call.path.endsWith('emet_review_access')));
  const invalid = await invoke('verify', { input: { type: 'magiclink', tokenHash: 'e'.repeat(64) },
    override: call => call.path === '/auth/v1/verify' ? response(400, {}) : undefined });
  assert.equal(invalid.status, 400);
  assert.ok(!invalid.headers['Set-Cookie']);
});

test('profile ignores authorization metadata and rejects avatars belonging to another account', async () => {
  const escalation = await invoke('profile', { authenticated: true, input: { displayName: 'Test', role: 'owner' } });
  assert.equal(escalation.status, 400);
  const badAvatar = await invoke('profile', { authenticated: true, input: { displayName: 'Test', avatarPath: `${PROJECT}/${REQUEST}.jpg` } });
  assert.equal(badAvatar.status, 400);
  const success = await invoke('profile', { authenticated: true, input: { displayName: 'Test User' } });
  assert.equal(success.status, 200);
  assert.equal(success.body.status, 'profile_updated');
  assert.equal(success.body.user.id, USER);
});

test('private avatar upload authorizes only a random own-user path and accepted image MIME', async () => {
  const result = await invoke('avatar', { authenticated: true, input: { contentType: 'image/jpeg' } });
  assert.equal(result.status, 200);
  assert.match(result.body.avatarPath, new RegExp(`^${USER}/[a-f0-9-]+\\.jpg$`));
  assert.equal(result.body.maxBytes, 2097152);
  assert.ok(!result.raw.includes(env.SUPABASE_SERVICE_ROLE_KEY));
  const svg = await invoke('avatar', { authenticated: true, input: { contentType: 'image/svg+xml' } });
  assert.equal(svg.status, 400);
});

test('password change requires current-password reauthentication for the same identity', async () => {
  const result = await invoke('credentials', { authenticated: true, input: { currentPassword: 'current-test-password', newPassword: 'new-long-test-password' } });
  assert.equal(result.status, 200);
  assert.equal(result.body.status, 'password_updated');
  assert.ok(result.calls.some(call => call.path === '/auth/v1/logout?scope=others'));
  assert.ok(!result.raw.includes('new-long-test-password'));
  const mismatch = await invoke('credentials', { authenticated: true, input: { currentPassword: 'bad-password', newPassword: 'new-long-test-password' },
    override: call => call.path.startsWith('/auth/v1/token?') ? response(200, { ...session, user: { ...user, id: PROJECT } }) : undefined });
  assert.equal(mismatch.status, 401);
});

test('email change fails closed until secure old/new-address confirmation is configured', async () => {
  const result = await invoke('credentials', { authenticated: true, input: { currentPassword: 'current-test-password', newEmail: 'other@example.test' } });
  assert.equal(result.status, 503);
  assert.equal(result.body.error, 'secure_email_change_setup_required');
  assert.ok(!result.calls.some(call => call.path === '/auth/v1/user' && call.options.method === 'PUT'));
});

test('password recovery always returns a generic result and never discloses a verification token', async () => {
  const existing = await invoke('recovery', { input: { email: user.email } });
  const absent = await invoke('recovery', { input: { email: 'unknown@example.test' }, override: call => call.path.endsWith('emet_recovery_user') ? response(200, null) : undefined });
  assert.equal(existing.status, 202);
  assert.deepEqual(existing.body, absent.body);
  assert.ok(!existing.raw.includes('token_hash'));
  assert.ok(!absent.calls.some(call => call.path === '/auth/v1/admin/generate_link'));
});
