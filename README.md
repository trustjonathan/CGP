# CGP

CGP is a React and TypeScript academic performance app built with Vite.

## Local development

```powershell
npm ci
npm run dev
```

Create a local `.env` from `.env.example` for environment-specific configuration. Never commit `.env` or Supabase service-role credentials.

## Render static site

- **Build command:** `npm ci && npm run build`
- **Publish directory:** `dist`
- Add the required `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` as Render environment variables when Supabase integration is enabled.
- Add a rewrite from `/*` to `/index.html` with status `200` so client-side routes resolve.

The web app is a client-rendered single-page application; Render serves its static build. Private database access must be enforced by Supabase Row Level Security, never by exposing a service-role key to the browser.

## Supabase database

Database changes live in `supabase/migrations`. The CGP records migration keeps CGPA records scoped to their authenticated owner, uses per-record server revisions for concurrent edits, and records conflicting edits for explicit resolution. Writes must use the `save_cgpa_record` RPC; authenticated clients have read-only table access.

Run migrations against a local Supabase stack before applying them to a hosted project. The hosted database must be accessible to the authorized project administrator. Never put database passwords, access tokens, or service-role keys in client code or commit them to Git.

## Supabase Auth setup

- Enable email/password sign-up in the Supabase project's Auth providers.
- Set the project's site URL to the deployed CGP origin.
- Add the local origin (for example, `http://localhost:5173`) and deployed CGP origin to the Auth redirect URL allowlist. Password-reset emails return to the site root.
- Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in the local `.env` and deployment environment. The browser uses only the anon/publishable key; never expose a service-role key.
- Apply the database migrations before using the signed-in workspace. The web app reads and writes CGPA records through Supabase and does not fall back to a browser database.

New accounts do not automatically import data from existing APK or EXE installations. Those clients need a later authenticated migration/update so users explicitly sign in and upload their own local records.