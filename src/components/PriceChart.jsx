import { useEffect, useRef, useState } from "react";
import { AreaSeries, ColorType, createChart } from "lightweight-charts";
import { money, percent, time, useLiveData, variation } from "../api.js";

export default function PriceChart({ stock }) {
  const [period, setPeriod] = useState("1h");
  const { data, error } = useLiveData(
    `/api/stocks/${stock.id_acao}/quotes?period=${period}`,
  );
  const container = useRef(null);
  const chartRef = useRef(null);
  const seriesRef = useRef(null);
  const previous = useRef(null);
  const change = variation(stock);
  useEffect(() => {
    const chart = createChart(container.current, {
      autoSize: true,
      layout: {
        background: { type: ColorType.Solid, color: "#ffffff" },
        textColor: "#728198",
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
        fontSize: 11,
      },
      grid: { vertLines: { visible: false }, horzLines: { color: "#eef1f5" } },
      rightPriceScale: { borderVisible: false, entireTextOnly: true },
      timeScale: {
        timeVisible: true,
        secondsVisible: false,
        borderVisible: false,
        tickMarkFormatter: (timestamp) =>
          new Date(timestamp * 1000).toLocaleTimeString("pt-BR", {
            hour: "2-digit",
            minute: "2-digit",
          }),
      },
      localization: {
        locale: "pt-BR",
        priceFormatter: (value) => money(value),
        timeFormatter: (timestamp) => time(timestamp * 1000),
      },
      crosshair: {
        vertLine: { color: "#a5b4fc", labelBackgroundColor: "#4f46e5" },
        horzLine: { color: "#a5b4fc", labelBackgroundColor: "#4f46e5" },
      },
    });
    seriesRef.current = chart.addSeries(AreaSeries, {
      lineColor: "#4f46e5",
      topColor: "#e0e7ff",
      bottomColor: "#ffffff",
      lineWidth: 2,
      priceLineVisible: false,
      lastValueVisible: false,
      crosshairMarkerRadius: 4,
    });
    chartRef.current = chart;
    const observer = new ResizeObserver(() => chart.timeScale().fitContent());
    observer.observe(container.current);
    return () => {
      observer.disconnect();
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
      previous.current = null;
    };
  }, []);

  useEffect(() => {
    if (!data || !seriesRef.current) return;
    // A fonte pode conter vários registros no mesmo segundo; o gráfico recebe o último.
    const byTime = new Map(
      data.map((quote) => [
        Math.floor(new Date(quote.data_hora).getTime() / 1000),
        Number(quote.valor_cotacao),
      ]),
    );
    const points = [...byTime].map(([timestamp, value]) => ({
      time: timestamp,
      value,
    }));
    const key = `${stock.id_acao}:${period}`;
    const prior = previous.current;
    if (
      prior?.key === key &&
      points.length &&
      prior.first === points[0].time &&
      prior.last <= points.at(-1).time &&
      period !== "all"
    ) {
      for (const point of points)
        if (point.time >= prior.last) seriesRef.current.update(point);
    } else {
      seriesRef.current.setData(points);
      if (prior?.key !== key) chartRef.current.timeScale().fitContent();
    }
    previous.current = { key, first: points[0]?.time, last: points.at(-1)?.time ?? 0 };
  }, [data, period, stock.id_acao]);

  return (
    <section
      className="chart-panel panel"
      aria-label={`Cotações de ${stock.ticker}`}
    >
      <div>
        <h2>{stock.nome_empresa}</h2>
        <p className="muted stock-subtitle">
          {stock.ticker}
          <span>·</span>
          {stock.setor_atuacao}
        </p>
      </div>
      <div className="chart-toolbar">
        <div className="quote-heading">
          <strong>{money(stock.valor_cotacao)}</strong>
          <span className={change >= 0 ? "positive" : "negative"}>
            {percent(change)}
          </span>
        </div>
        <div className="periods" aria-label="Período do gráfico">
          {[
            ["15m", "15min"],
            ["1h", "1h"],
            ["all", "Tudo"],
          ].map(([value, label]) => (
            <button
              key={value}
              aria-pressed={period === value}
              onClick={() => setPeriod(value)}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      <div className="chart-wrap">
        <div
          ref={container}
          className="price-chart"
          role="img"
          aria-label={`Gráfico de ${stock.ticker}. Último preço ${money(stock.valor_cotacao)}. Variação em uma hora ${percent(change)}.`}
        />
        {!data && !error && (
          <p className="chart-placeholder">Carregando cotações…</p>
        )}
        {data?.length === 0 && (
          <p className="chart-placeholder">
            Sem cotações neste período. Escolha Tudo.
          </p>
        )}
      </div>
      {error ? (
        <p className="inline-error" role="status">
          {error}
        </p>
      ) : (
        <p className="chart-caption">
          Última cotação às {time(stock.data_hora)}
          <span>Variação em 1h</span>
        </p>
      )}
    </section>
  );
}
