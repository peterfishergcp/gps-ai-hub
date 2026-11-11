# Cloud SDP & Purview Verdict Matrix

| Verdict | Server Behavior | Required Agent Behavior |
| :--- | :--- | :--- |
| `ALLOW` | Returns extracted text + `msip_labels` metadata. | Summarize with `#page=N` / `?web=1` citations and display label status. |
| `MASK` / `REDACT` | Replaces matched sensitive tokens across 100% of overlapping windows with `[REDACTED:<INFOTYPE>]`. | Preserve `[REDACTED:...]` markers verbatim; never attempt reconstruction. |
| `BLOCK` | Withholds 100% of cleartext (`blocked: true`), blocks download URLs & destructive writes, and emits `msip_labels` for audit logs. | State clearly that access was blocked by SDP policy; do not speculate on contents. |
