import { transaction } from "./db.js";

export const QUOTE_INTERVAL_MS = 5000;

export async function generateQuotes(db, now = new Date()) {
  const slot = new Date(
    Math.floor(now.getTime() / QUOTE_INTERVAL_MS) * QUOTE_INTERVAL_MS,
  );
  return transaction(db, async (client) => {
    const { rows } = await client.query(
      "SELECT pg_try_advisory_xact_lock(78123002) AS locked",
    );
    if (!rows[0].locked) return 0;
    const state =
      await client.query(`SELECT ativa AND ultimo_contato > CURRENT_TIMESTAMP - interval '60 seconds' AS active
      FROM simulacao WHERE id = 1`);
    if (!state.rows[0]?.active) return null;
    const result = await client.query(
      `
      INSERT INTO historico_cotacao (id_acao, data_hora, valor_cotacao)
      SELECT a.id_acao, $1, GREATEST(0.01, ROUND((q.valor_cotacao * (1 + (random() - 0.5) * 0.01))::numeric, 2))
      FROM acao a
      JOIN LATERAL (
        SELECT valor_cotacao, data_hora FROM historico_cotacao
        WHERE id_acao = a.id_acao ORDER BY data_hora DESC, id_cotacao DESC LIMIT 1
      ) q ON true
      WHERE q.data_hora < $1`,
      [slot],
    );
    return result.rowCount;
  });
}

export function startQuoteWorker(db) {
  let timer;
  let stopped = false;
  let enabled = false;
  let running = false;
  let current = Promise.resolve();
  function schedule() {
    if (stopped || !enabled || timer || running) return;
    timer = setTimeout(
      () => {
        timer = undefined;
        running = true;
        current = generateQuotes(db)
          .then((result) => {
            if (result === null) enabled = false;
          })
          .catch((error) =>
            console.error("Falha ao gerar cotações:", error.message),
          )
          .finally(() => {
            running = false;
            schedule();
          });
      },
      QUOTE_INTERVAL_MS - (Date.now() % QUOTE_INTERVAL_MS),
    );
  }
  return {
    wake() {
      enabled = true;
      schedule();
    },
    pause() {
      enabled = false;
      clearTimeout(timer);
      timer = undefined;
    },
    async stop() {
      stopped = true;
      clearTimeout(timer);
      await current;
    },
  };
}
