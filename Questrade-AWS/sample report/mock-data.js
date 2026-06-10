/*
 * MOCK DATA for the Net-Worth Report layout mockup.
 *
 * This object is intentionally shaped like the data the REAL backend will
 * eventually return (account-balances + bank-balances + custom-investments).
 * Once the layout is finalized, converting to the real UI is mostly swapping
 * this file for live API fetches — so treat this shape as the data contract.
 *
 * Numbers are illustrative but internally consistent:
 *   Questrade  total = invested + pnl + cash   (= marketValue + cash)
 *   Custom     cost  = Σ(qty × price),  currentValue = totalQty × currentPrice
 */
const MOCK_DATA = {
  meta: {
    reportTitle: "Net-Worth Report",
    asOfDate: "2026-06-09",
    usdCadRate: 1.39,            // top-bar USD/CAD rate (display-only)
    people: ["Vivek", "Dharati"] // free-form report names (Angel login -> Dharati)
  },

  // ---- Section A: Bank / cash balances (100% manual) ----------------------
  bankBalances: [
    { person: "Vivek",   bankName: "TD Chequing",   currency: "CAD", amount: 8500.00 },
    { person: "Vivek",   bankName: "Tangerine HISA", currency: "CAD", amount: 12000.00 },
    { person: "Dharati", bankName: "RBC Savings",    currency: "CAD", amount: 6400.00 },
    { person: "Dharati", bankName: "Simplii",        currency: "CAD", amount: 3200.00 },
    { person: "Vivek",   bankName: "TD US Account",  currency: "USD", amount: 2100.00 },
    { person: "Dharati", bankName: "RBC US Account", currency: "USD", amount: 950.00 }
  ],

  // ---- Section B: Questrade investment summary (auto + manual lines) -------
  // contribution = money in; invested = cost basis; pnl = marketValue - invested;
  // total = invested + pnl + cash. `manual:true` rows are owner-added extra lines.
  questrade: [
    // Vivek — CAD
    { person: "Vivek",   account: "TFSA", currency: "CAD", contribution: 10000.00, invested: 12000.00, pnl: 4724.01, cash: 348.80 },
    { person: "Vivek",   account: "RRSP", currency: "CAD", contribution: 20000.00, invested: 22000.00, pnl: 3100.50, cash: 540.00 },
    { person: "Vivek",   account: "Cash", currency: "CAD", contribution: 5000.00,  invested: 5200.00,  pnl: -300.00, cash: 1200.00 },
    // Dharati — CAD
    { person: "Dharati", account: "TFSA", currency: "CAD", contribution: 8000.00,  invested: 8500.00,  pnl: 1200.00, cash: 210.00 },
    { person: "Dharati", account: "RRSP", currency: "CAD", contribution: 6000.00,  invested: 6200.00,  pnl: 450.00,  cash: 120.00 },
    { person: "Dharati", account: "Cash", currency: "CAD", contribution: 2000.00,  invested: 1900.00,  pnl: 80.00,   cash: 300.00 },

    // Vivek — USD
    { person: "Vivek",   account: "TFSA", currency: "USD", contribution: 8000.00,  invested: 9687.89,  pnl: 2100.00, cash: 150.00 },
    { person: "Vivek",   account: "RRSP", currency: "USD", contribution: 5000.00,  invested: 5500.00,  pnl: 800.00,  cash: 75.00 },
    // Dharati — USD
    { person: "Dharati", account: "TFSA", currency: "USD", contribution: 3000.00,  invested: 3200.00,  pnl: 400.00,  cash: 60.00 },

    // Manual extra line (owner-added, e.g. "Parle G") — flows into the person total
    { person: "Vivek", account: "Parle G", currency: "CAD", manual: true, contribution: 0, invested: 1275.00, pnl: 375.00, cash: 0 }
  ],

  // ---- Section C: Custom investments (manual) -----------------------------
  // Two shapes:
  //   lot-based: lots:[{quantity, price}] + currentPrice  -> cost/avg/value/pnl computed
  //   simple   : cost + currentValue entered directly
  customInvestments: [
    { person: "Vivek",   name: "Parle G (Gold)", category: "GOLD",   currency: "CAD",
      lots: [ { quantity: 10, price: 80.00 }, { quantity: 5, price: 95.00 } ], currentPrice: 110.00 },
    { person: "Dharati", name: "Silver Bars",    category: "SILVER", currency: "CAD",
      lots: [ { quantity: 20, price: 30.00 } ], currentPrice: 35.00 },
    { person: "Vivek",   name: "Private Co Shares", category: "EQUITY", currency: "CAD",
      cost: 5000.00, currentValue: 7500.00 },
    { person: "Dharati", name: "Bitcoin",        category: "CRYPTO", currency: "USD",
      cost: 2000.00, currentValue: 3200.00 }
  ]
};
