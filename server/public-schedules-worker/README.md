# Public Schedules Worker (Cloudflare Workers + D1)

This worker serves schedule APIs, auth APIs, and admin APIs for the Scheduler app.

## API

- `GET /healthz`
- `GET /api/schedules`
- `GET /api/schedules/:id`
- `POST /api/schedules`
- `PUT /api/schedules/:id`
- `DELETE /api/schedules/:id`
- `PATCH /api/schedules/:id/folder`
- `GET /api/folders/tree`
- `POST /api/folders`
- `DELETE /api/folders/:id`
- `PATCH /api/folders/:id/order`
- `POST /api/auth/register`
- `POST /api/auth/login`
- `GET /api/auth/me`
- `POST /api/auth/logout`
- `GET /api/admin/users`
- `POST /api/admin/users/:id/approve`
- `POST /api/admin/users/:id/reject`
- `POST /api/admin/users/:id/reset-password`

## Deployment Model

Staging and production are deployed with generated Wrangler configs.

- Source template: [wrangler.toml](./wrangler.toml)
- Generated config: `wrangler.generated.<staging|production>.<public|admin>.toml`
- Generator: `node scripts/cloudflare/render-wrangler-config.mjs`
- CI workflow: `.github/workflows/deploy-cloudflare.yml`

The repository now assumes:

- `staging` branch -> staging deploy
- `main` branch -> production deploy
- staging and production use different D1 databases
- public and admin workers are deployed separately

## Local Rendering Example

```bash
set DEPLOY_ENV=staging
set CLOUDFLARE_D1_DATABASE_ID=replace-with-staging-d1-id
set CLOUDFLARE_ALLOWED_ADMIN_EMAILS=admin@example.com
set CLOUDFLARE_WORKERS_SUBDOMAIN=your-subdomain
node scripts/cloudflare/render-wrangler-config.mjs --surface public
node scripts/cloudflare/render-wrangler-config.mjs --surface admin
```

## Required Runtime Secret

Set `PASSWORD_PEPPER` on both workers before using password auth in a real environment.

Example:

```bash
npx wrangler secret put PASSWORD_PEPPER --config server/public-schedules-worker/wrangler.generated.staging.public.toml
npx wrangler secret put PASSWORD_PEPPER --config server/public-schedules-worker/wrangler.generated.staging.admin.toml
```

## Database Setup

Apply the schema to each D1 database:

```bash
npx wrangler d1 execute <database-name> --file=server/public-schedules-worker/schema.sql --remote
```

Optional follow-up migrations live in `server/public-schedules-worker/migrations/`.

For the full staging-to-production setup, see `docs/CLOUDFLARE_STAGING_PRODUCTION.md`.
