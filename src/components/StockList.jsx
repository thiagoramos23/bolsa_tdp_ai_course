import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import { money, percent, variation } from "../api.js";

export default function StockList({ stocks, selected, onSelect }) {
  return (
    <aside className="stock-list panel" aria-label="Ações disponíveis">
      <div className="list-heading">
        <h2>Ações</h2>
        <span>Variação em 1h</span>
      </div>
      <div className="stock-items">
        {stocks.map((stock) => {
          const change = variation(stock);
          const Icon = change >= 0 ? ArrowUpRight : ArrowDownRight;
          return (
            <button
              key={stock.id_acao}
              className={`stock-row ${selected === stock.id_acao ? "selected" : ""}`}
              aria-pressed={selected === stock.id_acao}
              onClick={() => onSelect(stock.id_acao)}
            >
              <span className="stock-name">
                <strong>{stock.ticker}</strong>
                <small>{stock.nome_empresa}</small>
              </span>
              <span className="stock-value">
                <strong>{money(stock.valor_cotacao)}</strong>
                <small className={change >= 0 ? "positive" : "negative"}>
                  <Icon size={13} />
                  {percent(change)}
                </small>
              </span>
            </button>
          );
        })}
      </div>
    </aside>
  );
}
