import { createSignal, Show, For, onMount, onCleanup, createEffect } from 'solid-js';
import { fetchCashBalances } from '../../services/api';
import { isMarketOpen } from '../../utils/marketHours';
import { connectionState } from '../../services/questradeWebSocket';
import './Topbar.css';

const Topbar = (props) => {
  const [isLive, setIsLive] = createSignal(isMarketOpen());
  const [showAccountDropdown, setShowAccountDropdown] = createSignal(false);
  const [showCurrencyDropdown, setShowCurrencyDropdown] = createSignal(false);
  const [accounts, setAccounts] = createSignal([]);
  const [selectedView, setSelectedView] = createSignal('person'); // 'all', 'person', 'account'
  const [selectedAccount, setSelectedAccount] = createSignal(null);

  // Get persons from props
  const persons = () => props.persons && props.persons.length > 0 ? props.persons : ['Vivek'];
  const selectedPerson = () => props.selectedPerson || 'Vivek';
  const selectedCurrency = () => props.selectedCurrency || 'CAD';
  const currencyFilter = () => props.currencyFilter || null;
  const exchangeRate = () => props.exchangeRate || 1.4002;

  // Get currency display text for button
  const getCurrencyDisplayText = () => {
    const filter = currencyFilter();
    if (filter) {
      return `${filter} Only`;
    }
    return `Combined (${selectedCurrency()})`;
  };

  // Currency display options
  const displayCurrencies = [
    { value: 'CAD', label: 'Combined (CAD)', desc: 'All holdings in CAD' },
    { value: 'USD', label: 'Combined (USD)', desc: 'All holdings in USD' }
  ];

  const currencyFilters = [
    { value: 'CAD', label: 'CAD Only', desc: 'Hide USD holdings' },
    { value: 'USD', label: 'USD Only', desc: 'Hide CAD holdings' }
  ];

  // Load accounts on mount
  onMount(async () => {
    try {
      const cashData = await fetchCashBalances(selectedPerson());
      if (cashData && cashData.accounts) {
        setAccounts(cashData.accounts);
      }
    } catch (error) {
      console.error('Error loading accounts:', error);
    }

    // Initial market check
    console.log('[TOPBAR] Initial market check on mount');
    const initialMarketStatus = isMarketOpen();
    console.log('[TOPBAR] Initial market status:', initialMarketStatus);
    setIsLive(initialMarketStatus);

    // Check market hours every minute
    const marketCheckInterval = setInterval(() => {
      console.log('[TOPBAR] Periodic market check');
      const marketStatus = isMarketOpen();
      console.log('[TOPBAR] Updating isLive to:', marketStatus);
      setIsLive(marketStatus);
    }, 60000); // Check every 60 seconds

    onCleanup(() => {
      console.log('[TOPBAR] Cleaning up market check interval');
      clearInterval(marketCheckInterval);
    });
  });

  const handleAccountSelection = (type, value) => {
    setSelectedView(type);
    if (type === 'account') {
      setSelectedAccount(value);
    }
    setShowAccountDropdown(false);
    // Notify parent if needed
    props.onAccountChange?.(type, value);
  };

  const handleCurrencySelection = (mode, currency) => {
    props.onCurrencyChange?.(mode, currency);
    setShowCurrencyDropdown(false);
  };

  const getAccountDisplayName = () => {
    if (selectedView() === 'all') return 'All Accounts';
    if (selectedView() === 'person') return selectedPerson();
    if (selectedView() === 'account' && selectedAccount()) {
      const acc = selectedAccount();
      return `${acc.accountType} - ${acc.accountId.slice(-8)}`;
    }
    return selectedPerson();
  };

  return (
    <div class="topbar">
      {/* Left Section: Title and Path */}
      <div class="topbar-left">
        <div class="topbar-title">portfolio-manager</div>
        <div class="topbar-path">
          <span class="path-separator">/</span>
          <span class="path-user">{selectedPerson().toLowerCase()}</span>
          <span class="path-separator">/</span>
          <span class="path-section">holdings</span>
        </div>
      </div>

      {/* Center Section: Dropdowns */}
      <div class="topbar-center">
        {/* Account Selector Dropdown */}
        <div class="topbar-dropdown" onClick={() => setShowAccountDropdown(!showAccountDropdown())}>
          <span class="dropdown-icon">👤</span>
          <span class="dropdown-text">{getAccountDisplayName()}</span>
          <svg class="dropdown-arrow" xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="6 9 12 15 18 9"></polyline>
          </svg>

          <Show when={showAccountDropdown()}>
            <div class="dropdown-panel account-dropdown">
              {/* ALL ACCOUNTS Section */}
              <div class="dropdown-section">
                <div class="dropdown-section-header">ALL ACCOUNTS</div>
                <div
                  class={`dropdown-option ${selectedView() === 'all' ? 'active' : ''}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    handleAccountSelection('all', null);
                  }}
                >
                  <span class="option-icon">🌐</span>
                  <span class="option-text">All Accounts</span>
                </div>
              </div>

              {/* BY PERSON Section */}
              <div class="dropdown-section">
                <div class="dropdown-section-header">BY PERSON</div>
                <For each={persons()}>
                  {(person) => (
                    <div
                      class={`dropdown-option ${selectedView() === 'person' && selectedPerson() === person ? 'active' : ''}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleAccountSelection('person', person);
                        props.onPersonChange?.(person);
                      }}
                    >
                      <span class="option-icon">👤</span>
                      <span class="option-text">{person}</span>
                    </div>
                  )}
                </For>
              </div>

              {/* INDIVIDUAL ACCOUNTS Section */}
              <Show when={accounts().length > 0}>
                <div class="dropdown-section">
                  <div class="dropdown-section-header">INDIVIDUAL ACCOUNTS</div>
                  <For each={accounts()}>
                    {(account) => (
                      <div
                        class={`dropdown-option ${selectedView() === 'account' && selectedAccount()?.accountId === account.accountId ? 'active' : ''}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleAccountSelection('account', account);
                        }}
                      >
                        <span class="option-icon">🏦</span>
                        <div class="option-content">
                          <span class="option-text">{account.accountType} - {account.accountId}</span>
                          <span class="option-badge">{account.accountType}</span>
                        </div>
                      </div>
                    )}
                  </For>
                </div>
              </Show>
            </div>
          </Show>
        </div>

        {/* Currency Selector Dropdown */}
        <div class="topbar-dropdown" onClick={() => setShowCurrencyDropdown(!showCurrencyDropdown())}>
          <span class="dropdown-icon">💰</span>
          <span class="dropdown-text">{getCurrencyDisplayText()}</span>
          <svg class="dropdown-arrow" xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="6 9 12 15 18 9"></polyline>
          </svg>

          <Show when={showCurrencyDropdown()}>
            <div class="dropdown-panel currency-dropdown">
              {/* DISPLAY CURRENCY Section */}
              <div class="dropdown-section">
                <div class="dropdown-section-header">💰 DISPLAY CURRENCY</div>
                <For each={displayCurrencies}>
                  {(curr) => (
                    <div
                      class={`dropdown-option ${selectedCurrency() === curr.value ? 'active' : ''}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleCurrencySelection('combined', curr.value);
                      }}
                    >
                      <span class="option-icon">{curr.value === 'CAD' ? '🍁' : '💵'}</span>
                      <div class="option-content">
                        <span class="option-text">{curr.label}</span>
                        <span class="option-desc">{curr.desc}</span>
                      </div>
                      <Show when={selectedCurrency() === curr.value}>
                        <span class="option-check">✓</span>
                      </Show>
                    </div>
                  )}
                </For>
              </div>

              {/* FILTER BY CURRENCY Section */}
              <div class="dropdown-section">
                <div class="dropdown-section-header">🔍 FILTER BY CURRENCY</div>
                <For each={currencyFilters}>
                  {(filter) => (
                    <div
                      class={`dropdown-option ${currencyFilter() === filter.value ? 'active' : ''}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleCurrencySelection('filter', filter.value);
                      }}
                    >
                      <span class="option-icon">🔍</span>
                      <div class="option-content">
                        <span class="option-text">{filter.label}</span>
                        <span class="option-desc">{filter.desc}</span>
                      </div>
                      <Show when={currencyFilter() === filter.value}>
                        <span class="option-check">✓</span>
                      </Show>
                    </div>
                  )}
                </For>
              </div>
            </div>
          </Show>
        </div>

        {/* Exchange Rate Display */}
        <div class="topbar-chip rate-chip">
          <span class="chip-text">USD/CAD: {exchangeRate().toFixed(4)}</span>
        </div>
      </div>

      {/* Right Section: Live Indicator and Sync Button */}
      <div class="topbar-right">
        {/* WebSocket Connection Status */}
        <div class="connection-indicator">
          <Show when={connectionState().status === 'connected'}>
            <span class="connection-dot connected"></span>
            <span class="connection-text">ws connected</span>
          </Show>
          <Show when={connectionState().status === 'connecting'}>
            <span class="connection-dot connecting"></span>
            <span class="connection-text">ws connecting</span>
          </Show>
          <Show when={connectionState().status === 'disconnected'}>
            <span class="connection-dot disconnected"></span>
            <span class="connection-text">ws disconnected</span>
          </Show>
          <Show when={connectionState().status === 'error'}>
            <span class="connection-dot error"></span>
            <span class="connection-text">ws error</span>
          </Show>
        </div>

        {/* Market Hours Indicator */}
        <div class="live-indicator">
          <span class={`live-dot ${isLive() ? 'live-pulse' : ''}`}></span>
          <span class="live-text">live</span>
        </div>

        <button class="sync-button" onClick={props.onSync} disabled={props.isSyncing}>
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
            class={props.isSyncing ? 'spinning' : ''}
          >
            <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
            <path d="M3 3v5h5" />
            <path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16" />
            <path d="M16 16h5v5" />
          </svg>
          <span>sync</span>
        </button>
      </div>
    </div>
  );
};

export default Topbar;
