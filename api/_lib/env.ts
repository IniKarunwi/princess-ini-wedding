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

export function readEnv(): PlannerEnv {
  return {
    supabaseUrl: need('SUPABASE_URL').replace(/\/+$/, ''),
    serviceRoleKey: need('SUPABASE_SERVICE_ROLE_KEY'),
    pinHash: need('PLANNER_PIN_HASH'),
    sessionSecret: need('PLANNER_SESSION_SECRET'),
  };
}
