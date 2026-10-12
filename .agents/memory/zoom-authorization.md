---
name: Zoom authorization
description: Product requirement for connecting a coordinator's Zoom account to the Jusoor platform.
---

The user wants a coordinator to authorize Zoom from the live Jusoor platform once it is ready. Do not ask the user to connect their Zoom account through chat.

**Why:** the user explicitly said they want the connection to happen in the live platform, not in chat.

**How to apply:** keep the account OAuth flow in the coordinator-facing app. Zoom OAuth app credentials are server configuration; they are separate from the coordinator's in-platform account authorization.
