import { useEffect, useState } from "react";
import { Pause, Play } from "lucide-react";
import { request } from "../api.js";

export default function SimulationControl({ active, onChange }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    if (!active) return;
    const controller = new AbortController();
    async function heartbeat() {
      if (document.visibilityState !== "visible") return;
      try {
        const state = await request("/api/simulation", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "heartbeat" }),
          signal: AbortSignal.any([
            controller.signal,
            AbortSignal.timeout(10000),
          ]),
        });
        if (!state.active && !controller.signal.aborted) onChange();
      } catch {
        /* O contato expira no servidor se a tela perder a conexão. */
      }
    }
    heartbeat();
    const interval = setInterval(heartbeat, 20000);
    document.addEventListener("visibilitychange", heartbeat);
    return () => {
      clearInterval(interval);
      controller.abort();
      document.removeEventListener("visibilitychange", heartbeat);
    };
  }, [active, onChange]);
  async function toggle() {
    if (pending) return;
    setPending(true);
    setError("");
    try {
      await request("/api/simulation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: active ? "pause" : "start" }),
      });
      onChange();
    } catch {
      setError("Não foi possível alterar a simulação. Tente novamente.");
    } finally {
      setPending(false);
    }
  }
  const Icon = active ? Pause : Play;
  return (
    <div className="simulation-control">
      <div
        className={`simulation-status ${active ? "" : "paused"}`}
        title="Simulação compartilhada. Pausa após 1 minuto sem uma tela visível."
      >
        <span className="status-dot" />
        {active ? "Preços simulados · 5s" : "Simulação pausada"}
      </div>
      <button className="simulation-toggle" disabled={pending} onClick={toggle}>
        <Icon size={13} />
        {pending
          ? "Aguarde…"
          : active
            ? "Pausar simulação"
            : "Iniciar simulação"}
      </button>
      {error && (
        <p className="simulation-error" role="status">
          {error}
        </p>
      )}
    </div>
  );
}
