// src/components/ContentArea.jsx
import { Show } from 'solid-js';
import HoldingsTab from './HoldingsTab';
import PortfolioAnalysisTab from './PortfolioAnalysisTab';
import BacktestTab from './BacktestTab';
import SettingsTab from './SettingsTab';

function ContentArea(props) {
    return (
        <div class="content-area">
            <Show when={props.activeTab() === 'holdings'}>
                <HoldingsTab
                    stockData={props.stockData}
                    selectedAccount={props.selectedAccount}
                    currencyFilter={props.currencyFilter}
                    usdCadRate={props.usdCadRate}
                />
            </Show>
            <Show when={props.activeTab() === 'portfolioAnalysis'}>
               <PortfolioAnalysisTab 
                   analysisData={props.portfolioAnalysisData} 
                   selectedAccount={props.selectedAccount}
               />
            </Show>
            <Show when={props.activeTab() === 'backtest'}>
             <BacktestTab 
                 backtestParamsData={props.backtestParamsData} 
                 setLoading={props.setLoading}
                 selectedAccount={props.selectedAccount}
             />
            </Show>
            <Show when={props.activeTab() === 'settings'}>
                <SettingsTab />
            </Show>
        </div>
    );
}

export default ContentArea;