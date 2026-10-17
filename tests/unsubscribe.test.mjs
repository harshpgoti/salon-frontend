import test from "node:test";
import assert from "node:assert/strict";

const oldBase = process.env.API_BASE_URL;
process.env.API_BASE_URL = "http://api.invalid";
const { default: unsubscribe } = await import("../pages/api/unsubscribe.js");
if (oldBase === undefined) delete process.env.API_BASE_URL;
else process.env.API_BASE_URL = oldBase;

function response() {
  const value = { headers: {} };
  return {
    value,
    setHeader(key, item) { value.headers[key.toLowerCase()] = item; },
    status(code) { value.status = code; return this; },
    json(body) { value.body = body; return this; },
    end(body) { value.body = body; return this; },
  };
}

test("public unsubscribe proxy accepts only POST and never forwards browser cookies", async () => {
  const originalFetch = global.fetch;
  let forwarded;
  global.fetch = async (url, options) => {
    forwarded = { url: String(url), options };
    return { status: 204 };
  };
  try {
    const denied = response();
    await unsubscribe({ method: "GET", headers: { cookie: "private=session" } }, denied);
    assert.equal(denied.value.status, 405);

    const accepted = response();
    await unsubscribe({ method: "POST", body: { token: "A".repeat(43) },
      headers: { cookie: "private=session" } }, accepted);
    assert.equal(accepted.value.status, 204);
    assert.equal(forwarded.url, "http://api.invalid/v1/public/communications/unsubscribe");
    assert.deepEqual(JSON.parse(forwarded.options.body), { token: "A".repeat(43) });
    assert.equal("cookie" in forwarded.options.headers, false);
  } finally {
    global.fetch = originalFetch;
  }
});
