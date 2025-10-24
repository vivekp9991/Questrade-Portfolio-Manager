// src/components/NotificationSystem.jsx - UPDATED
import { For } from 'solid-js';

function NotificationSystem(props) {
    const removeNotification = (id) => {
        // This would need to be passed from the parent if we want to remove notifications
        console.log('Remove notification:', id);
    };

    return (
        <div class="notification-container">
            <For each={props.notifications?.() || []}>
                {notification => (
                    <div class={`notification notification-${notification.type}`}>
                        <div class="notification-content">
                            <div class="notification-message">{notification.message}</div>
                            <div class="notification-time">{notification.timestamp}</div>
                        </div>
                        <button 
                            class="notification-close"
                            onClick={() => removeNotification(notification.id)}
                        >
                            ×
                        </button>
                    </div>
                )}
            </For>
        </div>
    );
}

export default NotificationSystem;