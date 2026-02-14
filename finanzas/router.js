/**
 * Router - Handles SPA navigation simply by toggling visibility of sections
 * based on IDs.
 */
class Router {
    constructor(routes, defaultRoute = 'home') {
        this.routes = routes; // Array of section IDs ['home', 'transactions', etc]
        this.defaultRoute = defaultRoute;
        this.currentRoute = null;
        this.init();
    }

    init() {
        // Handle browser back/forward buttons
        window.addEventListener('popstate', () => {
            this.handleLocation();
        });

        // Handle initial load
        this.handleLocation();
    }

    /**
     * Navigates to a specific route
     * @param {string} routeId - The ID of the section to show
     */
    navigate(routeId) {
        // Push state to history to allow back button usage
        window.history.pushState({}, routeId, `#${routeId}`);
        this.handleLocation();
    }

    /**
     * Reads current hash and shows the correct view
     */
    handleLocation() {
        const hash = window.location.hash.substring(1); // Remove '#'
        const route = this.routes.includes(hash) ? hash : this.defaultRoute;

        this.render(route);
    }

    /**
     * Hides all views and shows the target one
     * Updates Nav active state
     */
    render(route) {
        if (this.currentRoute === route) return;

        // 1. Hide all views
        document.querySelectorAll('.view').forEach(section => {
            section.classList.remove('active');
            section.style.display = 'none'; // Ensure display:none is applied
        });

        // 2. Show target view
        const targetSection = document.getElementById(route);
        if (targetSection) {
            targetSection.style.display = route === 'login' ? 'flex' : 'block';
            // Small timeout to allow display change before adding opacity class for simple transition if needed
            // For now, just adding active class which is handled in CSS
            setTimeout(() => {
                targetSection.classList.add('active');
            }, 10);
        }

        // 3. Update Global UI Visibility (Nav & FAB)
        const nav = document.querySelector('.main-nav');
        const fabContainer = document.querySelector('.fab-container'); // Correct selector from CSS inspection

        if (route === 'login') {
            if (nav) nav.style.display = 'none';
            if (fabContainer) fabContainer.style.display = 'none';
        } else if (route === 'settings') {
            if (nav) nav.style.display = 'flex'; // Keep nav visible
            if (fabContainer) fabContainer.style.display = 'none'; // Hide global FAB in settings
        } else {
            if (nav) nav.style.display = 'flex'; // Restore flex for nav
            if (fabContainer) fabContainer.style.display = 'block'; // Restore block for fab container
        }

        // 3. Update Navigation Active State
        document.querySelectorAll('.nav-item').forEach(btn => {
            if (btn.dataset.target === route) {
                btn.classList.add('active');
            } else {
                btn.classList.remove('active');
            }
        });

        // Handle FAB active state if desired, mostly FAB triggers 'add'
        const fab = document.querySelector('.fab');
        if (route === 'add') {
            fab.classList.add('active-fab'); // Optional styling
        } else {
            fab.classList.remove('active-fab');
        }

        this.currentRoute = route;
        console.log(`Navigated to: ${route}`);
    }
}

// Make accessible globally
window.Router = Router;
