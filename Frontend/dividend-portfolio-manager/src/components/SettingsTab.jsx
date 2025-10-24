// src/components/SettingsTab.jsx - FIXED: Handle missing API endpoints gracefully
import { createSignal, createEffect, onMount, For, Show } from 'solid-js';
import {
    fetchPersons,
    createPerson,
    updatePerson,
    deletePerson,
    setupPersonToken,
    refreshPersonToken,
    getTokenStatus,
    testConnection,
    deleteToken,
    fetchSettingsDashboard,
    validateToken,
    getErrorLogs,
    clearErrors,
    syncPerson,
    syncAllPersons,
    getSyncStatus
} from '../api';
import DividendYieldManager from './DividendYieldManager';

function SettingsTab() {
    const [activeSubTab, setActiveSubTab] = createSignal('personManagement');
    const [persons, setPersons] = createSignal([]);
    const [tokenStatuses, setTokenStatuses] = createSignal({});
    const [syncStatuses, setSyncStatuses] = createSignal({});
    const [errorLogs, setErrorLogs] = createSignal([]);
    const [dashboardData, setDashboardData] = createSignal({});
    const [isLoading, setIsLoading] = createSignal(false);
    const [apiStatus, setApiStatus] = createSignal({
        persons: false,
        tokens: false,
        sync: false,
        dashboard: false,
        errorLogs: false
    });
    
    // Form states
    const [newPersonForm, setNewPersonForm] = createSignal({
        personName: '',
        refreshToken: '',
        showToken: false
    });
    const [editingPerson, setEditingPerson] = createSignal(null);
    const [notifications, setNotifications] = createSignal([]);

    const subTabs = [
        { id: 'personManagement', icon: '👥', label: 'Person Management' },
        { id: 'tokenManagement', icon: '🔑', label: 'Token Management' },
        { id: 'dataSync', icon: '🔄', label: 'Data Synchronization' },
        { id: 'yocExclusion', icon: '💰', label: 'Dividend & Yield Manager' },
        { id: 'systemHealth', icon: '❤️', label: 'System Health' },
        { id: 'errorLogs', icon: '📋', label: 'Error Logs' }
    ];

    // FIXED: Enhanced API call wrapper with better error handling
    const safeApiCall = async (apiFunction, fallbackValue = null, endpointName = 'unknown') => {
        try {
            const result = await apiFunction();
            setApiStatus(prev => ({ ...prev, [endpointName]: true }));
            return result;
        } catch (error) {
            console.warn(`API endpoint ${endpointName} not available:`, error.message);
            setApiStatus(prev => ({ ...prev, [endpointName]: false }));
            return fallbackValue;
        }
    };

    // FIXED: Load data with graceful error handling
    const loadAllData = async () => {
        console.log('Loading settings data...');
        setIsLoading(true);
        
        try {
            // Try to load each endpoint individually with fallbacks
            const [personsData, tokenData, syncData, dashData, errorData] = await Promise.all([
                safeApiCall(() => fetchPersons(), [], 'persons'),
                safeApiCall(() => getTokenStatus(), {}, 'tokens'),
                safeApiCall(() => getSyncStatus(), {}, 'sync'),
                safeApiCall(() => fetchSettingsDashboard(), {
                    persons: [],
                    systemStats: {
                        totalPersons: 0,
                        totalAccounts: 0,
                        totalPositions: 0,
                        totalActivities: 0,
                        activeTokens: 0
                    },
                    recentErrors: []
                }, 'dashboard'),
                safeApiCall(() => getErrorLogs({ days: 7 }), { tokenErrors: [], syncErrors: [] }, 'errorLogs')
            ]);

            setPersons(Array.isArray(personsData) ? personsData : []);
            setTokenStatuses(tokenData || {});
            setSyncStatuses(syncData || {});
            setDashboardData(dashData || {});
            setErrorLogs(errorData || { tokenErrors: [], syncErrors: [] });
            
            console.log('Settings data loaded successfully');
            
            // Check API status and show warnings if needed
            const status = apiStatus();
            const failedEndpoints = Object.entries(status).filter(([key, value]) => !value).map(([key]) => key);
            
            if (failedEndpoints.length > 0) {
                showNotification(`Some API endpoints are not available: ${failedEndpoints.join(', ')}. Features may be limited.`, 'warning');
            }
            
        } catch (error) {
            console.error('Failed to load settings data:', error);
            showNotification('Failed to load settings data. Using demo mode.', 'error');
            
            // Set default demo data
            setPersons([]);
            setTokenStatuses({});
            setSyncStatuses({});
            setDashboardData({
                persons: [],
                systemStats: {
                    totalPersons: 0,
                    totalAccounts: 0,
                    totalPositions: 0,
                    totalActivities: 0,
                    activeTokens: 0
                },
                recentErrors: []
            });
            setErrorLogs({ tokenErrors: [], syncErrors: [] });
        } finally {
            setIsLoading(false);
        }
    };

    const showNotification = (message, type = 'info') => {
        const id = Date.now();
        const notification = {
            id,
            message,
            type,
            timestamp: new Date().toLocaleTimeString()
        };

        setNotifications(prev => [...prev, notification]);

        // Auto-hide after 10 seconds
        setTimeout(() => {
            setNotifications(prev => prev.filter(n => n.id !== id));
        }, 10000);
    };

    // FIXED: Enhanced person creation with better error handling
    const handleCreatePerson = async () => {
        const form = newPersonForm();
        if (!form.personName || !form.refreshToken) {
            showNotification('Please fill in all fields', 'error');
            return;
        }

        try {
            setIsLoading(true);
            
            // Check if API is available
            if (!apiStatus().persons) {
                showNotification('Person management API is not available. Cannot create person.', 'error');
                return;
            }
            
            await createPerson({
                personName: form.personName,
                refreshToken: form.refreshToken
            });
            
            setNewPersonForm({
                personName: '',
                refreshToken: '',
                showToken: false
            });
            
            await loadAllData();
            showNotification('Person created successfully', 'success');
        } catch (error) {
            console.error('Failed to create person:', error);
            showNotification(error.message || 'Failed to create person', 'error');
        } finally {
            setIsLoading(false);
        }
    };

    const handleDeletePerson = async (personName) => {
        if (!confirm(`Are you sure you want to delete ${personName} and all associated data?`)) {
            return;
        }

        try {
            setIsLoading(true);
            
            if (!apiStatus().persons) {
                showNotification('Person management API is not available. Cannot delete person.', 'error');
                return;
            }
            
            await deletePerson(personName);
            await loadAllData();
            showNotification('Person deleted successfully', 'success');
        } catch (error) {
            console.error('Failed to delete person:', error);
            showNotification(error.message || 'Failed to delete person', 'error');
        } finally {
            setIsLoading(false);
        }
    };

    const handleRefreshToken = async (personName) => {
        try {
            setIsLoading(true);
            
            if (!apiStatus().tokens) {
                showNotification('Token management API is not available. Cannot refresh token.', 'error');
                return;
            }
            
            await refreshPersonToken(personName);
            await loadAllData();
            showNotification('Token refreshed successfully', 'success');
        } catch (error) {
            console.error('Failed to refresh token:', error);
            showNotification(error.message || 'Failed to refresh token', 'error');
        } finally {
            setIsLoading(false);
        }
    };

    const handleTestConnection = async (personName) => {
        try {
            setIsLoading(true);
            
            if (!apiStatus().tokens) {
                showNotification('Token management API is not available. Cannot test connection.', 'error');
                return;
            }
            
            const result = await testConnection(personName);
            showNotification(`Connection test successful for ${personName}`, 'success');
        } catch (error) {
            console.error('Connection test failed:', error);
            showNotification(error.message || 'Connection test failed', 'error');
        } finally {
            setIsLoading(false);
        }
    };

    const handleSyncPerson = async (personName, fullSync = false) => {
        try {
            setIsLoading(true);
            
            if (!apiStatus().sync) {
                showNotification('Sync API is not available. Cannot sync person.', 'error');
                return;
            }
            
            await syncPerson(personName, fullSync);
            await loadAllData();
            showNotification(`Sync completed for ${personName}`, 'success');
        } catch (error) {
            console.error('Sync failed:', error);
            showNotification(error.message || 'Sync failed', 'error');
        } finally {
            setIsLoading(false);
        }
    };

    const handleSyncAll = async (fullSync = false) => {
        try {
            setIsLoading(true);
            
            if (!apiStatus().sync) {
                showNotification('Sync API is not available. Cannot sync all persons.', 'error');
                return;
            }
            
            await syncAllPersons(fullSync);
            await loadAllData();
            showNotification('Sync completed for all persons', 'success');
        } catch (error) {
            console.error('Sync all failed:', error);
            showNotification(error.message || 'Sync all failed', 'error');
        } finally {
            setIsLoading(false);
        }
    };

    const handleClearErrors = async (personName) => {
        try {
            if (!apiStatus().errorLogs) {
                showNotification('Error logs API is not available. Cannot clear errors.', 'error');
                return;
            }
            
            await clearErrors(personName);
            await loadAllData();
            showNotification(`Errors cleared for ${personName}`, 'success');
        } catch (error) {
            console.error('Failed to clear errors:', error);
            showNotification(error.message || 'Failed to clear errors', 'error');
        }
    };

    const getTokenStatusColor = (status) => {
        if (!status) return '#6b7280';
        if (status.valid && !status.expiringSoon) return '#10b981';
        if (status.valid && status.expiringSoon) return '#f59e0b';
        return '#ef4444';
    };

    const getTokenStatusText = (status) => {
        if (!status) return 'Unknown';
        if (!status.valid) return 'Invalid';
        if (status.expiringSoon) return 'Expiring Soon';
        return 'Valid';
    };

    // Load data on mount
    onMount(() => {
        loadAllData();
        
        // Set up periodic refresh every 2 minutes (increased from 30 seconds to reduce API load)
        const interval = setInterval(loadAllData, 120000);
        return () => clearInterval(interval);
    });

    return (
        <div id="settings-tab">
            <div class="content-header">
                <h2 class="content-title">Settings & Configuration</h2>
                <div class="header-controls">
                    <button class="btn" onClick={loadAllData} disabled={isLoading()}>
                        🔄 Refresh
                    </button>
                    
                    {/* FIXED: API Status Indicator */}
                    <div class="api-status-indicator">
                        <span class="status-label">API Status:</span>
                        <div class="status-dots">
                            <div 
                                class={`status-dot ${apiStatus().persons ? 'connected' : 'disconnected'}`} 
                                title={`Persons API: ${apiStatus().persons ? 'Connected' : 'Disconnected'}`}
                            ></div>
                            <div 
                                class={`status-dot ${apiStatus().tokens ? 'connected' : 'disconnected'}`} 
                                title={`Tokens API: ${apiStatus().tokens ? 'Connected' : 'Disconnected'}`}
                            ></div>
                            <div 
                                class={`status-dot ${apiStatus().sync ? 'connected' : 'disconnected'}`} 
                                title={`Sync API: ${apiStatus().sync ? 'Connected' : 'Disconnected'}`}
                            ></div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Notifications */}
            <Show when={notifications().length > 0}>
                <div class="notifications">
                    <For each={notifications()}>
                        {notification => (
                            <div class={`notification notification-${notification.type}`}>
                                {notification.message}
                                <button 
                                    class="notification-close"
                                    onClick={() => setNotifications(prev => prev.filter(n => n.id !== notification.id))}
                                >
                                    ✕
                                </button>
                            </div>
                        )}
                    </For>
                </div>
            </Show>

            <div class="settings-section">
                <div class="sub-tabs">
                    <For each={subTabs}>
                        {tab => (
                            <div
                                class={`sub-tab ${activeSubTab() === tab.id ? 'active' : ''}`}
                                onClick={() => setActiveSubTab(tab.id)}
                            >
                                {tab.icon} {tab.label}
                            </div>
                        )}
                    </For>
                </div>

                {/* Person Management Tab */}
                <div class={`sub-tab-content ${activeSubTab() === 'personManagement' ? '' : 'hidden'}`}>
                    {/* FIXED: Show warning if API is not available */}
                    <Show when={!apiStatus().persons}>
                        <div class="api-warning">
                            <div class="warning-icon">⚠️</div>
                            <div class="warning-text">
                                Person Management API is not available. This feature requires backend implementation.
                                <br />
                                <small>Expected endpoint: <code>/api/persons</code></small>
                            </div>
                        </div>
                    </Show>
                    
                    <div class="settings-card">
                        <div class="settings-header">👥 Add New Person</div>
                        <div class="person-form">
                            <div class="form-row">
                                <div class="form-group">
                                    <label>Person Name</label>
                                    <input
                                        type="text"
                                        value={newPersonForm().personName}
                                        onInput={e => setNewPersonForm(prev => ({ ...prev, personName: e.target.value }))}
                                        placeholder="Enter person name"
                                        disabled={!apiStatus().persons}
                                    />
                                </div>
                                <div class="form-group">
                                    <label>Questrade Refresh Token</label>
                                    <div class="token-input-group">
                                        <input
                                            type={newPersonForm().showToken ? 'text' : 'password'}
                                            value={newPersonForm().refreshToken}
                                            onInput={e => setNewPersonForm(prev => ({ ...prev, refreshToken: e.target.value }))}
                                            placeholder="Enter refresh token"
                                            disabled={!apiStatus().persons}
                                        />
                                        <button
                                            type="button"
                                            class="token-toggle"
                                            onClick={() => setNewPersonForm(prev => ({ ...prev, showToken: !prev.showToken }))}
                                        >
                                            {newPersonForm().showToken ? '👁️' : '👁️‍🗨️'}
                                        </button>
                                    </div>
                                </div>
                                <div class="form-group">
                                    <button
                                        class="btn btn-primary"
                                        onClick={handleCreatePerson}
                                        disabled={isLoading() || !apiStatus().persons}
                                    >
                                        Add Person
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div class="settings-card">
                        <div class="settings-header">👥 Existing Persons</div>
                        <div class="persons-list">
                            <Show when={persons().length === 0}>
                                <div class="empty-state">
                                    {apiStatus().persons ? 'No persons configured' : 'Person Management API not available'}
                                </div>
                            </Show>
                            
                            <For each={persons()}>
                                {person => (
                                    <div class="person-card">
                                        <div class="person-info">
                                            <div class="person-name">{person.personName}</div>
                                            <div class="person-details">
                                                <span class="account-count">{person.accountCount || 0} accounts</span>
                                                <span 
                                                    class="token-status"
                                                    style={{ color: getTokenStatusColor(tokenStatuses()[person.personName]) }}
                                                >
                                                    {getTokenStatusText(tokenStatuses()[person.personName])}
                                                </span>
                                            </div>
                                        </div>
                                        <div class="person-actions">
                                            <button
                                                class="btn btn-small"
                                                onClick={() => handleTestConnection(person.personName)}
                                                disabled={isLoading() || !apiStatus().tokens}
                                            >
                                                Test
                                            </button>
                                            <button
                                                class="btn btn-small"
                                                onClick={() => handleSyncPerson(person.personName)}
                                                disabled={isLoading() || !apiStatus().sync}
                                            >
                                                Sync
                                            </button>
                                            <button
                                                class="btn btn-small btn-danger"
                                                onClick={() => handleDeletePerson(person.personName)}
                                                disabled={isLoading() || !apiStatus().persons}
                                            >
                                                Delete
                                            </button>
                                        </div>
                                    </div>
                                )}
                            </For>
                        </div>
                    </div>
                </div>

                {/* Token Management Tab */}
                <div class={`sub-tab-content ${activeSubTab() === 'tokenManagement' ? '' : 'hidden'}`}>
                    <Show when={!apiStatus().tokens}>
                        <div class="api-warning">
                            <div class="warning-icon">⚠️</div>
                            <div class="warning-text">
                                Token Management API is not available. This feature requires backend implementation.
                                <br />
                                <small>Expected endpoints: <code>/api/auth/token-status</code>, <code>/api/auth/refresh-token</code></small>
                            </div>
                        </div>
                    </Show>
                    
                    <div class="settings-card">
                        <div class="settings-header">🔑 Token Status Dashboard</div>
                        <div class="token-dashboard">
                            <Show when={persons().length === 0}>
                                <div class="empty-state">
                                    {apiStatus().tokens ? 'No persons with tokens found' : 'Token Management API not available'}
                                </div>
                            </Show>
                            
                            <For each={persons()}>
                                {person => {
                                    const status = tokenStatuses()[person.personName];
                                    return (
                                        <div class="token-card">
                                            <div class="token-person">{person.personName}</div>
                                            <div class="token-details">
                                                <div class="token-status-indicator">
                                                    <div 
                                                        class="status-dot"
                                                        style={{ background: getTokenStatusColor(status) }}
                                                    ></div>
                                                    <span>{getTokenStatusText(status)}</span>
                                                </div>
                                                <Show when={status?.expiresAt}>
                                                    <div class="token-expiry">
                                                        Expires: {new Date(status.expiresAt).toLocaleString()}
                                                    </div>
                                                </Show>
                                                <Show when={status?.lastUsed}>
                                                    <div class="token-last-used">
                                                        Last used: {new Date(status.lastUsed).toLocaleString()}
                                                    </div>
                                                </Show>
                                            </div>
                                            <div class="token-actions">
                                                <button
                                                    class="btn btn-small"
                                                    onClick={() => handleRefreshToken(person.personName)}
                                                    disabled={isLoading() || !apiStatus().tokens}
                                                >
                                                    🔄 Refresh
                                                </button>
                                                <button
                                                    class="btn btn-small"
                                                    onClick={() => handleTestConnection(person.personName)}
                                                    disabled={isLoading() || !apiStatus().tokens}
                                                >
                                                    🔍 Test
                                                </button>
                                            </div>
                                        </div>
                                    );
                                }}
                            </For>
                        </div>
                    </div>
                </div>

                {/* Data Synchronization Tab */}
                <div class={`sub-tab-content ${activeSubTab() === 'dataSync' ? '' : 'hidden'}`}>
                    <Show when={!apiStatus().sync}>
                        <div class="api-warning">
                            <div class="warning-icon">⚠️</div>
                            <div class="warning-text">
                                Data Synchronization API is not available. This feature requires backend implementation.
                                <br />
                                <small>Expected endpoints: <code>/api/sync/person</code>, <code>/api/sync/all-persons</code></small>
                            </div>
                        </div>
                    </Show>
                    
                    <div class="settings-card">
                        <div class="settings-header">🔄 Data Synchronization</div>
                        
                        <div class="sync-controls">
                            <div class="sync-global">
                                <h4>Global Sync</h4>
                                <div class="sync-buttons">
                                    <button
                                        class="btn btn-primary"
                                        onClick={() => handleSyncAll(false)}
                                        disabled={isLoading() || !apiStatus().sync}
                                    >
                                        🔄 Sync All (Incremental)
                                    </button>
                                    <button
                                        class="btn btn-warning"
                                        onClick={() => handleSyncAll(true)}
                                        disabled={isLoading() || !apiStatus().sync}
                                    >
                                        🔄 Full Sync All
                                    </button>
                                </div>
                            </div>

                            <div class="sync-individual">
                                <h4>Individual Sync</h4>
                                <Show when={persons().length === 0}>
                                    <div class="empty-state">
                                        {apiStatus().sync ? 'No persons available for sync' : 'Sync API not available'}
                                    </div>
                                </Show>
                                
                                <For each={persons()}>
                                    {person => {
                                        const syncStatus = syncStatuses()[person.personName];
                                        return (
                                            <div class="sync-person">
                                                <div class="sync-person-info">
                                                    <div class="sync-person-name">{person.personName}</div>
                                                    <Show when={syncStatus}>
                                                        <div class="sync-status">
                                                            Last sync: {syncStatus.lastSync ? new Date(syncStatus.lastSync).toLocaleString() : 'Never'}
                                                        </div>
                                                        <Show when={syncStatus.isRunning}>
                                                            <div class="sync-running">Sync in progress...</div>
                                                        </Show>
                                                    </Show>
                                                </div>
                                                <div class="sync-person-actions">
                                                    <button
                                                        class="btn btn-small"
                                                        onClick={() => handleSyncPerson(person.personName, false)}
                                                        disabled={isLoading() || syncStatus?.isRunning || !apiStatus().sync}
                                                    >
                                                        🔄 Sync
                                                    </button>
                                                    <button
                                                        class="btn btn-small btn-warning"
                                                        onClick={() => handleSyncPerson(person.personName, true)}
                                                        disabled={isLoading() || syncStatus?.isRunning || !apiStatus().sync}
                                                    >
                                                        🔄 Full Sync
                                                    </button>
                                                </div>
                                            </div>
                                        );
                                    }}
                                </For>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Dividend & Yield Manager Tab */}
                <div class={`sub-tab-content ${activeSubTab() === 'yocExclusion' ? '' : 'hidden'}`}>
                    <DividendYieldManager />
                </div>

                {/* System Health Tab */}
                <div class={`sub-tab-content ${activeSubTab() === 'systemHealth' ? '' : 'hidden'}`}>
                    <div class="settings-card">
                        <div class="settings-header">❤️ System Health Overview</div>
                        <div class="health-dashboard">
                            <div class="health-metrics">
                                <div class="health-metric">
                                    <div class="metric-label">Total Persons</div>
                                    <div class="metric-value">{persons().length}</div>
                                </div>
                                <div class="health-metric">
                                    <div class="metric-label">Active Tokens</div>
                                    <div class="metric-value">
                                        {Object.values(tokenStatuses()).filter(s => s?.valid).length}
                                    </div>
                                </div>
                                <div class="health-metric">
                                    <div class="metric-label">Total Accounts</div>
                                    <div class="metric-value">
                                        {persons().reduce((sum, p) => sum + (p.accountCount || 0), 0)}
                                    </div>
                                </div>
                                <div class="health-metric">
                                    <div class="metric-label">API Status</div>
                                    <div class="metric-value">
                                        {Object.values(apiStatus()).filter(Boolean).length}/
                                        {Object.keys(apiStatus()).length}
                                    </div>
                                </div>
                            </div>

                            <div class="health-checks">
                                <h4>API Endpoint Status</h4>
                                <For each={Object.entries(apiStatus())}>
                                    {([endpoint, status]) => (
                                        <div class="health-check-item">
                                            <div class="health-check-name">{endpoint}</div>
                                            <div 
                                                class="health-check-status"
                                                style={{ color: status ? '#10b981' : '#ef4444' }}
                                            >
                                                {status ? 'Connected' : 'Not Available'}
                                            </div>
                                        </div>
                                    )}
                                </For>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Error Logs Tab */}
                <div class={`sub-tab-content ${activeSubTab() === 'errorLogs' ? '' : 'hidden'}`}>
                    <Show when={!apiStatus().errorLogs}>
                        <div class="api-warning">
                            <div class="warning-icon">⚠️</div>
                            <div class="warning-text">
                                Error Logs API is not available. This feature requires backend implementation.
                                <br />
                                <small>Expected endpoint: <code>/api/logs/errors</code></small>
                            </div>
                        </div>
                    </Show>
                    
                    <div class="settings-card">
                        <div class="settings-header">📋 Error Logs (Last 7 Days)</div>
                        <div class="error-logs">
                            <Show when={!errorLogs().tokenErrors?.length && !errorLogs().syncErrors?.length}>
                                <div class="empty-state">
                                    {apiStatus().errorLogs ? 'No recent errors found' : 'Error Logs API not available'}
                                </div>
                            </Show>

                            <Show when={errorLogs().tokenErrors?.length > 0}>
                                <div class="error-section">
                                    <h4>Token Errors</h4>
                                    <For each={errorLogs().tokenErrors}>
                                        {error => (
                                            <div class="error-item">
                                                <div class="error-timestamp">
                                                    {new Date(error.timestamp).toLocaleString()}
                                                </div>
                                                <div class="error-person">{error.personName}</div>
                                                <div class="error-message">{error.message}</div>
                                                <Show when={error.details}>
                                                    <div class="error-details">{error.details}</div>
                                                </Show>
                                            </div>
                                        )}
                                    </For>
                                </div>
                            </Show>

                            <Show when={persons().length > 0 && apiStatus().errorLogs}>
                                <div class="error-actions">
                                    <h4>Clear Errors</h4>
                                    <div class="clear-error-buttons">
                                        <For each={persons()}>
                                            {person => (
                                                <button
                                                    class="btn btn-small btn-warning"
                                                    onClick={() => handleClearErrors(person.personName)}
                                                    disabled={isLoading()}
                                                >
                                                    Clear {person.personName} Errors
                                                </button>
                                            )}
                                        </For>
                                    </div>
                                </div>
                            </Show>
                        </div>
                    </div>
                </div>
            </div>

            {/* Loading Overlay */}
            <Show when={isLoading()}>
                <div class="loading-overlay">
                    <div class="loading-spinner">🔄</div>
                    <div class="loading-text">Loading...</div>
                </div>
            </Show>
        </div>
    );
}

export default SettingsTab;