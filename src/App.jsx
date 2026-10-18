import { useCallback, useState } from "react";
import { Activity, TrendingUp, WifiOff } from "lucide-react";
import { useLiveData } from "./api.js";
import Summary from "./components/Summary.jsx";
import StockList from "./components/StockList.jsx";
import PriceChart from "./components/PriceChart.jsx";
import TradeForm from "./components/TradeForm.jsx";
import Portfolio from "./components/Portfolio.jsx";
import History from "./components/History.jsx";
import Retrospective from "./components/Retrospective.jsx";
import SimulationControl from "./components/SimulationControl.jsx";

const titles = {
  market: ["Mercado", "Acompanhe o mercado. Explore suas decisões."],
  portfolio: ["Carteira", "Suas ações, seu saldo e suas escolhas."],
  history: ["Histórico", "Cada decisão fica registrada."],
};

export default function App() {
  const [tab, setTab] = useState("market");
  const [selected, setSelected] = useState(null);
  const [version, setVersion] = useState(0);
  const { data, error } = useLiveData("/api/overview", version);
  const refresh = useCallback(() => setVersion((value) => value + 1), []);
  const stock =
    data?.stocks.find((item) => item.id_acao === selected) ?? data?.stocks[0];
  function selectStock(id) {
    setSelected(id);
    setTab("market");
  }
  return (
    <>
      <a className="skip-link" href="#main">
        Pular para conteúdo
      </a>
      <header className="site-header">
        <div className="header-inner">
          <a
            className="brand"
            href="#"
            onClick={(event) => {
              event.preventDefault();
              setTab("market");
            }}
          >
            <TrendingUp size={30} strokeWidth={2.5} />
            <span>Bolsa Lab</span>
          </a>
          <nav aria-label="Navegação principal">
            {[
              ["market", "Mercado"],
              ["portfolio", "Carteira"],
              ["history", "Histórico"],
            ].map(([key, label]) => (
              <button
                key={key}
                aria-current={tab === key ? "page" : undefined}
                onClick={() => setTab(key)}
              >
                {label}
              </button>
            ))}
          </nav>
          <SimulationControl
            active={data?.simulation.active ?? false}
            onChange={refresh}
          />
          <div
            className="avatar"
            title="Investidor de demonstração"
            aria-label="Investidor de demonstração"
          >
            D
          </div>
        </div>
      </header>
      <main id="main" className="main-container">
        <div className="page-heading">
          <h1>{titles[tab][0]}</h1>
          <p>{titles[tab][1]}</p>
        </div>
        {error && (
          <div className="connection-error" role="status">
            <WifiOff size={18} />
            {error} As operações podem estar indisponíveis.
          </div>
        )}
        {!data ? (
          <div className="loading-panel panel">
            <Activity size={30} />
            <h2>Preparando o mercado</h2>
            <p>Carregando ações e sua carteira…</p>
          </div>
        ) : (
          <>
            <Summary balance={data.balance} />
            {tab === "market" && (
              <>
                <div className="trading-layout">
                  <StockList
                    stocks={data.stocks}
                    selected={stock?.id_acao}
                    onSelect={setSelected}
                  />
                  {stock ? (
                    <>
                      <PriceChart key={`chart:${stock.id_acao}`} stock={stock} />
                      <TradeForm
                        key={`order:${stock.id_acao}`}
                        stock={stock}
                        onTrade={refresh}
                      />
                    </>
                  ) : (
                    <p>Nenhuma ação disponível.</p>
                  )}
                </div>
                <Portfolio stocks={data.stocks} onSelect={selectStock} />
              </>
            )}
            {tab === "portfolio" && (
              <>
                <Portfolio stocks={data.stocks} onSelect={selectStock} />
                <Retrospective />
              </>
            )}
            {tab === "history" && <History version={version} />}
          </>
        )}
        <footer>
          Dinheiro e cotações fictícios. Este é um simulador educacional.
          <span>
            Gráficos com{" "}
            <a
              href="https://www.tradingview.com/"
              target="_blank"
              rel="noreferrer"
            >
            TradingView Lightweight Charts™ © 2025 TradingView, Inc.
            </a>
            .
          </span>
        </footer>
      </main>
    </>
  );
}
