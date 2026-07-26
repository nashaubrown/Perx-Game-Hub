# Perx Play ↔ MyPerx integration contract

For the MyPerx (NestJS) team. Play's side of everything below is **already implemented**; MyPerx needs to implement **two endpoints and one call**. All signed traffic uses HMAC-SHA256 over the raw JSON body with the shared secret `MYPERX_SHARED_SECRET`, sent in the `X-Perx-Signature` header (hex).

## The model in one paragraph

Games played at a venue earn **merchant-card points** for that venue's card in the MyPerx wallet — merchants fund their own, same as transaction points. Card points post as **PENDING** and only get delivered after the customer has a **same-day transaction at that merchant** (or was verifiably on the venue's Wi-Fi while playing). No purchase by end of day (Maldives time) → the event expires, uncredited. Untagged play earns Play XP only — never wallet money. Per-venue daily caps, opening-hours checks, and a 4-hour session window are enforced on Play's side before an event is ever created.

## 1. Auth / SSO — MyPerx → Play (already implemented on Play)

The MyPerx app opens Play (webview tab or link) and exchanges its token:

```
POST {PLAY_URL}/api/auth/myperx
{ "token": "<jwt>" }
```

Current token contract: **HS256 JWT** signed with `MYPERX_TOKEN_SECRET`, claims:

| claim | required | meaning |
|---|---|---|
| `sub` | yes | MyPerx user id (stored as `perxUserId`) |
| `handle` | no | preferred Perx handle |
| `email` | no | used to link an existing Play account with the same email |

Play responds with `{ ok, handle }` and sets its own httpOnly session cookie. Repeat calls are idempotent. If MyPerx uses RS256/JWKS instead, tell us the JWKS URL — it's a one-line swap on our side.

## 2. Transaction notifications — MyPerx → Play (already implemented on Play)

Whenever a transaction is recorded for a customer at a merchant (the same event that credits purchase points today), also POST it to Play so pending game points can confirm:

```
POST {PLAY_URL}/api/v1/integration/transactions
X-Perx-Signature: hex(hmac_sha256(rawBody, MYPERX_SHARED_SECRET))

{ "perxUserId": "u_123", "merchantId": "myperx-merchant-meraki", "at": "2026-07-26T14:05:00Z" }
```

Response: `{ "confirmed": <n> }` — how many pending events this released. Fire-and-forget with retry is fine; the operation is idempotent (already-confirmed events are unaffected). `merchantId` must match the `externalMerchantId` configured on the Play venue.

## 3. Wallet credit — Play → MyPerx (**MyPerx implements this**)

Play delivers confirmed events to:

```
POST {MYPERX_API_URL}/wallet/play-earn
X-Perx-Signature: hex(hmac_sha256(rawBody, MYPERX_SHARED_SECRET))

{
  "idempotencyKey": "<play ledger row id>",   // dedupe on this — retries WILL happen
  "perxUserId": "u_123",
  "merchantId": "myperx-merchant-meraki",
  "cardPoints": 6,                            // credit THIS to the merchant's card
  "playPoints": 60,                           // raw game points, for reference/analytics
  "source": "perx-play",
  "presence": "transaction" | "venue_ip",
  "earnedAt": "2026-07-26T13:31:22Z"
}
```

Expected responses: `2xx` = credited · `409` = idempotency key already processed (Play treats as delivered) · anything else = Play retries with backoff, up to 10 attempts, then parks the event as `FAILED` for reconciliation.

## 4. Reconciliation — MyPerx → Play (already implemented on Play)

```
GET {PLAY_URL}/api/v1/integration/earn-events?venueId=...&status=SENT&since=2026-07-01
Authorization: Bearer <venue analyticsToken>
```

Lists earn events with statuses `PENDING | CONFIRMED | SENT | EXPIRED | FAILED` for audits and monthly merchant statements. Venue analytics remain at `GET /api/v1/venues/:id/analytics` (same bearer token).

## Environment variables (Play side)

| var | purpose |
|---|---|
| `MYPERX_TOKEN_SECRET` | verifies SSO JWTs from the MyPerx app |
| `MYPERX_SHARED_SECRET` | HMAC for both directions of server-to-server traffic |
| `MYPERX_API_URL` | base URL for wallet credit delivery; **unset = events queue safely** (nothing is lost while MyPerx builds its endpoint) |

## Merchant configuration (Play merchant dashboard, already live)

Per venue: earning on/off · card points per 10 game points (default 1) · daily cap per customer (default 30) · boost multiplier (0.5–5×) · opening hours · venue Wi-Fi public IP (presence fast-track). Admins additionally map the venue to its `externalMerchantId`.

## Fraud posture (why a photographed table QR is worthless)

1. **Pending-until-purchase** — no same-day transaction at the merchant → no card points, ever.
2. **Daily cap** per customer per venue ≈ one small purchase's points.
3. **Opening hours** — "playing at Meraki" at 3am is rejected outright.
4. **Session window** — one earning session per user per venue per 4 hours.
5. **Presence fast-track only, never a gate** — venue Wi-Fi IP match confirms instantly; its absence just means waiting for the transaction match.
6. Redemptions were already in-person (6-digit staff-validated codes), so prize hand-over always happens at the counter.
