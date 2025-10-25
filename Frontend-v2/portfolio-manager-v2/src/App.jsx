import { createSignal, onMount, Show } from 'solid-js';
import Sidebar from './components/layout/Sidebar';
import Topbar from './components/layout/Topbar';
import Holdings from './pages/Holdings';
import Analysis from './pages/Analysis';
import Backtesting from './pages/Backtesting';
import Settings from './pages/Settings';
import Login from './pages/Login';
import { fetchPersons } from './services/api';
import { isAuthenticated, logout, getUser } from './utils/auth';
import './App.css';

function App() {
  const [isLoggedIn, setIsLoggedIn] = createSignal(false);
  const [activePage, setActivePage] = createSignal('holdings');
  const [isSyncing, setIsSyncing] = createSignal(false);
  const [selectedPerson, setSelectedPerson] = createSignal('all');
  const [selectedCurrency, setSelectedCurrency] = createSignal('CAD');
  const [currencyFilter, setCurrencyFilter] = createSignal(null);
  const [exchangeRate, setExchangeRate] = createSignal(1.4015);
  const [persons, setPersons] = createSignal([]);
  const [accountFilter, setAccountFilter] = createSignal({ type: 'all', value: null });

  // Check authentication on mount and set up periodic checks
  onMount(() => {
    checkAuth();

    // Check authentication every minute
    const authCheckInterval = setInterval(() => {
      if (!isAuthenticated()) {
        setIsLoggedIn(false);
      }
    }, 60000); // 1 minute

    // Cleanup interval on unmount
    return () => clearInterval(authCheckInterval);
  });

  const checkAuth = () => {
    const authenticated = isAuthenticated();
    setIsLoggedIn(authenticated);

    if (authenticated) {
      const user = getUser();
      console.log('✅ User authenticated:', user?.displayName);
      loadPersons();
    }
  };

  // Fetch persons when logged in
  const loadPersons = async () => {
    try {
      const personsData = await fetchPersons();
      if (personsData && personsData.length > 0) {
        const personNames = personsData.map(p => p.personName || p.displayName);
        setPersons(personNames);
        console.log('✅ Loaded persons:', personNames);
      }
    } catch (error) {
      console.error('❌ Error loading persons:', error);
      // If fetch fails due to auth, logout
      if (error.message?.includes('401')) {
        handleLogout();
      }
    }
  };

  const handleSync = async () => {
    setIsSyncing(true);
    try {
      // Trigger backend sync (routes to Sync API on port 4002)
      const response = await fetch('/api-sync/sync/trigger', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ personName: selectedPerson() })
      });

      const data = await response.json();

      if (data.success) {
        console.log('✅ Sync completed successfully');
        // Reload data on current page
        window.location.reload();
      } else {
        console.error('❌ Sync failed:', data.error);
      }
    } catch (error) {
      console.error('❌ Sync error:', error);
    } finally {
      setIsSyncing(false);
    }
  };

  const handlePersonChange = (person) => {
    console.log('👤 Person changed to:', person);
    setSelectedPerson(person);
  };

  const handleCurrencyChange = (mode, currency) => {
    console.log('💰 Currency mode:', mode, 'currency:', currency);
    if (mode === 'combined') {
      setSelectedCurrency(currency);
      setCurrencyFilter(null); // Reset filter when switching to combined
    } else if (mode === 'filter') {
      setCurrencyFilter(currency); // Set filter (CAD or USD only)
      setSelectedCurrency(currency); // Also set display currency to match the filter
    }
  };

  const handleAccountChange = (type, value) => {
    console.log('🏦 Account changed:', type, value);
    setAccountFilter({ type, value });
    if (type === 'person') {
      setSelectedPerson(value);
    } else if (type === 'all') {
      setSelectedPerson('all');
    }
  };

  const handleLogout = () => {
    logout();
    setIsLoggedIn(false);
    setActivePage('holdings'); // Reset to default page
    console.log('👋 User logged out');
  };

  const handleLoginSuccess = () => {
    checkAuth(); // Re-check authentication and load data
  };

  return (
    <Show
      when={isLoggedIn()}
      fallback={<Login onLoginSuccess={handleLoginSuccess} />}
    >
      <div class="app">
        <Sidebar
          active={activePage()}
          onNavigate={setActivePage}
        />

        <div class="main-content">
          <Topbar
            onSync={handleSync}
            isSyncing={isSyncing()}
            selectedPerson={selectedPerson()}
            selectedCurrency={selectedCurrency()}
            currencyFilter={currencyFilter()}
            exchangeRate={exchangeRate()}
            persons={persons()}
            onPersonChange={handlePersonChange}
            onCurrencyChange={handleCurrencyChange}
            onAccountChange={handleAccountChange}
            onLogout={handleLogout}
          />

          <div class="page-container">
            {activePage() === 'holdings' && (
              <Holdings
                selectedPerson={selectedPerson()}
                selectedCurrency={selectedCurrency()}
                currencyFilter={currencyFilter}
                onExchangeRateUpdate={setExchangeRate}
                accountFilter={accountFilter}
              />
            )}
            {activePage() === 'analysis' && <Analysis />}
            {activePage() === 'backtesting' && <Backtesting />}
            {activePage() === 'settings' && <Settings />}
          </div>
        </div>
      </div>
    </Show>
  );
}

// Placeholder component for future pages
function PlaceholderPage(props) {
  return (
    <div class="placeholder-page">
      <h2>{props.title}</h2>
      <p>This page is coming soon...</p>
    </div>
  );
}

export default App;
