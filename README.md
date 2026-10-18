# Bolsa Lab — TDP

Simulador acadêmico de bolsa, em português, sem login e com dinheiro fictício.
Um investidor compartilhado começa com R$ 10.000,00 e nenhuma ação.

## Tecnologias

- React 19 e Vite 6 na interface.
- TradingView Lightweight Charts 5 para o gráfico interativo.
- Node.js 22, Express 5 e PostgreSQL 17 no servidor.
- Docker e Kamal 2 para publicação, seguindo a configuração do projeto Finance.
- Fonte Inter incluída localmente com sua licença.

## Rodar localmente

Instale Node.js **22.12 ou superior** e Docker. Execute na pasta do projeto:

```sh
cp .env.example .env
docker compose up -d --wait
npm ci
npm run dev
```

Abra **http://localhost:3007**. O PostgreSQL local usa a porta 5436 e um volume próprio.
O servidor cria as tabelas e carrega os dados na primeira inicialização. Nas seguintes,
preserva negociações, posições e cotações. Não execute `01_ddl.sql` novamente nesse banco.

## Como usar

1. Clique em **Iniciar simulação** para gerar cotações a cada 5 segundos.
2. Selecione uma ação e o período do gráfico: 15 minutos, uma hora ou todo o histórico.
3. Escolha comprar ou vender, informe a quantidade inteira e confirme pelo botão.
4. Consulte dinheiro, ações e patrimônio no resumo e as posições em **Carteira**.
5. Abra **Histórico** para consultar compras e vendas, com paginação.
6. Em **Carteira no passado**, escolha uma data e hora para reconstruir a posição.
7. Clique em **Pausar simulação** para interromper as cotações.

A simulação começa pausada e expira após **60 segundos sem uma tela aberta e visível**.
Abas em segundo plano não a mantêm ativa. Uma tela visível envia contato a cada 20 segundos.
Ao pausar ou expirar, o worker deixa de agendar rodadas. Não existe geração contínua com a
simulação parada. Iniciar e pausar afeta todos que compartilham esta demonstração.

Os preços variam em até ±0,5% por rodada, com mínimo de R$ 0,01. Uma rodada pode manter
o mesmo preço após o arredondamento. Não são criadas cotações para os períodos parados.
O gráfico completo usa até 600 amostras; os registros originais são preservados.

## Regras financeiras

- A compra exige dinheiro disponível; a venda exige ações suficientes.
- O servidor usa a última cotação gravada, sem aceitar preço enviado pela tela.
- Dinheiro é calculado em `NUMERIC` no PostgreSQL, sem ponto flutuante nas decisões de saldo.
- A view `saldo_financeiro` calcula saldo inicial menos compras mais vendas.
- Negociação e posição são gravadas na mesma transação, com bloqueio por investidor.
- Repetir o mesmo envio não duplica a negociação, pois cada envio tem identificação única.
- A carteira mostra o preço médio de compra das ações ainda possuídas. Compras recalculam
  a média ponderada; vendas parciais mantêm a média. Após vender tudo, uma nova compra inicia outra média.
- A consulta passada usa somente negociações e cotações até a data escolhida. Sem cotação
  anterior, o valor aparece como desconhecido, sem usar preços futuros nem substituir por zero.
- Com a simulação pausada, ainda é possível negociar pela última cotação registrada.

As validações de saldo e quantidade e a manutenção da posição ficam na API em
`server/trading.js`. Inserções manuais por SQL precisam aplicar essas mesmas regras.
Não há taxas, dividendos, aluguel de ações ou ordens pendentes nesta versão.

## Arquivos do trabalho

- `bolsa.dbml`: seis tabelas de domínio e `simulacao`, de controle operacional.
- `01_ddl.sql`: tabelas, chaves, restrições, índices e view financeira.
- `02_dados_iniciais.sql`: um investidor, cinco empresas, seis ações e 726 cotações iniciais (amostra histórica a cada 30 segundos; as novas cotações usam 5 segundos).
- `03_verificar.sql`: autoverificação da carga inicial; desfaz suas operações de teste.
- `04_consultas.sql`: ações possuídas pelo investidor, histórico de cotações e tabela Minha carteira com preço médio.
- `server/`: API, transações financeiras, inicialização do banco e worker.
- `src/`: interface e componentes React.
- `test/app.test.js`: testes em banco descartável separado do banco de uso do app.
- `docs/design/`: conceito visual e registro da comparação com a interface.

Para executar apenas os scripts acadêmicos, em um banco vazio:

```sh
psql -v ON_ERROR_STOP=1 -d bolsa -f 01_ddl.sql
psql -v ON_ERROR_STOP=1 -d bolsa -f 02_dados_iniciais.sql
psql -v ON_ERROR_STOP=1 -d bolsa -f 03_verificar.sql
```

A carga pode ser repetida sequencialmente sem duplicar dados. A verificação SQL pressupõe
a carga inicial, antes de novas cotações ou operações do app. Para testar o app depois:

```sh
npm test
npm run build
docker build -t bolsa-local .
```

Os testes criam e removem `bolsa_test_<pid>`; o usuário local precisa de permissão
`CREATEDB`. Eles não limpam os dados do banco `bolsa`.

Para verificar a troca de ações na interface, abra Mercado e execute o conteúdo
de `test/stock-selection.browser.js` no console do navegador. Ele troca entre
as seis ações 18 vezes e confirma que existe apenas um gráfico e um formulário,
sem executar compras ou vendas.

## Deploy com Kamal

`config/deploy.yml` reaproveita do Finance o servidor `178.104.212.36`, o registro
`thiagoramos23`, o builder remoto amd64 e o healthcheck `/up`. Serviço e imagem
chamam-se `bolsa`, usam a porta interna 3007 e um banco **separado**, também chamado `bolsa`.

O domínio sugerido é **bolsa.thiagoramos.me**. Antes do deploy:

1. Confirme o domínio ou ajuste `proxy.host` e `APP_URL` juntos.
2. Aponte o DNS para o servidor.
3. Crie o banco `bolsa` no PostgreSQL existente, com o proprietário da conexão em `DATABASE_URL`.
4. Confira `.kamal/secrets` (local, ignorado, permissão 600). As credenciais do registro
   e do PostgreSQL vieram do Finance, trocando somente o nome do banco para `bolsa`.
5. Coloque o projeto sob Git e faça o commit da versão que deseja publicar. Não inclua `.env`
   nem `.kamal/secrets`. Docker/Kamal e o acesso SSH do Finance precisam estar configurados.

Depois disso, no primeiro deploy:

```sh
kamal setup
```

Nas próximas versões:

```sh
kamal deploy
kamal logs
```

Para validar somente a configuração antes de existir um commit:

```sh
kamal config --version=local-check
```

Nenhum deploy ou alteração no banco remoto foi feito nesta implementação.
Sem login, qualquer visitante pode negociar e controlar a mesma simulação.
Todos os dados são fictícios; não use o app para operar ativos reais.
