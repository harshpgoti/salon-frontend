import Head from "next/head";
import { useEffect, useState } from "react";

const button = {
  border: 0, borderRadius: 8, padding: "12px 18px", background: "#334b39",
  color: "white", fontWeight: 650, cursor: "pointer",
};

export default function UnsubscribePage() {
  const [token, setToken] = useState("");
  const [state, setState] = useState("ready");

  useEffect(() => {
    const value = new URLSearchParams(window.location.hash.slice(1)).get("token") || "";
    setToken(value);
  }, []);

  async function unsubscribe() {
    if (!token || state === "sending") return;
    setState("sending");
    try {
      const response = await fetch("/api/unsubscribe", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      if (!response.ok) throw new Error("link unavailable");
      setState("done");
      setToken("");
      window.history.replaceState({}, "", window.location.pathname);
    } catch {
      setState("error");
    }
  }

  const message = {
    ready: "Choose below to stop email messages from this salon.",
    sending: "Updating your email preferences…",
    done: "You are unsubscribed from email messages from this salon.",
    error: "This link is invalid or expired. Contact the salon if you need help.",
  }[state];

  return (
    <main style={{ minHeight: "100vh", background: "#f5f3ef", color: "#20231f",
      fontFamily: "Inter, system-ui, sans-serif", display: "grid", placeItems: "center", padding: 24 }}>
      <Head>
        <title>Email preferences</title>
        <meta name="robots" content="noindex,nofollow" />
        <meta name="referrer" content="no-referrer" />
      </Head>
      <section style={{ width: "min(100%, 520px)", background: "white", border: "1px solid #dedbd3",
        borderRadius: 14, padding: 28, boxShadow: "0 12px 36px #1f2a1b12" }}>
        <p style={{ margin: 0, color: "#53614f", fontSize: 13, fontWeight: 700 }}>EMAIL PREFERENCES</p>
        <h1 style={{ margin: "10px 0", fontSize: 28 }}>Unsubscribe</h1>
        {state !== "error" && <p role="status" aria-live="polite" style={{ lineHeight: 1.55 }}>{message}</p>}
        {state === "error" && <p role="alert" style={{ lineHeight: 1.55 }}>{message}</p>}
        {state === "ready" && token && (
          <button type="button" style={button} onClick={unsubscribe}>Unsubscribe from email</button>
        )}
        {state === "ready" && !token && <p>This link is missing its unsubscribe code.</p>}
      </section>
    </main>
  );
}

export async function getServerSideProps({ res }) {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Referrer-Policy", "no-referrer");
  return { props: {} };
}
