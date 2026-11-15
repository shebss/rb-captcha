import "dotenv/config";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import Stripe from "stripe";

const root = resolve(fileURLToPath(new URL(".", import.meta.url)));
const port = Number(process.env.PORT || 4173);
const host = process.env.HOST || "127.0.0.1";
const baseUrl = (process.env.APP_BASE_URL || `http://localhost:${port}`).replace(/\/$/, "");
const secretKey = process.env.STRIPE_SECRET_KEY || "";
const livePaymentsEnabled = process.env.ENABLE_LIVE_PAYMENTS === "true";
const stripe = secretKey ? new Stripe(secretKey) : null;

const contentTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".md": "text/plain; charset=utf-8",
  ".png": "image/png"
};

function sendJson(response, status, payload) {
  response.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
  response.end(JSON.stringify(payload));
}

function getConfiguredStripe(response) {
  if (!stripe) {
    sendJson(response, 503, { error: "Stripe is not configured. Add your Stripe test secret to .env and restart the server." });
    return null;
  }
  if (!secretKey.startsWith("sk_test_") && !secretKey.startsWith("sk_live_")) {
    sendJson(response, 503, { error: "Use a Stripe secret key that begins with sk_test_." });
    return null;
  }
  if (secretKey.startsWith("sk_live_") && !livePaymentsEnabled) {
    sendJson(response, 503, { error: "Live payments are disabled. Use a test key or explicitly enable live payments on the server." });
    return null;
  }
  return stripe;
}

async function handleApi(request, response, url) {
  if (request.method === "POST") {
    const origin = request.headers.origin;
    if (origin && origin !== new URL(baseUrl).origin) {
      sendJson(response, 403, { error: "Checkout requests must come from this site." });
      return;
    }
  }
  const paymentProvider = getConfiguredStripe(response);
  if (!paymentProvider) return;

  if (request.method === "POST" && url.pathname === "/api/checkout-session") {
    try {
      const session = await paymentProvider.checkout.sessions.create({
        mode: "payment",
        managed_payments: { enabled: false },
        line_items: [{
          price_data: {
            currency: "usd",
            unit_amount: 99,
            product_data: { name: "Human-ish CAPTCHA skip" }
          },
          quantity: 1
        }],
        metadata: { purpose: "captcha-skip" },
        success_url: `${baseUrl}/?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${baseUrl}/?checkout=cancelled`
      });
      sendJson(response, 200, { url: session.url });
    } catch {
      sendJson(response, 502, { error: "Stripe could not create a checkout session. Check the server's Stripe configuration." });
    }
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/checkout-session") {
    const sessionId = url.searchParams.get("session_id") || "";
    if (!/^cs_(test|live)_[A-Za-z0-9_]+$/.test(sessionId)) {
      sendJson(response, 400, { error: "A valid Stripe Checkout session ID is required." });
      return;
    }
    try {
      const session = await paymentProvider.checkout.sessions.retrieve(sessionId);
      const paid = session.payment_status === "paid" &&
        session.mode === "payment" &&
        session.amount_total === 99 &&
        session.currency === "usd" &&
        session.metadata?.purpose === "captcha-skip";
      sendJson(response, 200, { paid });
    } catch {
      sendJson(response, 502, { error: "Stripe could not verify this checkout session." });
    }
    return;
  }

  sendJson(response, 404, { error: "API route not found." });
}

async function serveStatic(request, response, url) {
  let pathname;
  try {
    pathname = decodeURIComponent(url.pathname);
  } catch {
    response.writeHead(400).end("Bad request");
    return;
  }
  const relativePath = pathname === "/" ? "index.html" : pathname.replace(/^\/+/, "");
  const isPublicAsset = relativePath === "index.html" || relativePath === "styles.css" ||
    /^src\/(?:registry|app|login-captcha)\.js$/.test(relativePath) ||
    /^src\/games\/[A-Za-z0-9._-]+\.js$/.test(relativePath) ||
    /^src\/assets\/[A-Za-z0-9._-]+\.png$/.test(relativePath);
  if (!isPublicAsset) {
    response.writeHead(404).end("Not found");
    return;
  }
  const filePath = resolve(root, relativePath);
  if (filePath !== root && !filePath.startsWith(`${root}${sep}`)) {
    response.writeHead(403).end("Forbidden");
    return;
  }
  try {
    const contents = await readFile(filePath);
    response.writeHead(200, {
      "content-type": contentTypes[extname(filePath)] || "application/octet-stream",
      "cache-control": "no-cache"
    });
    response.end(request.method === "HEAD" ? undefined : contents);
  } catch {
    response.writeHead(404).end("Not found");
  }
}

const server = createServer(async (request, response) => {
  const url = new URL(request.url || "/", baseUrl);
  if (url.pathname.startsWith("/api/")) {
    await handleApi(request, response, url);
    return;
  }
  if (request.method !== "GET" && request.method !== "HEAD") {
    response.writeHead(405, { allow: "GET, HEAD" }).end("Method not allowed");
    return;
  }
  await serveStatic(request, response, url);
});

server.listen(port, host, () => {
  console.log(`Human-ish is running at ${baseUrl}`);
  if (!secretKey) console.log("Stripe is not configured yet. Copy .env.example to .env and add a Stripe test secret.");
});