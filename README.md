# Mirage

A playable 3D world that changes as you explore it.

## Run

```bash
pnpm install
pnpm dev
```

Open `http://localhost:3000` and enter the world.

## Play

Find three echoes. Each echo lets you remix the persistent 3D world. Complete
the world and share its deterministic seed.

The earlier LingBot experiment remains available at `/labs/lingbot`.

## Env

Required server-side env vars:

- `REACTOR_API_KEY`
- `STRIPE_SECRET_KEY`
- `STRIPE_PRICE_ID`
- `STRIPE_WEBHOOK_SECRET`
- `MIRAGE_SUPABASE_URL` or `SUPABASE_PROJECT_URL`
- `MIRAGE_SUPABASE_PUBLISHABLE_KEY` or `SUPABASE_PUBLISHABLE_KEY`
- `MIRAGE_DATABASE_URL`, `SUPABASE_POOLER_URL`, or `SUPABASE_DB_URL`

`app/api/reactor/token/route.ts` requires an authenticated user with an active
subscription before minting a short-lived Reactor JWT.
