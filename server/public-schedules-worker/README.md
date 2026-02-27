# Public Schedules Worker (Cloudflare Workers + D1)

This worker provides schedule APIs (read/write), auth APIs, and optional admin-only APIs.

## API

- `GET /api/schedules`
- `GET /api/schedules/:id`
- `POST /api/schedules` (write)
- `PUT /api/schedules/:id` (write)
- `PATCH /api/schedules/:id/folder` (write)
- `GET /api/folders/tree`
- `POST /api/folders` (write)
- `DELETE /api/folders/:id` (write)

## Environment Variables

`[vars]`

- `READ_ONLY_MODE=1|0`
- `REQUIRE_ACCESS_EMAIL=1|0`
- `ALLOWED_ADMIN_EMAILS` (comma-separated)
- `CORS_ALLOWED_ORIGINS` (comma-separated, supports `*` wildcard rules)
- `SHARED_SCHEDULE_ID` (optional; if set, create is blocked and only that ID can be updated)
- `ALLOWED_FROM_DOMAIN` (ex: `hanlim.com`)
- `ENABLE_ADMIN_ENDPOINTS=1|0` (enable/disable `/api/admin/*` and folder-admin write endpoints)

`secrets`

- `PASSWORD_PEPPER` (recommended)

## Write Access Rules

Write requests are blocked when:

1. `READ_ONLY_MODE=1`
2. Authenticated user is missing
3. Authenticated user is not approved (`status !== approved`)

Admin endpoints (`/api/admin/*`, `/api/folders` POST/DELETE, `/api/schedules/:id/folder`) additionally require:

1. `ENABLE_ADMIN_ENDPOINTS=1`
2. Authenticated admin user (email in `ALLOWED_ADMIN_EMAILS`)
3. If `REQUIRE_ACCESS_EMAIL=1`, `CF-Access-Authenticated-User-Email` must exist and match the authenticated user

When `SHARED_SCHEDULE_ID` is set:

- `POST /api/schedules` is blocked
- `PUT /api/schedules/:id` and `PATCH /api/schedules/:id/folder` only allow that ID
- `GET /api/schedules` returns only the shared schedule entry

## First Deployment

1. Install/login Wrangler

```bash
npm.cmd i -g wrangler
wrangler.cmd login
```

2. Create D1 (once)

```bash
wrangler.cmd d1 create hl-scheduler
```

3. Put `database_id` in `wrangler.toml`

4. Apply schema

```bash
wrangler.cmd d1 execute hl-scheduler --file=./schema.sql --remote
```

5. Set secrets (recommended)

```bash
wrangler.cmd secret put PASSWORD_PEPPER
```

6. Deploy

```bash
wrangler.cmd deploy
```

## Recommended Free-Plan Topology

- Public Worker: `READ_ONLY_MODE=0`, `ENABLE_ADMIN_ENDPOINTS=0`
- Admin Worker: `READ_ONLY_MODE=0`, `ENABLE_ADMIN_ENDPOINTS=1`, `REQUIRE_ACCESS_EMAIL=1`
- Both bind the same D1 database
- Public app uses public worker for browse/login/write
- Admin app uses admin worker for admin page + admin APIs
