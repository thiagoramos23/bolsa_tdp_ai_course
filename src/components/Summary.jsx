import { money } from "../api.js";

export default function Summary({ balance }) {
  const cash = Number(balance.saldo_disponivel);
  const stocks = Number(balance.valor_acoes);
  return (
    <section className="summary" aria-label="Resumo da carteira">
      <div>
        <span>Dinheiro disponível</span>
        <strong>{money(cash)}</strong>
      </div>
      <div>
        <span>Em ações</span>
        <strong>{money(stocks)}</strong>
      </div>
      <div>
        <span>Patrimônio</span>
        <strong>{money(cash + stocks)}</strong>
      </div>
    </section>
  );
}
