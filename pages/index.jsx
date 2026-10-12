import Head from "next/head";

const card = { background: "white", border: "1px solid #e8e6df", borderRadius: 14, padding: 18 };
const muted = { color: "#747970", fontSize: 13 };
const rows = [["9:30 AM", "Jamie Chen", "Cut + style", "Maya"], ["10:15 AM", "Alex Morgan", "Colour refresh", "Sofia"], ["11:00 AM", "Taylor Singh", "Consultation", "Maya"]];

export default function Home() {
  const metrics = [["Appointments today", "18"], ["New clients", "6"], ["Rebooking rate", "68%"], ["Estimated revenue", "$2,460 CAD"]];
  return <div style={{ minHeight: "100vh", display: "grid", gridTemplateColumns: "220px 1fr", background: "#f5f3ef", color: "#20231f", fontFamily: "Inter, system-ui, sans-serif" }}>
    <Head><title>Overview · Salon Operations</title><meta name="description" content="Synthetic salon dashboard preview." /></Head>
    <aside style={{ padding: 26, background: "#202a24", color: "#f6f4ec" }}><strong>✳ Salon Operations</strong><nav aria-label="Main navigation" style={{ display: "grid", gap: 18, marginTop: 40, color: "#c7d0c9" }}><span>Overview</span><span>Appointments</span><span>Clients</span><span>Services</span><span>Messages</span><span>Reports</span><span>Settings</span></nav></aside>
    <main style={{ padding: "38px 5vw", maxWidth: 1300 }}>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 28 }}><div><div style={muted}>Tuesday, October 13, 2026</div><h1 style={{ margin: "6px 0", fontSize: 30 }}>Good morning, Alex</h1><div style={muted}>Here’s what’s happening at your salon today.</div></div><span style={{ ...muted, background: "#e8eee4", padding: "9px 13px", borderRadius: 20 }}>Synthetic demo data</span></header>
      <section aria-label="Salon performance" style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 14, marginBottom: 20 }}>{metrics.map(([label, value]) => <article key={label} style={card}><div style={muted}>{label}</div><strong style={{ display: "block", fontSize: 26, marginTop: 14 }}>{value}</strong></article>)}</section>
      <section style={{ ...card, padding: 22 }}><h2 style={{ fontSize: 17, margin: "0 0 16px" }}>Upcoming appointments</h2>{rows.map((row) => <div key={row[0]} style={{ display: "grid", gridTemplateColumns: "1fr 1.4fr 1.4fr 1fr", gap: 10, padding: "14px 0", borderTop: "1px solid #eeede7", fontSize: 13 }}>{row.map((item) => <span key={item}>{item}</span>)}</div>)}</section>
      <p style={{ ...muted, marginTop: 16 }}>Preview only · All displayed records are synthetic.</p>
    </main>
  </div>;
}
