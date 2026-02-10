/**
 * Toast Notification System
 * Fixed: Uses animationend and guaranteed export
 */

function showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    if (!container) return;

    // Create Toast Element
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;

    // Icon based on type
    let icon = 'fa-info-circle';
    if (type === 'success') icon = 'fa-check-circle';
    if (type === 'error') icon = 'fa-exclamation-circle';

    toast.innerHTML = `
        <i class="fa-solid ${icon}"></i>
        <span>${message}</span>
    `;

    // Append
    container.appendChild(toast);

    // Auto Remove
    const removeToast = () => {
        toast.classList.add('hide');
        toast.addEventListener('animationend', () => {
            toast.remove();
        });
    };

    setTimeout(removeToast, 3000);
}

// Global Exposure
window.showToast = showToast;
