// ═══════════════════════════════════════════════════════════════════════
// GLASS BACKEND — the bridge between this real website and Nexora/Dasenter
// ═══════════════════════════════════════════════════════════════════════
//
// WHY THIS FILE EXISTS AT ALL:
// The frontend (index.html + script.js) runs in the customer's BROWSER.
// A browser can never be trusted with a secret (anyone can open dev tools
// and read it), so it can only ever hold the low-privilege Nexora public
// SDK key (already embedded in index.html's Nexora.init() call).
// Creating a real order or sending a signed webhook needs a SECRET key —
// so that work has to happen somewhere the customer can't see: a server.
// THIS file is that server. It runs on your own machine (or wherever you
// deploy it), never in the customer's browser.
//
// THE BIG PICTURE (browser -> this backend -> Nexora):
//   Browser (index.html/script.js)
//        |  fetch('/api/orders', {...})            <- same-origin call, no secret involved
//        v
//   THIS FILE (server.js), listening on PORT
//        |  fetch(`${NEXORA_API_BASE}/api/orders`, { Authorization: Bearer NEXORA_API_KEY })
//        v
//   Nexora/Dasenter's own real server (a separate app, separate port)
//
// So every "order.created" and "order.updated" event flows browser -> this
// file -> Nexora. The one exception is page views: those go straight from
// the browser to Nexora via the Nexora SDK script tag in index.html — this
// backend is never involved in that path, since a public key is safe to
// use directly from a browser.
'use strict';

// Node's built-in HTTP server — deliberately no Express/Fastify/etc. This
// whole backend is small enough that a raw http.createServer (further
// down) is simpler than pulling in a framework dependency for it.
const http = require('http');
// Used to read this project's own static files (index.html, script.js,
// style.css) off disk so they can be served to the browser.
const fs = require('fs');
// Used to safely join this file's own directory with a requested filename,
// so a request can never accidentally escape this project's folder.
const path = require('path');
// Node's built-in cryptography module — used below for two unrelated
// things: (1) computing the real HMAC-SHA256 signature Nexora's webhook
// receiver expects, and (2) a constant-time string comparison so checking
// the GLASS_DEV_TOKEN can't leak timing information about how much of it
// matched.
const crypto = require('crypto');

// Reads this project's own .env file (if present) and copies each
// KEY=value line into process.env — this is what makes
// process.env.NEXORA_API_KEY etc. (below) actually have a value at
// runtime. Defined further down; called here, at the very top, so every
// other line in this file can rely on process.env already being populated.
loadEnvFile(path.join(__dirname, '.env'));

// ── Configuration, read once at startup from the environment ──
// The port THIS backend itself listens on (not Nexora's port).
const PORT = Number(process.env.PORT || 4000);
// Nexora's own base URL — where the *real* Dasenter app is running. This
// backend's outbound calls (further down) are sent here. Trailing slash(es)
// stripped so "${NEXORA_API_BASE}/api/orders" never ends up with "//".
const NEXORA_API_BASE = (process.env.NEXORA_API_BASE || 'http://localhost:3000').replace(/\/+$/, '');
// Which Nexora store this website's orders/webhooks belong to — must
// match the same store's id used in index.html's Nexora.init() call.
const NEXORA_STORE_ID = process.env.NEXORA_STORE_ID || '';
// The secret Bearer key for Nexora's real POST /api/orders endpoint —
// generated once in the Nexora dashboard, never visible to the browser.
const NEXORA_API_KEY = process.env.NEXORA_API_KEY || '';
// The secret used to HMAC-sign outbound webhook calls to Nexora's real
// POST /api/webhooks/orders endpoint — a completely different secret from
// the API key above, also generated in the Nexora dashboard.
const NEXORA_WEBHOOK_SECRET = process.env.NEXORA_WEBHOOK_SECRET || '';
// A THIRD, separate secret — this one authenticates requests coming FROM
// Nexora TO this backend (the reverse direction of the other two, which
// both go FROM this backend TO Nexora). Nexora generates this itself, once,
// the moment you set this integration's "outbound webhook URL" to point at
// this backend's /api/nexora/products endpoint (PATCH /api/integrations/[id]
// in the Nexora dashboard) — it is shown exactly once there, same rule as
// every other secret in this file. Used below in verifyNexoraSignature() to
// make sure a request claiming to be "Nexora asking for your product
// catalog" really is Nexora, and not anyone else who happens to guess this
// URL.
const NEXORA_OUTBOUND_SECRET = process.env.NEXORA_OUTBOUND_SECRET || '';
// A private shared token that gates this backend's own /api/nexora/health
// endpoint (defined below) — so a random visitor can't probe which Nexora
// env vars you've configured.
const GLASS_DEV_TOKEN = process.env.GLASS_DEV_TOKEN || '';

// An explicit allowlist of exactly which files this server will serve, and
// under which URL path — e.g. a GET to "/" serves the file "index.html".
// Deliberately NOT "serve the whole project folder": that would also
// expose server.js (with its secrets read into memory) and .env itself
// (with the secrets in plain text) to anyone who requested them by name.
const STATIC_FILES = {
  '/': 'index.html',
  '/index.html': 'index.html',
  '/script.js': 'script.js',
  '/style.css': 'style.css',
};
// The correct Content-Type header for each file extension above, so the
// browser renders/executes each file correctly instead of guessing.
const STATIC_CONTENT_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
};

// Where this backend's OWN copy of the product catalog lives — a real file
// on disk this SERVER can read, unlike the browser's localStorage (which
// script.js's SEED/DB.prods() use, and which only ever exists inside one
// visitor's own browser). This file is what makes a Nexora product PULL
// possible at all: Nexora can only ever pull from something a server can
// read, never reach into a customer's browser storage.
const PRODUCTS_FILE = path.join(__dirname, 'products.json');
// How old a signed request's timestamp is allowed to be before it's
// rejected as a possible replay of a captured request — mirrors the exact
// same 300-second window Nexora's own verifyWebhookSignature enforces
// (../Nexora/src/lib/webhookSignature.ts), so both sides agree on what
// "too old to trust" means.
const REPLAY_WINDOW_SECONDS = 300;

// Hand-rolled ".env file" reader (no dotenv package dependency). Reads the
// file at `file`, and for every "KEY=value" line found, sets
// process.env[KEY] = value — but ONLY if that key isn't already set in the
// environment, so a real deployment platform's own env var configuration
// always wins over whatever happens to be sitting in a local .env file.
function loadEnvFile(file) {
  let text;
  try {
    text = fs.readFileSync(file, 'utf8');
  } catch {
    return; // no .env present — fine, everything below degrades gracefully
  }
  for (const rawLine of text.split('\n')) {
    const line = rawLine.trim();
    // Skip blank lines and comment lines (lines starting with #).
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq === -1) continue; // not a KEY=value line — ignore it
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    // Strip a single layer of surrounding quotes, e.g. KEY="value with spaces".
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = value;
  }
}

// Reads this backend's own product catalog off disk (products.json) —
// this is the REAL, server-readable source of truth a Nexora pull request
// reads from. Kept as its own small function (rather than inlined into the
// route handler below) so it's obvious this is the one place that would
// need to change if products ever moved to a real database instead of a
// JSON file.
function readProducts() {
  try {
    const text = fs.readFileSync(PRODUCTS_FILE, 'utf8');
    const parsed = JSON.parse(text);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return []; // missing/corrupt file — an empty catalog, not a crash
  }
}

// Checks that an incoming request genuinely came from Nexora, by
// recomputing the same HMAC-SHA256 signature Nexora itself computes
// (identical scheme to forwardOrderStatus() above, just verifying instead
// of producing) and comparing it, in constant time, against what the
// request actually sent. Also rejects a timestamp that's too old — even a
// technically-valid signature attached to a captured, replayed request
// must not be honored forever.
function verifyNexoraSignature(timestampHeader, signatureHeader, rawBody) {
  if (!NEXORA_OUTBOUND_SECRET) return { valid: false, reason: 'not_configured' };
  if (!timestampHeader || !signatureHeader) return { valid: false, reason: 'missing_headers' };

  const timestamp = Number(timestampHeader);
  if (!Number.isFinite(timestamp)) return { valid: false, reason: 'invalid_timestamp' };
  if (Math.abs(Math.floor(Date.now() / 1000) - timestamp) > REPLAY_WINDOW_SECONDS) {
    return { valid: false, reason: 'stale_timestamp' };
  }

  const expected = `sha256=${crypto.createHmac('sha256', NEXORA_OUTBOUND_SECRET).update(`${timestamp}.${rawBody}`).digest('hex')}`;
  const expectedBuf = Buffer.from(expected);
  const actualBuf = Buffer.from(signatureHeader);
  // Buffers of different lengths would make timingSafeEqual throw, so that
  // case is treated as an immediate, plain mismatch instead.
  if (expectedBuf.length !== actualBuf.length) return { valid: false, reason: 'signature_mismatch' };
  return crypto.timingSafeEqual(expectedBuf, actualBuf)
    ? { valid: true }
    : { valid: false, reason: 'signature_mismatch' };
}

// Small helper: writes a JSON body with the right status code and headers.
// Every route handler below uses this instead of repeating writeHead/end.
function sendJson(res, status, body) {
  const data = JSON.stringify(body);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': Buffer.byteLength(data) });
  res.end(data);
}

// Node's raw http server delivers a request body as a stream of chunks,
// not a ready-made string — this collects those chunks into one string,
// while also rejecting anything absurdly large (maxBytes, default 1MB) so
// a malicious/broken client can't make this process buffer unbounded data.
function readBody(req, maxBytes = 1_000_000) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > maxBytes) {
        reject(Object.assign(new Error('Request body too large.'), { statusCode: 413 }));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

// A deliberately simple "looks like an email" check — good enough to avoid
// forwarding obvious garbage to Nexora as a customer email, not meant to
// be a full RFC-5322 validator.
function isValidEmail(value) {
  return typeof value === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

// A tiny structured console logger used everywhere below instead of raw
// console.log, so every line has a consistent, greppable prefix/timestamp.
function log(level, message, meta) {
  // Never pass apiKey/webhookSecret/signature values into `meta` — this
  // logger doesn't redact, callers are responsible, same discipline the
  // real Nexora backend documents for its own integration_logs.
  const line = `[glass-backend] ${new Date().toISOString()} ${level} ${message}`;
  console[level === 'error' ? 'error' : 'log'](line, meta ? JSON.stringify(meta) : '');
}

// ═══════════════════════════════════════════════════════════════════════
// PATH 1 — a real order, sent to Nexora's real API (Bearer-key authenticated)
// ═══════════════════════════════════════════════════════════════════════
// Called from handleCreateOrder() below, which itself is only ever reached
// when the BROWSER's script.js calls DB.placeOrder(...) and that function
// internally calls pushGlassEvent('/api/orders', {...}) — a same-origin
// fetch() straight to THIS server, no Nexora secret ever touches the
// browser. This function is the second half of that chain: it takes the
// order this backend just received from the browser, reshapes it into
// exactly the fields Nexora's real POST /api/orders expects (see
// ../Nexora/docs/API_CONTRACTS.md), and sends it there with the real
// secret key.
async function forwardOrderCreated(order) {
  // If the Nexora credentials aren't set up yet, don't attempt the call at
  // all — the site keeps working (see handleCreateOrder), just without
  // this real forwarding step.
  if (!NEXORA_API_KEY || !NEXORA_STORE_ID) {
    return { forwarded: false, reason: 'not_configured' };
  }
  // Reshape Glass's own internal order object (whatever script.js's
  // DB.placeOrder happened to send) into Nexora's documented order shape.
  const payload = {
    storeId: NEXORA_STORE_ID,
    externalId: String(order.id), // Glass's own order id — Nexora uses this for idempotency
    customer: {
      name: (order.customer && String(order.customer)) || 'Guest',
      email: isValidEmail(order.email) ? order.email : undefined, // omit rather than send garbage
      phone: order.phone ? String(order.phone).slice(0, 40) : undefined,
    },
    items: (Array.isArray(order.items) ? order.items : []).map((it) => ({
      name: String(it.name || 'Item').slice(0, 200),
      // Glass's cart items use `qty`; Nexora's contract calls it `quantity`
      // — this is exactly the kind of field-name translation this backend
      // exists to do, so script.js never needs to know Nexora's shape.
      quantity: Math.max(1, Math.round(Number(it.qty ?? it.quantity ?? 1))),
      price: Math.max(0, Math.round(Number(it.price ?? 0))),
    })),
    total: Math.max(0, Math.round(Number(order.total ?? 0))),
    currency: 'NGN',
    deliveryAddress: order.area ? String(order.area).slice(0, 500) : undefined,
  };

  try {
    // THE actual real network call to Nexora — a POST to its real API,
    // authenticated with the secret Bearer key, exactly like any other
    // real Nexora API integration (the same header shape docs/API_CONTRACTS.md
    // documents for any developer's own backend).
    const res = await fetch(`${NEXORA_API_BASE}/api/orders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${NEXORA_API_KEY}` },
      body: JSON.stringify(payload),
    });
    // Nexora always replies with JSON (either the created order or a real
    // error) — parse it, but degrade to {} if that ever somehow fails
    // rather than crashing this whole request.
    const json = await res.json().catch(() => ({}));
    log(res.ok ? 'info' : 'error', 'nexora order.created forward', { externalId: payload.externalId, status: res.status });
    // res.ok being true here is the real, concrete thing that makes
    // Nexora's own dashboard show the "Nexora API" integration as
    // Connected — it sets lastRequestAt on Nexora's side the moment this
    // authenticated request actually lands.
    return { forwarded: res.ok, status: res.status, data: json };
  } catch (err) {
    // Nexora unreachable, DNS failure, etc. — logged, but deliberately
    // never thrown further up: see handleCreateOrder's comment on why a
    // failed forward must never break the customer's own checkout.
    log('error', 'nexora order.created forward failed', { externalId: payload.externalId, error: String(err) });
    return { forwarded: false, reason: 'request_failed' };
  }
}

// ═══════════════════════════════════════════════════════════════════════
// PATH 2 — an order status change, sent to Nexora as a signed webhook
// ═══════════════════════════════════════════════════════════════════════
// Reached when the admin panel's status dropdown (script.js's
// DB.updOrder(id,status), rendered around line 1217 of script.js) calls
// pushGlassEvent(`/api/orders/${id}/status`, {status}) — again, a
// same-origin browser call straight to THIS server. This function takes
// that and sends Nexora a genuinely HMAC-signed webhook — a DIFFERENT
// authentication scheme from path 1's Bearer key, matching Nexora's own
// documented webhook contract (../Nexora/docs/WEBHOOKS.md).
async function forwardOrderStatus(orderId, status) {
  if (!NEXORA_WEBHOOK_SECRET || !NEXORA_STORE_ID) {
    return { forwarded: false, reason: 'not_configured' };
  }
  // The "envelope" shape every Nexora webhook is expected to carry:
  // which event happened, which store it's for, a unique event id (for
  // Nexora's own duplicate-delivery protection), and the actual event data.
  const envelope = {
    event: 'order.updated',
    store_id: NEXORA_STORE_ID,
    // Deterministic per (order, status) so a retried/duplicate status push
    // is safely deduped by Nexora's (storeId, eventId) idempotency index
    // rather than re-processed.
    event_id: `${orderId}:${status}`,
    occurred_at: new Date().toISOString(),
    data: { id: String(orderId), status },
  };
  // The EXACT bytes that get signed and sent must be identical — signing a
  // re-serialized copy of the object instead of this literal string could
  // subtly change byte order/whitespace and make the signature invalid on
  // Nexora's side.
  const rawBody = JSON.stringify(envelope);
  // A Unix timestamp (seconds), included in what gets signed — Nexora uses
  // this to reject a captured-and-replayed request that's too old, even if
  // the signature itself is technically still valid.
  const timestamp = Math.floor(Date.now() / 1000);
  // THE actual signing step: HMAC-SHA256 over "{timestamp}.{rawBody}",
  // keyed with the shared secret only this backend and Nexora know. This
  // is what proves to Nexora "this request really came from someone who
  // holds the real secret," without that secret ever being sent over the
  // network itself.
  const signature = crypto.createHmac('sha256', NEXORA_WEBHOOK_SECRET).update(`${timestamp}.${rawBody}`).digest('hex');

  try {
    // The real network call to Nexora's webhook receiver — note there's no
    // Authorization header at all here (unlike path 1); the signature
    // headers ARE the authentication for this path.
    const res = await fetch(`${NEXORA_API_BASE}/api/webhooks/orders`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Nexora-Signature': `sha256=${signature}`,
        'X-Nexora-Timestamp': String(timestamp),
      },
      body: rawBody,
    });
    const json = await res.json().catch(() => ({}));
    log(res.ok ? 'info' : 'error', 'nexora order.updated webhook', { orderId, status, httpStatus: res.status });
    // Just like path 1's lastRequestAt, a successful signed webhook here
    // is the real, concrete thing that sets lastWebhookAt on Nexora's
    // side — that's what flips the "Nexora Webhooks" integration to
    // Connected on the real dashboard.
    return { forwarded: res.ok, status: res.status, data: json };
  } catch (err) {
    log('error', 'nexora order.updated webhook failed', { orderId, status, error: String(err) });
    return { forwarded: false, reason: 'request_failed' };
  }
}

// ── Route handlers: these run in response to the BROWSER's own calls ──

// Reached by: browser's script.js -> DB.placeOrder(...) -> internally calls
// pushGlassEvent('/api/orders', {...}) -> a same-origin fetch() that lands
// right here, on THIS backend (see the http.createServer routing table
// further down for how "POST /api/orders" gets mapped to this function).
async function handleCreateOrder(req, res) {
  let raw;
  try {
    raw = await readBody(req);
  } catch (err) {
    return sendJson(res, err.statusCode || 400, { error: 'Could not read request body.' });
  }
  let body;
  try {
    body = JSON.parse(raw);
  } catch {
    return sendJson(res, 400, { error: 'Malformed JSON body.' });
  }
  // Minimal shape check on what the BROWSER sent this backend — separate
  // from, and stricter than, the reshaping forwardOrderCreated does before
  // sending onward to Nexora.
  if (!body || typeof body !== 'object' || !body.id || !Array.isArray(body.items) || !body.items.length) {
    return sendJson(res, 422, { error: 'Order requires at least: id, items[].' });
  }

  // Hand off to path 1 above — this is the actual bridge moment: a browser
  // request becomes a real outbound call to Nexora.
  const result = await forwardOrderCreated(body);
  // Always 200 back to the BROWSER regardless of whether Nexora forwarding
  // succeeded — script.js's pushGlassEvent() doesn't even look at this
  // response (see its `.catch(()=>{})`), so Glass's own checkout flow
  // (localStorage order, WhatsApp message, etc.) is never blocked or
  // broken by a Nexora hiccup. The `nexora: result` field is purely for
  // this backend's own logs/debugging, not read by the frontend.
  sendJson(res, 200, { received: true, nexora: result });
}

// Reached by: the admin Orders panel's status <select> (script.js, around
// line 1217: `onchange="DB.updOrder('${o.id}',this.value)"`), which calls
// pushGlassEvent(`/api/orders/${id}/status`, {status}) — again landing
// here via the routing table below.
async function handleOrderStatus(req, res, orderId) {
  let raw;
  try {
    raw = await readBody(req);
  } catch (err) {
    return sendJson(res, err.statusCode || 400, { error: 'Could not read request body.' });
  }
  let body;
  try {
    body = JSON.parse(raw);
  } catch {
    return sendJson(res, 400, { error: 'Malformed JSON body.' });
  }
  // Only Nexora's own recognized order statuses are ever forwarded —
  // matches the enum Nexora's real order.status column accepts.
  const ALLOWED_STATUSES = new Set(['pending', 'confirmed', 'preparing', 'shipped', 'delivered', 'cancelled']);
  if (!body || !ALLOWED_STATUSES.has(body.status)) {
    return sendJson(res, 422, { error: `status must be one of: ${[...ALLOWED_STATUSES].join(', ')}` });
  }

  // Hand off to path 2 above — the browser's status change becomes a real
  // signed webhook to Nexora.
  const result = await forwardOrderStatus(orderId, body.status);
  sendJson(res, 200, { received: true, nexora: result });
}

// ═══════════════════════════════════════════════════════════════════════
// PATH 3 — Nexora PULLING this backend's product catalog (the reverse
// direction from paths 1/2 above: this time NEXORA calls US, not the
// browser).
// ═══════════════════════════════════════════════════════════════════════
// Reached when someone (a merchant owner, from the Nexora dashboard's
// Products page "Pull" button, or automatically the moment this store
// first becomes fully Connected) triggers a pull. Nexora's own
// pullProductsViaCustomWebhook (../Nexora/src/lib/connectors/nexoraNative.ts)
// sends a real, signed GET request to whatever URL you've configured as
// this integration's "outbound webhook URL" — this function is what that
// request needs to land on.
function handleProductsPull(req, res) {
  // A GET request has no body, but the exact same signing scheme used for
  // POST bodies elsewhere in this file still applies here with an EMPTY
  // string standing in for the (nonexistent) body — this must match
  // exactly what Nexora itself signed, or the signature simply won't match.
  const rawBody = '';
  const signatureHeader = req.headers['x-nexora-signature'];
  const timestampHeader = req.headers['x-nexora-timestamp'];

  const verification = verifyNexoraSignature(timestampHeader, signatureHeader, rawBody);
  if (!verification.valid) {
    log('error', 'Rejected product pull request', { reason: verification.reason });
    return sendJson(res, 401, { error: `Invalid request: ${verification.reason}.` });
  }

  // Read this backend's own real product catalog (products.json — see
  // readProducts() above) and reshape each item into exactly the field
  // names Nexora's normalizeProduct() expects (../Nexora/src/lib/connectors/
  // nexoraNative.ts): sku/name/description/price/images/categories/
  // quantity/status. Field names deliberately differ from products.json's
  // own shape in a couple of places (`available` here vs `status`/
  // `quantity` on Nexora's side) — this reshaping step is exactly why a
  // bridge like this backend needs to exist at all, same as
  // forwardOrderCreated() does for orders.
  const products = readProducts().map((p) => ({
    sku: p.sku,
    name: p.name,
    description: p.description,
    price: p.price,
    images: p.images,
    categories: p.categories,
    // Glass genuinely has no real stock-count system today (its menu is
    // "available" or not, never "12 left") — so the only HONEST signal to
    // give Nexora is: unavailable items are out of stock (quantity 0);
    // available items have no real count to report, so `quantity` is left
    // out entirely rather than inventing a fake number. This is a real,
    // known limitation, not an oversight — see NEXORA_INTEGRATION.md.
    quantity: p.available ? undefined : 0,
  }));

  // Nexora's pull expects exactly this wrapper shape: a 2xx response whose
  // JSON body has a top-level "products" array — anything else (a bare
  // array, a different key name) is rejected on Nexora's own side as "no
  // parseable product list".
  sendJson(res, 200, { products });
}

// A small, separate, developer-only diagnostic endpoint — NOT part of the
// browser <-> Nexora bridge at all. Lets you (the developer) check from a
// terminal whether this backend currently has its Nexora env vars filled
// in, without ever exposing the secret values themselves.
function handleDevStatus(req, res) {
  if (!GLASS_DEV_TOKEN) {
    return sendJson(res, 503, { error: 'GLASS_DEV_TOKEN is not set — configure it in .env to use this endpoint.' });
  }
  const auth = req.headers['authorization'] || '';
  const match = /^Bearer\s+(.+)$/.exec(auth);
  const provided = match ? match[1] : req.headers['x-dev-token'];
  let authorized = false;
  try {
    const a = Buffer.from(String(provided || ''));
    const b = Buffer.from(GLASS_DEV_TOKEN);
    // Constant-time comparison — a plain `===` here would let an attacker
    // slowly guess GLASS_DEV_TOKEN one byte at a time by measuring how
    // long each wrong guess takes to reject.
    authorized = a.length === b.length && crypto.timingSafeEqual(a, b);
  } catch {
    authorized = false;
  }
  if (!authorized) return sendJson(res, 401, { error: 'Invalid or missing developer token.' });

  // Presence/absence only — the actual NEXORA_API_KEY / NEXORA_WEBHOOK_SECRET
  // string values are never included in this response.
  sendJson(res, 200, {
    nexoraApiBase: NEXORA_API_BASE,
    nexoraStoreId: NEXORA_STORE_ID || null,
    configured: {
      apiKey: Boolean(NEXORA_API_KEY),
      webhookSecret: Boolean(NEXORA_WEBHOOK_SECRET),
    },
    note: 'The Nexora connection code itself is generated in the Nexora dashboard (Terminal, or Integrations > Generate connection command) — Glass only consumes the resulting credentials via .env. See docs/NEXORA_INTEGRATION.md.',
  });
}

// Serves one of the allowlisted static files (index.html/script.js/style.css)
// straight off disk to the browser — this is how the browser gets the
// frontend code in the first place, BEFORE any of the /api/... bridging
// above ever runs.
function serveStatic(req, res, filename) {
  const filePath = path.join(__dirname, filename);
  fs.readFile(filePath, (err, data) => {
    if (err) return sendJson(res, 404, { error: 'Not found.' });
    const ext = path.extname(filename);
    res.writeHead(200, { 'Content-Type': STATIC_CONTENT_TYPES[ext] || 'application/octet-stream' });
    res.end(data);
  });
}

// ═══════════════════════════════════════════════════════════════════════
// THE ROUTER — this is the literal front door: every single request that
// reaches this backend (whether it's the browser asking for index.html,
// or script.js's pushGlassEvent() posting an order) arrives here first,
// and gets dispatched to exactly one of the handlers defined above based
// on its HTTP method + URL path.
// ═══════════════════════════════════════════════════════════════════════
const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const pathname = url.pathname;

  (async () => {
    try {
      // Static file requests — GET / , GET /script.js, GET /style.css.
      if (req.method === 'GET' && STATIC_FILES[pathname]) {
        return serveStatic(req, res, STATIC_FILES[pathname]);
      }
      // This is the exact line that makes "POST /api/orders" (sent by
      // script.js's pushGlassEvent from DB.placeOrder) reach
      // handleCreateOrder -> forwardOrderCreated -> Nexora's real API.
      if (req.method === 'POST' && pathname === '/api/orders') {
        return await handleCreateOrder(req, res);
      }
      // Matches "/api/orders/<anything>/status" and captures <anything> as
      // the order id — this is what makes "POST /api/orders/ORD-123/status"
      // (sent by script.js's pushGlassEvent from DB.updOrder) reach
      // handleOrderStatus -> forwardOrderStatus -> Nexora's signed webhook.
      const statusMatch = /^\/api\/orders\/([^/]+)\/status$/.exec(pathname);
      if (req.method === 'POST' && statusMatch) {
        return await handleOrderStatus(req, res, decodeURIComponent(statusMatch[1]));
      }
      // The developer-only diagnostic endpoint from earlier.
      if (req.method === 'GET' && pathname === '/api/nexora/health') {
        return handleDevStatus(req, res);
      }
      // Path 3 — Nexora itself calling in to read this backend's product
      // catalog (see handleProductsPull's own comment above for the full
      // explanation of when/why this gets hit).
      if (req.method === 'GET' && pathname === '/api/nexora/products') {
        return handleProductsPull(req, res);
      }
      // Anything else (unknown path/method) — a plain 404.
      sendJson(res, 404, { error: 'Not found.' });
    } catch (err) {
      log('error', 'unhandled request error', { path: pathname, error: String(err) });
      sendJson(res, 500, { error: 'Internal error.' });
    }
  })();
});

// Actually starts listening — until this runs, nothing above does
// anything. Everything from here down only executes once, at startup.
server.listen(PORT, () => {
  log('info', `Glass backend listening on http://localhost:${PORT}`);
  if (!NEXORA_API_KEY || !NEXORA_STORE_ID || !NEXORA_WEBHOOK_SECRET) {
    log('info', 'Nexora credentials incomplete — copy .env.example to .env and fill in real values from the Nexora dashboard.');
  }
  if (!NEXORA_OUTBOUND_SECRET) {
    log(
      'info',
      'NEXORA_OUTBOUND_SECRET is not set — GET /api/nexora/products will reject every request until you set this ' +
        "integration's outbound webhook URL to this backend in the Nexora dashboard and copy the one-time secret it gives you.",
    );
  }
});
