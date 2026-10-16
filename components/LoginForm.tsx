"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { FormEvent } from "react";

export default function LoginForm() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (res.ok) {
        router.replace("/");
        router.refresh();
      } else {
        const data = await res.json().catch(() => ({}));
        setError(data.error || "Login failed");
        setBusy(false);
      }
    } catch {
      setError("Network error — please try again");
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit}>
      {error ? <div className="error">{error}</div> : null}
      <div className="field">
        <label htmlFor="pw">Admin Password</label>
        <input
          id="pw"
          type="password"
          autoFocus
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Enter password"
          disabled={busy}
        />
      </div>
      <button className="btn block" type="submit" disabled={busy || !password}>
        {busy ? "Verifying…" : "Sign In"}
      </button>
    </form>
  );
}
