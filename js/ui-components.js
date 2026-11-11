/**
 * AGENDAÍ - Premium UI Feedback System
 * Toasts & Modals
 */

class UIComponents {
    constructor() {
        this.toastContainer = null;
        this.init();
    }

    init() {
        // Create toast container if not exists
        if (!document.querySelector('.ui-toast-container')) {
            this.toastContainer = document.createElement('div');
            this.toastContainer.className = 'ui-toast-container';
            document.body.appendChild(this.toastContainer);
        } else {
            this.toastContainer = document.querySelector('.ui-toast-container');
        }

        // Pre-create modal structure for reuse or on-demand
    }

    /**
     * Shows a toast notification
     * @param {string} message 
     * @param {string} type - 'success' | 'error' | 'info' | 'warning'
     * @param {number} duration - ms
     */
    toast(message, type = 'success', duration = 3000) {
        const toast = document.createElement('div');
        toast.className = `ui-toast ${type}`;
        
        const iconMap = {
            success: '✦', // Elegant spark
            error: '✕',
            info: 'ℹ',
            warning: '⚠'
        };

        toast.innerHTML = `
            <div class="ui-toast-icon">${iconMap[type] || '✦'}</div>
            <div class="ui-toast-content">
                <div class="ui-toast-message">${message}</div>
            </div>
            <div class="ui-toast-progress" style="animation: ui-progress ${duration}ms linear forwards"></div>
        `;

        this.toastContainer.appendChild(toast);

        // Progress bar animation
        const style = document.createElement('style');
        style.innerHTML = `@keyframes ui-progress { from { transform: scaleX(1); } to { transform: scaleX(0); } }`;
        document.head.appendChild(style);

        // Auto remove
        setTimeout(() => {
            toast.classList.add('ui-fade-out');
            setTimeout(() => toast.remove(), 500);
        }, duration);
    }

    /**
     * Shows a custom confirmation modal
     * @param {string} title 
     * @param {string} message 
     * @param {object} options - { confirmText, cancelText, type }
     * @returns {Promise<boolean>}
     */
    confirm(title, message, options = {}) {
        const {
            confirmText = 'Confirmar',
            cancelText = 'Cancelar',
            type = 'primary' // 'primary' or 'danger'
        } = options;

        return new Promise((resolve) => {
            const overlay = document.createElement('div');
            overlay.className = 'ui-modal-overlay';
            
            const btnClass = type === 'danger' ? 'ui-modal-btn-danger' : 'ui-modal-btn-confirm';
            const icon = type === 'danger' ? '🚫' : '✧';

            overlay.innerHTML = `
                <div class="ui-modal-card">
                    <div class="ui-modal-header">
                        <div class="ui-modal-icon">${icon}</div>
                        <h3 class="ui-modal-title">${title}</h3>
                    </div>
                    <div class="ui-modal-body">
                        <p class="ui-modal-text">${message}</p>
                    </div>
                    <div class="ui-modal-footer">
                        <button type="button" class="ui-modal-btn ui-modal-btn-cancel">${cancelText}</button>
                        <button type="button" class="ui-modal-btn ${btnClass}">${confirmText}</button>
                    </div>
                </div>
            `;

            document.body.appendChild(overlay);
            
            // Force reflow for animation
            overlay.offsetHeight; 
            overlay.classList.add('active');

            const btnCancel = overlay.querySelector('.ui-modal-btn-cancel');
            const btnConfirm = overlay.querySelector(`.${btnClass}`);

            const close = (result) => {
                overlay.classList.remove('active');
                setTimeout(() => {
                    overlay.remove();
                    resolve(result);
                }, 400);
            };

            btnCancel.onclick = () => close(false);
            btnConfirm.onclick = () => close(true);
            
            // Background click to cancel
            overlay.onclick = (e) => {
                if (e.target === overlay) close(false);
            };
        });
    }

    /**
     * Shows a custom alert modal
     * @param {string} title 
     * @param {string} message 
     */
    alert(title, message) {
        return this.confirm(title, message, { cancelText: '', confirmText: 'OK', type: 'primary' });
    }
}

// Create singleton
window.UI = new UIComponents();
window.alert = (msg) => window.UI.toast(msg, 'info'); // Override native alert with toast for simple messages
window.confirm = () => { console.warn("Native confirm() is deprecated. Use await UI.confirm()"); return true; }; // Safety
