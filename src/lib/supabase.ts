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
    console.warn('Supabase not configured — RSVP not saved.');
    return {};
  }

  // Check for duplicate submission by email
  const { data: existing } = await supabase
    .from('rsvps')
    .select('id')
    .eq('email', data.email)
    .maybeSingle();

  if (existing) {
    return { error: 'duplicate' };
  }

  const { error } = await supabase.from('rsvps').insert({
    full_name:             data.full_name,
    email:                 data.email,
    phone:                 data.phone     || null,
    attending:             data.attending,
    guest_count:           0,
    plus_one_requested:    data.plus_one_requested,
    plus_one_name:         data.plus_one_name         || null,
    plus_one_relationship: data.plus_one_relationship || null,
    plus_one_status:       data.plus_one_requested ? 'pending' : null,
    created_at:            new Date().toISOString(),
  });

  if (error) return { error: error.message };
  return {};
}
