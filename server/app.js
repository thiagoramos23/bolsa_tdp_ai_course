import express from "express";
import helmet from "helmet";
import { rateLimit } from "express-rate-limit";
import { transaction } from "./db.js";
import { executeOrder, TradeError } from "./trading.js";
import { QUOTE_INTERVAL_MS } from "./market.js";

export function createApp(db, worker) {
  const app = express();
  app.disable("x-powered-by");
  if (process.env.TRUST_PROXY)
    app.set("trust proxy", Number(process.env.TRUST_PROXY));
  app.use(
    helmet({
      contentSecurityPolicy:
        process.env.NODE_ENV === "production" ? undefined : false,
    }),
  );
  app.use(express.json({ limit: "4kb" }));
  app.get("/up", async (_req, res) => {
    try {
      await db.query("SELECT 1");
      res.json({ ok: true });
    } catch {
      res.status(503).json({ ok: false });
    }
  });
  app.use("/api", (req, res, next) => {
    res.set("Cache-Control", "no-store");
    const origin = req.get("origin");
    if (
      req.method === "POST" &&
      (!req.is("application/json") ||
        (origin && origin !== process.env.APP_URL))
    ) {
      throw new TradeError("Origem ou formato da solicitação inválido.", 403);
    }
    next();
  });

  app.post("/api/simulation", async (req, res) => {
    const action = req.body?.action;
    if (!["start", "pause", "heartbeat"].includes(action))
      throw new TradeError("Ação da simulação inválida.");
    const active = await transaction(db, async (client) => {
      await client.query("SELECT pg_advisory_xact_lock(78123002)");
      if (action === "start") {
        await client.query(
          "UPDATE simulacao SET ativa = true, ultimo_contato = clock_timestamp() WHERE id = 1",
        );
      } else if (action === "pause") {
        await client.query("UPDATE simulacao SET ativa = false WHERE id = 1");
      } else {
        await client.query(`UPDATE simulacao SET ultimo_contato = clock_timestamp()
          WHERE id = 1 AND ativa AND ultimo_contato > CURRENT_TIMESTAMP - interval '60 seconds'`);
      }
      const { rows } =
        await client.query(`SELECT ativa AND ultimo_contato > CURRENT_TIMESTAMP - interval '60 seconds' AS active
        FROM simulacao WHERE id = 1`);
      return rows[0].active;
    });
    if (active) worker?.wake();
    else worker?.pause();
    res.json({ active });
  });

  app.get("/api/overview", async (_req, res) => {
    const result = await transaction(
      db,
      async (client) => {
        const { rows: stocks } = await client.query(`WITH RECURSIVE ordered_trades AS (
          SELECT n.*, ROW_NUMBER() OVER (
            PARTITION BY id_acao ORDER BY data_hora, id_negociacao
          ) AS step
          FROM negociacao n JOIN investidor i USING (id_investidor)
          WHERE i.cpf_cnpj = '52998224725'
        ), purchase_cost AS (
          SELECT id_acao, step, quantidade_acoes AS quantity, valor_unitario::numeric AS average
          FROM ordered_trades WHERE step = 1
          UNION ALL
          SELECT n.id_acao, n.step,
            c.quantity + CASE WHEN n.tipo_operacao = 'COMPRA' THEN n.quantidade_acoes ELSE -n.quantidade_acoes END,
            CASE WHEN n.tipo_operacao = 'COMPRA' THEN
              (c.quantity * c.average + n.quantidade_acoes * n.valor_unitario) / (c.quantity + n.quantidade_acoes)
              WHEN c.quantity = n.quantidade_acoes THEN 0::numeric
              ELSE c.average END
          FROM purchase_cost c JOIN ordered_trades n ON n.id_acao = c.id_acao AND n.step = c.step + 1
        ), latest_cost AS (
          SELECT DISTINCT ON (id_acao) id_acao, average
          FROM purchase_cost ORDER BY id_acao, step DESC
        ) SELECT a.id_acao, a.ticker,
        e.nome_empresa, e.setor_atuacao, q.valor_cotacao, q.data_hora,
        first_quote.valor_cotacao AS preco_referencia, COALESCE(p.quantidade_acoes, 0) AS quantidade_acoes,
        COALESCE(p.quantidade_acoes, 0) * q.valor_cotacao AS valor_posicao,
        cost.average AS preco_medio_compra
        FROM acao a JOIN empresa e USING (id_empresa)
        LEFT JOIN latest_cost cost ON cost.id_acao = a.id_acao
        JOIN LATERAL (SELECT valor_cotacao, data_hora FROM historico_cotacao
          WHERE id_acao = a.id_acao ORDER BY data_hora DESC, id_cotacao DESC LIMIT 1) q ON true
        JOIN LATERAL (SELECT valor_cotacao FROM historico_cotacao
          WHERE id_acao = a.id_acao AND data_hora >= q.data_hora - interval '1 hour'
          ORDER BY data_hora, id_cotacao LIMIT 1) first_quote ON true
        LEFT JOIN posicao_carteira p ON p.id_acao = a.id_acao
          AND p.id_investidor = (SELECT id_investidor FROM investidor WHERE cpf_cnpj = '52998224725')
        ORDER BY a.ticker`);
        const { rows } = await client.query(`SELECT s.*,
        COALESCE((SELECT SUM(p.quantidade_acoes * q.valor_cotacao)
          FROM posicao_carteira p JOIN LATERAL (
            SELECT valor_cotacao FROM historico_cotacao WHERE id_acao = p.id_acao
            ORDER BY data_hora DESC, id_cotacao DESC LIMIT 1
          ) q ON true WHERE p.id_investidor = s.id_investidor), 0) AS valor_acoes
        FROM saldo_financeiro s JOIN investidor i USING (id_investidor)
        WHERE i.cpf_cnpj = '52998224725'`);
        const simulation =
          await client.query(`SELECT ativa AND ultimo_contato > CURRENT_TIMESTAMP - interval '60 seconds' AS active
        FROM simulacao WHERE id = 1`);
        return {
          stocks,
          balance: rows[0],
          simulation: simulation.rows[0],
          serverTime: new Date().toISOString(),
          intervalSeconds: QUOTE_INTERVAL_MS / 1000,
        };
      },
      "BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY",
    );
    res.json(result);
  });

  app.get("/api/stocks/:id/quotes", async (req, res) => {
    const id = Number(req.params.id);
    const period = req.query.period ?? "1h";
    if (
      !Number.isSafeInteger(id) ||
      id < 1 ||
      !["15m", "1h", "all"].includes(period)
    ) {
      throw new TradeError("Ação ou período inválido.");
    }
    // shortcut: até 600 pontos no gráfico completo; usar agregação temporal se o volume exigir.
    const { rows } = await db.query(
      `WITH quotes AS (
      SELECT id_cotacao, data_hora, valor_cotacao,
        ntile(600) OVER (ORDER BY data_hora, id_cotacao) AS bucket
      FROM historico_cotacao WHERE id_acao = $1 AND ($2::text = 'all' OR data_hora >=
        CURRENT_TIMESTAMP - CASE WHEN $2 = '15m' THEN interval '15 minutes' ELSE interval '1 hour' END)
    ), sampled AS (
      SELECT DISTINCT ON (bucket) data_hora, valor_cotacao FROM quotes
      ORDER BY bucket, data_hora DESC, id_cotacao DESC
    ) SELECT data_hora, valor_cotacao FROM sampled ORDER BY data_hora`,
      [id, period],
    );
    res.json(rows);
  });

  app.get("/api/portfolio", async (req, res) => {
    const at = new Date(req.query.at);
    if (
      typeof req.query.at !== "string" ||
      !Number.isFinite(at.getTime()) ||
      at > new Date()
    ) {
      throw new TradeError(
        "Escolha uma data e hora válida, até o momento atual.",
      );
    }
    const result = await transaction(
      db,
      async (client) => {
        const { rows: positions } = await client.query(
          `WITH positions AS (
        SELECT n.id_acao, SUM(CASE WHEN tipo_operacao = 'COMPRA' THEN quantidade_acoes ELSE -quantidade_acoes END) AS quantidade_acoes
        FROM negociacao n JOIN investidor i USING(id_investidor)
        WHERE i.cpf_cnpj = '52998224725' AND n.data_hora <= $1
        GROUP BY n.id_acao
      ) SELECT a.id_acao, a.ticker, e.nome_empresa, p.quantidade_acoes,
          q.valor_cotacao, p.quantidade_acoes * q.valor_cotacao AS valor_posicao
        FROM positions p JOIN acao a USING(id_acao) JOIN empresa e USING(id_empresa)
        LEFT JOIN LATERAL (SELECT valor_cotacao FROM historico_cotacao
          WHERE id_acao = p.id_acao AND data_hora <= $1
          ORDER BY data_hora DESC, id_cotacao DESC LIMIT 1) q ON true
        WHERE p.quantidade_acoes > 0 ORDER BY a.id_acao`,
          [at],
        );
        const { rows } = await client.query(
          `SELECT i.saldo_inicial,
        i.saldo_inicial + COALESCE(SUM(CASE WHEN n.tipo_operacao = 'COMPRA'
          THEN -n.quantidade_acoes * n.valor_unitario ELSE n.quantidade_acoes * n.valor_unitario END), 0) AS saldo_disponivel
        FROM investidor i LEFT JOIN negociacao n ON n.id_investidor = i.id_investidor AND n.data_hora <= $1
        WHERE i.cpf_cnpj = '52998224725' GROUP BY i.id_investidor`,
          [at],
        );
        return { at: at.toISOString(), positions, balance: rows[0] };
      },
      "BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY",
    );
    res.json(result);
  });

  app.get("/api/trades", async (req, res) => {
    const page = Number(req.query.page ?? 1);
    if (!Number.isSafeInteger(page) || page < 1 || page > 1000000)
      throw new TradeError("Página inválida.");
    const result = await transaction(
      db,
      async (client) => {
        const params = [20, (page - 1) * 20];
        const { rows } = await client.query(
          `SELECT n.*, a.ticker, e.nome_empresa,
        n.quantidade_acoes * n.valor_unitario AS valor_total
        FROM negociacao n JOIN acao a USING (id_acao) JOIN empresa e USING (id_empresa)
        JOIN investidor i USING (id_investidor) WHERE i.cpf_cnpj = '52998224725'
        ORDER BY n.data_hora DESC, n.id_negociacao DESC LIMIT $1 OFFSET $2`,
          params,
        );
        const count =
          await client.query(`SELECT COUNT(*) FROM negociacao n JOIN investidor i USING(id_investidor)
        WHERE i.cpf_cnpj = '52998224725'`);
        return { trades: rows, total: Number(count.rows[0].count), page };
      },
      "BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY",
    );
    res.json(result);
  });

  app.post(
    "/api/trades",
    rateLimit({
      windowMs: 60000,
      limit: 60,
      standardHeaders: "draft-8",
      legacyHeaders: false,
      message: { error: "Muitas operações. Aguarde um minuto." },
    }),
    async (req, res) => res.status(201).json(await executeOrder(db, req.body)),
  );

  app.use("/api", (_req, res) =>
    res.status(404).json({ error: "Recurso não encontrado." }),
  );
  app.use((error, _req, res, _next) => {
    if (error instanceof TradeError)
      return res.status(error.status).json({ error: error.message });
    if (
      error.type === "entity.parse.failed" ||
      error.type === "entity.too.large"
    ) {
      return res.status(400).json({ error: "Solicitação inválida." });
    }
    console.error("Falha na API:", error.message);
    res
      .status(500)
      .json({ error: "Não foi possível concluir. Tente novamente." });
  });
  return app;
}
