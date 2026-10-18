-- PostgreSQL. Consultas somente de leitura.
-- Troque o CPF abaixo pelo CPF/CNPJ do investidor que deseja consultar.

-- 1. AÇÕES QUE O INVESTIDOR POSSUI
-- Quantidade atual por ação. Posições zeradas não aparecem.
SELECT
    i.nome_completo AS investidor,
    a.ticker,
    e.nome_empresa,
    p.quantidade_acoes,
    p.data_atualizacao
FROM posicao_carteira p
JOIN investidor i ON i.id_investidor = p.id_investidor
JOIN acao a ON a.id_acao = p.id_acao
JOIN empresa e ON e.id_empresa = a.id_empresa
WHERE i.cpf_cnpj = '52998224725'
  AND p.quantidade_acoes > 0
ORDER BY a.ticker;

-- 2. HISTÓRICO DE COTAÇÕES DAS AÇÕES
-- Cada linha contém o preço de uma ação em determinada data e hora.
-- Para consultar apenas uma ação, descomente o filtro de ticker.
SELECT
    a.ticker,
    e.nome_empresa,
    h.data_hora,
    h.valor_cotacao
FROM historico_cotacao h
JOIN acao a ON a.id_acao = h.id_acao
JOIN empresa e ON e.id_empresa = a.id_empresa
WHERE a.ticker = 'AURR3'
ORDER BY a.ticker, h.data_hora, h.id_cotacao;

-- 3. TABELA "MINHA CARTEIRA" DO APP
-- Mesmas colunas da tela: ativo, empresa, quantidade, preço médio de compra,
-- preço atual e valor total. Valores monetários são arredondados para exibição.
-- A média considera as ações restantes: vendas parciais mantêm a média;
-- após uma venda total, a próxima compra inicia uma nova média.
WITH RECURSIVE negociacoes_ordenadas AS (
    SELECT
        n.id_acao,
        n.tipo_operacao,
        n.quantidade_acoes,
        n.valor_unitario,
        ROW_NUMBER() OVER (
            PARTITION BY n.id_acao
            ORDER BY n.data_hora, n.id_negociacao
        ) AS ordem
    FROM negociacao n
    JOIN investidor i ON i.id_investidor = n.id_investidor
    WHERE i.cpf_cnpj = '52998224725'
), custos AS (
    SELECT
        id_acao,
        ordem,
        quantidade_acoes AS quantidade,
        valor_unitario::numeric AS preco_medio
    FROM negociacoes_ordenadas
    WHERE ordem = 1

    UNION ALL

    SELECT
        n.id_acao,
        n.ordem,
        c.quantidade + CASE
            WHEN n.tipo_operacao = 'COMPRA' THEN n.quantidade_acoes
            ELSE -n.quantidade_acoes
        END,
        CASE
            WHEN n.tipo_operacao = 'COMPRA' THEN
                (c.quantidade * c.preco_medio + n.quantidade_acoes * n.valor_unitario)
                / (c.quantidade + n.quantidade_acoes)
            WHEN c.quantidade = n.quantidade_acoes THEN 0::numeric
            ELSE c.preco_medio
        END
    FROM custos c
    JOIN negociacoes_ordenadas n
      ON n.id_acao = c.id_acao AND n.ordem = c.ordem + 1
), ultimo_custo AS (
    SELECT DISTINCT ON (id_acao)
        id_acao,
        preco_medio
    FROM custos
    ORDER BY id_acao, ordem DESC
)
SELECT
    a.ticker AS ativo,
    e.nome_empresa,
    p.quantidade_acoes,
    ROUND(c.preco_medio, 2) AS preco_medio_compra,
    ROUND(h.valor_cotacao, 2) AS preco_atual,
    ROUND(p.quantidade_acoes * h.valor_cotacao, 2) AS valor_total
FROM posicao_carteira p
JOIN investidor i ON i.id_investidor = p.id_investidor
JOIN acao a ON a.id_acao = p.id_acao
JOIN empresa e ON e.id_empresa = a.id_empresa
LEFT JOIN ultimo_custo c ON c.id_acao = p.id_acao
JOIN LATERAL (
    SELECT valor_cotacao
    FROM historico_cotacao
    WHERE id_acao = a.id_acao
    ORDER BY data_hora DESC, id_cotacao DESC
    LIMIT 1
) h ON true
WHERE i.cpf_cnpj = '52998224725'
  AND p.quantidade_acoes > 0
ORDER BY a.ticker;
