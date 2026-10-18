# Direção visual — Bolsa Lab

Tema atual: índigo #4f46e5, solicitado pelo usuário após a implementação.
Botões, seleção, gráfico e favicon usam índigo; vendas e quedas continuam em vermelho.
O conceito e as capturas abaixo registram a versão verde anterior.

Referência: `conceito.png`, criada com Image Gen integrado para esta implementação.

Interface em português, fundo cinza claro #f6f7f9, superfícies brancas,
texto azul escuro #152238 e ações em verde #0c8669. Tipografia Inter com
alternativa do sistema. Cabeçalho horizontal, três números de resumo e três
colunas para ações, gráfico e negociação; tabela da carteira abaixo.

Componentes: cabeçalho e navegação, resumo, lista de ações, gráfico, formulário
de compra/venda, carteira, histórico paginado e consulta retrospectiva.
Em telas pequenas, a lista de ações rola na horizontal e as demais áreas ficam
empilhadas. O teclado deve alcançar todos os controles; erros e resultados
das negociações são anunciados por uma região de status.

Diferenças intencionais do conceito:

- Empresas e preços usam o banco do trabalho; os dados no desenho são exemplos.
- A carteira mostra quantidade, preço médio de compra, preço atual e valor total.
  A pedido do usuário, o preço médio usa média ponderada das ações ainda possuídas;
  vendas parciais mantêm a média e uma nova posição começa outra média após a venda total.
- A variação sempre se refere à última hora, com rótulo explícito.
- Inclui posição possuída no formulário, erro de conexão e estados de erro/sucesso.
- Carteira inclui análise por data/hora, exigida pelo enunciado.
- O gráfico inclui a atribuição exigida pela biblioteca.
- O cabeçalho tem Iniciar/Pausar simulação, conforme o novo pedido; pausa após 60 segundos sem tela visível.

## Verificação final

Conceito e captura final foram inspecionados com `view_image`. A referência tem
1505 × 1045 pixels; a interface foi conferida nessa largura, além de desktop 1440
e celular 390 e 320. As capturas finais estão em `desktop.png` e `mobile.png`.

Comparação realizada:

- Layout: cabeçalho horizontal, três números de resumo, ações/gráfico/negociação
  em três colunas e carteira abaixo; no celular, áreas empilhadas e ações em lista horizontal.
- Tipografia: Inter local, números destacados e texto secundário menor; os valores
  e controles do desktop foram ampliados após a primeira inspeção.
- Paleta: fundo cinza claro, painéis brancos, verde nas compras e vermelho nas vendas.
- Espaçamento e controles: bordas discretas, cantos pequenos e formulário com
  seletor de operação, quantidade, preço e total.
- Gráfico: linha verde e preenchimento leve, com dados reais da simulação. O ajuste
  ao tamanho do painel foi corrigido após a primeira captura, sem faixa vazia à esquerda.
- Texto do primeiro viewport: títulos e ações seguem o conceito. Dados vêm do banco;
  os acréscimos são os controles de simulação pedidos e rótulos descritos acima.

Não restaram diferenças visuais materiais fora das adaptações listadas. A interface
mantém a direção do conceito; os preços aleatórios não repetem o traçado ilustrativo.

O navegador do T3 falhou na captura com `Preview automation snapshot timed out after 15000ms`.
A verificação continuou no Chrome via CUA. Foram exercitados iniciar/pausar, mudança
de preços, compra, venda, recusa por saldo/quantidade, histórico, consulta retrospectiva
entre compra e venda e troca do período do gráfico. Não houve rolagem lateral da
página em 320 ou 390 pixels.
