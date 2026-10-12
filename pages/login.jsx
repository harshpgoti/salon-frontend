import Head from "next/head";
import { useRouter } from "next/router";

export default function Login() {
  const router = useRouter();
  const api = process.env.NEXT_PUBLIC_API_BASE_URL || "";
  const surface = router.query.surface === "company" ? "company" : "staff";
  const signedIn = router.query.status === "signed-in";
  const start = api ? new URL("/v1/auth/" + surface + "/start", api).toString() : "#";
  return <main style={{ maxWidth: 480, margin: "12vh auto", padding: 28, fontFamily: "system-ui", color: "#20231f" }}>
    <Head><title>{surface === "company" ? "Company operations sign in" : "Salon team sign in"}</title></Head>
    <a href="/" style={{ color: "#526b55" }}>Salon Operations</a>
    <h1>{surface === "company" ? "Company operations" : "Salon team sign in"}</h1>
    {signedIn ? <p role="status">Identity provider sign-in completed. Your protected workspace is ready when access is assigned.</p> : <p>Sign in through your organization’s secure identity provider. Passwords and recovery stay with the provider.</p>}
    <p><a href={start} style={{ display: "inline-block", padding: 13, background: "#334b39", color: "white", borderRadius: 8, textDecoration: "none" }}>Continue securely</a></p>
    {!api && <p role="alert">Sign-in service is not configured.</p>}
    <p><a href={surface === "company" ? "/login?surface=staff" : "/login?surface=company"}>Use {surface === "company" ? "salon team" : "company operations"} sign-in</a></p>
    <p><small>Password reset and MFA enrollment are handled by the secure identity provider.</small></p>
  </main>;
}
