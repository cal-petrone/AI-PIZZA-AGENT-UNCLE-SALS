# PersonaPlex Integration — Multi-Tenant Conversation Engine

This document describes the pluggable conversation engine (default OpenAI Realtime vs. PersonaPlex gateway), company config, and how to enable PersonaPlex per company with zero code changes.

## Summary

- **Default engine:** Current behavior unchanged (OpenAI Realtime API + Twilio Media Stream). All companies use this unless overridden.
- **PersonaPlex engine:** Adapter that calls an external PersonaPlex gateway. On any failure, timeout, or if the gateway is not configured, the system **automatically falls back** to the default engine.
- **Multi-tenant:** Company is resolved from `getStoreConfig(calledNumber)`. Persona and engine selection are config-driven via `config/companies/<company_id>/`.

## New Files

| File | Purpose |
|------|---------|
| `config/companies/index.js` | `getStoreConfig(calledNumber)`, `getCompanyById`, `listCompanies` |
| `config/companies/uncle_sals/config.json` | Uncle Sal's store config (name, taxRate, persona path, optional engine override) |
| `config/companies/uncle_sals/persona.json` | Uncle Sal's persona (role, tone, business_rules, greeting) |
| `config/companies/tazza_pizza/config.json` | Tazza Pizza store config |
| `config/companies/tazza_pizza/persona.json` | Tazza Pizza persona |
| `src/conversation/interface.js` | `IConversationEngine` (startSession, handleUserTurn, getResponse, endSession) |
| `src/conversation/engines/default.js` | `DefaultConversationEngine` (wraps existing connectToOpenAI) |
| `src/conversation/engines/personaplex.js` | `PersonaPlexConversationEngine` (gateway + fallback) |
| `src/conversation/index.js` | `getConversationEngineName(storeConfig)`, `createPersonaPlexEngine(connectToOpenAI)` |
| `src/tools/business-tools.js` | Shared helpers: `lookupMenuItems`, `getWingOptions`, `calculatePrice`, `logOrderToGoogleSheet` (call existing Sheets layer) |
| `docs/PERSONAPLEX_INTEGRATION.md` | This file |

## Modified Files

| File | Change |
|------|--------|
| `server.js` | Require `config/companies` and `src/conversation`; implement `getStoreConfig` usage (was previously undefined); resolve engine by `getConversationEngineName(storeConfig)` and, when engine is `personaplex`, call `createPersonaPlexEngine(connectToOpenAI).startSession(...)` with fallback to default engine. |

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `CONVERSATION_ENGINE` | No | `default` (default) or `personaplex`. Global default; can be overridden per company in `config/companies/<id>/config.json` with `conversation_engine`. |
| `PERSONAPLEX_GATEWAY_URL` | For PersonaPlex | Base URL of the PersonaPlex gateway (e.g. `https://personaplex-gateway.example.com`). If unset or invalid, PersonaPlex engine falls back to default. |
| `PERSONAPLEX_GATEWAY_TIMEOUT_MS` | No | Timeout in ms for gateway `/session/start` (default: 8000). |
| `DEFAULT_CLIENT_SLUG` | No | Company id used when no company is resolved from phone number (e.g. `uncle_sals`). |

Existing variables (OpenAI, Twilio, Google Sheets, etc.) are unchanged.

## Enabling PersonaPlex Per Company (Zero Code Changes)

1. **Global (all companies):** Set `CONVERSATION_ENGINE=personaplex` and `PERSONAPLEX_GATEWAY_URL=https://...` in the environment. All companies will try PersonaPlex first and fall back to default on failure.

2. **Single company:** Leave `CONVERSATION_ENGINE=default`. In that company’s config, set the override:
   - Edit `config/companies/<company_id>/config.json`.
   - Set `"conversation_engine": "personaplex"`.
   - Deploy. Only that company uses PersonaPlex; others use the default engine.

3. **Disable PersonaPlex for one company when global is PersonaPlex:** In that company’s `config.json`, set `"conversation_engine": "default"`.

## Company Config and Persona

- **config.json** per company: `company_id`, `name`, `location`, `taxRate`, `personaPath`, `conversation_engine` (optional override), `phoneNumbers` (optional list for number → company mapping).
- **persona.json** per company: `role`, `tone`, `business_rules`, `confirmation_style`, `greeting`. The PersonaPlex engine sends this to the gateway at session start so the same engine serves all companies with different personas.

## Tool Preservation

- Google Sheets integration is **unchanged**: same schema, same `logOrderToGoogleSheets`, `calculateOrderTotals`, and menu fetch behavior.
- Shared business helpers live in `src/tools/business-tools.js` and call the existing Sheets layer. No schema or column changes.

## Reliability and Fallback

- PersonaPlex engine uses timeouts and retries; on failure or timeout it calls the default engine (`connectToOpenAI`).
- Logging includes `company_id`, `sessionId`, and which engine was used / fallback events.

## Adding a New Company

1. Create `config/companies/<new_company_id>/config.json` (and optionally `persona.json`).
2. Add the company’s phone numbers to `phoneNumbers` in `config.json` if you want number-based routing.
3. Set env (e.g. Google Sheet ID) for that deployment as needed. No code changes required.
