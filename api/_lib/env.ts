/**
 * Server-only configuration.
 *
 * Nothing in api/ is ever bundled into the browser: Vercel builds these files
 * as Node functions, separately from the Vite build, and they are only
 * reachable over HTTP. That is what makes it safe to read the service-role
 * key here and nowhere else.
 *
 * Note the names have NO `VITE_` prefix, deliberately. Vite inlines every
 * `VITE_`-prefixed variable into the client bundle at build time, so a
 * service-role key named that way would be published on the first deploy.
 */

export interface PlannerEnv {
  supabaseUrl: string;
  serviceRoleKey: string;
  /** scrypt$N$r$p$saltB64$hashB64 — see scripts/seating/hash-pin.mjs */
  pinHash: string;
  /** HMAC key for session cookies. Rotating it logs everyone out. */
  sessionSecret: string;
}

export class ConfigError extends Error {}

const need = (name: string): string => {
  const v = process.env[name];
  if (!v) throw new ConfigError(`${name} is not set`);
  return v;
};

/**
 * Normalises SUPABASE_URL to the project origin.
 *
 * store.ts appends `/rest/v1/...`, so this must be the bare origin. Two
 * pastes are easy to make and both used to fail as an opaque 404: a trailing
 * slash, and the full REST base copied from the Supabase dashboard
 * ("https://x.supabase.co/rest/v1"). The second would have produced
 * ".../rest/v1/rest/v1/seating_layouts". Both are accepted and corrected
 * here, and anything that is not a URL at all is rejected by name.
 */
export function normaliseSupabaseUrl(raw: string): string {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    throw new ConfigError(`SUPABASE_URL is not a valid URL: "${raw.slice(0, 40)}"`);
  }
  // http is allowed for local stand-ins. What this is really guarding against
  // is a postgres:// connection string pasted in place of the project URL,
  // which is an easy mistake and would otherwise fail as an opaque fetch
  // error rather than as the configuration problem it is.
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new ConfigError(
      `SUPABASE_URL must be the project URL (https://<ref>.supabase.co), not ${url.protocol}//…`);
  }
  // Drop any path — /rest/v1, /rest/v1/, or a stray trailing slash.
  return `${url.protocol}//${url.host}`;
}

export function readEnv(): PlannerEnv {
  return {
    supabaseUrl: normaliseSupabaseUrl(need('SUPABASE_URL')),
    serviceRoleKey: need('SUPABASE_SERVICE_ROLE_KEY').trim(),
    pinHash: need('PLANNER_PIN_HASH').trim(),
    sessionSecret: need('PLANNER_SESSION_SECRET'),
  };
}

/** Just enough to reach Supabase. */
export interface StorageEnv {
  supabaseUrl: string;
  serviceRoleKey: string;
}

/**
 * Configuration for the guest camera.
 *
 * Deliberately NOT readEnv(). The camera needs the project URL and the
 * service-role key and nothing else — it has no PIN and no session. Calling
 * readEnv() here would make a guest's upload fail with "PLANNER_PIN_HASH is
 * not set" on a project where the planner simply is not configured, which is
 * a confusing way to couple two features that share nothing.
 */
export function readStorageEnv(): StorageEnv {
  return {
    supabaseUrl: normaliseSupabaseUrl(need('SUPABASE_URL')),
    serviceRoleKey: need('SUPABASE_SERVICE_ROLE_KEY').trim(),
  };
}
