import { transaction } from "./db.js";

export class TradeError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

export function validateOrder(body) {
  if (
    !body ||
    typeof body !== "object" ||
    Array.isArray(body) ||
    !Number.isSafeInteger(body.stockId) ||
    body.stockId < 1 ||
    !Number.isSafeInteger(body.quantity) ||
    body.quantity < 1 ||
    body.quantity > 1000000 ||
    !["COMPRA", "VENDA"].includes(body.operation) ||
    typeof body.requestId !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      body.requestId,
    )
  ) {
    throw new TradeError(
      "Informe uma ação, uma operação e uma quantidade inteira entre 1 e 1.000.000.",
    );
  }
  return body;
}

export async function executeOrder(db, body) {
  const { stockId, quantity, operation, requestId } = validateOrder(body);
  return transaction(db, async (client) => {
    const investor = await client.query(`SELECT id_investidor FROM investidor
      WHERE cpf_cnpj = '52998224725' FOR UPDATE`);
    const investorId = investor.rows[0]?.id_investidor;
    if (!investorId)
      throw new TradeError("Investidor de demonstração indisponível.", 503);
    const previous = await client.query(
      "SELECT * FROM negociacao WHERE id_requisicao = $1",
      [requestId],
    );
    if (previous.rowCount) {
      const trade = previous.rows[0];
      if (
        trade.id_investidor !== investorId ||
        Number(trade.id_acao) !== stockId ||
        Number(trade.quantidade_acoes) !== quantity ||
        trade.tipo_operacao !== operation
      ) {
        throw new TradeError(
          "Esta identificação já foi usada por outra operação.",
          409,
        );
      }
      return trade;
    }
    const quote = await client.query(
      `SELECT valor_cotacao FROM historico_cotacao
      WHERE id_acao = $1 ORDER BY data_hora DESC, id_cotacao DESC LIMIT 1`,
      [stockId],
    );
    if (!quote.rowCount)
      throw new TradeError("Ação sem cotação disponível.", 404);
    const price = quote.rows[0].valor_cotacao;
    const funds = await client.query(
      `SELECT saldo_disponivel >= $2::numeric * $3::bigint AS sufficient
      FROM saldo_financeiro WHERE id_investidor = $1`,
      [investorId, price, quantity],
    );
    const position = await client.query(
      `SELECT quantidade_acoes FROM posicao_carteira
      WHERE id_investidor = $1 AND id_acao = $2`,
      [investorId, stockId],
    );
    const held = BigInt(position.rows[0]?.quantidade_acoes ?? 0);
    if (operation === "COMPRA" && !funds.rows[0].sufficient) {
      throw new TradeError("Dinheiro insuficiente para esta compra.", 409);
    }
    if (operation === "VENDA" && held < BigInt(quantity)) {
      throw new TradeError(
        "Você não possui essa quantidade de ações para vender.",
        409,
      );
    }
    const trade = await client.query(
      `INSERT INTO negociacao
      (id_requisicao, id_investidor, id_acao, data_hora, tipo_operacao, quantidade_acoes, valor_unitario)
      VALUES ($1, $2, $3, clock_timestamp(), $4, $5, $6) RETURNING *`,
      [requestId, investorId, stockId, operation, quantity, price],
    );
    const delta = operation === "COMPRA" ? quantity : -quantity;
    await client.query(
      `INSERT INTO posicao_carteira
      (id_investidor, id_acao, quantidade_acoes, data_atualizacao)
      VALUES ($1, $2, $3, clock_timestamp())
      ON CONFLICT (id_investidor, id_acao) DO UPDATE
      SET quantidade_acoes = posicao_carteira.quantidade_acoes + EXCLUDED.quantidade_acoes,
          data_atualizacao = EXCLUDED.data_atualizacao`,
      [investorId, stockId, delta],
    );
    return trade.rows[0];
  });
}
