import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

export const supabase = supabaseUrl && supabaseAnonKey
  ? createClient(supabaseUrl, supabaseAnonKey)
  : null;

export interface RSVPData {
  full_name: string;
  email: string;
  phone?: string;
  guest_count: number;
  attending: boolean;
}

export async function submitRSVP(data: RSVPData): Promise<{ error?: string }> {
  if (!supabase) {
    console.log('Supabase not configured, RSVP data:', data);
    return {};
  }

  // Check for duplicate
  const { data: existing } = await supabase
    .from('rsvps')
    .select('id')
    .eq('email', data.email)
    .single();

  if (existing) {
    return { error: 'duplicate' };
  }

  const { error } = await supabase.from('rsvps').insert({
    full_name: data.full_name,
    email: data.email,
    phone: data.phone || null,
    guest_count: data.guest_count,
    attending: data.attending,
    created_at: new Date().toISOString(),
  });

  if (error) return { error: error.message };
  return {};
}
