// Holdings Page - Main Portfolio View
import { createSignal, createEffect, createMemo, onMount, onCleanup, batch } from 'solid-js';
import { createStore } from 'solid-js/store';
import MetricsGrid from '../components/metrics/MetricsGrid';
import HoldingsTable from '../components/holdings/HoldingsTable';
import { fetchPositions, fetchCashBalances, fetchExchangeRate } from '../services/api';
import questradeWebSocket from '../services/questradeWebSocket';
import { debounce } from '../utils/debounce';
import './Holdings.css';

// WebSocket enabled with backend caching to prevent rate limit errors
const WEBSOCKET_ENABLED = true;

export default function Holdings(props) {
  // Use createStore for positions to enable granular reactivity
  // Only changed positions will trigger downstream effects
  const [rawPositions, setRawPositions] = createStore([]);
  const [positionsVersion, setPositionsVersion] = createSignal(0); // Track when positions update
  const [holdings, setHoldings] = createSignal([]); // Transformed & filtered holdings for display
  const [cashBalances, setCashBalances] = createSignal([]);
  const [exchangeRate, setExchangeRate] = createSignal(1.40);
  const [loading, setLoading] = createSignal(true);

  const personName = () => props.selectedPerson || 'Vivek';

  const [metrics, setMetrics] = createSignal({
    totalInvested: 0,
    currentValue: 0,
    profitLoss: 0,
    profitLossPercent: 0,
    totalReturn: 0,
    totalReturnPercent: 0,
    todayPnL: 0, // NEW: Today's P&L
    todayPnLPercent: 0, // NEW: Today's P&L percentage
    yoc: 0,
    monthlyIncome: 0,
    totalCashCAD: 0,
    totalCashUSD: 0,
    cashAccountCount: 0,
    positionCount: 0
  });

  let refreshInterval;
  let updateBatchTimer = null; // Timer for batching quote updates

  // Create debounced version of calculateMetrics
  // Waits 300ms after last update before recalculating
  // This prevents excessive calculations during rapid WebSocket updates
  const debouncedCalculateMetrics = debounce((positions, cash, rate, filter, currFilter, displayCurrency) => {
    console.log('🔄 [Debounced] Executing metrics calculation after 300ms delay');
    calculateMetrics(positions, cash, rate, filter, currFilter, displayCurrency);
  }, 300);

  // Transform API data to match table format with ALL 17 columns
  // NOTE: Table shows ORIGINAL currency values (no conversion), only metrics are converted
  function transformPositions(positions, rate) {
    return positions.map(pos => {
      const shares = pos.openQuantity || 0;

      // Backend-provided values (KEEP ORIGINAL CURRENCY - NO CONVERSION)
      const avgCost = pos.averageEntryPrice || 0;
      const currentPrice = pos.currentPrice || 0;
      const previousClose = pos.previousClose || pos.openPrice || currentPrice; // Previous day close (from backend)

      // Dividend data from backend (in original currency)
      const yieldOnCost = pos.dividendData?.yieldOnCost || 0;
      const annualDividendPerShare = pos.dividendData?.annualDividendPerShare || 0;
      const monthlyDividendPerShare = pos.dividendData?.monthlyDividendPerShare || 0;
      const totalDivReceived = pos.dividendData?.totalReceived || 0;

      // Frontend calculations (all in ORIGINAL currency)
      const investmentValue = avgCost * shares; // Total cost
      const marketValue = currentPrice * shares; // Current value
      // FIXED: Use previousClose (yesterday's close) instead of openPrice (today's open)
      // IMPORTANT: Questrade's formula for Today's Change
      // Today's % = ((Current Price - Previous Close) / Previous Close) × 100
      // Today's $ = (Current Price - Previous Close) × Shares
      const todayChangePercent = previousClose > 0 ? ((currentPrice - previousClose) / previousClose) * 100 : 0; // Today's % change
      const todayChangeDollar = (currentPrice - previousClose) * shares; // Today's $ change (matches Questrade)
      const todayReturn = (currentPrice - previousClose) * shares; // Today's $ return (same as todayChangeDollar)

      // Total P&L (all-time profit/loss from avg cost to current price)
      const totalPnLDollar = (currentPrice - avgCost) * shares; // Total P&L in dollars
      const totalPnLPercent = avgCost > 0 ? ((currentPrice - avgCost) / avgCost) * 100 : 0; // Total P&L in percentage

      // Current Yield - calculated in UI with real-time price for accuracy
      const currentYield = currentPrice > 0 ? (annualDividendPerShare / currentPrice) * 100 : 0; // Current yield %
      const monthlyYield = monthlyDividendPerShare * shares; // Monthly dividend income (use backend's 4 decimal precision)
      const monthlyDivIncome = monthlyDividendPerShare; // Monthly div per share (use backend's 4 decimal precision)
      const divAdjCost = shares > 0 ? avgCost - (totalDivReceived / shares) : avgCost; // Dividend-adjusted cost basis
      const divAdjYield = (divAdjCost * shares) > 0 ? (annualDividendPerShare / divAdjCost) * 100 : 0; // Div adj yield %
      const sourceAccounts = pos.sourceAccounts || [];

      return {
        // Stock info
        ticker: pos.symbol,
        company: pos.companyName,
        currency: pos.currency,

        // All column values
        quantity: shares, // Legacy name kept for compatibility
        shares: shares, // SHARES column
        cost: avgCost, // AVG COST column
        previousClose: previousClose, // PREV CLOSE column (yesterday's close)
        price: currentPrice, // CURRENT PRICE column
        change: todayChangePercent, // TODAY CHANGE column (%)
        changeDollar: todayChangeDollar, // TODAY CHANGE column ($)
        totalPnL: totalPnLPercent, // TOTAL P&L column (%)
        totalPnLDollar: totalPnLDollar, // TOTAL P&L column ($)
        portfolioPercentage: pos.portfolioPercentage || 0, // % OF PORTFOLIO column (%)
        yield: currentYield, // CURRENT YIELD column (%)
        monthlyYield: monthlyYield, // MONTHLY YIELD column ($)
        yoc: yieldOnCost, // YIELD ON COST column (%)
        investmentValue: investmentValue, // INVESTMENT VALUE column ($)
        value: marketValue, // Legacy - MARKET VALUE column ($)
        marketValue: marketValue, // MARKET VALUE column ($)
        todayReturn: todayReturn, // TODAY RETURN column ($)
        divPerShare: annualDividendPerShare, // DIV PER SHARE column ($)
        monthlyDivIncome: monthlyDivIncome, // MONTHLY DIV INCOME column ($)
        totalDivReceived: totalDivReceived, // TOTAL DIV RECEIVED column ($)
        divAdjCost: divAdjCost, // DIV ADJ COST column ($)
        divAdjYield: divAdjYield, // DIV ADJ YIELD column (%)
        sourceAccounts: sourceAccounts.join(', '), // SOURCE ACCOUNTS column (text)
        actions: null // ACTIONS column (UI only)
      };
    });
  }

  // Filter positions based on account selection
  function filterPositionsByAccount(positions) {
    const filter = accountFilter();
    console.log('🔍 Applying account filter:', filter);

    // If viewing by person (aggregate), show all positions
    if (filter.type === 'person') {
      console.log('✅ Showing all positions for person:', filter.value);
      return positions;
    }

    // If viewing by specific account, filter by sourceAccounts (account type)
    if (filter.type === 'account' && filter.value?.accountType) {
      const accountType = filter.value.accountType; // e.g., "Cash", "TFSA", "FHSA", "RRSP"
      console.log('🏦 Filtering by account type:', accountType);

      const filtered = positions.filter(pos => {
        const sourceAccounts = pos.sourceAccounts || [];
        // sourceAccounts is an array of account types like ["TFSA", "Cash"]
        const hasAccount = sourceAccounts.includes(accountType);
        return hasAccount;
      });

      console.log(`✅ Filtered ${filtered.length} of ${positions.length} positions for account type ${accountType}`);
      return filtered;
    }

    return positions;
  }

  // Load data
  async function loadData() {
    try {
      // Get current account filter
      const filter = (typeof props.accountFilter === 'function' ? props.accountFilter() : props.accountFilter) || { type: 'person', value: 'Vivek' };

      console.log('📊 Loading portfolio data - Filter:', JSON.stringify(filter));

      // Determine what data to fetch based on filter type
      let positionsPromise, cashPromise;

      if (filter.type === 'all') {
        // Fetch all persons' combined data
        console.log('📊 Fetching ALL ACCOUNTS data');
        positionsPromise = fetchPositions('all'); // Use 'all' to fetch combined data
        cashPromise = fetchCashBalances('all');
      } else if (filter.type === 'person') {
        // Fetch specific person's data
        console.log('📊 Fetching data for person:', filter.value);
        positionsPromise = fetchPositions(filter.value);
        cashPromise = fetchCashBalances(filter.value);
      } else if (filter.type === 'account') {
        // For specific account, still fetch the person's data (filtering happens in UI)
        const person = personName();
        console.log('📊 Fetching data for person:', person, '(will filter by account:', filter.value?.accountType, ')');
        positionsPromise = fetchPositions(person);
        cashPromise = fetchCashBalances(person);
      } else {
        // Fallback
        positionsPromise = fetchPositions(personName());
        cashPromise = fetchCashBalances(personName());
      }

      const [positionsData, cashData, rate] = await Promise.all([
        positionsPromise,
        cashPromise,
        fetchExchangeRate()
      ]);

      console.log('✅ Positions loaded:', positionsData?.length, 'positions');
      console.log('✅ Cash balances loaded:', cashData);
      console.log('✅ Exchange rate:', rate);

      // Store raw positions and exchange rate
      setRawPositions(positionsData || []);
      setCashBalances(cashData || []);
      setExchangeRate(rate);

      // Update exchange rate in parent
      if (props.onExchangeRateUpdate) {
        props.onExchangeRateUpdate(rate);
      }

      setLoading(false);
    } catch (error) {
      console.error('❌ Error loading portfolio data:', error);
      console.error('Error details:', error.message);
      setLoading(false);
    }
  }

  // Reload data when account filter changes (person, all accounts, or specific account)
  createEffect(() => {
    const filter = (typeof props.accountFilter === 'function' ? props.accountFilter() : props.accountFilter) || { type: 'person', value: 'Vivek' };
    console.log('🔄 Account filter changed, reloading data. Filter:', JSON.stringify(filter));
    loadData();
  });

  // OPTIMIZED: Split large effect into granular memo chain
  // Each memo only reruns when its specific dependencies change

  // Step 1: Account filtering (reruns only when rawPositions OR accountFilter changes)
  const filteredByAccount = createMemo(() => {
    // Track version to ensure reactivity when positions update
    positionsVersion(); // Access version signal to trigger reactivity

    // Access store as array to ensure reactivity on changes
    const positions = [...rawPositions]; // Create new array to track changes
    const filter = (typeof props.accountFilter === 'function' ? props.accountFilter() : props.accountFilter) || { type: 'person', value: 'Vivek' };

    console.log('🔄 [Memo 1/4] Applying account filter:', JSON.stringify(filter));
    console.log('   Raw positions count:', positions.length);

    if (positions.length === 0) return [];

    // If viewing by specific account, expand individualPositions and filter
    if (filter.type === 'account' && filter.value?.accountType) {
      const accountType = filter.value.accountType;
      console.log('🏦 Filtering by account type:', accountType);

      const filteredPositions = [];

      // Expand individualPositions into separate position objects
      positions.forEach(pos => {
        if (pos.individualPositions && Array.isArray(pos.individualPositions)) {
          const accountPositions = pos.individualPositions.filter(
            indivPos => indivPos.accountType === accountType
          );

          accountPositions.forEach(indivPos => {
            // Recalculate account-specific dividend data
            const accountDividendData = { ...pos.dividendData };
            if (accountDividendData && accountDividendData.annualDividendPerShare) {
              const annualDividendPerShare = accountDividendData.annualDividendPerShare || 0;
              const monthlyDividendPerShare = accountDividendData.monthlyDividendPerShare || 0;

              accountDividendData.annualDividend = annualDividendPerShare * indivPos.shares;
              accountDividendData.monthlyDividend = monthlyDividendPerShare * indivPos.shares;
            }

            filteredPositions.push({
              ...pos,
              currency: indivPos.currency || pos.currency,
              openQuantity: indivPos.shares,
              averageEntryPrice: indivPos.avgCost,
              accountName: indivPos.accountName,
              sourceAccounts: [indivPos.accountType],
              isAggregated: false,
              dividendData: accountDividendData
            });
          });
        }
      });

      console.log(`✅ Expanded to ${filteredPositions.length} account-specific positions`);
      return filteredPositions;
    }

    // Person view or All accounts view - use aggregated positions
    const viewType = filter.type === 'all' ? 'all accounts' : `person: ${filter.value}`;
    console.log(`✅ Showing aggregated positions for ${viewType}`);
    return positions;
  });

  // Step 2: Currency filtering (reruns only when filteredByAccount OR currencyFilter changes)
  const filteredByCurrency = createMemo(() => {
    const positions = filteredByAccount();
    const currFilter = (typeof props.currencyFilter === 'function' ? props.currencyFilter() : props.currencyFilter);

    console.log('🔄 [Memo 2/4] Applying currency filter:', currFilter);

    if (!currFilter) {
      // Always return new array reference to ensure downstream reactivity
      return [...positions];
    }

    console.log('💱 Filtering by currency:', currFilter);
    const filtered = positions.filter(pos => pos.currency === currFilter);
    console.log(`✅ Currency filtered: ${filtered.length} of ${positions.length} positions`);
    return filtered;
  });

  // Step 3: Transform for display (reruns only when filteredByCurrency OR exchangeRate changes)
  const transformedHoldings = createMemo(() => {
    const positions = filteredByCurrency();
    const rate = exchangeRate();

    console.log('🔄 [Memo 3/4] Transforming holdings, count:', positions.length);

    if (positions.length === 0) return [];

    return transformPositions(positions, rate);
  });

  // Step 4: Update holdings signal from memo (effect only runs when transformedHoldings changes)
  createEffect(() => {
    const holdings = transformedHoldings();
    console.log('🔄 [Effect] Updating holdings signal, count:', holdings.length);
    setHoldings(holdings);
  });

  // Step 5: Calculate metrics (effect runs when positions, cash, or rate changes)
  // DEBOUNCED: Waits 300ms after last change before recalculating
  createEffect(() => {
    const positions = filteredByCurrency();
    const cash = cashBalances();
    const rate = exchangeRate();
    const filter = (typeof props.accountFilter === 'function' ? props.accountFilter() : props.accountFilter) || { type: 'person', value: 'Vivek' };
    const currFilter = (typeof props.currencyFilter === 'function' ? props.currencyFilter() : props.currencyFilter);
    const displayCurrency = props.selectedCurrency || 'CAD';

    console.log('🔄 [Effect] Metrics calculation triggered, positions:', positions.length, '(debounced 300ms)');

    if (positions.length > 0) {
      // Use debounced version - waits 300ms after last update
      debouncedCalculateMetrics(positions, cash, rate, filter, currFilter, displayCurrency);
    }
  });

  // Calculate portfolio metrics
  function calculateMetrics(positions, cash, rate, filter = null, currencyFilter = null, displayCurrency = 'CAD') {
    let totalInvested = 0;
    let currentValue = 0;
    let totalDividendIncome = 0;
    let todayPnL = 0; // NEW: Today's P&L from Questrade (aggregated)

    // IMPORTANT: YoC calculation should ONLY include positions that are checked in "Include in YoC"
    // This means we EXCLUDE positions where excludedFromYoC === true
    let yocTotalInvested = 0; // Investment only for stocks included in YoC
    let yocTotalDividendIncome = 0; // Dividends only for stocks included in YoC

    console.log('💹 Calculating metrics in display currency:', displayCurrency);
    console.log(`💹 Processing ${positions.length} positions for metrics calculation`);
    console.log(`💹 Exchange rate: ${rate}`);

    positions.forEach(pos => {
      const cost = pos.averageEntryPrice || 0;
      const currentPrice = pos.currentPrice || 0; // Live price (updated by WebSocket)
      const previousClose = pos.previousClose || pos.openPrice || currentPrice; // Previous day close (from backend)
      const qty = pos.openQuantity || 0;
      const isUSD = pos.currency === 'USD';
      const excludedFromYoC = pos.excludedFromYoC || false; // Flag from backend (Dividend Manager)

      // FIXED: Calculate TODAY'S P&L correctly using Questrade's formula:
      // Today's P&L = (Current Price - Previous Day Close) × Quantity
      // previousClose = Yesterday's closing price (NOT today's opening price)
      // Use live currentPrice if available from WebSocket, otherwise use backend price
      const positionDayPnl = (currentPrice - previousClose) * qty;

      // Convert to display currency
      let costInDisplayCurrency, priceInDisplayCurrency, previousCloseInDisplayCurrency, dayPnlInDisplayCurrency;

      if (displayCurrency === 'USD') {
        // Convert everything to USD
        costInDisplayCurrency = isUSD ? cost : cost / rate;
        priceInDisplayCurrency = isUSD ? currentPrice : currentPrice / rate;
        previousCloseInDisplayCurrency = isUSD ? previousClose : previousClose / rate;
        dayPnlInDisplayCurrency = isUSD ? positionDayPnl : positionDayPnl / rate;
      } else {
        // Convert everything to CAD (default)
        costInDisplayCurrency = isUSD ? cost * rate : cost;
        priceInDisplayCurrency = isUSD ? currentPrice * rate : currentPrice;
        previousCloseInDisplayCurrency = isUSD ? previousClose * rate : previousClose;
        dayPnlInDisplayCurrency = isUSD ? positionDayPnl * rate : positionDayPnl;
      }

      const positionInvested = costInDisplayCurrency * qty;
      const positionValue = priceInDisplayCurrency * qty;

      totalInvested += positionInvested;
      currentValue += positionValue;
      todayPnL += dayPnlInDisplayCurrency; // Use calculated dayPnl

      // Log each position's contribution
      console.log(`   ${pos.symbol} (${pos.currency}): ${qty} shares @ ${displayCurrency} ${priceInDisplayCurrency.toFixed(2)} current, ${previousCloseInDisplayCurrency.toFixed(2)} prev close = Today P&L: ${displayCurrency} ${dayPnlInDisplayCurrency.toFixed(2)} (calculated: ${currentPrice.toFixed(2)} - ${previousClose.toFixed(2)} × ${qty})`);

      // Calculate dividend income (convert to display currency)
      const annualDividend = pos.dividendData?.annualDividend || 0;
      const annualDividendInDisplayCurrency = displayCurrency === 'USD'
        ? (isUSD ? annualDividend : annualDividend / rate)
        : (isUSD ? annualDividend * rate : annualDividend);

      totalDividendIncome += annualDividendInDisplayCurrency;

      // IMPORTANT: Only include in YoC calculation if NOT excluded
      if (!excludedFromYoC) {
        yocTotalInvested += positionInvested;
        yocTotalDividendIncome += annualDividendInDisplayCurrency;
        console.log(`   ✅ ${pos.symbol}: INCLUDED in YoC (invested: ${positionInvested.toFixed(2)}, dividend: ${annualDividendInDisplayCurrency.toFixed(2)})`);
      } else {
        console.log(`   ❌ ${pos.symbol}: EXCLUDED from YoC`);
      }
    });

    const profitLoss = currentValue - totalInvested;
    const profitLossPercent = totalInvested > 0 ? (profitLoss / totalInvested) * 100 : 0;
    const todayPnLPercent = currentValue > 0 ? (todayPnL / (currentValue - todayPnL)) * 100 : 0; // Today's P&L percentage (based on opening value)

    // Total return = P&L + dividends received
    const totalReturn = profitLoss + (totalDividendIncome * 0.5); // Estimate half-year dividends
    const totalReturnPercent = totalInvested > 0 ? (totalReturn / totalInvested) * 100 : 0;

    // FIXED: YoC calculation ONLY includes stocks checked in "Include in YoC" (excludedFromYoC === false)
    const yoc = yocTotalInvested > 0 ? (yocTotalDividendIncome / yocTotalInvested) * 100 : 0;
    const monthlyIncome = yocTotalDividendIncome / 12;

    console.log(`💰 YoC Calculation - Total Invested: ${yocTotalInvested.toFixed(2)}, Total Dividend: ${yocTotalDividendIncome.toFixed(2)}, YoC: ${yoc.toFixed(2)}%`);

    // Calculate total cash - filter by account if specified, keep CAD and USD separate
    let totalCashCAD = 0;
    let totalCashUSD = 0;
    let accountCount = 0;

    if (cash && cash.accounts && Array.isArray(cash.accounts)) {
      // Filter accounts if specific account type is selected
      const accountsToSum = filter && filter.type === 'account' && filter.value?.accountType
        ? cash.accounts.filter(acc => acc.accountType === filter.value.accountType)
        : cash.accounts;

      accountCount = accountsToSum.length;
      console.log('💰 Calculating cash for accounts:', accountsToSum.length, 'of', cash.accounts.length);

      accountsToSum.forEach(account => {
        console.log('   💵 Account:', account.accountType, account.accountId);
        if (account.cashBalances && Array.isArray(account.cashBalances)) {
          account.cashBalances.forEach(balance => {
            // Use 'cash' field only (not totalEquity which includes investments)
            const amount = balance.cash || 0;
            if (balance.currency === 'USD') {
              totalCashUSD += amount;
              console.log(`      USD cash: $${amount.toFixed(2)}`);
            } else if (balance.currency === 'CAD') {
              totalCashCAD += amount;
              console.log(`      CAD cash: $${amount.toFixed(2)}`);
            }
          });
        }
      });
      console.log(`   ✅ Total cash - CAD: $${totalCashCAD.toFixed(2)}, USD: $${totalCashUSD.toFixed(2)}`);
    } else if (cash && cash.summary) {
      // Use summary if available (only for aggregate view)
      if (!filter || filter.type === 'person') {
        totalCashCAD = cash.summary.totalCAD || 0;
        totalCashUSD = cash.summary.totalUSD || 0;
        accountCount = cash.summary.totalAccounts || 0;
      }
    }

    // Store metrics with display currency for formatting
    setMetrics({
      totalInvested,
      currentValue,
      profitLoss,
      profitLossPercent,
      totalReturn,
      totalReturnPercent,
      todayPnL, // NEW: Today's P&L
      todayPnLPercent, // NEW: Today's P&L percentage
      yoc,
      monthlyIncome,
      totalCashCAD,
      totalCashUSD,
      cashAccountCount: accountCount,
      positionCount: positions.length,
      displayCurrency // Store display currency for formatting
    });

    console.log(`✅ Metrics calculated in ${displayCurrency}:`, {
      invested: totalInvested.toFixed(2),
      current: currentValue.toFixed(2),
      profitLoss: profitLoss.toFixed(2)
    });
  }

  // Format metrics for MetricsGrid component
  // MEMOIZED: Only recalculates when metrics() or exchangeRate() changes
  const formattedMetrics = createMemo(() => {
    const m = metrics();
    const displayCurr = m.displayCurrency || 'CAD';
    const currSymbol = displayCurr === 'USD' ? 'USD' : 'CAD';

    console.log('🔄 [Memo] Formatting metrics for display');

    // For CASH metric, show 3 lines: Total (converted), CAD (raw), USD (raw)
    let totalCash, totalCashLabel;
    if (displayCurr === 'USD') {
      // Convert both CAD and USD to USD for total
      totalCash = m.totalCashUSD + (m.totalCashCAD / exchangeRate());
      totalCashLabel = 'Total';
    } else {
      // Convert both CAD and USD to CAD for total (default)
      totalCash = m.totalCashCAD + (m.totalCashUSD * exchangeRate());
      totalCashLabel = 'Total';
    }

    const cashValue = `${totalCashLabel} ${displayCurr}: $${totalCash.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}\nCAD $${m.totalCashCAD.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}\nUSD $${m.totalCashUSD.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

    return [
      {
        name: 'INVEST',
        value: `${currSymbol}: $${m.totalInvested.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
        info: `${m.positionCount} pos`,
        successTag: null
      },
      {
        name: 'CURRENT',
        value: `${currSymbol}: $${m.currentValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
        info: 'live',
        successTag: null
      },
      {
        name: 'P&L',
        value: `${currSymbol}: $${m.profitLoss.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
        info: `${m.profitLossPercent >= 0 ? '+' : ''}${m.profitLossPercent.toFixed(2)}%`,
        successTag: m.profitLossPercent >= 0 ? `+${m.profitLossPercent.toFixed(2)}%` : null
      },
      {
        name: "TODAY'S P&L", // NEW: Today's P&L metric card
        value: `${currSymbol}: ${m.todayPnL >= 0 ? '+' : ''}$${Math.abs(m.todayPnL).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
        info: `${m.todayPnLPercent >= 0 ? '+' : ''}${m.todayPnLPercent.toFixed(2)}%`,
        successTag: m.todayPnL >= 0 ? `+${m.todayPnLPercent.toFixed(2)}%` : null,
        errorTag: m.todayPnL < 0 ? `${m.todayPnLPercent.toFixed(2)}%` : null
      },
      {
        name: 'RETURN',
        value: `${currSymbol}: $${m.totalReturn.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
        info: `${m.totalReturnPercent >= 0 ? '+' : ''}${m.totalReturnPercent.toFixed(2)}%`,
        successTag: m.totalReturnPercent >= 0 ? `+${m.totalReturnPercent.toFixed(2)}%` : null
      },
      {
        name: 'YOC',
        value: `${m.yoc.toFixed(2)}%`,
        info: `${currSymbol}: $${m.monthlyIncome.toFixed(0)}/mo`,
        successTag: null
      },
      {
        name: 'CASH',
        value: cashValue,
        info: `${m.cashAccountCount} account${m.cashAccountCount !== 1 ? 's' : ''}`,
        successTag: null
      }
    ];
  });

  // Handle real-time quote updates from WebSocket
  // Receives an ARRAY of quotes (batched from WebSocket)
  // OPTIMIZED: Skip quotes with no price change, use granular store updates
  function handleQuoteUpdate(quotes) {
    const timestamp = new Date().toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });

    // Handle both single quote and array of quotes
    const quoteArray = Array.isArray(quotes) ? quotes : [quotes];

    // Filter out quotes with no price change BEFORE updating store
    const changedQuotes = [];
    quoteArray.forEach(quote => {
      if (!quote.symbol || !quote.lastTradePrice) return;

      // Find position index
      const index = rawPositions.findIndex(pos => pos.symbol === quote.symbol);
      if (index === -1) return;

      const currentPrice = rawPositions[index].currentPrice;
      const newPrice = quote.lastTradePrice;

      // Only include if price actually changed
      if (newPrice !== currentPrice) {
        changedQuotes.push({ index, symbol: quote.symbol, newPrice });
      }
    });

    // Skip entirely if no prices changed
    if (changedQuotes.length === 0) {
      console.log(`[Holdings] [${timestamp}] ⏭️  Skipped ${quoteArray.length} quotes (no price changes)`);
      return;
    }

    console.log(`[Holdings] [${timestamp}] 📦 Processing ${changedQuotes.length} of ${quoteArray.length} quotes (prices changed)`);

    // Update ONLY changed positions using granular store updates
    // batch() groups multiple updates into one reactivity cycle
    batch(() => {
      changedQuotes.forEach(({ index, newPrice }) => {
        // Granular update: only triggers reactivity for this specific position
        setRawPositions(index, {
          currentPrice: newPrice,
          lastUpdated: new Date().toISOString()
        });
      });

      // Increment version to trigger memo chain reactivity
      setPositionsVersion(v => v + 1);
    });

    console.log(`[Holdings] [${timestamp}] ✅ Batch update complete - updated ${changedQuotes.length} positions`);
  }


  // Auto-refresh every 1 minute
  onMount(() => {
    loadData();
    refreshInterval = setInterval(loadData, 60000);

    // Note: WebSocket connection is handled by the reactive effect below
    // which triggers once positions are loaded
  });

  onCleanup(() => {
    if (refreshInterval) clearInterval(refreshInterval);

    // Disconnect WebSocket on cleanup
    console.log('[Holdings] 🔌 Disconnecting WebSocket...');
    questradeWebSocket.disconnect();
  });

  // Reactive effect to connect/manage WebSocket - SINGLE PERSISTENT CONNECTION
  // This effect triggers when positions change (person switch, data load, etc.)
  // The WebSocket service maintains ONE connection and updates symbols dynamically
  createEffect(() => {
    const positions = rawPositions; // Store access (no function call needed)
    const symbols = positions.map(pos => pos.symbol).filter(Boolean);

    console.log('[Holdings] 🔄 Effect triggered - positions:', positions.length, 'symbols:', symbols.length, 'connected:', questradeWebSocket.isConnected());

    // Check if WebSocket is enabled
    if (!WEBSOCKET_ENABLED) {
      console.log('[Holdings] ⏸️  WebSocket DISABLED - using 30-second REST API updates only');
      console.log('[Holdings] ℹ️  To enable WebSocket, set WEBSOCKET_ENABLED = true in Holdings.jsx after rate limit resets');
      return; // Skip WebSocket connection
    }

    if (symbols.length > 0) {
      // IMPORTANT: Do NOT disconnect/reconnect on person switch
      // The WebSocket service maintains a SINGLE PERSISTENT connection
      // and updates symbols dynamically
      console.log('[Holdings] 🔌 Connecting/updating WebSocket with', symbols.length, 'symbols');
      console.log('[Holdings] 🔌 WebSocket will handle ALL persons with ONE connection');
      questradeWebSocket.connect(symbols, handleQuoteUpdate);
    }
  });

  // Handle CSV export
  function handleExport(data) {
    console.log('📊 Exporting holdings to CSV...');

    if (!data || data.length === 0) {
      console.warn('No data to export');
      return;
    }

    // CSV headers
    const headers = [
      'Symbol',
      'Company',
      'Shares',
      'Avg Cost',
      'Current Price',
      'Previous Close',
      'Today Change',
      'Today Change %',
      'Total P&L',
      'Total P&L %',
      'Portfolio %',
      'Current Yield',
      'Monthly Yield',
      'YoC',
      'Investment Value',
      'Market Value',
      'Today Return',
      'Div/Share',
      'Monthly Div Income',
      'Total Div Received',
      'Div Adj Cost',
      'Div Adj Yield',
      'Currency',
      'Source Accounts'
    ];

    // Convert data to CSV rows
    const rows = data.map(holding => [
      holding.ticker || '',
      holding.company || '',
      holding.shares || '0',
      holding.avgCost || '0',
      holding.currentPrice || '0',
      holding.previousClose || '0',
      holding.todayChange || '0',
      holding.todayChangePercent || '0',
      holding.totalPnL || '0',
      holding.totalPnLPercent || '0',
      holding.portfolioPercentage || '0',
      holding.currentYield || '0',
      holding.monthlyYield || '0',
      holding.yoc || '0',
      holding.investmentValue || '0',
      holding.marketValue || '0',
      holding.todayReturn || '0',
      holding.divPerShare || '0',
      holding.monthlyDivIncome || '0',
      holding.totalDivReceived || '0',
      holding.divAdjCost || '0',
      holding.divAdjYield || '0',
      holding.currency || '',
      Array.isArray(holding.sourceAccounts) ? holding.sourceAccounts.join('; ') : ''
    ]);

    // Combine headers and rows
    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(cell => {
        // Escape cells containing commas or quotes
        const cellStr = String(cell);
        if (cellStr.includes(',') || cellStr.includes('"') || cellStr.includes('\n')) {
          return `"${cellStr.replace(/"/g, '""')}"`;
        }
        return cellStr;
      }).join(','))
    ].join('\n');

    // Create blob and download
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);

    // Generate filename with timestamp
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
    const filename = `portfolio-holdings-${timestamp}.csv`;

    link.setAttribute('href', url);
    link.setAttribute('download', filename);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    console.log(`✅ Exported ${data.length} holdings to ${filename}`);
  }

  return (
    <div class="holdings-page">
      <div class="workspace-head">
        <div class="workspace-title">Portfolio Holdings</div>
      </div>

      <MetricsGrid metrics={formattedMetrics()} loading={loading()} />

      <HoldingsTable
        holdings={holdings()}
        exchangeRate={exchangeRate()}
        loading={loading()}
        onExport={handleExport}
      />
    </div>
  );
}
