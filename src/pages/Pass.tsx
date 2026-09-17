/**
 * /pass/:token — a guest's wedding pass.
 *
 * Deliberately minimal for now: the route, the token plumbing and the security
 * boundary, with the visual design to follow.
 *
 * ── What this page must never become ───────────────────────────────────────
 * It resolves the token through an Edge Function, NEVER by querying Supabase
 * from the browser. The browser holds only the anon key, and after
 * 0007_wedding_day.sql the anon key can read nothing — which is the point. The
 * function runs with the service role server-side and returns only name, party
 * size and access. No email, no phone, no id, no tier internals.
 *
 * ── Why a guest cannot check themselves in ─────────────────────────────────
 * The QR on this page encodes this same URL. Scanning it opens this read-only
 * page. Check-in is a different call (checkin_by_token) that requires a staff
 * session, so a guest scanning their own code achieves nothing but looking at
 * their own pass.
 */
import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';

type Access = { joining: boolean; reception: boolean; afterParty: boolean };
type Pass = { full_name: string; party_size: number; plus_one_name?: string | null; access: Access };

const FN_BASE = import.meta.env.VITE_SUPABASE_URL
  ? `${import.meta.env.VITE_SUPABASE_URL}/functions/v1`
  : '';

export default function PassPage() {
  const { token = '' } = useParams();
  const [state, setState] = useState<'loading' | 'ok' | 'invalid' | 'error'>('loading');
  const [pass, setPass] = useState<Pass | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!FN_BASE) { if (!cancelled) setState('error'); return; }
      try {
        const r = await fetch(`${FN_BASE}/resolve-pass`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ token }),
        });
        const body = await r.json();
        if (cancelled) return;
        if (!r.ok || !body?.ok) { setState('invalid'); return; }
        setPass(body.pass); setState('ok');
      } catch {
        // Venue wifi. Distinguished from "invalid" so a guest is not told
        // their real pass is fake because the network dropped.
        if (!cancelled) setState('error');
      }
    })();
    return () => { cancelled = true; };
  }, [token]);

  const shell = (children: React.ReactNode) => (
    <main style={{
      minHeight: '100dvh', display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center', gap: '0.6rem',
      background: '#f6f1e4', color: '#1b4332', padding: '2rem',
      fontFamily: "Georgia, 'Times New Roman', serif", textAlign: 'center',
    }}>{children}</main>
  );

  if (state === 'loading') return shell(<p style={{ color: '#6f6551' }}>Loading your pass…</p>);
  if (state === 'error')   return shell(<>
    <p style={{ margin: 0 }}>We couldn&rsquo;t load your pass.</p>
    <p style={{ margin: 0, color: '#6f6551', fontSize: '0.9rem' }}>
      Check your connection and try again — your pass is still valid.
    </p>
  </>);
  if (state === 'invalid') return shell(<>
    <p style={{ margin: 0 }}>This pass link isn&rsquo;t valid.</p>
    <p style={{ margin: 0, color: '#6f6551', fontSize: '0.9rem' }}>
      Please use the link from your email, or find us at the entrance.
    </p>
  </>);

  const p = pass!;
  const rows: [string, boolean][] = [
    ['Wedding Service', p.access.joining],
    ['Wedding Reception', p.access.reception],
    ['After Party', p.access.afterParty],
  ];

  return shell(<>
    <p style={{ margin: 0, fontSize: '0.7rem', letterSpacing: '0.2em', textTransform: 'uppercase',
                color: '#b8935a', fontFamily: 'Helvetica, Arial, sans-serif' }}>
      Princess &amp; IniOluwa
    </p>
    <h1 style={{ margin: '0.2rem 0 0', fontSize: '1.7rem', fontWeight: 400 }}>{p.full_name}</h1>
    <p style={{ margin: 0, fontSize: '0.7rem', letterSpacing: '0.18em', textTransform: 'uppercase',
                color: '#6f6551', fontFamily: 'Helvetica, Arial, sans-serif' }}>
      Registered guest
    </p>
    <p style={{ margin: '0.4rem 0 0', color: '#6f6551' }}>
      Party size: {p.party_size}{p.plus_one_name ? ` · with ${p.plus_one_name}` : ''}
    </p>

    <div style={{ marginTop: '1rem', minWidth: 230, textAlign: 'left' }}>
      <p style={{ margin: '0 0 0.4rem', fontSize: '0.65rem', letterSpacing: '0.2em',
                  textTransform: 'uppercase', color: '#b8935a',
                  fontFamily: 'Helvetica, Arial, sans-serif' }}>Access</p>
      {rows.map(([label, yes]) => (
        <div key={label} style={{
          display: 'flex', justifyContent: 'space-between', padding: '0.35rem 0',
          borderBottom: '1px solid #d8cdb2',
          color: yes ? '#1b4332' : '#b3ab97',
        }}>
          <span>{label}</span><span>{yes ? '✓' : '—'}</span>
        </div>
      ))}
    </div>

    {/* The QR renders here once the pass design lands. It will encode this
        page's own URL, which is why nothing private may ever appear on it. */}
    <p style={{ marginTop: '1.25rem', color: '#6f6551', fontSize: '0.8rem' }}>
      Your QR code will appear here — show this page at the entrance.
    </p>
  </>);
}
