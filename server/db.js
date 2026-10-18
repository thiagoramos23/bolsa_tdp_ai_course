import pg from "pg";
import { readFile } from "node:fs/promises";

export const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  max: 10,
});
pool.on("error", (error) =>
  console.error("Conexão ociosa do banco falhou:", error.message),
);

export async function transaction(db, work, begin = "BEGIN") {
  const client = await db.connect();
  try {
    await client.query(begin);
    const result = await work(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function initialize(db = pool) {
  await transaction(db, async (client) => {
    await client.query("SELECT pg_advisory_xact_lock(78123001)");
    const { rows } = await client.query(
      "SELECT to_regclass('public.investidor') AS tabela",
    );
    if (!rows[0].tabela) {
      const ddl = await readFile(
        new URL("../01_ddl.sql", import.meta.url),
        "utf8",
      );
      await client.query(ddl.replace(/^BEGIN;|^COMMIT;/gm, ""));
    }
    // Aceita também bancos criados pelos scripts da etapa anterior do trabalho.
    await client.query(`ALTER TABLE investidor ADD COLUMN IF NOT EXISTS saldo_inicial numeric(18,2) NOT NULL DEFAULT 10000;
      ALTER TABLE negociacao ADD COLUMN IF NOT EXISTS id_requisicao uuid NOT NULL DEFAULT gen_random_uuid();
      CREATE UNIQUE INDEX IF NOT EXISTS uq_negociacao_requisicao ON negociacao(id_requisicao);
      CREATE TABLE IF NOT EXISTS simulacao (
        id smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1),
        ativa boolean NOT NULL DEFAULT false,
        ultimo_contato timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      INSERT INTO simulacao (id) VALUES (1) ON CONFLICT DO NOTHING`);
    const seed = await readFile(
      new URL("../02_dados_iniciais.sql", import.meta.url),
      "utf8",
    );
    await client.query(seed.replace(/^BEGIN;|^COMMIT;/gm, ""));
  });
}
