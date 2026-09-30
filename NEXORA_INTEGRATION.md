# Glass ↔ Nexora integration

Glass ("GrubGlass") connects to a Nexora dashboard as a store using
Nexora's three real, documented integration paths — see the Nexora
project's own `docs/INTEGRATIONS.md`, `docs/API_CONTRACTS.md`, and
`docs/WEBHOOKS.md` for the authoritative contracts this file summarizes.

## How the pieces fit together

```
Browser (index.html)  --Nexora JS SDK (public key)-->  Nexora  (page views / identify)
Glass backend (server.js) --Bearer nx_live_... API key--> Nexora  POST /api/orders     (order.created)
Glass backend (server.js) --HMAC-signed webhook-------->  Nexora  POST /api/webhooks/orders (order.updated)
```

- The **JS SDK** path is already wired in `index.html` (`Nexora.init(...)`)
  and needs no backend involvement — it only ever carries a low-privilege
  `publicKey` that cannot create orders or read data.
- The **API** and **Webhook** paths both require a secret credential, so
  they live only in `server.js`, read from environment variables — never
  in `index.html`/`script.js`/any browser-visible code.

## Where the connection code actually comes from

Nexora's real Terminal connection-code flow (`Nexora Dashboard → Terminal`)
mints and verifies its connection codes **on the Nexora side**, scoped to
one store and one organization, signed with Nexora's own JWT secret
(`src/lib/bulkConnectToken.ts`, `src/app/api/integrations/terminal/route.ts`
in the Nexora repo). Glass never generates a Nexora connection code — it
only ever *consumes* the credentials that code produces. Concretely:

1. In the Nexora dashboard, as the OWNER of the organization this store
   belongs to, open the **glass** store.
2. Either:
   - Open the **Terminal** panel and type `connect` (with this store
     selected) — this mints and immediately runs a short-lived signed
     token that sets up all three integrations at once, **or**
   - Go to **Integrations**, and for each of the three providers
     (Nexora API, Nexora Webhooks, Nexora JavaScript SDK) that isn't
     already active, click **Set Up** (or **Generate new key** if a row
     already exists) — each shows its secret **once**.
3. Copy the resulting values into Glass's `.env` (see below). The public
   SDK key also needs to replace the `publicKey` in `index.html`'s
   `Nexora.init(...)` call — that one is meant to be visible client-side.

Because the currently-active keys are only ever stored as one-way hashes
inside Nexora, an already-set-up integration's original secret can't be
recovered later — only rotated (Nexora API / JS SDK: **Generate new key**
on that integration's page) or reset via Disconnect → Set Up again
(Nexora Webhooks, since its HMAC secret has no separate rotate action).

## Environment variables (`server.js`, see `.env.example`)

| Variable | Meaning |
|---|---|
| `PORT` | Port the Glass backend listens on (also serves the static frontend). |
| `NEXORA_API_BASE` | Base URL of the Nexora deployment this store connects to. Must match `apiBase` in `index.html`. |
| `NEXORA_STORE_ID` | This store's Nexora store id. Must match `storeId` in `index.html`. |
| `NEXORA_API_KEY` | Secret `nx_live_...` key, scope `orders:write`, used for `POST /api/orders`. |
| `NEXORA_WEBHOOK_SECRET` | HMAC secret used to sign outbound `POST /api/webhooks/orders` calls. |
| `GLASS_DEV_TOKEN` | Shared secret protecting `GET /api/nexora/health`. Leave blank to disable that endpoint. |

## Endpoints this backend exposes

- `POST /api/orders` — called by `script.js` (`DB.placeOrder`) right after
  a real order is placed. Forwards it to Nexora's `POST /api/orders` with
  the secret API key. This is what verifies the **Nexora API** integration
  (sets `lastRequestAt`).
- `POST /api/orders/:id/status` — called by `script.js` (`DB.updOrder`,
  the admin Orders panel's status dropdown) whenever an order's status
  changes. Sends a signed `order.updated` webhook to Nexora's
  `POST /api/webhooks/orders`. This is what verifies the **Nexora
  Webhooks** integration (sets `lastWebhookAt`).
- `GET /api/nexora/health` — developer-only (`Authorization: Bearer
  <GLASS_DEV_TOKEN>`). Reports which Nexora env vars are configured and
  the non-secret `apiBase`/`storeId` in use. Never returns a secret value.

Both forwarding calls are best-effort from the frontend's point of view:
if the Glass backend or Nexora is unreachable, the existing
localStorage/WhatsApp checkout flow is completely unaffected — nothing
about the customer-facing UI changed.

## Testing the connection

1. `cd` into this project, copy `.env.example` to `.env`, fill in real
   values obtained from the Nexora dashboard as above.
2. `npm start` (or `node server.js`) — serves the site and API on
   `http://localhost:<PORT>`.
3. Open the site, log in, add an item to the cart, and place an order.
   Check the Glass backend's console output for `nexora order.created
   forward` — status `200`/`201` means Nexora accepted it.
4. As an admin, change that order's status (e.g. to "preparing"). Check
   the console for `nexora order.updated webhook` — status `200` means
   the signed webhook was accepted.
5. In the Nexora dashboard, open this store: **Nexora API** and **Nexora
   Webhooks** should now show **Connected** (real traffic landed), and
   once the JS SDK has also logged at least one page view, all three —
   and the store itself — read **Connected**.
6. `GET /api/nexora/health` with a wrong/missing token should return
   `401`; with the right `GLASS_DEV_TOKEN` it returns `200` with
   non-secret configuration info only.

## Rotating / revoking

- Rotate the API key or SDK public key any time from that integration's
  page in the Nexora dashboard (**Generate new key**) — update `.env`
  (and `index.html` for the public key) with the new value.
- To revoke Glass's access entirely, **Disconnect** the integration(s)
  from the store's page in Nexora — this immediately invalidates the
  associated key(s)/secret, and Glass's forwarding calls will start
  failing (visible in the backend's own console logs) until reconnected.
