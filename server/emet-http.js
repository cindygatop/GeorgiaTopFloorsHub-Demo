'use strict';

const { randomBytes, timingSafeEqual, createHash, createHmac } = require('node:crypto');
const { EmetError } = require('./emet-config');
const COOKIE = { access: '__Host-emet-access', refresh: '__Host-emet-refresh', csrf: '__Host-emet-csrf' };
const hash = value => createHash('sha256').update(value).digest('hex');

function cookies(req) {
  const result = {};
  for (const entry of String(req.headers.cookie || '').split(';')) {
    const at = entry.indexOf('=');
    if (at > 0) { try { result[entry.slice(0, at).trim()] = decodeURIComponent(entry.slice(at + 1)); } catch { /* Invalid cookies are ignored. */ } }
  }
  return result;
}

function setCookie(res, config, name, value, maxAge) {
  const current = res.getHeader('Set-Cookie') || [];
  // Production cookies always use Secure and the __Host prefix. Local HTTP is a separate explicit setup.
  const cookieName = config.secure ? name : name.replace('__Host-', '');
  const valueString = `${cookieName}=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${config.secure ? '; Secure' : ''}`;
  res.setHeader('Set-Cookie', [...(Array.isArray(current) ? current : [current]), valueString]);
}

function cookieValue(req, config, name) { return cookies(req)[config.secure ? name : name.replace('__Host-', '')]; }
function csrf(req, res, config) {
  let token = cookieValue(req, config, COOKIE.csrf);
  if (!/^[A-Za-z0-9_-]{43}$/.test(token || '')) { token = randomBytes(32).toString('base64url'); setCookie(res, config, COOKIE.csrf, token, 3600); }
  return token;
}
function requireCsrf(req, config) {
  if (req.headers.origin !== config.origin || (req.headers['sec-fetch-site'] && !['same-origin', 'none'].includes(req.headers['sec-fetch-site']))) {
    throw new EmetError(403, 'origin_rejected', 'Open this form from the Emet website.');
  }
  const expected = cookieValue(req, config, COOKIE.csrf), actual = req.headers['x-emet-csrf'];
  if (typeof actual !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(actual) || !/^[A-Za-z0-9_-]{43}$/.test(expected || '') || !timingSafeEqual(Buffer.from(actual), Buffer.from(expected))) {
    throw new EmetError(403, 'csrf_rejected', 'Reload the account page and try again.');
  }
}

function sessionCookies(res, config, session) {
  if (!session?.access_token || !session?.refresh_token) throw new EmetError(502, 'invalid_auth_response');
  setCookie(res, config, COOKIE.access, session.access_token, Math.min(Number(session.expires_in) || 3600, 3600));
  setCookie(res, config, COOKIE.refresh, session.refresh_token, 60 * 60 * 24 * 30);
}
function clearSession(res, config) { setCookie(res, config, COOKIE.access, '', 0); setCookie(res, config, COOKIE.refresh, '', 0); }

function headers(res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Vary', 'Cookie, Origin');
}
function json(res, status, data) { headers(res); res.statusCode = status; res.end(JSON.stringify(data)); }
function method(req, res, allowed) {
  if (!allowed.includes(req.method)) { res.setHeader('Allow', allowed.join(', ')); throw new EmetError(405, 'method_not_allowed'); }
}

async function body(req) {
  if (!/^application\/json(?:\s*;|$)/i.test(req.headers['content-type'] || '')) throw new EmetError(415, 'json_required');
  if (Number(req.headers['content-length']) > 8192) throw new EmetError(413, 'body_too_large');
  let value = req.body;
  if (value === undefined) {
    let raw = '';
    for await (const chunk of req) { raw += chunk; if (Buffer.byteLength(raw) > 8192) throw new EmetError(413, 'body_too_large'); }
    value = raw;
  }
  if (typeof value === 'string' || Buffer.isBuffer(value)) {
    if (Buffer.byteLength(value) > 8192) throw new EmetError(413, 'body_too_large');
    try { value = JSON.parse(String(value)); } catch { throw new EmetError(400, 'invalid_json'); }
  }
  if (!value || typeof value !== 'object' || Array.isArray(value) || Buffer.byteLength(JSON.stringify(value)) > 8192) throw new EmetError(400, 'invalid_body');
  return value;
}
function fields(value, allowed) { if (Object.keys(value).some(key => !allowed.includes(key))) throw new EmetError(400, 'unexpected_field'); }
function email(value) { if (typeof value !== 'string' || value.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim())) throw new EmetError(400, 'invalid_email'); return value.trim().toLowerCase(); }
function password(value) { if (typeof value !== 'string' || value.length < 12 || value.length > 128) throw new EmetError(400, 'password_length', 'Use a password between 12 and 128 characters.'); return value; }
function uuid(value) { if (typeof value !== 'string' || !/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(value)) throw new EmetError(400, 'invalid_identifier'); return value; }
function invitationHash(value) { if (typeof value !== 'string' || !/^emt_[A-Za-z0-9_-]{43}$/.test(value)) throw new EmetError(400, 'invalid_invitation'); return hash(value); }

async function rateLimit(req, client, action, limit = 20, windowSeconds = 60, identifier) {
  const trustedAddress = process.env.VERCEL === '1' ? req.headers['x-vercel-forwarded-for'] : req.socket?.remoteAddress;
  const address = typeof trustedAddress === 'string' ? trustedAddress.split(',')[0].trim() : 'unknown';
  const key = createHmac('sha256', client.config.rateSecret).update(`${action}:${identifier || address}`).digest('hex');
  const allowed = await client.rpc('emet_rate_limit', { p_key: key, p_limit: limit, p_window_seconds: windowSeconds });
  if (allowed !== true) throw new EmetError(429, 'rate_limited', 'Too many attempts. Please try again later.');
}

module.exports = { COOKIE, hash, cookieValue, csrf, requireCsrf, sessionCookies, clearSession, json, method, body, fields, email, password, uuid, invitationHash, rateLimit };
