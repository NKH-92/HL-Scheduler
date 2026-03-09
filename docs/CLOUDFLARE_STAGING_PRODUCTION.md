# Cloudflare 스테이징/운영 배포 가이드

이 저장소는 이제 `staging -> production` 흐름으로 배포하도록 정리되어 있습니다.

## 배포 구조

- `staging` 브랜치에 push: 스테이징 Worker + Pages 배포
- `main` 브랜치에 push: 운영 Worker + Pages 배포
- 스테이징과 운영은 서로 다른 D1 데이터베이스를 사용
- public 앱과 admin 앱은 각각 별도 Pages 프로젝트로 배포
- public API와 admin API는 각각 별도 Worker로 배포

## 기본 이름 규칙

변수를 따로 지정하지 않으면 아래 이름을 기본값으로 사용합니다.

- staging public worker: `hl-scheduler-public-api-staging`
- staging admin worker: `hl-scheduler-admin-api-staging`
- production public worker: `hl-scheduler-public-api`
- production admin worker: `hl-scheduler-admin-api`
- staging public pages: `hl-scheduler-public-staging`
- staging admin pages: `hl-scheduler-admin-staging`
- production public pages: `hl-scheduler-public`
- production admin pages: `hl-scheduler-admin`

## GitHub Environments

GitHub 저장소에서 Environment를 2개 만듭니다.

- `staging`
- `production`

각 Environment에 아래 값을 넣습니다.

### Secrets

- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`

### Variables

- `CLOUDFLARE_D1_DATABASE_ID`
- `CLOUDFLARE_D1_DATABASE_NAME`
- `CLOUDFLARE_D1_PREVIEW_DATABASE_ID` (선택)
- `CLOUDFLARE_WORKERS_SUBDOMAIN`
- `CLOUDFLARE_PUBLIC_WORKER_NAME` (선택)
- `CLOUDFLARE_ADMIN_WORKER_NAME` (선택)
- `CLOUDFLARE_PUBLIC_PAGES_PROJECT` (선택)
- `CLOUDFLARE_ADMIN_PAGES_PROJECT` (선택)
- `CLOUDFLARE_PUBLIC_API_URL` (커스텀 도메인 쓸 때만)
- `CLOUDFLARE_ADMIN_API_URL` (커스텀 도메인 쓸 때만)
- `CLOUDFLARE_PUBLIC_APP_URL` (커스텀 도메인 쓸 때만)
- `CLOUDFLARE_ADMIN_APP_URL` (커스텀 도메인 쓸 때만)
- `CLOUDFLARE_ALLOWED_ADMIN_EMAILS`
- `CLOUDFLARE_ALLOWED_FROM_DOMAIN`
- `CLOUDFLARE_CORS_ALLOWED_ORIGINS` (선택)
- `CLOUDFLARE_EXTRA_CORS_ALLOWED_ORIGINS` (선택)
- `CLOUDFLARE_READ_ONLY_MODE` (선택, 기본 `0`)
- `CLOUDFLARE_SHARED_SCHEDULE_ID` (선택)
- `CLOUDFLARE_SESSION_COOKIE_DOMAIN` (권장)
- `CLOUDFLARE_SESSION_COOKIE_NAME` (선택)
- `CLOUDFLARE_SESSION_COOKIE_SAME_SITE` (선택, 기본 `None`)
- `CLOUDFLARE_SESSION_TTL_HOURS` (선택, 기본 `12`)
- `CLOUDFLARE_AUTH_RATE_LIMIT_WINDOW_SECONDS` (선택, 기본 `300`)
- `CLOUDFLARE_AUTH_RATE_LIMIT_MAX_ATTEMPTS` (선택, 기본 `10`)
- `CLOUDFLARE_PUBLIC_REQUIRE_ACCESS_EMAIL` (선택, 기본 `0`)
- `CLOUDFLARE_PUBLIC_ENABLE_ADMIN_ENDPOINTS` (선택, 기본 `0`)
- `CLOUDFLARE_ADMIN_REQUIRE_ACCESS_EMAIL` (선택, 기본 `1`)
- `CLOUDFLARE_ADMIN_ENABLE_ADMIN_ENDPOINTS` (선택, 기본 `1`)

권장값:

- staging `CLOUDFLARE_D1_DATABASE_NAME`: `hl-scheduler-staging`
- production `CLOUDFLARE_D1_DATABASE_NAME`: `hl-scheduler`
- `CLOUDFLARE_SESSION_COOKIE_DOMAIN`: `<your-workers-subdomain>.workers.dev`

## Cloudflare 초기 준비

### 1. 로그인 확인

```bash
npx wrangler whoami
```

### 2. D1 데이터베이스 생성

```bash
npx wrangler d1 create hl-scheduler-staging
npx wrangler d1 create hl-scheduler
```

생성 후 나온 `database_id`를 각각 GitHub Environment 변수에 넣습니다.

### 3. 스키마 반영

```bash
npx wrangler d1 execute hl-scheduler-staging --file=server/public-schedules-worker/schema.sql --remote
npx wrangler d1 execute hl-scheduler --file=server/public-schedules-worker/schema.sql --remote
```

필요하면 아래 마이그레이션도 순서대로 반영합니다.

- `server/public-schedules-worker/migrations/20260211_rev4_folders.sql`
- `server/public-schedules-worker/migrations/20260214_auth_identity.sql`

### 4. Worker 시크릿 설정

`PASSWORD_PEPPER`는 public/admin Worker 각각에 넣어야 합니다.

예시:

```bash
set DEPLOY_ENV=staging
set CLOUDFLARE_D1_DATABASE_ID=replace-with-staging-d1-id
set CLOUDFLARE_ALLOWED_ADMIN_EMAILS=admin@example.com
set CLOUDFLARE_WORKERS_SUBDOMAIN=your-subdomain

node scripts/cloudflare/render-wrangler-config.mjs --surface public
node scripts/cloudflare/render-wrangler-config.mjs --surface admin

npx wrangler secret put PASSWORD_PEPPER --config server/public-schedules-worker/wrangler.generated.staging.public.toml
npx wrangler secret put PASSWORD_PEPPER --config server/public-schedules-worker/wrangler.generated.staging.admin.toml
```

운영도 같은 방식으로 `DEPLOY_ENV=production`으로 반복합니다.

## 자동 배포 흐름

GitHub Actions 파일:

- `.github/workflows/deploy-cloudflare.yml`

동작 순서:

1. 환경 결정 (`staging` 또는 `production`)
2. `npm run test`
3. public/admin 앱 빌드 검증
4. public/admin Worker 배포
5. public/admin Pages 배포
6. 스모크 테스트 실행

## 수동 확인용 명령

```bash
npm run test
npm run cf:render:worker:public
npm run cf:render:worker:admin
npm run cf:build:public
npm run cf:build:admin
npm run cf:smoke
```

`cf:*` 스크립트는 `DEPLOY_ENV`와 Cloudflare 관련 환경변수가 먼저 설정되어 있어야 합니다.

## 권장 운영 방식

1. 개선 작업은 기능 브랜치에서 진행
2. `staging` 브랜치로 병합해서 스테이징 자동 배포
3. 실제 사용자 시나리오 테스트
4. 이상 없으면 `main`으로 병합해서 운영 배포

이 구조를 기준으로 다음 개선 작업도 안전하게 진행하면 됩니다.
