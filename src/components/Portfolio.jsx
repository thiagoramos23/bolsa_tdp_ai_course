import { BriefcaseBusiness, ArrowUpRight } from "lucide-react";
import { money, number } from "../api.js";

export default function Portfolio({ stocks, onSelect }) {
  const positions = stocks.filter(
    (stock) => Number(stock.quantidade_acoes) > 0,
  );
  return (
    <section className="portfolio-panel panel">
      <div className="section-heading">
        <h2>Minha carteira</h2>
        <span>
          {positions.length} {positions.length === 1 ? "ativo" : "ativos"}
        </span>
      </div>
      {positions.length ? (
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Ativo</th>
                <th>Quantidade</th>
                <th title="Média ponderada das compras das ações que ainda estão na carteira">Preço médio de compra</th>
                <th>Preço atual</th>
                <th>Valor total</th>
                <th>
                  <span className="sr-only">Ações</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {positions.map((stock) => (
                <tr key={stock.id_acao}>
                  <td>
                    <strong>{stock.ticker}</strong>
                    <small>{stock.nome_empresa}</small>
                  </td>
                  <td>{number(stock.quantidade_acoes)}</td>
                  <td>{money(stock.preco_medio_compra)}</td>
                  <td>{money(stock.valor_cotacao)}</td>
                  <td className="table-total">{money(stock.valor_posicao)}</td>
                  <td>
                    <button
                      className="text-button"
                      onClick={() => onSelect(stock.id_acao)}
                    >
                      Negociar <ArrowUpRight size={14} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="empty-state">
          <BriefcaseBusiness size={30} strokeWidth={1.5} />
          <h3>Sua carteira começa aqui</h3>
          <p>Compre sua primeira ação para acompanhar sua posição.</p>
        </div>
      )}
    </section>
  );
}
