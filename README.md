# Princess & IniOluwa — Wedding RSVP

An interactive, mobile-first wedding invitation and RSVP experience for the wedding of Princess & IniOluwa on **September 26, 2026** in Asokoro, Abuja.

## What it does

Guests land on an animated storybook-style digital invitation that walks through the story of the day — location reveal, venue preview, chair-claim interaction — before arriving at the RSVP form. Responses are stored in Supabase; duplicate submissions (same email) are detected gracefully.

**Screens**

1. Landing — illustrated invitation with names and date
2. Abuja reveal — "It's happening in Abuja"
3. Venue — wide-angle hall view
4. Chair — tap-to-RSVP interaction
5. RSVP decision — attending / not attending choice
6. RSVP form — name, email, phone (optional), guest count
7. Confirmation — confetti + calendar invite link
8. Regrets — warm send-off with registry link

## Stack

- **React 18 + TypeScript** via Vite
- **Framer Motion** — screen transitions and particle animations
- **Tailwind CSS** + shadcn/ui primitives
- **react-hook-form** + Zod — form validation
- **Supabase** — RSVP persistence (optional; app works without it)

## Getting started

```sh
npm install
npm run dev        # starts at http://localhost:8080
```

Visit `/wedding` to see the invitation flow.

## Environment variables

Create a `.env.local` file to enable Supabase persistence:

```
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
```

Without these the app runs in no-op mode — the RSVP form submits but nothing is saved.

## Supabase schema

```sql
create table rsvps (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  email text not null unique,
  phone text,
  guest_count integer not null default 1,
  attending boolean not null,
  created_at timestamptz not null default now()
);
```

## Build

```sh
npm run build      # output in dist/
npm run preview    # preview the production build locally
```
