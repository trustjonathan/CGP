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