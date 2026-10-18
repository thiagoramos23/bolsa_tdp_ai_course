-- Dados fictícios para demonstração. Executar após 01_ddl.sql.
-- Pode ser repetido: preserva cadastros existentes e só cria histórico para ações sem cotações.
BEGIN;

INSERT INTO investidor
    (cpf_cnpj, nome_completo, tipo_investidor, email, telefone, saldo_inicial)
VALUES
    ('52998224725', 'Investidor de Demonstração', 'PF', 'investidor@example.com', '11999990000', 10000.00)
ON CONFLICT (cpf_cnpj) DO NOTHING;

INSERT INTO empresa (nome_empresa, setor_atuacao, valor_mercado)
SELECT d.nome, d.setor, d.valor
FROM (VALUES
    ('Aurora Energia', 'Energia', 15000000000.00),
    ('Horizonte Tecnologia', 'Tecnologia', 8500000000.00),
    ('Serra Mineração', 'Mineração', 22000000000.00),
    ('Maré Alimentos', 'Alimentos', 4200000000.00),
    ('Verde Logística', 'Logística', 6100000000.00)
) AS d(nome, setor, valor)
WHERE NOT EXISTS (SELECT 1 FROM empresa e WHERE e.nome_empresa = d.nome);

INSERT INTO acao (id_empresa, ticker)
SELECT e.id_empresa, d.ticker
FROM (VALUES
    ('Aurora Energia', 'AURR3'),
    ('Aurora Energia', 'AURR4'),
    ('Horizonte Tecnologia', 'HZTE3'),
    ('Serra Mineração', 'SRMN3'),
    ('Maré Alimentos', 'MARE3'),
    ('Verde Logística', 'VRLG3')
) AS d(empresa, ticker)
JOIN empresa e ON e.nome_empresa = d.empresa
ON CONFLICT (ticker) DO NOTHING;

-- O worker grava novas cotações a cada 5 segundos enquanto a simulação estiver ativa.
-- A amostra histórica inicial abaixo mantém pontos a cada 30 segundos.
INSERT INTO historico_cotacao (id_acao, data_hora, valor_cotacao)
SELECT a.id_acao,
       CURRENT_TIMESTAMP - INTERVAL '1 hour' + g.passo * INTERVAL '30 seconds',
       ROUND((d.preco_base * (0.98 + RANDOM() * 0.04))::numeric, 2)
FROM (VALUES
    ('AURR3', 32.00),
    ('AURR4', 30.00),
    ('HZTE3', 18.50),
    ('SRMN3', 65.00),
    ('MARE3', 24.75),
    ('VRLG3', 12.40)
) AS d(ticker, preco_base)
JOIN acao a ON a.ticker = d.ticker
CROSS JOIN generate_series(0, 120) AS g(passo)
WHERE NOT EXISTS (SELECT 1 FROM historico_cotacao h WHERE h.id_acao = a.id_acao);

COMMIT;
