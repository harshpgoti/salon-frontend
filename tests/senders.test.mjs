import test from "node:test";
import assert from "node:assert/strict";

const tenant = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const sender = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

async function loadHandler() {
  process.env.API_BASE_URL = "https://api.example.invalid";
  const { default: handler } = await import(`../pages/api/senders.js?test=${Date.now()}`);
  return handler;
}

function response() {
  return {
    headers: {}, statusCode: 200, body: undefined,
    setHeader(name, value) { this.headers[name] = value; },
    status(value) { this.statusCode = value; return this; },
    json(value) { this.body = value; return this; },
  };
}

test("sender list and mutations use the tenant-scoped authenticated API", async () => {
  const handler = await loadHandler();
  const previous = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, init) => {
    calls.push({ url: new URL(url), init });
    return new Response(JSON.stringify({ items: [] }), { status: 200 });
  };
  try {
    const list = response();
    await handler({ method: "GET", query: { tenant_id: tenant }, headers: { cookie: "salon_session=opaque" } }, list);
    assert.equal(list.statusCode, 200);
    assert.equal(calls[0].url.pathname, `/v1/tenants/${tenant}/sms-senders`);
    assert.equal(calls[0].init.headers.cookie, "salon_session=opaque");

    const verify = response();
    await handler({ method: "POST", query: { tenant_id: tenant, sender_id: sender, action: "verify" },
      headers: { cookie: "salon_session=opaque", origin: "https://salon.example.invalid" },
      body: { code: "123456" } }, verify);
    assert.equal(calls[1].url.pathname, `/v1/tenants/${tenant}/sms-senders/${sender}/verify`);
    assert.equal(calls[1].init.body, JSON.stringify({ code: "123456" }));
    assert.equal(calls[1].init.headers.origin, "https://salon.example.invalid");
  } finally {
    globalThis.fetch = previous;
  }
});

test("sender proxy rejects unsupported methods and actions before upstream calls", async () => {
  const handler = await loadHandler();
  const previous = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => { calls += 1; return new Response("{}", { status: 200 }); };
  try {
    const badAction = response();
    await handler({ method: "POST", query: { tenant_id: tenant, sender_id: sender, action: "delete" }, headers: {} }, badAction);
    assert.equal(badAction.statusCode, 400);
    const badMethod = response();
    await handler({ method: "DELETE", query: { tenant_id: tenant }, headers: {} }, badMethod);
    assert.equal(badMethod.statusCode, 405);
    assert.equal(badMethod.headers.Allow, "GET, POST");
    assert.equal(calls, 0);
  } finally {
    globalThis.fetch = previous;
  }
});
