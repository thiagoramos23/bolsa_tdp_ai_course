import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import pg from "pg";
import { initialize, pool as unusedPool } from "../server/db.js";
import { executeOrder, validateOrder } from "../server/trading.js";
import { generateQuotes } from "../server/market.js";
import { createApp } from "../server/app.js";

// Banco descartável separado: nunca limpa nem negocia no banco de desenvolvimento.
const database = `bolsa_test_${process.pid}`;
const admin = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const url = new URL(process.env.DATABASE_URL);
url.pathname = `/${database}`;
const db = new pg.Pool({ connectionString: url.href, max: 10 });
let server;
let base;
let stockId;
let investorId;
const order = (operation, quantity, extra = {}) => ({
  stockId,
  operation,
  quantity,
  requestId: randomUUID(),
  ...extra,
});

before(async () => {
  await admin.query(`CREATE DATABASE "${database}"`);
  await initialize(db);
  stockId = Number(
    (await db.query("SELECT id_acao FROM acao WHERE ticker = 'AURR3'")).rows[0]
      .id_acao,
  );
  investorId = (await db.query("SELECT id_investidor FROM investidor")).rows[0]
    .id_investidor;
  server = createApp(db).listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  await new Promise((resolve) => (server ? server.close(resolve) : resolve()));
  await db.end();
  await admin.query(`DROP DATABASE IF EXISTS "${database}" WITH (FORCE)`);
  await admin.end();
  await unusedPool.end();
});

test("carga inicial, execução repetida e autoverificação SQL", async () => {
  await initialize(db);
  await db.query(
    await readFile(new URL("../03_verificar.sql", import.meta.url), "utf8"),
  );
  assert.equal(
    (await db.query("SELECT COUNT(*) FROM negociacao")).rows[0].count,
    "0",
  );
});

test("rejeita entrada inválida antes de gravar", () => {
  for (const change of [
    { quantity: 0 },
    { quantity: -1 },
    { quantity: 1.5 },
    { quantity: "2" },
    { stockId: 0 },
    { operation: "OUTRA" },
    { requestId: "invalid" },
  ]) {
    assert.throws(() => validateOrder(order("COMPRA", 1, change)));
  }
});

test("compra e venda usam preço do banco, saldo exato e atualizam posição atomicamente", async () => {
  const trade = await executeOrder(db, { ...order("COMPRA", 10), price: 0.01 });
  const price = (
    await db.query(
      "SELECT valor_cotacao FROM historico_cotacao WHERE id_acao = $1 ORDER BY data_hora DESC LIMIT 1",
      [stockId],
    )
  ).rows[0].valor_cotacao;
  assert.equal(trade.valor_unitario, price);
  await executeOrder(db, order("VENDA", 4));
  const { rows } = await db.query(
    `SELECT p.quantidade_acoes,
    s.saldo_disponivel = 10000 - $1::numeric * 6 AS correct
    FROM posicao_carteira p JOIN saldo_financeiro s USING(id_investidor)
    WHERE p.id_acao = $2`,
    [price, stockId],
  );
  assert.equal(rows[0].quantidade_acoes, "6");
  assert.equal(rows[0].correct, true);
});

test("compra sem saldo e venda sem ações não alteram os registros", async () => {
  const before = (await db.query("SELECT COUNT(*) FROM negociacao")).rows[0]
    .count;
  await assert.rejects(
    executeOrder(db, order("COMPRA", 1000000)),
    /Dinheiro insuficiente/,
  );
  await assert.rejects(executeOrder(db, order("VENDA", 7)), /não possui/);
  await assert.rejects(
    executeOrder(db, order("COMPRA", 1, { stockId: 999999 })),
    /sem cotação/,
  );
  assert.equal(
    (await db.query("SELECT COUNT(*) FROM negociacao")).rows[0].count,
    before,
  );
});

test("reenvio concorrente da mesma operação cria uma só negociação", async () => {
  const payload = order("COMPRA", 1);
  const result = await Promise.all([
    executeOrder(db, payload),
    executeOrder(db, payload),
  ]);
  assert.equal(result[0].id_negociacao, result[1].id_negociacao);
  const count = await db.query(
    "SELECT COUNT(*) FROM negociacao WHERE id_requisicao = $1",
    [payload.requestId],
  );
  assert.equal(count.rows[0].count, "1");
  await assert.rejects(
    executeOrder(db, { ...payload, quantity: 2 }),
    /outra operação/,
  );
});

test("compras simultâneas não gastam o mesmo saldo", async () => {
  const price = Number(
    (
      await db.query(
        "SELECT valor_cotacao FROM historico_cotacao WHERE id_acao = $1 ORDER BY data_hora DESC LIMIT 1",
        [stockId],
      )
    ).rows[0].valor_cotacao,
  );
  const balance = Number(
    (await db.query("SELECT saldo_disponivel FROM saldo_financeiro")).rows[0]
      .saldo_disponivel,
  );
  const quantity = Math.floor((balance / price) * 0.75);
  const results = await Promise.allSettled([
    executeOrder(db, order("COMPRA", quantity)),
    executeOrder(db, order("COMPRA", quantity)),
  ]);
  assert.equal(results.filter((item) => item.status === "fulfilled").length, 1);
  assert.match(
    results.find((item) => item.status === "rejected").reason.message,
    /insuficiente/,
  );
  assert.ok(
    Number(
      (await db.query("SELECT saldo_disponivel FROM saldo_financeiro")).rows[0]
        .saldo_disponivel,
    ) >= 0,
  );
});

test("vendas simultâneas não vendem a mesma posição duas vezes", async () => {
  const quantity = Number(
    (
      await db.query(
        "SELECT quantidade_acoes FROM posicao_carteira WHERE id_acao = $1",
        [stockId],
      )
    ).rows[0].quantidade_acoes,
  );
  const results = await Promise.allSettled([
    executeOrder(db, order("VENDA", quantity)),
    executeOrder(db, order("VENDA", quantity)),
  ]);
  assert.equal(results.filter((item) => item.status === "fulfilled").length, 1);
  assert.match(
    results.find((item) => item.status === "rejected").reason.message,
    /não possui/,
  );
  assert.equal(
    (
      await db.query(
        "SELECT quantidade_acoes FROM posicao_carteira WHERE id_acao = $1",
        [stockId],
      )
    ).rows[0].quantidade_acoes,
    "0",
  );
});

test("falha ao atualizar posição desfaz também a negociação", async () => {
  await db.query(`CREATE FUNCTION reject_position() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'forced position failure'; END $$;
    CREATE TRIGGER reject_position BEFORE INSERT OR UPDATE ON posicao_carteira FOR EACH ROW EXECUTE FUNCTION reject_position()`);
  const payload = order("COMPRA", 1);
  try {
    await assert.rejects(executeOrder(db, payload), /forced position failure/);
  } finally {
    await db.query(
      "DROP TRIGGER reject_position ON posicao_carteira; DROP FUNCTION reject_position()",
    );
  }
  assert.equal(
    (
      await db.query(
        "SELECT COUNT(*) FROM negociacao WHERE id_requisicao = $1",
        [payload.requestId],
      )
    ).rows[0].count,
    "0",
  );
});

test("API: overview, gráfico, paginação e limites de entrada", async () => {
  const overview = await (await fetch(`${base}/api/overview`)).json();
  assert.equal(overview.stocks.length, 6);
  assert.equal(overview.intervalSeconds, 5);
  const quotes = await (
    await fetch(`${base}/api/stocks/${stockId}/quotes?period=all`)
  ).json();
  assert.equal(quotes.length, 121);
  assert.ok(quotes.every((item) => Number(item.valor_cotacao) > 0));
  assert.equal(
    (await fetch(`${base}/api/stocks/1/quotes?period=wrong`)).status,
    400,
  );
  assert.equal((await fetch(`${base}/api/trades?page=-1`)).status, 400);
  const trades = await (await fetch(`${base}/api/trades`)).json();
  assert.ok(trades.total > 0);
  assert.ok(trades.trades.length <= 20);
  const second = await (await fetch(`${base}/api/trades?page=2`)).json();
  assert.deepEqual(second.trades, []);
  assert.equal((await fetch(`${base}/up`)).status, 200);
  const foreign = await fetch(`${base}/api/trades`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: "https://another.invalid",
    },
    body: JSON.stringify(order("COMPRA", 1)),
  });
  assert.equal(foreign.status, 403);
  const invalid = await fetch(`${base}/api/trades`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{",
  });
  assert.equal(invalid.status, 400);
  const valid = await fetch(`${base}/api/trades`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(order("COMPRA", 1)),
  });
  assert.equal(valid.status, 201);
});

test("análise retrospectiva usa posição e última cotação até o instante; não usa cotação futura", async () => {
  const a = await executeOrder(db, order("COMPRA", 2));
  await db.query(
    "UPDATE negociacao SET data_hora = CURRENT_TIMESTAMP - interval '20 minutes' WHERE id_negociacao = $1",
    [a.id_negociacao],
  );
  const at = new Date(Date.now() - 15 * 60000).toISOString();
  const result = await (
    await fetch(`${base}/api/portfolio?at=${encodeURIComponent(at)}`)
  ).json();
  assert.equal(Number(result.positions[0].quantidade_acoes), 2);
  const expected = await db.query(
    `SELECT valor_cotacao FROM historico_cotacao WHERE id_acao = $1 AND data_hora <= $2
    ORDER BY data_hora DESC, id_cotacao DESC LIMIT 1`,
    [stockId, at],
  );
  assert.equal(
    result.positions[0].valor_cotacao,
    expected.rows[0].valor_cotacao,
  );
  const longAgo = new Date(Date.now() - 86400000).toISOString();
  await db.query(
    "UPDATE negociacao SET data_hora = $1::timestamptz - interval '1 minute' WHERE id_negociacao = $2",
    [longAgo, a.id_negociacao],
  );
  const unknown = await (
    await fetch(`${base}/api/portfolio?at=${encodeURIComponent(longAgo)}`)
  ).json();
  assert.equal(unknown.positions[0].valor_cotacao, null);
  const future = new Date(Date.now() + 86400000).toISOString();
  assert.equal(
    (await fetch(`${base}/api/portfolio?at=${encodeURIComponent(future)}`))
      .status,
    400,
  );
});

test("worker grava seis preços por rodada e evita duplicação entre instâncias e reinícios", async () => {
  const now = new Date(Date.now() + 60000);
  const slot = new Date(Math.floor(now.getTime() / 5000) * 5000);
  assert.equal(await generateQuotes(db, now), null);
  const started = await (
    await fetch(`${base}/api/simulation`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "start" }),
    })
  ).json();
  assert.equal(started.active, true);
  const counts = await Promise.all([
    generateQuotes(db, now),
    generateQuotes(db, now),
  ]);
  assert.equal(
    counts.reduce((sum, value) => sum + value, 0),
    6,
  );
  assert.equal(await generateQuotes(db, now), 0);
  const { rows } = await db.query(
    `SELECT COUNT(*) AS count, MIN(valor_cotacao) > 0 AS positive FROM historico_cotacao WHERE data_hora = $1`,
    [slot],
  );
  assert.equal(rows[0].count, "6");
  assert.equal(rows[0].positive, true);
  assert.equal(await generateQuotes(db, new Date(slot.getTime() + 5000)), 6);
});

test("pausa explícita e expiração por falta de contato impedem novos preços", async () => {
  const post = (action) =>
    fetch(`${base}/api/simulation`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    }).then((response) => response.json());
  assert.equal((await post("pause")).active, false);
  assert.equal(await generateQuotes(db, new Date(Date.now() + 180000)), null);
  assert.equal((await post("start")).active, true);
  assert.equal((await post("heartbeat")).active, true);
  await db.query(
    "UPDATE simulacao SET ultimo_contato = CURRENT_TIMESTAMP - interval '61 seconds'",
  );
  assert.equal((await post("heartbeat")).active, false);
  assert.equal(await generateQuotes(db, new Date(Date.now() + 180000)), null);
  const overview = await (await fetch(`${base}/api/overview`)).json();
  assert.equal(overview.simulation.active, false);
});

test("preço médio ponderado mantém custo em vendas parciais e reinicia após venda total", async () => {
  const id = Number((await db.query("SELECT id_acao FROM acao WHERE ticker = 'HZTE3'")).rows[0].id_acao);
  let step = 0;
  async function trade(operation, quantity, price) {
    await db.query(`INSERT INTO historico_cotacao (id_acao, data_hora, valor_cotacao)
      VALUES ($1, CURRENT_TIMESTAMP + interval '1 hour' + $2 * interval '1 second', $3)`, [id, ++step, price]);
    await executeOrder(db, order(operation, quantity, { stockId: id }));
  }
  async function average() {
    const overview = await (await fetch(`${base}/api/overview`)).json();
    return Number(overview.stocks.find(stock => Number(stock.id_acao) === id).preco_medio_compra);
  }
  await trade('COMPRA', 10, 10);
  assert.equal(await average(), 10);
  await trade('COMPRA', 30, 20);
  assert.equal(await average(), 17.5);
  await trade('VENDA', 20, 40);
  assert.equal(await average(), 17.5);
  await trade('COMPRA', 20, 30);
  assert.equal(await average(), 23.75);
  await trade('VENDA', 40, 50);
  assert.equal(await average(), 0);
  await trade('COMPRA', 5, 12);
  assert.equal(await average(), 12);
});
