import { useEffect, useRef, useState } from "react";
import { money, number, request } from "../api.js";

export default function Retrospective() {
  const [at, setAt] = useState(() => {
    const now = new Date();
    return new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 19);
  });
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const controller = useRef(null);
  useEffect(() => () => controller.current?.abort(), []);
  async function submit(event) {
    event.preventDefault();
    controller.current?.abort();
    const current = new AbortController();
    controller.current = current;
    setLoading(true);
    setError("");
    setResult(null);
    try {
      const data = await request(
        `/api/portfolio?at=${encodeURIComponent(new Date(at).toISOString())}`,
        {
          signal: AbortSignal.any([current.signal, AbortSignal.timeout(10000)]),
        },
      );
      if (!current.signal.aborted) setResult(data);
    } catch (failure) {
      if (!current.signal.aborted)
        setError(
          failure.status
            ? failure.message
            : "Não foi possível consultar a carteira. Tente novamente.",
        );
    } finally {
      if (!current.signal.aborted) setLoading(false);
    }
  }
  const unknown = result?.positions.some(
    (position) => position.valor_posicao === null,
  );
  const stocksValue =
    result?.positions.reduce(
      (sum, position) => sum + Number(position.valor_posicao),
      0,
    ) ?? 0;
  return (
    <section className="panel retrospective">
      <div>
        <h2>Carteira no passado</h2>
        <p>Consulte suas posições e as cotações disponíveis naquele momento.</p>
      </div>
      <form onSubmit={submit}>
        <label htmlFor="portfolio-at">Data e hora</label>
        <div className="retrospective-inputs">
          <input
            id="portfolio-at"
            type="datetime-local"
            step="1"
            required
            value={at}
            onChange={(event) => setAt(event.target.value)}
          />
          <button className="primary" disabled={loading}>
            {loading ? "Consultando…" : "Consultar"}
          </button>
        </div>
      </form>
      {error && (
        <p className="inline-error" role="status">
          {error}
        </p>
      )}
      {result && (
        <div className="retrospective-result" role="status">
          <p>Em {new Date(result.at).toLocaleString("pt-BR")}</p>
          <div className="past-summary">
            <span>
              Dinheiro <strong>{money(result.balance.saldo_disponivel)}</strong>
            </span>
            <span>
              Em ações{" "}
              <strong>{unknown ? "Sem cotação" : money(stocksValue)}</strong>
            </span>
            <span>
              Patrimônio{" "}
              <strong>
                {unknown
                  ? "Sem cotação"
                  : money(
                      Number(result.balance.saldo_disponivel) + stocksValue,
                    )}
              </strong>
            </span>
          </div>
          {result.positions.length ? (
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Ativo</th>
                    <th>Quantidade</th>
                    <th>Cotação no momento</th>
                    <th>Valor total</th>
                  </tr>
                </thead>
                <tbody>
                  {result.positions.map((position) => (
                    <tr key={position.id_acao}>
                      <td>
                        <strong>{position.ticker}</strong>
                      </td>
                      <td>{number(position.quantidade_acoes)}</td>
                      <td>
                        {position.valor_cotacao === null
                          ? "Sem cotação anterior"
                          : money(position.valor_cotacao)}
                      </td>
                      <td>
                        {position.valor_posicao === null
                          ? "Desconhecido"
                          : money(position.valor_posicao)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p>Nenhuma ação em carteira nesse momento.</p>
          )}
        </div>
      )}
    </section>
  );
}
