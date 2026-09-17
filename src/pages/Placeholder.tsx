/**
 * A route that exists before its content does.
 *
 * /menu and /drinks will carry printed QR codes on the wedding tables, so the
 * URLs must resolve NOW — a QR is printed once and cannot be corrected on the
 * day. This page is what those codes point at until the real menus land.
 */
export default function Placeholder({ title }: { title: string }) {
  return (
    <main
      style={{
        minHeight: '100dvh', display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center', gap: '0.75rem',
        background: '#f6f1e4', color: '#1b4332', padding: '2rem',
        fontFamily: "Georgia, 'Times New Roman', serif", textAlign: 'center',
      }}
    >
      <p style={{
        margin: 0, fontSize: '0.7rem', letterSpacing: '0.2em',
        textTransform: 'uppercase', color: '#b8935a',
        fontFamily: 'Helvetica, Arial, sans-serif',
      }}>
        Princess &amp; IniOluwa
      </p>
      <h1 style={{ margin: 0, fontSize: '1.9rem', fontWeight: 400 }}>{title}</h1>
      <p style={{ margin: 0, color: '#6f6551', fontSize: '0.95rem' }}>
        This page is being built.
      </p>
      <p style={{ margin: 0, color: '#6f6551', fontSize: '0.8rem' }}>
        26 September 2026 &middot; Signature by Wells Carlton, Asokoro
      </p>
    </main>
  );
}
