# Microsoft Outlook Connector Temporal Enhancer Skill (`outlook_connector_skill`)

> **Disclaimer**: This repository and its contents are provided for illustration and educational purposes only as example code. This is not an official Google product or officially supported Google Cloud project. This code is provided as-is for demonstration purposes and is NOT intended or supported for production workloads. The views, code, and opinions expressed in this repository are those of the author(s) and do not necessarily reflect the position, opinions, or official policy of Google LLC or Google Cloud Platform.

---

## Overview
This directory contains the standalone **Microsoft Outlook Temporal Search & Thread Synthesis Skill ([`SKILL.md`](./SKILL.md))** (`outlook-connector-temporal-enhancer`) for **Gemini Enterprise**.

### Key Capabilities
- **Temporal Date Reasoning**: Anchors relative temporal expressions (`today`, `latest`, `oldest`, `last week`) to current system time and sorts results chronologically by `receivedDateTime`.
- **Conversation Thread Aggregation**: Groups related email messages by `conversationId` / `Subject` to reconstruct full chronological email threads.
- **Clickable `webLink` Citations**: Ensures every referenced email includes a direct clickable link to open the message in Outlook on the Web (`OWA`).
