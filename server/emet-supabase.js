'use strict';

const { EmetError } = require('./emet-config');

function createClient(config, fetcher = globalThis.fetch) {
  async function request(path, { method = 'GET', data, token, publicKey = false, allowedError } = {}) {
    let response;
    try {
      response = await fetcher(config.supabase + path, { method, headers: {
        apikey: publicKey ? config.anonKey : config.serviceKey,
        Authorization: `Bearer ${token || (publicKey ? config.anonKey : config.serviceKey)}`,
        'Content-Type': 'application/json'
      }, ...(data === undefined ? {} : { body: JSON.stringify(data) }), signal: AbortSignal.timeout(10000), redirect: 'error' });
    } catch { throw new EmetError(503, 'provider_unavailable', 'Account services are temporarily unavailable.'); }
    let result;
    try { result = await response.json(); } catch { result = {}; }
    if (!response.ok) {
      if (allowedError) return { error: true, status: response.status };
      // Provider messages can contain PII; never echo arbitrary error text or response bodies.
      if (result.code === 'EM403' || response.status === 403) throw new EmetError(403, 'not_authorized');
      if (result.code === 'EM409') throw new EmetError(409, 'invitation_unavailable');
      if (result.code === 'EM400') throw new EmetError(400, 'invalid_request');
      if (response.status === 401) throw new EmetError(401, 'authentication_required');
      throw new EmetError(503, 'provider_operation_failed', 'Account services could not complete this request.');
    }
    return result;
  }
  return { config, request,
    rpc: (name, args = {}, token) => request('/rest/v1/rpc/' + name, { method: 'POST', data: args, token, publicKey: !!token }),
    auth: (path, options = {}) => request('/auth/v1/' + path, { publicKey: !path.startsWith('admin/'), ...options }) };
}

module.exports = { createClient };
