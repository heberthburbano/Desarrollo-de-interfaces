/**
 * i18n - Internationalization
 */

const DICTIONARY = {
    es: {
        // Auth
        app_name: "Mi Billetera",
        login_email: "Correo Electrónico",
        login_pass: "Contraseña",
        login_btn: "Entrar",
        login_footer: "¿No tienes cuenta?",
        login_register: "Regístrate",

        // Navigation
        nav_home: "Inicio",
        nav_transactions: "Movimientos",
        nav_profile: "Perfil",

        // Home
        greeting: "Hola, Usuario",
        balance_total: "Balance Total",
        income_label: "Ingresos",
        expense_label: "Gastos",
        expense_month: "Gastos del Mes",
        budget_info: "65% de tu presupuesto",
        recent_moves: "Últimos Movimientos",
        view_all: "Ver todo",
        empty_state: "No hay movimientos aún.",

        // Transactions
        moves_title: "Movimientos",

        // Add
        add_title: "Añadir",
        type_expense: "Gasto",
        type_income: "Ingreso",
        concept_label: "Concepto",
        concept_placeholder: "¿Qué es?",
        amount_placeholder: "0.00",
        date_label: "Fecha",
        category_label: "Categoría",
        save_btn: "Guardar",

        // Categories
        cat_food: "Comida",
        cat_transport: "Transporte",
        cat_home: "Hogar",
        cat_entertainment: "Ocio",
        cat_salary: "Nómina",
        cat_gift: "Regalo",
        cat_investment: "Inversión",
        cat_other: "Otro",

        // Profile
        profile_title: "Perfil",
        dark_mode: "Modo Oscuro",
        language: "Idioma",
        logout: "Cerrar Sesión",
        filter_all: "Todas las Categorías",

        // Alerts
        confirm_delete: "¿Borrar movimiento?",
        login_success: "¡Login exitoso! Bienvenido."
    },
    en: {
        // Auth
        app_name: "My Wallet",
        login_email: "Email Address",
        login_pass: "Password",
        login_btn: "Login",
        login_footer: "No account?",
        login_register: "Sign up",

        // Navigation
        nav_home: "Home",
        nav_transactions: "Transactions",
        nav_profile: "Profile",

        // Home
        greeting: "Hello, User",
        balance_total: "Total Balance",
        income_label: "Income",
        expense_label: "Expenses",
        expense_month: "Monthly Expenses",
        budget_info: "65% of your budget",
        recent_moves: "Recent Transactions",
        view_all: "View all",
        empty_state: "No transactions yet.",

        // Transactions
        moves_title: "Transactions",

        // Add
        add_title: "Add",
        type_expense: "Expense",
        type_income: "Income",
        concept_label: "Concept",
        concept_placeholder: "What is it?",
        amount_placeholder: "0.00",
        date_label: "Date",
        category_label: "Category",
        save_btn: "Save",

        // Categories
        cat_food: "Food",
        cat_transport: "Transport",
        cat_home: "Home",
        cat_entertainment: "Entertainment",
        cat_salary: "Salary",
        cat_gift: "Gift",
        cat_investment: "Investment",
        cat_other: "Other",

        // Profile
        profile_title: "Profile",
        dark_mode: "Dark Mode",
        language: "Language",
        logout: "Log Out",
        filter_all: "All Categories",

        // Alerts
        confirm_delete: "Delete transaction?",
        login_success: "Login successful! Welcome."
    }
};

class TranslationManager {
    constructor() {
        this.currentLang = localStorage.getItem('appLang') || 'es';
        this.init();
    }

    init() {
        this.setLanguage(this.currentLang);
    }

    setLanguage(lang) {
        if (!DICTIONARY[lang]) return;
        this.currentLang = lang;
        localStorage.setItem('appLang', lang);
        this.updateView();
    }

    // Helper to get text in JS
    t(key) {
        return DICTIONARY[this.currentLang][key] || key;
    }

    updateView() {
        const texts = DICTIONARY[this.currentLang];

        // 1. Update Text Content
        document.querySelectorAll('[data-i18n]').forEach(el => {
            const key = el.dataset.i18n;
            if (texts[key]) {
                el.innerText = texts[key];
            }
        });

        // 2. Update Placeholders
        document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
            const key = el.dataset.i18nPlaceholder;
            if (texts[key]) {
                el.placeholder = texts[key];
            }
        });

        // 3. Update Language Toggles Active State
        document.querySelectorAll('.lang-btn').forEach(btn => {
            if (btn.id === `lang-${this.currentLang}`) {
                btn.classList.add('active');
            } else {
                btn.classList.remove('active');
            }
        });

        // 4. Update Dynamic Content (Transactions List)
        // We trigger a re-render if the Main logic is loaded
        if (window.renderTransactions) {
            window.renderTransactions();
        }
    }
}

// Global Export
window.TranslationManager = TranslationManager;
