// Execute no console do navegador com o app aberto na aba Mercado.
// Não realiza compras/vendas nem altera os dados do banco.
(async () => {
  const stocks = [...document.querySelectorAll('.stock-row')];
  if (stocks.length < 2) throw new Error('Abra Mercado e aguarde as ações carregarem.');
  const switches = [...stocks, ...stocks.toReversed(), ...stocks];
  for (const button of switches) {
    const ticker = button.querySelector('.stock-name strong').textContent;
    button.click();
    const deadline = Date.now() + 3000;
    while (!document.querySelector('.chart-panel .stock-subtitle')?.textContent.startsWith(ticker)) {
      if (Date.now() > deadline) throw new Error(`O gráfico não mudou para ${ticker}.`);
      await new Promise(resolve => setTimeout(resolve, 20));
    }
    for (const selector of ['.chart-panel', '.price-chart', '.order-panel']) {
      const count = document.querySelectorAll(selector).length;
      if (count !== 1) throw new Error(`${ticker}: esperado 1 ${selector}, encontrado ${count}.`);
    }
    if (!document.querySelector('.order-panel button[type="submit"]').textContent.includes(ticker)) {
      throw new Error(`O formulário não mudou para ${ticker}.`);
    }
  }
  return `${switches.length} trocas verificadas: um gráfico e um formulário por ação.`;
})();
