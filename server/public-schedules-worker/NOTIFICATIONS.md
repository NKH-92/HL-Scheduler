# Schedule Update Email Notifications

## Summary

On `PUT /api/schedules/:id`, the worker can send notification emails through Resend.

- `updatedByEmail` is used as the `from` address.
- Recipient list is taken from `notificationRecipients` in payload.
- If payload recipients are empty, stored recipients are reused.

## Required Settings

- Secret: `RESEND_API_KEY`
- Var: `ALLOWED_FROM_DOMAIN` (optional but recommended)

If `ALLOWED_FROM_DOMAIN` is set, `updatedByEmail` must match that domain.

## Response Behavior

Schedule update is committed even if email send fails.

Response includes `notification`:

```json
{
  "notification": {
    "status": "sent|failed|skipped",
    "reason": "...",
    "recipientCount": 2
  }
}
```

- `sent`: Resend request succeeded
- `failed`: Resend rejected/errored or missing `RESEND_API_KEY`
- `skipped`: no recipients configured

## Notes

- This worker does not use direct SMTP relay.
- Cloudflare Worker TCP port 25 path is not used.
