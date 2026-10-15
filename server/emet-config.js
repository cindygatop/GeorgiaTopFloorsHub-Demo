'use strict';

class EmetError extends Error {
  constructor(status, code, message = code) { super(message); this.status = status; this.code = code; }
}

function configuration(env = process.env) {
  const missing = [];
  if (env.EMET_AUTH_ENABLED !== 'true') missing.push('activation');
  for (const name of ['SUPABASE_URL', 'SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY', 'EMET_APP_ORIGIN',
    'EMET_RATE_LIMIT_SECRET', 'RESEND_API_KEY', 'EMET_FROM_EMAIL']) {
    if (!env[name]) missing.push(name);
  }
  let origin, supabase;
  try {
    origin = new URL(env.EMET_APP_ORIGIN);
    const local = env.NODE_ENV !== 'production' && env.EMET_ALLOW_LOCAL_HTTP === 'true' && ['localhost', '127.0.0.1'].includes(origin.hostname);
    if (origin.origin !== env.EMET_APP_ORIGIN || (origin.protocol !== 'https:' && !local)) missing.push('valid_app_origin');
  } catch { missing.push('valid_app_origin'); }
  try {
    supabase = new URL(env.SUPABASE_URL);
    if (supabase.protocol !== 'https:' || supabase.username || supabase.password || supabase.pathname !== '/') missing.push('valid_supabase_url');
  } catch { missing.push('valid_supabase_url'); }
  if (String(env.EMET_RATE_LIMIT_SECRET || '').length < 32) missing.push('rate_limit_secret_length');
  if (/[\r\n]/.test(env.EMET_FROM_EMAIL || '')) missing.push('valid_sender');
  return { ready: missing.length === 0, missing, origin: origin?.origin, supabase: supabase?.origin,
    anonKey: env.SUPABASE_ANON_KEY, serviceKey: env.SUPABASE_SERVICE_ROLE_KEY,
    rateSecret: env.EMET_RATE_LIMIT_SECRET, mailKey: env.RESEND_API_KEY, from: env.EMET_FROM_EMAIL,
    secure: origin?.protocol === 'https:' };
}

function requiredConfiguration(env) {
  const config = configuration(env);
  if (!config.ready) throw new EmetError(503, 'provisioning_required', 'Secure account services are not configured.');
  return config;
}

module.exports = { EmetError, configuration, requiredConfiguration };
