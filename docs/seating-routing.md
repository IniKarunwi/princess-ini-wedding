# Why `vercel.json` looks like that

```json
{ "rewrites": [{ "source": "/((?!api/).*)", "destination": "/index.html" }] }
```

Vercel resolves a request in this order:

1. `headers`
2. `redirects`
3. **the filesystem** — the built static output *and* the Serverless Functions
   compiled from `api/`
4. `rewrites`

Two consequences the seating chart depends on:

**The catch-all cannot swallow assets.** `/assets/index-*.js` and `/email/*.jpg`
are real files, matched at step 3, so they are served as themselves. This is
also why it must be `rewrites` and never the legacy `routes` key: `routes` is
evaluated *before* the filesystem, and the same pattern there would return
`index.html` for the JavaScript bundle — a white page with a 200 status.
136 delivered invitation emails fetch `<site>/email/*`, so this is not
theoretical.

**The catch-all cannot swallow `/api`.** Functions are part of step 3, so
`/api/planner/login` reaches `api/planner/login.ts` before any rewrite is
considered. `(?!api/)` is therefore not what makes `/api` work — it is what
makes a *broken* `/api` visible. Without it, a deployment where the functions
failed to build would answer `/api/planner/draft` with `index.html` and a
200, and the browser would report a JSON parse error rather than a 404.

## Checking it on a real deployment

Push does not equal deployed, and deployed does not equal working. After a
deploy, from any machine:

```sh
S=https://princessandini.com

# The SPA deep link must still work — this is the route that 404'd once before.
curl -sI  "$S/seating-chart"            | head -1     # 200, and HTML

# The public chart. 200 with JSON, or 404 if migration 0009 has not run.
curl -s   "$S/api/seating/published"    | head -c 200

# Auth is required. Expect 401, NOT index.html.
curl -si  "$S/api/planner/draft"        | head -1     # HTTP/2 401

# Sign in. Expect 200 and a Set-Cookie with HttpOnly; Secure; SameSite=Lax.
curl -si -X POST "$S/api/planner/login" \
  -H 'content-type: application/json' \
  -d '{"pin":"0000","name":"Test"}'     | head -20    # 401 bad_pin with a wrong PIN

# A path under /api that does not exist must 404, not return the app.
curl -sI  "$S/api/nope"                 | head -1     # HTTP/2 404
```

If `/api/planner/draft` returns HTML, the functions did not deploy — check the
Vercel build log for the `api/` build step, not the front end's.
