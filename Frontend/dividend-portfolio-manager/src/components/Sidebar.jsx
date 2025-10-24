// src/components/Sidebar.jsx
import { For } from 'solid-js';

function Sidebar(props) {
    const navItems = [
        { icon: '📊', background: '#f59e0b', label: 'Portfolio Holdings', id: 'holdings' },
        { icon: '💰', background: '#10b981', label: 'Portfolio Analysis', id: 'portfolioAnalysis' },
        { icon: '📈', background: '#3b82f6', label: 'Backtesting Analytics', id: 'backtest' },
        { icon: '⚙️', background: '#8b5cf6', label: 'Settings', id: 'settings' }
    ];

    return (
        <div class={`sidebar ${props.isCollapsed() ? 'collapsed' : ''}`}>
            <button 
                class="sidebar-toggle" 
                onClick={() => props.setIsCollapsed(!props.isCollapsed())}
                title={props.isCollapsed() ? 'Expand menu' : 'Collapse menu'}
            >
                {props.isCollapsed() ? '☰' : '✕'}
            </button>
            <div class="nav-items-container">
                <For each={navItems}>
                    {item => (
                        <div
                            class={`nav-item ${props.activeTab() === item.id ? 'active' : ''}`}
                            onClick={() => {
                                props.setActiveTab(item.id);
                                if (window.innerWidth < 1024) {
                                    props.setIsCollapsed(true);
                                }
                            }}
                            title={props.isCollapsed() ? item.label : ''}
                        >
                            <div class="nav-icon" style={{ background: item.background }}>{item.icon}</div>
                            {!props.isCollapsed() && <span class="nav-label">{item.label}</span>}
                        </div>
                    )}
                </For>
            </div>
        </div>
    );
}

export default Sidebar;