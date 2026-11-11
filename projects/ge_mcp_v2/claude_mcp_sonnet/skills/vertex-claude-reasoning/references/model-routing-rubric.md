# Vertex AI Claude Model Routing & Token Budget Rubric

| Task Archetype | Recommended `max_tokens` | Recommended `system_prompt` Pattern |
| :--- | :--- | :--- |
| Fast Classification / Triage | `512` – `1024` | Require concise JSON or bulleted severity verdict without prose preamble. |
| Security & Code Review | `2048` – `4096` | Specify target CWE classes, trust boundaries, and minimal patch constraints. |
| Deep Architectural Critique | `4096` – `8192` | Request structured trade-off matrix, failure modes, and concrete verification steps. |

## Safety & Governance Rules
- Never forward raw credentials, OAuth secrets, or unredacted PII inside `prompt` or `system_prompt`.
- Treat model output as untrusted advisory text; validate code and policy claims deterministically before execution.
