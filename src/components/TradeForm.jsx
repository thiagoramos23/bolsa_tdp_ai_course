import { useRef, useState } from "react";
import { Minus, Plus } from "lucide-react";
import { money, number, request } from "../api.js";

export default function TradeForm({ stock, onTrade }) {
  const [operation, setOperation] = useState("COMPRA");
  const [quantity, setQuantity] = useState("1");
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState(null);
  const lastRequest = useRef(null);
  const sending = useRef(false);
  const amount = Number(quantity);
  const valid =
    Number.isSafeInteger(amount) && amount >= 1 && amount <= 1000000;
  const buying = operation === "COMPRA";
  async function submit(event) {
    event.preventDefault();
    if (!valid || sending.current) return;
    sending.current = true;
    setPending(true);
    setMessage(null);
    const signature = `${stock.id_acao}:${operation}:${amount}`;
    if (lastRequest.current?.signature !== signature) {
      lastRequest.current = { signature, id: crypto.randomUUID() };
    }
    try {
      const trade = await request("/api/trades", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          stockId: Number(stock.id_acao),
          operation,
          quantity: amount,
          requestId: lastRequest.current.id,
        }),
      });
      lastRequest.current = null;
      setMessage({
        ok: true,
        text: `${buying ? "Compra" : "Venda"} de ${number(amount)} ${stock.ticker} concluída a ${money(trade.valor_unitario)} por ação.`,
      });
      onTrade();
    } catch (error) {
      if (error.status) lastRequest.current = null;
      setMessage({
        ok: false,
        text: error.status
          ? error.message
          : "Sem confirmação do servidor. Envie a mesma operação novamente para consultar o resultado sem duplicá-la.",
      });
    } finally {
      sending.current = false;
      setPending(false);
    }
  }
  return (
    <section className="order-panel panel">
      <h2>Negociar</h2>
      <form onSubmit={submit}>
        <fieldset disabled={pending}>
          <legend className="sr-only">Tipo de operação</legend>
          <div className={`operation-tabs ${buying ? "" : "selling"}`}>
            <button
              type="button"
              aria-pressed={buying}
              onClick={() => {
                setOperation("COMPRA");
                setMessage(null);
              }}
            >
              Comprar
            </button>
            <button
              type="button"
              aria-pressed={!buying}
              onClick={() => {
                setOperation("VENDA");
                setMessage(null);
              }}
            >
              Vender
            </button>
          </div>
          <label htmlFor="quantity">Quantidade</label>
          <div className="quantity-control">
            <button
              type="button"
              aria-label="Diminuir quantidade"
              disabled={amount <= 1}
              onClick={() => setQuantity(String(Math.max(1, amount - 1)))}
            >
              <Minus size={16} />
            </button>
            <input
              id="quantity"
              name="quantity"
              type="number"
              inputMode="numeric"
              min="1"
              max="1000000"
              step="1"
              required
              value={quantity}
              onChange={(event) => setQuantity(event.target.value)}
            />
            <button
              type="button"
              aria-label="Aumentar quantidade"
              disabled={amount >= 1000000}
              onClick={() => setQuantity(String(Math.min(1000000, amount + 1)))}
            >
              <Plus size={16} />
            </button>
          </div>
          <div className="price-label">Preço (por ação)</div>
          <div className="price-value">{money(stock.valor_cotacao)}</div>
          <p className="holding">
            Você possui <strong>{number(stock.quantidade_acoes)}</strong> ações
            de {stock.ticker}.
          </p>
          <div className="order-total">
            <span>Total estimado</span>
            <strong>
              {money(valid ? amount * Number(stock.valor_cotacao) : 0)}
            </strong>
          </div>
          <button
            className={`primary ${buying ? "" : "sell-button"}`}
            disabled={!valid || pending}
            type="submit"
          >
            {pending
              ? "Confirmando…"
              : `${buying ? "Comprar" : "Vender"} ${stock.ticker}`}
          </button>
          <p className="order-note">Valor final calculado na confirmação.</p>
        </fieldset>
      </form>
      {message && (
        <p
          className={`trade-message ${message.ok ? "success" : "failure"}`}
          role="status"
        >
          {message.text}
        </p>
      )}
    </section>
  );
}
