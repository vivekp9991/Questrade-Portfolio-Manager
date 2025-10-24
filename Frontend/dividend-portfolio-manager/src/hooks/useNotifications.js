// src/hooks/useNotifications.js
import { createSignal } from 'solid-js';

export function useNotifications() {
    const [notifications, setNotifications] = createSignal([]);

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

    const removeNotification = (id) => {
        setNotifications(prev => prev.filter(n => n.id !== id));
    };

    return {
        notifications,
        showNotification,
        removeNotification
    };
}