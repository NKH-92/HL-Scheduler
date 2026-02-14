# Public Schedules Worker (Cloudflare Workers + D1)

This worker provides public schedule read APIs and admin write APIs for HL-Scheduler web mode.

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

`secrets`

- `RESEND_API_KEY` (required for update email send)
- `UPLOAD_KEY` (optional extra write token)
- `FOLDER_ADMIN_KEY` (optional folder admin key)

## Write Access Rules

Write requests are blocked when:

1. `READ_ONLY_MODE=1`
2. `REQUIRE_ACCESS_EMAIL=1` and `CF-Access-Authenticated-User-Email` is missing
3. `ALLOWED_ADMIN_EMAILS` is set and email is not in allowlist
4. `UPLOAD_KEY` is set (legacy mode) and request key is missing/invalid

`UPLOAD_KEY` check is skipped when Access-based auth is enabled (`REQUIRE_ACCESS_EMAIL=1` or `ALLOWED_ADMIN_EMAILS` configured).

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

5. Set secrets

```bash
wrangler.cmd secret put RESEND_API_KEY
```

Optional:

```bash
wrangler.cmd secret put UPLOAD_KEY
wrangler.cmd secret put FOLDER_ADMIN_KEY
```

6. Deploy

```bash
wrangler.cmd deploy
```

## Recommended Free-Plan Topology

- Public Worker: `READ_ONLY_MODE=1`
- Admin Worker: `READ_ONLY_MODE=0`, `REQUIRE_ACCESS_EMAIL=1`
- Both bind the same D1 database
- Protect only admin URLs with Cloudflare Access
