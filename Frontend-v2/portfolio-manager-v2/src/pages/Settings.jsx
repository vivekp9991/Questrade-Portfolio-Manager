import { createSignal, onMount, Show, For, createEffect } from 'solid-js';
import './Settings.css';
import * as settingsApi from '../services/settingsApi';
import DividendManager from '../components/DividendManager';

export default function Settings() {
  const [activeTab, setActiveTab] = createSignal('persons');
  const [loading, setLoading] = createSignal(false);
  const [message, setMessage] = createSignal({ text: '', type: '' });

  // Person Management State
  const [persons, setPersons] = createSignal([]);
  const [newPerson, setNewPerson] = createSignal({ personName: '', refreshToken: '' });

  // Token Management State
  const [selectedPerson, setSelectedPerson] = createSignal('');
  const [tokenInfo, setTokenInfo] = createSignal(null);

  // Data Sync State
  const [syncStatus, setSyncStatus] = createSignal(null);
  const [syncHistory, setSyncHistory] = createSignal([]);
  const [syncSortColumn, setSyncSortColumn] = createSignal('timestamp');
  const [syncSortDirection, setSyncSortDirection] = createSignal('desc'); // Latest first
  const [syncCurrentPage, setSyncCurrentPage] = createSignal(1);
  const [syncItemsPerPage] = createSignal(10);

  // Dividend Manager State - handled by DividendManager component
  const [dividendPerson, setDividendPerson] = createSignal('Vivek');

  // System Health State
  const [healthStatus, setHealthStatus] = createSignal({
    auth: null,
    sync: null,
    portfolio: null
  });
  const [stats, setStats] = createSignal({
    sync: null,
    data: null
  });

  // Error Logs State
  const [errors, setErrors] = createSignal([]);
  const [errorStats, setErrorStats] = createSignal(null);

  // Load initial data
  onMount(() => {
    loadPersons();
    loadSyncStatus();
    loadSyncHistory(); // Load sync history on mount
    loadHealthStatus();
  });

  // Auto-refresh health status every 30 seconds
  createEffect(() => {
    if (activeTab() === 'health') {
      const interval = setInterval(() => {
        loadHealthStatus();
      }, 30000);
      return () => clearInterval(interval);
    }
  });

  // ============================================
  // UTILITY FUNCTIONS
  // ============================================

  const showMessage = (text, type = 'info') => {
    setMessage({ text, type });
    setTimeout(() => setMessage({ text: '', type: '' }), 5000);
  };

  const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    return date.toLocaleString('en-US', {
      year: 'numeric',
      month: 'short',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  };

  const formatDuration = (ms) => {
    if (!ms) return 'N/A';
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
    return `${(ms / 60000).toFixed(1)}m`;
  };

  // ============================================
  // PERSON MANAGEMENT
  // ============================================

  const loadPersons = async () => {
    try {
      setLoading(true);
      const data = await settingsApi.fetchPersons();
      const personsArray = Array.isArray(data) ? data : [];

      // Enrich person data with account count and last sync info
      const enrichedPersons = await Promise.all(
        personsArray.map(async (person) => {
          try {
            // Fetch account summary for this person
            const accountSummary = await settingsApi.fetchAccountSummary(person.personName);

            // Fetch sync history to get last sync time
            const syncHistory = await settingsApi.fetchSyncHistory(50);
            const personSyncs = Array.isArray(syncHistory)
              ? syncHistory.filter(s => s.personName === person.personName)
              : [];

            const lastSync = personSyncs.length > 0
              ? (personSyncs[0].timestamp || personSyncs[0].startTime || personSyncs[0].createdAt)
              : null;

            return {
              ...person,
              accountCount: accountSummary?.accountCount || 0,
              lastSync: lastSync
            };
          } catch (err) {
            console.error(`Failed to enrich data for ${person.personName}:`, err);
            return {
              ...person,
              accountCount: 0,
              lastSync: null
            };
          }
        })
      );

      setPersons(enrichedPersons);
    } catch (error) {
      showMessage(`Failed to load persons: ${error.message}`, 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleAddPerson = async (e) => {
    e.preventDefault();
    try {
      setLoading(true);
      await settingsApi.addPerson(newPerson());
      showMessage('Person added successfully', 'success');
      setNewPerson({ personName: '', refreshToken: '' });
      await loadPersons();
    } catch (error) {
      showMessage(`Failed to add person: ${error.message}`, 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleToggleActive = async (personName, currentStatus) => {
    try {
      await settingsApi.togglePersonActive(personName, !currentStatus);
      showMessage(`Person ${!currentStatus ? 'activated' : 'deactivated'}`, 'success');
      await loadPersons();
    } catch (error) {
      showMessage(`Failed to toggle status: ${error.message}`, 'error');
    }
  };

  const handleDeletePerson = async (personName) => {
    if (!confirm(`Are you sure you want to delete ${personName}?`)) return;
    try {
      await settingsApi.deletePerson(personName);
      showMessage('Person deleted successfully', 'success');
      await loadPersons();
    } catch (error) {
      showMessage(`Failed to delete person: ${error.message}`, 'error');
    }
  };

  // ============================================
  // TOKEN MANAGEMENT
  // ============================================

  const handleLoadToken = async () => {
    if (!selectedPerson()) {
      showMessage('Please select a person', 'error');
      return;
    }
    try {
      setLoading(true);
      const data = await settingsApi.fetchTokenInfo(selectedPerson());

      // Map the nested backend response to flat structure for UI
      const mappedData = {
        accessToken: data.accessToken?.exists ? '***' + (data.accessToken.apiServer ? ' (Valid)' : '') : null,
        expiresAt: data.accessToken?.expiresAt,
        apiServer: data.accessToken?.apiServer,
        lastRefreshed: data.accessToken?.lastUsed,
        refreshToken: data.refreshToken?.exists,
        isHealthy: data.isHealthy
      };

      setTokenInfo(mappedData);
    } catch (error) {
      showMessage(`Failed to load token: ${error.message}`, 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleRefreshToken = async () => {
    if (!selectedPerson()) {
      showMessage('Please select a person', 'error');
      return;
    }
    try {
      setLoading(true);
      await settingsApi.refreshToken(selectedPerson());
      showMessage('Token refreshed successfully', 'success');
      await handleLoadToken();
    } catch (error) {
      showMessage(`Failed to refresh token: ${error.message}`, 'error');
    } finally {
      setLoading(false);
    }
  };

  // ============================================
  // DATA SYNC
  // ============================================

  const loadSyncStatus = async () => {
    try {
      const data = await settingsApi.fetchSyncStatus();
      setSyncStatus(data);
    } catch (error) {
      console.error('Failed to load sync status:', error);
    }
  };

  const loadSyncHistory = async () => {
    try {
      const data = await settingsApi.fetchSyncHistory(100); // Increased limit for pagination
      setSyncHistory(Array.isArray(data) ? data : []);
    } catch (error) {
      showMessage(`Failed to load sync history: ${error.message}`, 'error');
    }
  };

  // Sync History Sorting
  const handleSyncSort = (column) => {
    if (syncSortColumn() === column) {
      setSyncSortDirection(syncSortDirection() === 'asc' ? 'desc' : 'asc');
    } else {
      setSyncSortColumn(column);
      setSyncSortDirection('asc');
    }
    setSyncCurrentPage(1); // Reset to first page when sorting
  };

  const getSyncSortIcon = (column) => {
    if (syncSortColumn() !== column) return '⇅';
    return syncSortDirection() === 'asc' ? '↑' : '↓';
  };

  // Sorted and paginated sync history
  const sortedAndPaginatedSyncHistory = () => {
    let sorted = [...syncHistory()];

    // Sort
    sorted.sort((a, b) => {
      let aVal, bVal;

      switch (syncSortColumn()) {
        case 'timestamp':
          aVal = new Date(a.startedAt || a.createdAt).getTime();
          bVal = new Date(b.startedAt || b.createdAt).getTime();
          break;
        case 'person':
          aVal = a.personName || 'ALL';
          bVal = b.personName || 'ALL';
          break;
        case 'type':
          aVal = (a.syncType || a.type || 'FULL').toUpperCase();
          bVal = (b.syncType || b.type || 'FULL').toUpperCase();
          break;
        case 'status':
          aVal = a.status || 'UNKNOWN';
          bVal = b.status || 'UNKNOWN';
          break;
        case 'duration':
          aVal = a.duration || 0;
          bVal = b.duration || 0;
          break;
        case 'endpoint':
          aVal = a.endpoint || a.dataType || 'N/A';
          bVal = b.endpoint || b.dataType || 'N/A';
          break;
        default:
          return 0;
      }

      if (typeof aVal === 'string') {
        return syncSortDirection() === 'asc'
          ? aVal.localeCompare(bVal)
          : bVal.localeCompare(aVal);
      } else {
        return syncSortDirection() === 'asc' ? aVal - bVal : bVal - aVal;
      }
    });

    // Paginate
    const startIndex = (syncCurrentPage() - 1) * syncItemsPerPage();
    const endIndex = startIndex + syncItemsPerPage();
    return sorted.slice(startIndex, endIndex);
  };

  // Pagination helpers
  const totalSyncPages = () => Math.ceil(syncHistory().length / syncItemsPerPage());

  const handleSyncPageChange = (page) => {
    if (page >= 1 && page <= totalSyncPages()) {
      setSyncCurrentPage(page);
    }
  };

  const handleSyncAll = async () => {
    try {
      setLoading(true);
      showMessage('Starting sync for all persons...', 'info');
      await settingsApi.syncAll();
      showMessage('Sync completed successfully', 'success');
      await loadSyncStatus();
      await loadSyncHistory();
    } catch (error) {
      showMessage(`Sync failed: ${error.message}`, 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleSyncPerson = async (personName) => {
    try {
      setLoading(true);
      showMessage(`Syncing ${personName}...`, 'info');
      await settingsApi.syncPerson(personName);
      showMessage(`${personName} synced successfully`, 'success');
      await loadSyncStatus();
      await loadSyncHistory();
    } catch (error) {
      showMessage(`Sync failed: ${error.message}`, 'error');
    } finally {
      setLoading(false);
    }
  };

  // Granular sync handlers for all persons
  const handleSyncTrigger = async () => {
    try {
      setLoading(true);
      showMessage('Starting full sync with candles for all persons...', 'info');
      await settingsApi.syncTrigger();
      showMessage('Full sync completed successfully', 'success');
      await loadSyncStatus();
      await loadSyncHistory();
    } catch (error) {
      showMessage(`Sync failed: ${error.message}`, 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleSyncCandlesAll = async () => {
    try {
      setLoading(true);
      showMessage('Syncing previous day close for all persons...', 'info');
      await settingsApi.syncCandlesAll();
      showMessage('Previous day close synced successfully', 'success');
      await loadSyncStatus();
      await loadSyncHistory();
    } catch (error) {
      showMessage(`Sync failed: ${error.message}`, 'error');
    } finally {
      setLoading(false);
    }
  };

  // Granular sync handlers for individual person
  const handleSyncPersonAccounts = async (personName) => {
    try {
      setLoading(true);
      showMessage(`Syncing accounts for ${personName}...`, 'info');
      await settingsApi.syncAccounts(personName);
      showMessage(`Accounts synced successfully for ${personName}`, 'success');
      await loadSyncStatus();
      await loadSyncHistory();
    } catch (error) {
      showMessage(`Sync failed: ${error.message}`, 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleSyncPersonPositions = async (personName) => {
    try {
      setLoading(true);
      showMessage(`Syncing positions for ${personName}...`, 'info');
      await settingsApi.syncPositions(personName);
      showMessage(`Positions synced successfully for ${personName}`, 'success');
      await loadSyncStatus();
      await loadSyncHistory();
    } catch (error) {
      showMessage(`Sync failed: ${error.message}`, 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleSyncPersonActivities = async (personName) => {
    try {
      setLoading(true);
      showMessage(`Syncing activities for ${personName}...`, 'info');
      await settingsApi.syncActivities(personName);
      showMessage(`Activities synced successfully for ${personName}`, 'success');
      await loadSyncStatus();
      await loadSyncHistory();
    } catch (error) {
      showMessage(`Sync failed: ${error.message}`, 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleSyncPersonCandles = async (personName) => {
    try {
      setLoading(true);
      showMessage(`Syncing previous day close for ${personName}...`, 'info');
      await settingsApi.syncCandlesPerson(personName);
      showMessage(`Previous day close synced successfully for ${personName}`, 'success');
      await loadSyncStatus();
      await loadSyncHistory();
    } catch (error) {
      showMessage(`Sync failed: ${error.message}`, 'error');
    } finally {
      setLoading(false);
    }
  };

  // Dividend Manager handled by DividendManager component

  // ============================================
  // SYSTEM HEALTH
  // ============================================

  const loadHealthStatus = async () => {
    try {
      const [auth, sync, portfolio, syncStats, dataStats] = await Promise.allSettled([
        settingsApi.checkAuthHealth(),
        settingsApi.checkSyncHealth(),
        settingsApi.checkPortfolioHealth(),
        settingsApi.fetchSyncStats(),
        settingsApi.fetchDataStats()
      ]);

      setHealthStatus({
        auth: auth.status === 'fulfilled' ? auth.value : { error: auth.reason?.message },
        sync: sync.status === 'fulfilled' ? sync.value : { error: sync.reason?.message },
        portfolio: portfolio.status === 'fulfilled' ? portfolio.value : { error: portfolio.reason?.message }
      });

      setStats({
        sync: syncStats.status === 'fulfilled' ? syncStats.value : null,
        data: dataStats.status === 'fulfilled' ? dataStats.value : null
      });
    } catch (error) {
      console.error('Failed to load health status:', error);
    }
  };

  // ============================================
  // ERROR LOGS
  // ============================================

  const loadErrorLogs = async () => {
    try {
      setLoading(true);
      const [errorData, statsData] = await Promise.allSettled([
        settingsApi.fetchRecentErrors(20),
        settingsApi.fetchErrorStats()
      ]);

      setErrors(errorData.status === 'fulfilled' && Array.isArray(errorData.value) ? errorData.value : []);
      setErrorStats(statsData.status === 'fulfilled' ? statsData.value : null);
    } catch (error) {
      showMessage(`Failed to load errors: ${error.message}`, 'error');
    } finally {
      setLoading(false);
    }
  };

  // Load tab-specific data when switching tabs
  createEffect(() => {
    const tab = activeTab();
    if (tab === 'sync') loadSyncHistory();
    if (tab === 'dividends') loadDividendPositions();
    if (tab === 'health') loadHealthStatus();
    if (tab === 'errors') loadErrorLogs();
  });

  return (
    <div class="settings-container">
      <div class="settings-header">
        <h1 class="settings-title">SETTINGS & CONFIGURATION</h1>
        <Show when={message().text}>
          <div class={`settings-message ${message().type}`}>
            {message().text}
          </div>
        </Show>
      </div>

      {/* Tab Navigation */}
      <div class="settings-tabs">
        <button
          class={`settings-tab ${activeTab() === 'persons' ? 'active' : ''}`}
          onClick={() => setActiveTab('persons')}
        >
          PERSON MANAGEMENT
        </button>
        <button
          class={`settings-tab ${activeTab() === 'tokens' ? 'active' : ''}`}
          onClick={() => setActiveTab('tokens')}
        >
          TOKEN MANAGEMENT
        </button>
        <button
          class={`settings-tab ${activeTab() === 'sync' ? 'active' : ''}`}
          onClick={() => setActiveTab('sync')}
        >
          DATA SYNC
        </button>
        <button
          class={`settings-tab ${activeTab() === 'dividends' ? 'active' : ''}`}
          onClick={() => setActiveTab('dividends')}
        >
          DIVIDEND MANAGER
        </button>
        <button
          class={`settings-tab ${activeTab() === 'health' ? 'active' : ''}`}
          onClick={() => setActiveTab('health')}
        >
          SYSTEM HEALTH
        </button>
        <button
          class={`settings-tab ${activeTab() === 'errors' ? 'active' : ''}`}
          onClick={() => setActiveTab('errors')}
        >
          ERROR LOGS
        </button>
      </div>

      {/* Tab Content */}
      <div class="settings-content">
        {/* PERSON MANAGEMENT TAB */}
        <Show when={activeTab() === 'persons'}>
          <div class="settings-section">
            <h2 class="section-title">ADD NEW PERSON</h2>
            <form onSubmit={handleAddPerson} class="settings-form">
              <div class="form-row">
                <input
                  type="text"
                  placeholder="Person Name"
                  value={newPerson().personName}
                  onInput={(e) => setNewPerson({ ...newPerson(), personName: e.target.value })}
                  required
                  class="form-input"
                />
                <input
                  type="text"
                  placeholder="Refresh Token"
                  value={newPerson().refreshToken}
                  onInput={(e) => setNewPerson({ ...newPerson(), refreshToken: e.target.value })}
                  required
                  class="form-input"
                />
                <button type="submit" class="btn btn-primary" disabled={loading()}>
                  ADD PERSON
                </button>
              </div>
            </form>

            <h2 class="section-title">EXISTING PERSONS</h2>
            <div class="settings-table-container">
              <table class="settings-table">
                <thead>
                  <tr>
                    <th>PERSON NAME</th>
                    <th>STATUS</th>
                    <th>LAST SYNC</th>
                    <th>ACCOUNTS</th>
                    <th>ACTIONS</th>
                  </tr>
                </thead>
                <tbody>
                  <For each={persons()}>
                    {(person) => (
                      <tr>
                        <td class="mono-text">{person.personName}</td>
                        <td>
                          <span class={`status-badge ${person.isActive ? 'active' : 'inactive'}`}>
                            {person.isActive ? 'ACTIVE' : 'INACTIVE'}
                          </span>
                        </td>
                        <td class="mono-text">{formatDate(person.lastSync)}</td>
                        <td class="mono-text">{person.accountCount || 0}</td>
                        <td>
                          <button
                            class="btn btn-small btn-secondary"
                            onClick={() => handleToggleActive(person.personName, person.isActive)}
                          >
                            {person.isActive ? 'DEACTIVATE' : 'ACTIVATE'}
                          </button>
                          <button
                            class="btn btn-small btn-danger"
                            onClick={() => handleDeletePerson(person.personName)}
                          >
                            DELETE
                          </button>
                        </td>
                      </tr>
                    )}
                  </For>
                </tbody>
              </table>
            </div>
          </div>
        </Show>

        {/* TOKEN MANAGEMENT TAB */}
        <Show when={activeTab() === 'tokens'}>
          <div class="settings-section">
            <h2 class="section-title">TOKEN MANAGEMENT</h2>
            <div class="form-row">
              <select
                class="form-input"
                value={selectedPerson()}
                onChange={(e) => setSelectedPerson(e.target.value)}
              >
                <option value="">Select Person</option>
                <For each={persons()}>
                  {(person) => <option value={person.personName}>{person.personName}</option>}
                </For>
              </select>
              <button class="btn btn-primary" onClick={handleLoadToken} disabled={loading()}>
                LOAD TOKEN
              </button>
              <button class="btn btn-secondary" onClick={handleRefreshToken} disabled={loading()}>
                REFRESH TOKEN
              </button>
            </div>

            <Show when={tokenInfo()}>
              <div class="token-info">
                <div class="info-row">
                  <span class="info-label">Access Token:</span>
                  <span class="info-value mono-text">{tokenInfo().accessToken || 'N/A'}</span>
                </div>
                <div class="info-row">
                  <span class="info-label">Expires At:</span>
                  <span class="info-value mono-text">{formatDate(tokenInfo().expiresAt)}</span>
                </div>
                <div class="info-row">
                  <span class="info-label">API Server:</span>
                  <span class="info-value mono-text">{tokenInfo().apiServer || 'N/A'}</span>
                </div>
                <div class="info-row">
                  <span class="info-label">Last Refreshed:</span>
                  <span class="info-value mono-text">{formatDate(tokenInfo().lastRefreshed)}</span>
                </div>
              </div>
            </Show>
          </div>
        </Show>

        {/* DATA SYNC TAB */}
        <Show when={activeTab() === 'sync'}>
          <div class="settings-section">
            <h2 class="section-title">SYNC ALL PERSONS</h2>
            <div class="sync-controls-grid">
              <button
                class="btn btn-primary"
                onClick={handleSyncTrigger}
                disabled={loading()}
                title="Full sync including accounts, positions, activities, and previous day close prices"
              >
                FULL SYNC (ALL DATA + CANDLES)
              </button>
              <button
                class="btn btn-secondary"
                onClick={handleSyncAll}
                disabled={loading()}
                title="Sync accounts, positions, and activities only"
              >
                SYNC ALL DATA
              </button>
              <button
                class="btn btn-secondary"
                onClick={handleSyncCandlesAll}
                disabled={loading()}
                title="Sync previous day close prices for all persons"
              >
                PREV DAY CLOSE
              </button>
            </div>
            <Show when={syncStatus()}>
              <div class="sync-status">
                <span>Last Sync: {formatDate(syncStatus().lastSync)}</span>
                <span>Status: {syncStatus().status || 'IDLE'}</span>
              </div>
            </Show>

            <h2 class="section-title">SYNC BY PERSON</h2>
            <div class="person-sync-grid">
              <For each={persons()}>
                {(person) => (
                  <div class="person-sync-card">
                    <div class="card-header">
                      <span class="card-title">{person.personName}</span>
                      <span class={`status-badge ${person.isActive ? 'active' : 'inactive'}`}>
                        {person.isActive ? 'ACTIVE' : 'INACTIVE'}
                      </span>
                    </div>
                    <div class="card-info">
                      <div class="info-item">
                        <span class="info-item-label">Last Sync:</span>
                        <span class="info-item-value">{formatDate(person.lastSync)}</span>
                      </div>
                      <div class="info-item">
                        <span class="info-item-label">Accounts:</span>
                        <span class="info-item-value">{person.accountCount || 0}</span>
                      </div>
                    </div>
                    <div class="card-actions">
                      <button
                        class="btn btn-primary btn-full"
                        onClick={() => handleSyncPerson(person.personName)}
                        disabled={loading() || !person.isActive}
                        title="Sync all data for this person"
                      >
                        SYNC ALL
                      </button>
                      <div class="btn-group">
                        <button
                          class="btn btn-small btn-secondary"
                          onClick={() => handleSyncPersonAccounts(person.personName)}
                          disabled={loading() || !person.isActive}
                          title="Sync accounts only"
                        >
                          ACCOUNTS
                        </button>
                        <button
                          class="btn btn-small btn-secondary"
                          onClick={() => handleSyncPersonPositions(person.personName)}
                          disabled={loading() || !person.isActive}
                          title="Sync positions only"
                        >
                          POSITIONS
                        </button>
                      </div>
                      <div class="btn-group">
                        <button
                          class="btn btn-small btn-secondary"
                          onClick={() => handleSyncPersonActivities(person.personName)}
                          disabled={loading() || !person.isActive}
                          title="Sync activities only"
                        >
                          ACTIVITIES
                        </button>
                        <button
                          class="btn btn-small btn-secondary"
                          onClick={() => handleSyncPersonCandles(person.personName)}
                          disabled={loading() || !person.isActive}
                          title="Sync previous day close prices"
                        >
                          PREV CLOSE
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </For>
            </div>

            <h2 class="section-title">SYNC HISTORY</h2>
            <div class="settings-table-container">
              <table class="settings-table">
                <thead>
                  <tr>
                    <th class="sortable" onClick={() => handleSyncSort('timestamp')}>
                      TIMESTAMP <span class="sort-icon">{getSyncSortIcon('timestamp')}</span>
                    </th>
                    <th class="sortable" onClick={() => handleSyncSort('person')}>
                      PERSON <span class="sort-icon">{getSyncSortIcon('person')}</span>
                    </th>
                    <th class="sortable" onClick={() => handleSyncSort('type')}>
                      TYPE <span class="sort-icon">{getSyncSortIcon('type')}</span>
                    </th>
                    <th class="sortable" onClick={() => handleSyncSort('endpoint')}>
                      ENDPOINT/DATA <span class="sort-icon">{getSyncSortIcon('endpoint')}</span>
                    </th>
                    <th class="sortable" onClick={() => handleSyncSort('status')}>
                      STATUS <span class="sort-icon">{getSyncSortIcon('status')}</span>
                    </th>
                    <th class="sortable" onClick={() => handleSyncSort('duration')}>
                      DURATION <span class="sort-icon">{getSyncSortIcon('duration')}</span>
                    </th>
                    <th>MESSAGE</th>
                  </tr>
                </thead>
                <tbody>
                  <For each={sortedAndPaginatedSyncHistory()}>
                    {(sync) => (
                      <tr>
                        <td class="mono-text">{formatDate(sync.startedAt || sync.createdAt)}</td>
                        <td class="mono-text">{sync.personName || 'ALL'}</td>
                        <td class="mono-text">{(sync.syncType || sync.type || 'FULL').toUpperCase()}</td>
                        <td class="mono-text">{sync.endpoint || sync.dataType || 'N/A'}</td>
                        <td>
                          <span class={`status-badge ${sync.status === 'completed' ? 'success' : 'error'}`}>
                            {sync.status ? sync.status.toUpperCase() : 'UNKNOWN'}
                          </span>
                        </td>
                        <td class="mono-text">{formatDuration(sync.duration)}</td>
                        <td class="mono-text">
                          {sync.errors?.length > 0
                            ? sync.errors[sync.errors.length - 1].message
                            : (sync.message || '-')}
                        </td>
                      </tr>
                    )}
                  </For>
                </tbody>
              </table>

              {/* Pagination Controls */}
              <div class="pagination-controls" style="margin-top: 16px; display: flex; justify-content: space-between; align-items: center;">
                <div class="pagination-info">
                  Showing {syncHistory().length > 0 ? ((syncCurrentPage() - 1) * syncItemsPerPage() + 1) : 0} - {Math.min(syncCurrentPage() * syncItemsPerPage(), syncHistory().length)} of {syncHistory().length} records
                </div>
                <div class="pagination-buttons" style="display: flex; gap: 8px;">
                  <button
                    class="btn btn-secondary"
                    onClick={() => handleSyncPageChange(1)}
                    disabled={syncCurrentPage() === 1}
                  >
                    First
                  </button>
                  <button
                    class="btn btn-secondary"
                    onClick={() => handleSyncPageChange(syncCurrentPage() - 1)}
                    disabled={syncCurrentPage() === 1}
                  >
                    Previous
                  </button>
                  <span style="padding: 8px 16px; background: #1e1e1e; border-radius: 4px;">
                    Page {syncCurrentPage()} of {totalSyncPages()}
                  </span>
                  <button
                    class="btn btn-secondary"
                    onClick={() => handleSyncPageChange(syncCurrentPage() + 1)}
                    disabled={syncCurrentPage() === totalSyncPages()}
                  >
                    Next
                  </button>
                  <button
                    class="btn btn-secondary"
                    onClick={() => handleSyncPageChange(totalSyncPages())}
                    disabled={syncCurrentPage() === totalSyncPages()}
                  >
                    Last
                  </button>
                </div>
              </div>
            </div>
          </div>
        </Show>

        {/* DIVIDEND MANAGER TAB */}
        <Show when={activeTab() === 'dividends'}>
          <div class="settings-section">
            <h2 class="section-title">DIVIDEND YIELD MANAGER</h2>
            <div class="form-row" style="margin-bottom: 16px;">
              <select
                class="form-input"
                value={dividendPerson()}
                onChange={(e) => setDividendPerson(e.target.value)}
              >
                <For each={persons()}>
                  {(person) => <option value={person.personName}>{person.personName}</option>}
                </For>
              </select>
            </div>
            <DividendManager
              selectedPerson={dividendPerson()}
              showMessage={showMessage}
            />
          </div>
        </Show>

        {/* SYSTEM HEALTH TAB */}
        <Show when={activeTab() === 'health'}>
          <div class="settings-section">
            <h2 class="section-title">API SERVICES STATUS</h2>
            <div class="health-grid">
              <div class="health-card">
                <div class="health-header">
                  <span class="health-title">Auth API</span>
                  <span class={`status-indicator ${healthStatus().auth?.success ? 'online' : 'offline'}`}>
                    {healthStatus().auth?.success ? '● ONLINE' : '● OFFLINE'}
                  </span>
                </div>
                <Show when={healthStatus().auth}>
                  <div class="health-details">
                    <div>Service: {healthStatus().auth.service || 'N/A'}</div>
                    <div>Port: {healthStatus().auth.port || 'N/A'}</div>
                    <div>Database: {healthStatus().auth.database?.connected ? 'Connected' : 'Disconnected'}</div>
                  </div>
                </Show>
              </div>

              <div class="health-card">
                <div class="health-header">
                  <span class="health-title">Sync API</span>
                  <span class={`status-indicator ${healthStatus().sync?.success ? 'online' : 'offline'}`}>
                    {healthStatus().sync?.success ? '● ONLINE' : '● OFFLINE'}
                  </span>
                </div>
                <Show when={healthStatus().sync}>
                  <div class="health-details">
                    <div>Service: {healthStatus().sync.service || 'N/A'}</div>
                    <div>Port: {healthStatus().sync.port || 'N/A'}</div>
                    <div>Auto Sync: {healthStatus().sync.syncEnabled ? 'Enabled' : 'Disabled'}</div>
                  </div>
                </Show>
              </div>

              <div class="health-card">
                <div class="health-header">
                  <span class="health-title">Portfolio API</span>
                  <span class={`status-indicator ${healthStatus().portfolio?.success ? 'online' : 'offline'}`}>
                    {healthStatus().portfolio?.success ? '● ONLINE' : '● OFFLINE'}
                  </span>
                </div>
                <Show when={healthStatus().portfolio}>
                  <div class="health-details">
                    <div>Service: {healthStatus().portfolio.service || 'N/A'}</div>
                    <div>Port: {healthStatus().portfolio.port || 'N/A'}</div>
                    <div>Database: {healthStatus().portfolio.database?.connected ? 'Connected' : 'Disconnected'}</div>
                  </div>
                </Show>
              </div>
            </div>

            <h2 class="section-title">STATISTICS</h2>
            <div class="stats-grid">
              <Show when={stats().data}>
                <div class="stat-card">
                  <div class="stat-label">Total Positions</div>
                  <div class="stat-value">{stats().data.totalPositions || 0}</div>
                </div>
                <div class="stat-card">
                  <div class="stat-label">Total Accounts</div>
                  <div class="stat-value">{stats().data.totalAccounts || 0}</div>
                </div>
                <div class="stat-card">
                  <div class="stat-label">Total Activities</div>
                  <div class="stat-value">{stats().data.totalActivities || 0}</div>
                </div>
              </Show>
              <Show when={stats().sync}>
                <div class="stat-card">
                  <div class="stat-label">Total Syncs</div>
                  <div class="stat-value">{stats().sync.totalSyncs || 0}</div>
                </div>
                <div class="stat-card">
                  <div class="stat-label">Successful Syncs</div>
                  <div class="stat-value">{stats().sync.successfulSyncs || 0}</div>
                </div>
                <div class="stat-card">
                  <div class="stat-label">Failed Syncs</div>
                  <div class="stat-value">{stats().sync.failedSyncs || 0}</div>
                </div>
              </Show>
            </div>
          </div>
        </Show>

        {/* ERROR LOGS TAB */}
        <Show when={activeTab() === 'errors'}>
          <div class="settings-section">
            <h2 class="section-title">ERROR STATISTICS</h2>
            <Show when={errorStats()}>
              <div class="stats-grid">
                <div class="stat-card error">
                  <div class="stat-label">Total Errors (24h)</div>
                  <div class="stat-value">{errorStats().last24Hours || 0}</div>
                </div>
                <div class="stat-card error">
                  <div class="stat-label">Total Errors (7d)</div>
                  <div class="stat-value">{errorStats().last7Days || 0}</div>
                </div>
                <div class="stat-card error">
                  <div class="stat-label">Most Recent</div>
                  <div class="stat-value">{formatDate(errorStats().mostRecent)}</div>
                </div>
              </div>
            </Show>

            <h2 class="section-title">RECENT ERRORS</h2>
            <div class="settings-table-container">
              <table class="settings-table">
                <thead>
                  <tr>
                    <th>TIMESTAMP</th>
                    <th>PERSON</th>
                    <th>TYPE</th>
                    <th>ERROR MESSAGE</th>
                    <th>DURATION</th>
                  </tr>
                </thead>
                <tbody>
                  <For each={errors()}>
                    {(error) => (
                      <tr class="error-row">
                        <td class="mono-text">{formatDate(error.timestamp)}</td>
                        <td class="mono-text">{error.personName || 'N/A'}</td>
                        <td class="mono-text">{error.type || 'SYNC'}</td>
                        <td class="mono-text error-text">{error.error || error.message || 'Unknown error'}</td>
                        <td class="mono-text">{formatDuration(error.duration)}</td>
                      </tr>
                    )}
                  </For>
                </tbody>
              </table>
            </div>
          </div>
        </Show>
      </div>
    </div>
  );
}
