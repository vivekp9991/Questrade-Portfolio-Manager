// src/hooks/useExchangeRate.js - UPDATED FOR TWELVEDATA WITH 5 MINUTE UPDATES
import { createSignal, onMount, onCleanup } from 'solid-js';
import { fetchExchangeRate } from '../api';
import { DEFAULT_USD_CAD_RATE, POLLING_INTERVALS } from '../utils/constants';

export function useExchangeRate() {
    const [usdCadRate, setUsdCadRate] = createSignal(DEFAULT_USD_CAD_RATE);
    const [lastUpdate, setLastUpdate] = createSignal(null);
    const [error, setError] = createSignal(null);

    const loadExchangeRate = async () => {
        try {
            setError(null);
            console.log('Fetching USD/CAD exchange rate from backend (cached)...');

            const rate = await fetchExchangeRate('USD', 'CAD');
            setUsdCadRate(rate);
            setLastUpdate(new Date());

            console.log(`Backend cached USD/CAD Exchange Rate: ${rate} (updated at ${new Date().toLocaleTimeString()})`);
        } catch (error) {
            console.warn('Failed to load exchange rate from backend:', error);
            setError(error.message);
            setUsdCadRate(DEFAULT_USD_CAD_RATE);
        }
    };

    onMount(() => {
        // Load immediately on mount
        loadExchangeRate();
        
        // UPDATED: Refresh exchange rate every 5 minutes instead of 30 minutes
        const interval = setInterval(() => {
            console.log('Scheduled TwelveData exchange rate refresh (5 minutes)...');
            loadExchangeRate();
        }, POLLING_INTERVALS.EXCHANGE_RATE);
        
        onCleanup(() => {
            clearInterval(interval);
        });
    });

    return {
        usdCadRate,
        lastUpdate,
        error,
        loadExchangeRate
    };
}