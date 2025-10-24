// Sidebar Component
import { For, createSignal } from 'solid-js';
import { theme, toggleTheme } from '../../services/theme';
import './Sidebar.css';

export default function Sidebar(props) {
  const [expanded, setExpanded] = createSignal(false);

  const navItems = [
    { id: 'holdings', label: 'Holdings', icon: '📊' },
    { id: 'analysis', label: 'Analysis', icon: '📈' },
    { id: 'backtesting', label: 'Backtesting', icon: '🔄' },
    { id: 'settings', label: 'Settings', icon: '⚙️' }
  ];

  return (
    <div class={`sidebar ${expanded() ? 'expanded' : ''}`}>
      {/* Logo and Toggle */}
      <div class="sidebar-header">
        <div class="sidebar-logo">
          <svg width="36" height="36" viewBox="0 0 36 36" fill="none">
            <rect width="36" height="36" rx="8" fill="url(#logoGradient)"/>
            <text x="18" y="24" text-anchor="middle" fill="white" font-size="18" font-weight="700" font-family="system-ui">D</text>
            <defs>
              <linearGradient id="logoGradient" x1="0" y1="0" x2="36" y2="36">
                <stop offset="0%" stop-color="#58a6ff"/>
                <stop offset="100%" stop-color="#1f6feb"/>
              </linearGradient>
            </defs>
          </svg>
        </div>
        <button
          class="sidebar-toggle-btn"
          onClick={() => setExpanded(!expanded())}
          title={expanded() ? 'Collapse sidebar' : 'Expand sidebar'}
        >
          {expanded() ? '◀' : '▶'}
        </button>
      </div>

      {/* Navigation Items */}
      <div class="sidebar-nav">
        <For each={navItems}>
          {(item) => (
            <button
              class={`sidebar-nav-btn ${props.active === item.id ? 'active' : ''}`}
              onClick={() => props.onNavigate?.(item.id)}
              title={!expanded() ? item.label : ''}
            >
              <span class="nav-icon">{item.icon}</span>
              {expanded() && <span class="nav-label">{item.label}</span>}
            </button>
          )}
        </For>
      </div>

      {/* Theme Toggle */}
      <button class="sidebar-theme-toggle" onClick={toggleTheme} title="Toggle theme">
        <span class="theme-icon">{theme() === 'dark' ? '☀️' : '🌙'}</span>
      </button>
    </div>
  );
}
