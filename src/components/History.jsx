import { useState } from "react";
import { ArrowLeft, ArrowRight, History as HistoryIcon } from "lucide-react";
import { money, number, useLiveData } from "../api.js";

export default function History({ version }) {
  const [page, setPage] = useState(1);
  const { data, error } = useLiveData(`/api/trades?page=${page}`, version);
  return (
    <section className="panel history-panel">
      <div className="section-heading">
        <h2>Suas negociações</h2>
        <span>{data?.total ?? 0} operações</span>
      </div>
      {error && (
        <p className="inline-error" role="status">
          {error}
        </p>
      )}
      {!data ? (
        <p className="loading">Carregando histórico…</p>
      ) : data.total === 0 ? (
        <div className="empty-state">
          <HistoryIcon size={30} strokeWidth={1.5} />
          <h3>Uma nova história começa aqui</h3>
          <p>Suas compras e vendas aparecerão nesta lista.</p>
        </div>
      ) : (
        <>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Data e hora</th>
                  <th>Operação</th>
                  <th>Ativo</th>
                  <th>Quantidade</th>
                  <th>Preço unitário</th>
                  <th>Total</th>
                </tr>
              </thead>
              <tbody>
                {data.trades.map((trade) => (
                  <tr key={trade.id_negociacao}>
                    <td>{new Date(trade.data_hora).toLocaleString("pt-BR")}</td>
                    <td>
                      <span
                        className={`operation-label ${trade.tipo_operacao === "COMPRA" ? "positive" : "negative"}`}
                      >
                        {trade.tipo_operacao === "COMPRA" ? "Compra" : "Venda"}
                      </span>
                    </td>
                    <td>
                      <strong>{trade.ticker}</strong>
                    </td>
                    <td>{number(trade.quantidade_acoes)}</td>
                    <td>{money(trade.valor_unitario)}</td>
                    <td className="table-total">{money(trade.valor_total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="pagination">
            <span>
              Página {page} de {Math.max(1, Math.ceil(data.total / 20))}
            </span>
            <button
              aria-label="Página anterior"
              disabled={page <= 1}
              onClick={() => setPage(page - 1)}
            >
              <ArrowLeft size={16} />
            </button>
            <button
              aria-label="Próxima página"
              disabled={page * 20 >= data.total}
              onClick={() => setPage(page + 1)}
            >
              <ArrowRight size={16} />
            </button>
          </div>
        </>
      )}
    </section>
  );
}
