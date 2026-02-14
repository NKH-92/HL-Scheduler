# Scheduler Mail Relay

`public-schedules-worker` can store schedules, but it cannot directly send SMTP mail to `omail.hanlim.com:25`.
This relay receives an HTTPS call from the Worker and sends mail through SMTP.

## 1) Install

```bash
cd server/mail-relay
npm install
```

## 2) Run

```bash
# required if relay is exposed beyond loopback
set MAIL_RELAY_TOKEN=change-this-token

# set to 0.0.0.0 only when you really need remote access
# set MAIL_RELAY_BIND=0.0.0.0

# SMTP settings (defaults already match requested values)
set SMTP_HOST=omail.hanlim.com
set SMTP_PORT=25
set SMTP_SECURE=false

npm start
```

Health check:

```bash
curl http://127.0.0.1:8788/healthz
```

## 3) Worker environment

Set these in Worker:

- `MAIL_RELAY_URL`: relay endpoint URL (ex: `https://relay.your-company.internal/notify/schedule-updated`)
- `MAIL_RELAY_TOKEN`: same token as relay (recommended)

## Request body

`POST /notify/schedule-updated`

```json
{
  "scheduleId": "string",
  "projectName": "프로젝트명",
  "scheduleUrl": "https://.../api/schedules/<id>",
  "updatedByEmail": "updater@hanlim.com",
  "updatedAt": 1760000000000,
  "recipients": ["lead@hanlim.com", "manager@hanlim.com"]
}
```

## Mail template

Subject:

`[Scheduler] 일정 업데이트 알림 - <프로젝트명>`

Body (plain text):

```text
일정이 업데이트되었습니다.

[프로젝트명]: <프로젝트명>
[수정자]: <수정자 메일>
[수정시각]: <KST 시각>

감사합니다.
```
