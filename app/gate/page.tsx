"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function Gate() {
  const router = useRouter();
  const [passcode, setPasscode] = useState("");
  const [state, setState] = useState<"idle" | "checking" | "wrong">("idle");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setState("checking");
    const res = await fetch("/api/auth", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ passcode }),
    });
    if (res.ok) {
      router.replace("/");
      router.refresh();
    } else {
      setState("wrong");
    }
  }

  return (
    <main className="flex flex-1 items-center justify-center px-6">
      <div className="w-full max-w-sm">
        <h1 className="font-serif text-4xl text-ink">zhaksartu</h1>
        <p className="mt-1 text-sm text-ink-muted">
          жақсарту <span className="mx-1">·</span> to improve
        </p>

        <form onSubmit={submit} className="mt-10">
          <label
            htmlFor="passcode"
            className="block font-mono text-xs uppercase tracking-wider text-ink-muted"
          >
            passcode
          </label>
          <input
            id="passcode"
            type="password"
            autoFocus
            value={passcode}
            onChange={(e) => {
              setPasscode(e.target.value);
              if (state === "wrong") setState("idle");
            }}
            className="mt-2 w-full rounded-[2px] border border-hairline bg-paper-2 px-3 py-2.5 text-ink outline-none focus:border-navy"
          />
          <button
            type="submit"
            disabled={state === "checking" || passcode.length === 0}
            className="mt-4 w-full rounded-[2px] bg-navy px-4 py-2.5 text-sm font-medium text-paper transition-colors hover:bg-navy-hover disabled:opacity-50"
          >
            {state === "checking" ? "Checking…" : "Enter"}
          </button>
          {state === "wrong" && (
            <p className="mt-3 text-sm text-ink-muted">
              Not it. Try again.
            </p>
          )}
        </form>
      </div>
    </main>
  );
}
