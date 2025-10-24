// src/hooks/useQuoteStreaming.js - WEBSOCKET ENABLED VERSION WITH MARKET HOURS
import { createSignal, onCleanup } from 'solid-js';
import { startPollingQuotes, stopQuoteStream, manualFetchQuotes } from '../streaming';
import { POLLING_INTERVALS } from '../utils/constants';
import { updateStockWithLiveData } from '../services/formatters';
import questradeWebSocketProxy from '../services/questradeWebSocketProxy';

// Feature flag to enable/disable WebSocket (set to true to use WebSocket, false for polling)
// ENABLED: Using backend WebSocket proxy server to avoid CORS issues
const USE_WEBSOCKET = true;

export function useQuoteStreaming(stockData, setStockData, usdCadRate, updateStatsWithLivePrice) {
    const [updatedStocks, setUpdatedStocks] = createSignal(new Set());
    let pollingCleanup = null;
    let isWebSocketConnected = false;

    const handleQuoteUpdate = (quote) => {
        const price = quote.lastTradePrice || quote.price;
        if (!price || !quote.symbol) return;

        console.log(`📈 Processing quote update for ${quote.symbol}: ${price}`);

        setStockData(prevStocks => {
            let hasChanges = false;

            const newStocks = prevStocks.map(stock => {
                if (stock.symbol !== quote.symbol) return stock;

                const currentRate = usdCadRate();

                // Check if price actually changed
                const newPrice = Number(price);
                const oldPrice = stock.currency === 'USD'
                    ? stock.currentPriceNum / currentRate
                    : stock.currentPriceNum;

                if (Math.abs(newPrice - oldPrice) < 0.001) {
                    return stock;
                }

                hasChanges = true;
                console.log(`💰 Price change detected for ${stock.symbol}: ${oldPrice} → ${newPrice}`);

                // Update stock with live data using the formatter function
                const updatedStock = updateStockWithLiveData(stock, quote, currentRate);

                return updatedStock;
            });

            if (hasChanges) {
                console.log(`✅ Stock data updated with new prices`);
                updateStatsWithLivePrice();

                // Track updated stocks for animation
                const currentTime = Date.now();
                const recentlyUpdated = new Set();

                newStocks.forEach(stock => {
                    if (stock.lastUpdateTime && (currentTime - stock.lastUpdateTime) < 2000) {
                        recentlyUpdated.add(stock.symbol);
                    }
                });

                setUpdatedStocks(recentlyUpdated);

                // Clear the updates after animation completes
                setTimeout(() => {
                    setUpdatedStocks(new Set());
                }, 1500);

                return newStocks;
            }

            return prevStocks;
        });
    };

    const startQuotePolling = async (symbols) => {
        if (!symbols || symbols.length === 0) {
            console.log('[useQuoteStreaming] No symbols to subscribe to');
            return;
        }

        if (USE_WEBSOCKET) {
            console.log('[useQuoteStreaming] 🚀 Starting WebSocket connection for real-time quotes');

            // Stop any existing connection
            if (isWebSocketConnected) {
                questradeWebSocketProxy.disconnect();
                isWebSocketConnected = false;
            }

            try {
                await questradeWebSocketProxy.connect(symbols, handleQuoteUpdate, (status, details) => {
                    console.log(`[useQuoteStreaming] WebSocket status: ${status}`, details);
                });
                isWebSocketConnected = true;
                console.log(`[useQuoteStreaming] ✅ WebSocket connected for ${symbols.length} symbols`);
            } catch (error) {
                console.error('[useQuoteStreaming] ❌ WebSocket connection failed, falling back to polling:', error);

                // Fallback to polling if WebSocket fails
                if (pollingCleanup) {
                    pollingCleanup();
                }
                pollingCleanup = await startPollingQuotes(symbols, handleQuoteUpdate, POLLING_INTERVALS.QUOTES);
            }
        } else {
            console.log('[useQuoteStreaming] Using polling mode for quotes');

            // Traditional polling approach
            if (pollingCleanup) {
                pollingCleanup();
            }
            pollingCleanup = await startPollingQuotes(symbols, handleQuoteUpdate, POLLING_INTERVALS.QUOTES);
        }
    };

    const stopQuotePolling = () => {
        console.log('[useQuoteStreaming] Stopping quote streaming');

        // Stop WebSocket if connected
        if (USE_WEBSOCKET && isWebSocketConnected) {
            questradeWebSocketProxy.disconnect();
            isWebSocketConnected = false;
        }

        // Stop polling if active
        if (pollingCleanup) {
            pollingCleanup();
            pollingCleanup = null;
        }
        stopQuoteStream();
    };

    onCleanup(() => {
        stopQuotePolling();
    });

    const manualSync = async (symbols) => {
        console.log('[useQuoteStreaming] 🔄 Manual sync requested');
        const result = await manualFetchQuotes(symbols, handleQuoteUpdate);

        if (result.success) {
            console.log(`[useQuoteStreaming] ✅ Manual sync complete - Updated ${result.count} quotes`);
        } else {
            console.error(`[useQuoteStreaming] ❌ Manual sync failed:`, result.error);
        }

        return result;
    };

    return {
        updatedStocks,
        startQuotePolling,
        stopQuotePolling,
        handleQuoteUpdate,
        manualSync  // Add manual sync function
    };
}