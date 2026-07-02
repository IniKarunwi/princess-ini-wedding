import { createClient } from '@supabase/supabase-js';

const supabaseUrl     = import.meta.env.VITE_SUPABASE_URL     || '';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

export const supabase = supabaseUrl && supabaseAnonKey
  ? createClient(supabaseUrl, supabaseAnonKey)
  : null;

export interface RSVPData {
  full_name:            string;
  email:                string;
  phone?:               string | null;
  attending:            boolean;
  plus_one_requested:   boolean;
  plus_one_name?:       string | null;
  plus_one_relationship?: string | null;
}

export async function submitRSVP(data: RSVPData): Promise<{ error?: string }> {
  if (!supabase) {
    console.log('[RSVP] Supabase not configured, RSVP data:', data);
    return {};
  }

  // ── DEBUG ─────────────────────────────────────────────────────────────────
  console.log('[RSVP] Submitting payload:', JSON.stringify(data, null, 2));

  // Check for duplicate submission by email
  const { data: existing, error: dupError } = await supabase
    .from('rsvps')
    .select('id')
    .eq('email', data.email)
    .maybeSingle();

  console.log('[RSVP] Duplicate check result — data:', existing, '| error:', dupError);

  if (existing) {
    return { error: 'duplicate' };
  }

  const payload = {
    full_name:            data.full_name,
    email:                data.email,
    phone:                data.phone     || null,
    attending:            data.attending,
    guest_count:          0,
    plus_one_requested:   data.plus_one_requested,
    plus_one_name:        data.plus_one_name         || null,
    plus_one_relationship: data.plus_one_relationship || null,
    plus_one_status:      data.plus_one_requested ? 'pending' : null,
    created_at:           new Date().toISOString(),
  };

  console.log('[RSVP] Insert payload:', JSON.stringify(payload, null, 2));

  const { data: insertData, error } = await supabase.from('rsvps').insert(payload).select();

  console.log('[RSVP] Insert response — data:', insertData, '| error:', error);

  if (error) {
    console.error('[RSVP] Full Supabase error object:', JSON.stringify(error, null, 2));
    // Show an alert so the error is visible without digging into DevTools
    alert(`RSVP insert failed:\n\nCode: ${error.code}\nMessage: ${error.message}\nDetails: ${error.details}\nHint: ${error.hint}`);
    return { error: error.message };
  }

  return {};
}
