/**
 * The registry, on a URL of its own.
 *
 * The same <Registry> the RSVP flow shows — not a copy of it, so the account
 * details live in exactly one file and can never drift apart. All this page
 * adds is the thing the component expects and the RSVP flow used to provide:
 * a positioned, full-height backdrop for its `absolute inset-0` sheet.
 *
 * Deliberately not linked from the site navigation and marked noindex: the
 * page carries real account numbers, so it is a page you arrive at from the
 * couple's signature, not one a search engine hands to a stranger.
 */

import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import Registry from '@/components/wedding/Registry';
import { C, F } from '@/lib/design';

export default function RegistryPage() {
  useEffect(() => {
    const prevTitle = document.title;
    document.title = 'Registry · Princess & IniOluwa';

    const meta = document.createElement('meta');
    meta.name = 'robots';
    meta.content = 'noindex, nofollow';
    document.head.appendChild(meta);

    return () => {
      document.title = prevTitle;
      meta.remove();
    };
  }, []);

  return (
    <main style={{
      position: 'relative', minHeight: '100dvh', background: C.green,
      overflow: 'hidden', display: 'flex', justifyContent: 'center',
    }}>
      {/* The same 520px frame the RSVP flow gives it. The sheet is composed
          for a phone; left to fill a desktop window its hero images stretch
          to several hundred pixels tall and the whole thing falls apart. */}
      <div style={{ position: 'relative', width: '100%', maxWidth: 520, height: '100dvh' }}>
        <Registry />
      </div>

      {/* Sits above the sheet so there is always a way back to the letter. */}
      <Link
        to="/"
        style={{
          position: 'absolute', top: '1.25rem', left: '1.25rem', zIndex: 10,
          fontFamily: F.sans, fontSize: '0.66rem', fontWeight: 500,
          letterSpacing: '0.24em', textTransform: 'uppercase',
          color: C.onDark, textDecoration: 'none', opacity: 0.85,
        }}
      >
        &larr; Home
      </Link>
    </main>
  );
}
