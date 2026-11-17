# Stage 1 Blueprint & Stage 2 Parity Checklist

## Latent Legacy Bug Categories to Check in Every State Codebase
- **String-Concatenated SQL / Command Calls:** Convert 100% to parameterized queries (`@param`, `$1`, `?`) and `execFile` / SDK calls (`shell: false`).
- **Hardcoded Credentials, Connection Strings & SMTP Passwords:** Extract into `.env.example` + Google Cloud Secret Manager (`--set-secrets`).
- **Local Filesystem State Assuming Sticky Single-VM Disk:** Refactor temp exports to `/tmp` (ephemeral) or Cloud Storage (`gs://`) so horizontal Cloud Run scaling never loses user uploads.
- **Implicit Local Timezone Math:** Normalize timestamps to UTC (`TIMESTAMPTZ` / ISO-8601) and format in `America/New_York` (`ET`) at the presentation edge for West Virginia users.
- **Floating-Point Currency Math (`float` / `Number` for Dollars & Cents):** Use integer cents or exact `Decimal` / `NUMERIC` types for all grant, tax, fee, and budget calculations!
