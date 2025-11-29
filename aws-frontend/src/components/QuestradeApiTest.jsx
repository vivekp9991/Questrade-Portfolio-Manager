import { createSignal, Show, For } from 'solid-js';
import * as api from '../services/api';
import './QuestradeApiTest.css';

export default function QuestradeApiTest(props) {
  const [selectedPerson, setSelectedPerson] = createSignal('');
  const [selectedEndpoint, setSelectedEndpoint] = createSignal('');
  const [customEndpoint, setCustomEndpoint] = createSignal('');
  const [selectedAccount, setSelectedAccount] = createSignal('');
  const [startDate, setStartDate] = createSignal('');
  const [endDate, setEndDate] = createSignal('');
  const [testResult, setTestResult] = createSignal(null);
  const [loading, setLoading] = createSignal(false);
  const [error, setError] = createSignal('');

  // Common Questrade API endpoints
  const commonEndpoints = [
    { value: '/v1/accounts', label: 'Get Accounts', requiresAccount: false, requiresDates: false },
    { value: '/v1/accounts/{accountId}/positions', label: 'Get Positions', requiresAccount: true, requiresDates: false },
    { value: '/v1/accounts/{accountId}/balances', label: 'Get Balances', requiresAccount: true, requiresDates: false },
    { value: '/v1/accounts/{accountId}/activities', label: 'Get Activities (with dates)', requiresAccount: true, requiresDates: true },
    { value: '/v1/accounts/{accountId}/executions', label: 'Get Executions', requiresAccount: true, requiresDates: true },
    { value: '/v1/markets', label: 'Get Markets', requiresAccount: false, requiresDates: false },
    { value: '/v1/symbols/{symbolId}', label: 'Get Symbol Details', requiresAccount: false, requiresDates: false },
    { value: 'custom', label: 'Custom Endpoint', requiresAccount: false, requiresDates: false }
  ];

  // Get current endpoint configuration
  const currentEndpoint = () => {
    return commonEndpoints.find(e => e.value === selectedEndpoint());
  };

  // Check if dates are required
  const requiresDates = () => {
    const endpoint = currentEndpoint();
    return endpoint && endpoint.requiresDates;
  };

  // Check if account is required
  const requiresAccount = () => {
    const endpoint = currentEndpoint();
    return endpoint && endpoint.requiresAccount;
  };

  // Build the final endpoint URL
  const buildEndpointUrl = () => {
    let endpoint = selectedEndpoint() === 'custom' ? customEndpoint() : selectedEndpoint();

    // Replace {accountId} placeholder
    if (requiresAccount() && selectedAccount()) {
      endpoint = endpoint.replace('{accountId}', selectedAccount());
    }

    return endpoint;
  };

  // Handle test API button click
  const handleTestApi = async () => {
    setError('');
    setTestResult(null);

    // Validation
    if (!selectedPerson()) {
      setError('Please select a person');
      return;
    }

    if (!selectedEndpoint()) {
      setError('Please select an endpoint');
      return;
    }

    if (selectedEndpoint() === 'custom' && !customEndpoint()) {
      setError('Please enter a custom endpoint');
      return;
    }

    if (requiresAccount() && !selectedAccount()) {
      setError('Please enter an account ID for this endpoint');
      return;
    }

    if (requiresDates() && (!startDate() || !endDate())) {
      setError('Please select start and end dates for this endpoint');
      return;
    }

    try {
      setLoading(true);

      const endpoint = buildEndpointUrl();
      const start = startDate() ? new Date(startDate()).toISOString() : null;
      const end = endDate() ? new Date(endDate()).toISOString() : null;

      console.log('[Questrade API Test] Testing:', { person: selectedPerson(), endpoint, start, end });

      const result = await api.testQuestradeApi(selectedPerson(), endpoint, start, end);

      setTestResult(result);
      console.log('[Questrade API Test] Result:', result);

    } catch (err) {
      console.error('[Questrade API Test] Error:', err);
      setError(err.message || 'Test failed');
    } finally {
      setLoading(false);
    }
  };

  // Format JSON for display
  const formatJson = (obj) => {
    return JSON.stringify(obj, null, 2);
  };

  return (
    <div class="questrade-api-test">
      <h3>Questrade API Test</h3>
      <p class="description">
        Test Questrade API endpoints to debug and verify data. This tool makes direct API calls to Questrade
        using your stored tokens.
      </p>

      <div class="test-form">
        {/* Person Selection */}
        <div class="form-group">
          <label>Person:</label>
          <select
            value={selectedPerson()}
            onChange={(e) => setSelectedPerson(e.target.value)}
            disabled={loading()}
          >
            <option value="">Select Person</option>
            <For each={props.persons || []}>
              {(person) => (
                <option value={person.personName}>
                  {person.personName} {!person.isActive && '(Inactive)'}
                </option>
              )}
            </For>
          </select>
        </div>

        {/* Endpoint Selection */}
        <div class="form-group">
          <label>Endpoint:</label>
          <select
            value={selectedEndpoint()}
            onChange={(e) => setSelectedEndpoint(e.target.value)}
            disabled={loading()}
          >
            <option value="">Select Endpoint</option>
            <For each={commonEndpoints}>
              {(endpoint) => (
                <option value={endpoint.value}>{endpoint.label}</option>
              )}
            </For>
          </select>
        </div>

        {/* Custom Endpoint Input */}
        <Show when={selectedEndpoint() === 'custom'}>
          <div class="form-group">
            <label>Custom Endpoint URL:</label>
            <input
              type="text"
              value={customEndpoint()}
              onInput={(e) => setCustomEndpoint(e.target.value)}
              placeholder="/v1/..."
              disabled={loading()}
            />
            <small>Example: /v1/accounts or /v1/markets/quotes/AAPL</small>
          </div>
        </Show>

        {/* Account ID Input */}
        <Show when={requiresAccount()}>
          <div class="form-group">
            <label>Account ID:</label>
            <input
              type="text"
              value={selectedAccount()}
              onInput={(e) => setSelectedAccount(e.target.value)}
              placeholder="Enter account number"
              disabled={loading()}
            />
            <small>Required for this endpoint (e.g., 53510361)</small>
          </div>
        </Show>

        {/* Date Range Inputs */}
        <Show when={requiresDates()}>
          <div class="form-group">
            <label>Start Date:</label>
            <input
              type="date"
              value={startDate()}
              onInput={(e) => setStartDate(e.target.value)}
              disabled={loading()}
            />
          </div>

          <div class="form-group">
            <label>End Date:</label>
            <input
              type="date"
              value={endDate()}
              onInput={(e) => setEndDate(e.target.value)}
              disabled={loading()}
            />
          </div>

          <small class="date-helper">
            For activities/dividends: Select a date range to filter results
          </small>
        </Show>

        {/* Test Button */}
        <button
          class="btn-test"
          onClick={handleTestApi}
          disabled={loading()}
        >
          {loading() ? 'Testing...' : 'Test API'}
        </button>
      </div>

      {/* Error Display */}
      <Show when={error()}>
        <div class="error-message">
          <strong>Error:</strong> {error()}
        </div>
      </Show>

      {/* Results Display */}
      <Show when={testResult()}>
        <div class="test-results">
          <h4>Test Results</h4>

          {/* Request Info */}
          <div class="result-section">
            <h5>Request Details</h5>
            <div class="info-grid">
              <div class="info-item">
                <strong>Person:</strong> {testResult().requestParams?.personName}
              </div>
              <div class="info-item">
                <strong>Endpoint:</strong> {testResult().endpoint}
              </div>
              <div class="info-item">
                <strong>URL:</strong> {testResult().url}
              </div>
              <Show when={testResult().requestParams?.startDate}>
                <div class="info-item">
                  <strong>Start Date:</strong> {testResult().requestParams?.startDate}
                </div>
              </Show>
              <Show when={testResult().requestParams?.endDate}>
                <div class="info-item">
                  <strong>End Date:</strong> {testResult().requestParams?.endDate}
                </div>
              </Show>
            </div>
          </div>

          {/* Response Metadata */}
          <div class="result-section">
            <h5>Response Metadata</h5>
            <div class="info-grid">
              <div class="info-item">
                <strong>Status:</strong> {testResult().metadata?.status} {testResult().metadata?.statusText}
              </div>
              <div class="info-item">
                <strong>Timestamp:</strong> {testResult().metadata?.timestamp}
              </div>
            </div>
          </div>

          {/* Response Data */}
          <div class="result-section">
            <h5>Response Data</h5>
            <div class="json-viewer">
              <pre>{formatJson(testResult().response)}</pre>
            </div>
          </div>

          {/* Quick Stats */}
          <Show when={testResult().response}>
            <div class="result-section">
              <h5>Quick Stats</h5>
              <div class="stats-grid">
                <Show when={testResult().response.accounts}>
                  <div class="stat-item">
                    <strong>Accounts:</strong> {testResult().response.accounts?.length || 0}
                  </div>
                </Show>
                <Show when={testResult().response.positions}>
                  <div class="stat-item">
                    <strong>Positions:</strong> {testResult().response.positions?.length || 0}
                  </div>
                </Show>
                <Show when={testResult().response.activities}>
                  <div class="stat-item">
                    <strong>Activities:</strong> {testResult().response.activities?.length || 0}
                  </div>
                </Show>
                <Show when={testResult().response.executions}>
                  <div class="stat-item">
                    <strong>Executions:</strong> {testResult().response.executions?.length || 0}
                  </div>
                </Show>
              </div>
            </div>
          </Show>
        </div>
      </Show>
    </div>
  );
}
