-- Autoverificação após a carga inicial, antes de usar o app. Desfaz os dados de teste.
BEGIN;

DO $$
DECLARE
    investidor_demo bigint;
    acao_demo bigint;
    saldo numeric;
BEGIN
    SELECT id_investidor INTO STRICT investidor_demo
    FROM investidor WHERE cpf_cnpj = '52998224725';
    SELECT id_acao INTO STRICT acao_demo FROM acao WHERE ticker = 'AURR3';

    SELECT saldo_disponivel INTO saldo FROM saldo_financeiro
    WHERE id_investidor = investidor_demo;
    IF saldo <> 10000 THEN
        RAISE EXCEPTION 'Saldo inicial esperado: 10000; recebido: %', saldo;
    END IF;

    IF (SELECT COUNT(*) FROM acao) <> 6
       OR (SELECT COUNT(*) FROM empresa) <> 5
       OR (SELECT COUNT(*) FROM historico_cotacao) <> 726 THEN
        RAISE EXCEPTION 'Carga inicial incompleta ou duplicada';
    END IF;

    IF EXISTS (
        SELECT 1 FROM (
            SELECT data_hora - LAG(data_hora) OVER (
                PARTITION BY id_acao ORDER BY data_hora
            ) AS intervalo FROM historico_cotacao
        ) h WHERE intervalo <> INTERVAL '30 seconds'
    ) THEN
        RAISE EXCEPTION 'Intervalo entre cotações diferente de 30 segundos';
    END IF;

    INSERT INTO negociacao
        (id_investidor, id_acao, data_hora, tipo_operacao, quantidade_acoes, valor_unitario)
    VALUES
        (investidor_demo, acao_demo, CURRENT_TIMESTAMP, 'COMPRA', 10, 30),
        (investidor_demo, acao_demo, CURRENT_TIMESTAMP, 'VENDA', 4, 35);

    SELECT saldo_disponivel INTO saldo FROM saldo_financeiro
    WHERE id_investidor = investidor_demo;
    IF saldo <> 9840 THEN
        RAISE EXCEPTION 'Saldo após compra/venda esperado: 9840; recebido: %', saldo;
    END IF;

    BEGIN
        INSERT INTO historico_cotacao (id_acao, data_hora, valor_cotacao)
        VALUES (acao_demo, CURRENT_TIMESTAMP, 0);
        RAISE EXCEPTION 'Cotação zero foi aceita';
    EXCEPTION WHEN check_violation THEN
        NULL;
    END;

    INSERT INTO posicao_carteira
        (id_investidor, id_acao, quantidade_acoes, data_atualizacao)
    VALUES (investidor_demo, acao_demo, 6, CURRENT_TIMESTAMP);

    BEGIN
        INSERT INTO posicao_carteira
            (id_investidor, id_acao, quantidade_acoes, data_atualizacao)
        VALUES (investidor_demo, acao_demo, 6, CURRENT_TIMESTAMP);
        RAISE EXCEPTION 'Posição duplicada foi aceita';
    EXCEPTION WHEN unique_violation THEN
        NULL;
    END;

    RAISE NOTICE 'Verificações concluídas: carga, intervalo, saldo, cotação positiva e posição única.';
END;
$$;

ROLLBACK;
