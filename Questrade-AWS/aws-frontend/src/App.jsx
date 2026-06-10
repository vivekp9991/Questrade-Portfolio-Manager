import { createSignal, onMount, Show } from 'solid-js';
import Sidebar from './components/layout/Sidebar';
import Topbar from './components/layout/Topbar';
import Holdings from './pages/Holdings';
import DividendAnalysis from './pages/DividendAnalysis';
import NetWorthReport from './components/NetWorthReport';
import Backtesting from './pages/Backtesting';
import Settings from './pages/Settings';
import Login from './pages/Login';
import { fetchPersons } from './services/api';
import authTokenManager from './services/authToken';
import questradeWebSocket from './services/questradeWebSocket';
import './App.css';

function App() {
  const [isLoggedIn, setIsLoggedIn] = createSignal(false);
  const [activePage, setActivePage] = createSignal('holdings');
  const [isSyncing, setIsSyncing] = createSignal(false);
  const [selectedPerson, setSelectedPerson] = createSignal('all');
  const [selectedCurrency, setSelectedCurrency] = createSignal('CAD');
  const [currencyFilter, setCurrencyFilter] = createSignal(null);
  const [exchangeRate, setExchangeRate] = createSignal({ rate: 1.40, percentChange: 0 });
  const [persons, setPersons] = createSignal([]);
  const [accountFilter, setAccountFilter] = createSignal({ type: 'all', value: null });
  const [stockTypeFilter, setStockTypeFilter] = createSignal('all');

  // Check authentication on mount and set up periodic checks
  onMount(() => {
    checkAuth();

    // Check authentication every minute
    const authCheckInterval = setInterval(() => {
      if (!authTokenManager.isTokenValid()) {
        setIsLoggedIn(false);
      }
    }, 60000); // 1 minute

    // Cleanup interval on unmount
    return () => clearInterval(authCheckInterval);
  });

  const checkAuth = () => {
    const authenticated = authTokenManager.isTokenValid();
    setIsLoggedIn(authenticated);

    if (authenticated) {
      const token = authTokenManager.getToken();
      console.log('✅ User authenticated:', token?.username);
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
      // Import syncPortfolio from api.js
      const { syncPortfolio } = await import('./services/api');

      const currentSelection = selectedPerson();

      // If "all" is selected, sync ALL persons
      if (currentSelection === 'all') {
        const availablePersons = persons();

        if (!availablePersons || availablePersons.length === 0) {
          // Fallback to Vivek if no persons loaded
          console.log('🔄 No persons loaded, syncing Vivek');
          const data = await syncPortfolio('Vivek');

          if (data.success || data) {
            console.log('✅ Sync completed for Vivek');
            alert('Sync completed for Vivek! Refreshing page to load new data...');
            window.location.reload();
          } else {
            throw new Error(data.error || 'Sync failed');
          }
          return;
        }

        // Sync all persons sequentially
        console.log(`🔄 Syncing ${availablePersons.length} person(s): ${availablePersons.join(', ')}`);

        const results = [];
        for (const person of availablePersons) {
          try {
            console.log(`🔄 Syncing ${person}...`);
            const data = await syncPortfolio(person);
            results.push({ person, success: true, data });
            console.log(`✅ ${person} synced successfully`);
          } catch (error) {
            console.error(`❌ Failed to sync ${person}:`, error);
            results.push({ person, success: false, error: error.message });
          }
        }

        // Show summary
        const successCount = results.filter(r => r.success).length;
        const failCount = results.filter(r => !r.success).length;

        alert(`Sync completed!\n✅ Success: ${successCount}\n❌ Failed: ${failCount}\n\nRefreshing page...`);
        window.location.reload();

      } else {
        // Sync single person
        console.log(`🔄 Starting sync for ${currentSelection}...`);
        const data = await syncPortfolio(currentSelection);

        if (data.success || data) {
          console.log('✅ Sync completed successfully');
          alert(`Sync completed for ${currentSelection}! Refreshing page to load new data...`);
          window.location.reload();
        } else {
          throw new Error(data.error || 'Sync failed');
        }
      }
    } catch (error) {
      console.error('❌ Sync error:', error);
      alert('Sync error: ' + error.message);
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

  const handleStockTypeChange = (stockType) => {
    console.log('📊 Stock type filter changed to:', stockType);
    setStockTypeFilter(stockType);
  };

  const handleLogout = () => {
    // Disconnect WebSocket before logout
    console.log('[App] 🔌 Disconnecting WebSocket on logout...');
    questradeWebSocket.disconnect();

    authTokenManager.clearToken();
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
            stockTypeFilter={stockTypeFilter()}
            onStockTypeChange={handleStockTypeChange}
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
                stockTypeFilter={stockTypeFilter}
              />
            )}
            {activePage() === 'dividend-analysis' && (
              <DividendAnalysis
                selectedPerson={selectedPerson()}
                selectedCurrency={selectedCurrency()}
                currencyFilter={currencyFilter}
                accountFilter={accountFilter}
              />
            )}
            {activePage() === 'net-worth' && <NetWorthReport showMessage={(t, type) => console.log(`[${type || 'info'}]`, t)} />}
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
