-- PostgreSQL 17. Execute uma vez em um banco vazio.
BEGIN;

CREATE TABLE investidor (
    id_investidor bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    cpf_cnpj varchar(14) NOT NULL UNIQUE,
    nome_completo varchar(200) NOT NULL,
    tipo_investidor varchar(2) NOT NULL,
    email varchar(254) NOT NULL,
    telefone varchar(20) NOT NULL,
    saldo_inicial numeric(18,2) NOT NULL DEFAULT 10000.00,
    CONSTRAINT ck_saldo_inicial CHECK (saldo_inicial >= 0),
    CONSTRAINT ck_tipo_investidor CHECK (tipo_investidor IN ('PF', 'PJ')),
    CONSTRAINT ck_documento_tipo CHECK (
        (tipo_investidor = 'PF' AND char_length(cpf_cnpj) = 11)
        OR (tipo_investidor = 'PJ' AND char_length(cpf_cnpj) = 14)
    )
);

CREATE TABLE empresa (
    id_empresa bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    nome_empresa varchar(200) NOT NULL,
    setor_atuacao varchar(100) NOT NULL,
    valor_mercado numeric(20,2) NOT NULL,
    CONSTRAINT ck_valor_mercado CHECK (valor_mercado >= 0)
);

CREATE TABLE acao (
    id_acao bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    id_empresa bigint NOT NULL REFERENCES empresa ON DELETE RESTRICT,
    ticker varchar(20) NOT NULL UNIQUE
);

CREATE TABLE negociacao (
    id_negociacao bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    id_requisicao uuid NOT NULL DEFAULT gen_random_uuid(),
    id_investidor bigint NOT NULL REFERENCES investidor ON DELETE RESTRICT,
    id_acao bigint NOT NULL REFERENCES acao ON DELETE RESTRICT,
    data_hora timestamptz NOT NULL,
    tipo_operacao varchar(6) NOT NULL,
    quantidade_acoes bigint NOT NULL,
    valor_unitario numeric(18,6) NOT NULL,
    CONSTRAINT ck_tipo_operacao CHECK (tipo_operacao IN ('COMPRA', 'VENDA')),
    CONSTRAINT ck_quantidade_negociada CHECK (quantidade_acoes > 0),
    CONSTRAINT ck_valor_unitario CHECK (valor_unitario > 0)
);

CREATE UNIQUE INDEX uq_negociacao_requisicao ON negociacao (id_requisicao);
CREATE INDEX ix_negociacao_investidor_acao_data
    ON negociacao (id_investidor, id_acao, data_hora);

CREATE TABLE historico_cotacao (
    id_cotacao bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    id_acao bigint NOT NULL REFERENCES acao ON DELETE RESTRICT,
    data_hora timestamptz NOT NULL,
    valor_cotacao numeric(18,6) NOT NULL,
    CONSTRAINT ck_valor_cotacao CHECK (valor_cotacao > 0)
);

CREATE INDEX ix_cotacao_acao_data ON historico_cotacao (id_acao, data_hora);

CREATE TABLE posicao_carteira (
    id_carteira bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    id_investidor bigint NOT NULL REFERENCES investidor ON DELETE RESTRICT,
    id_acao bigint NOT NULL REFERENCES acao ON DELETE RESTRICT,
    quantidade_acoes bigint NOT NULL DEFAULT 0,
    data_atualizacao timestamptz NOT NULL,
    CONSTRAINT uq_posicao_investidor_acao UNIQUE (id_investidor, id_acao)
);

CREATE VIEW saldo_financeiro AS
SELECT i.id_investidor,
       i.saldo_inicial,
       i.saldo_inicial + COALESCE(SUM(
           CASE n.tipo_operacao
               WHEN 'COMPRA' THEN -n.quantidade_acoes * n.valor_unitario
               WHEN 'VENDA' THEN n.quantidade_acoes * n.valor_unitario
           END
       ), 0) AS saldo_disponivel
FROM investidor i
LEFT JOIN negociacao n ON n.id_investidor = i.id_investidor
GROUP BY i.id_investidor;

COMMENT ON COLUMN investidor.cpf_cnpj IS
    'Sem pontuação. Validar formato e dígitos verificadores na aplicação.';
COMMENT ON TABLE negociacao IS
    'A API registra pelo último preço disponível e atualiza posicao_carteira na mesma transação, validando saldo e quantidade. SQL manual precisa aplicar essas regras.';
COMMENT ON TABLE historico_cotacao IS
    'Worker do app: inserir cotação simulada por ação a cada 5 segundos enquanto ativo. O DDL não agenda nem executa o worker.';
COMMENT ON TABLE posicao_carteira IS
    'Uma posição atual por investidor e ação. Quantidade = compras menos vendas; reconstruir posições passadas pelas negociações.';
COMMENT ON VIEW saldo_financeiro IS
    'Dinheiro fictício disponível = saldo inicial menos compras mais vendas. Não inclui o valor das ações em carteira.';

-- Estado operacional do simulador; não é uma entidade do domínio financeiro.
CREATE TABLE simulacao (
    id smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1),
    ativa boolean NOT NULL DEFAULT false,
    ultimo_contato timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO simulacao (id) VALUES (1);
COMMENT ON TABLE simulacao IS
    'Simulação compartilhada, iniciada por botão. Expira após 60 segundos sem uma tela visível enviar contato.';

COMMIT;
