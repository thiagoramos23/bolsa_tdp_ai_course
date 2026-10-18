import { useEffect, useState } from "react";

export async function request(url, options = {}) {
  const response = await fetch(url, {
    signal: AbortSignal.timeout(10000),
    ...options,
  });
  const body = await response.json();
  if (!response.ok) {
    const error = new Error(
      body.error || "Não foi possível carregar os dados.",
    );
    error.status = response.status;
    throw error;
  }
  return body;
}

export function useLiveData(url, version = 0) {
  const [state, setState] = useState({ url, data: null, error: "" });
  useEffect(() => {
    const controller = new AbortController();
    let timer;
    async function load() {
      try {
        const data = await request(url, {
          signal: AbortSignal.any([
            controller.signal,
            AbortSignal.timeout(10000),
          ]),
        });
        if (!controller.signal.aborted) setState({ url, data, error: "" });
      } catch (error) {
        if (!controller.signal.aborted)
          setState((previous) => ({
            ...previous,
            url,
            error:
              "Não foi possível atualizar. Tentaremos novamente em instantes.",
          }));
      } finally {
        if (!controller.signal.aborted) timer = setTimeout(load, 5000);
      }
    }
    load();
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [url, version]);
  return state.url === url ? state : { url, data: null, error: "" };
}

const currency = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});
export const money = (value) => currency.format(Number(value ?? 0));
export const number = (value) =>
  new Intl.NumberFormat("pt-BR").format(Number(value));
export const time = (value) =>
  new Intl.DateTimeFormat("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(new Date(value));
export function variation(stock) {
  return (
    (Number(stock.valor_cotacao) / Number(stock.preco_referencia) - 1) * 100
  );
}
export const percent = (value) =>
  `${value >= 0 ? "+" : ""}${value.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;
