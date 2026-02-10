/**
/**
 * Main - App Entry Point
 */
window.activeCategoryFilter = null;

window.filterTransactionByCategory = function (category) {
    window.activeCategoryFilter = category;
    window.router.navigate('transactions');
    renderTransactions(); // Force re-render
};

document.addEventListener('DOMContentLoaded', () => {

    // 1. Initialize Managers
    const routes = ['login', 'home', 'transactions', 'add', 'profile', 'settings'];
    window.router = new Router(routes, 'login'); // Default to login

    // Auth & Data Managers
    window.auth = new AuthManager();
    window.tm = new TransactionManager();
    window.i18n = new TranslationManager();
    // window.i18n = new TranslationManager(); // Removed duplicate
    window.currency = new CurrencyService();
    window.chartManager = new ChartManager();
    window.cm = new CategoryManager(); // NEW: Category Manager
    window.pdfService = new PDFService(); // NEW: PDF Service

    // 2. Setup Navigation
    setupNavigation();
    setupAddForm();
    setupLanguageSelector();
    setupTheme();
    setupCategoryModal(); // NEW: Category Modal
    setupCSVExport(); // NEW: CSV Export
    setupPDFExport(); // NEW: PDF Export
    setupSettingsLogic(); // NEW: Settings View Logic

    // Chart Init
    window.chartManager.init();

    setupAuthListeners();

    // 3. Auth Check & Data Load
    checkSession();
});

/**
 * Async Confirmation Modal Helper
 */
function showConfirmModal(message) {
    return new Promise((resolve) => {
        const modal = document.getElementById('custom-modal');
        const titleEl = document.getElementById('modal-title');
        const msgEl = document.getElementById('modal-msg');
        const btnYes = document.getElementById('modal-btn-confirm');
        const btnNo = document.getElementById('modal-btn-cancel');

        // Configurar texto
        msgEl.innerText = message;
        // Reset title just in case it was changed
        if (titleEl) titleEl.innerText = "Confirmación";

        modal.classList.remove('hidden');

        // Definir handlers para poder eliminarlos después (limpieza)
        const handleYes = () => {
            modal.classList.add('hidden');
            cleanup();
            resolve(true); // El usuario dijo SÍ
        };

        const handleNo = () => {
            modal.classList.add('hidden');
            cleanup();
            resolve(false); // El usuario dijo NO
        };

        function cleanup() {
            btnYes.removeEventListener('click', handleYes);
            btnNo.removeEventListener('click', handleNo);
        }

        // Escuchar clicks
        btnYes.addEventListener('click', handleYes);
        btnNo.addEventListener('click', handleNo);
    });
}


// --- AUTHENTICATION ---
async function checkSession() {
    try {
        const user = await window.auth.getUser();
        if (user) {
            // Logged in
            await loadUserData();
            window.router.navigate('home');
        } else {
            // Not logged in
            window.router.navigate('login');
        }
    } catch (e) {
        window.router.navigate('login');
    }
}

async function loadUserData() {
    // Only load if logged in
    await window.tm.init();
    await window.cm.init(); // NEW: Init Categories

    // Render dynamic selects
    renderCategorySelects();

    updateDashboard();
    renderTransactions();

    // Update Profile Email
    const user = await window.auth.getUser();
    const emailEl = document.querySelector('.profile-header p');
    if (emailEl && user) emailEl.innerText = user.email;
}

function setupAuthListeners() {
    // DOM Elements
    const form = document.getElementById('login-form');
    const emailInput = document.getElementById('email');
    const passInput = document.getElementById('password');

    // Dynamic Text Elements
    const authTitle = document.getElementById('auth-title');
    const submitBtn = document.getElementById('auth-submit-btn');
    const toggleLink = document.getElementById('auth-toggle-link');
    const footerText = document.getElementById('auth-footer-text');

    // State: true = Login, false = Register
    let isLoginMode = true;

    // 1. Toggle Logic
    if (toggleLink) {
        toggleLink.addEventListener('click', (e) => {
            e.preventDefault();
            isLoginMode = !isLoginMode; // Toggle State

            if (isLoginMode) {
                // LOGIN MODE
                if (authTitle) authTitle.innerText = "Mi Billetera";
                if (submitBtn) submitBtn.innerText = "Entrar";
                if (footerText) footerText.innerText = "¿No tienes cuenta?";
                toggleLink.innerText = "Regístrate";
            } else {
                // REGISTER MODE
                if (authTitle) authTitle.innerText = "Crear Cuenta";
                if (submitBtn) submitBtn.innerText = "Registrarse";
                if (footerText) footerText.innerText = "¿Ya tienes cuenta?";
                toggleLink.innerText = "Inicia Sesión";
            }
        });
    }

    // 2. Submit Logic
    if (form) {
        form.addEventListener('submit', async (e) => {
            e.preventDefault();

            // 1. Sanitización Estricta
            const rawEmail = emailInput.value;
            const email = rawEmail ? rawEmail.trim().toLowerCase() : '';
            const password = passInput.value ? passInput.value.trim() : '';

            // Visual Feedback
            const originalBtnText = submitBtn.innerText;
            submitBtn.disabled = true;
            submitBtn.innerText = "Procesando...";

            // 2. Validación Previa (Antes de llamar a Supabase)
            if (!email || !password) {
                window.showToast("Por favor, rellena todos los campos.", 'error');
                submitBtn.disabled = false;
                submitBtn.innerText = originalBtnText;
                return; // DETENER EJECUCIÓN
            }

            // Debug para ver qué estamos enviando realmente
            console.log(`Enviando a Supabase: Email='${email}', Pass='${password}'`);

            try {
                if (isLoginMode) {
                    // Try LOGIN
                    await window.auth.signIn(email, password);
                } else {
                    // Try REGISTER
                    await window.auth.signUp(email, password);
                    window.showToast("¡Cuenta creada! Has iniciado sesión automáticamente.", 'success');
                }

                // Success -> Load Data & Go Home
                await loadUserData();
                window.router.navigate('home');

            } catch (err) {
                console.error(err);
                if (err.status === 400 || (err.message && err.message.toLowerCase().includes('invalid'))) {
                    window.showToast("Formato de correo inválido o credenciales incorrectas", 'error');
                } else {
                    window.showToast("Error: " + (err.message || "Operación fallida"), 'error');
                }
            } finally {
                submitBtn.disabled = false;
                submitBtn.innerText = originalBtnText;
            }
        });
    }

    // Logout Logic
    const logoutBtn = document.querySelector('.setting-item.text-danger');
    if (logoutBtn) {
        // Force replace any existing onclick
        logoutBtn.onclick = async () => {
            await window.auth.signOut();
            window.router.navigate('login');
        };
    }
}

// --- SETUP HELPERS ---

function setupTheme() {
    const themeToggle = document.getElementById('theme-toggle');
    const storedTheme = localStorage.getItem('theme');

    if (storedTheme === 'dark') {
        document.body.classList.add('dark-mode');
        if (themeToggle) themeToggle.checked = true;
    }

    if (themeToggle) {
        themeToggle.addEventListener('change', (e) => {
            if (e.target.checked) {
                document.body.classList.add('dark-mode');
                localStorage.setItem('theme', 'dark');
            } else {
                document.body.classList.remove('dark-mode');
                localStorage.setItem('theme', 'light');
            }
        });
    }
}

function setupNavigation() {
    const navItems = document.querySelectorAll('.nav-item');
    navItems.forEach(item => {
        item.addEventListener('click', (e) => {
            const button = e.target.closest('.nav-item');
            const target = button.dataset.target;
            if (target) {
                // Clear filter when navigating manually to transactions
                if (target === 'transactions') {
                    window.activeCategoryFilter = null;
                }
                window.router.navigate(target);
                if (target === 'home' || target === 'transactions') {
                    updateDashboard();
                    renderTransactions();
                }
            }
        });
    });

    const fab = document.querySelector('.main-nav .fab');
    if (fab) {
        fab.addEventListener('click', () => {
            resetAddForm(); // Ensure clean state
            window.router.navigate('add');
        });
    }
}

function setupCSVExport() {
    const btn = document.getElementById('btn-export-csv');
    if (btn) {
        btn.addEventListener('click', () => {
            if (!window.tm) return;

            window.showToast("Generando Excel...", "info");

            // Allow UI to update before blocking with download
            setTimeout(() => {
                const success = window.tm.exportToCSV();
                if (success) {
                    window.showToast("Descarga iniciada", "success");
                } else {
                    window.showToast("No hay movimientos para exportar", "warning");
                }
            }, 100);
        });
    }
}

function setupPDFExport() {
    const btn = document.getElementById('btn-export-pdf');
    if (btn) {
        btn.addEventListener('click', () => {
            // Open Modal instead of direct download
            openPDFModal();
        });
    }

    // Setup Modal Buttons (Cancel & Confirm)
    const btnCancel = document.getElementById('btn-cancel-pdf');
    const btnConfirm = document.getElementById('btn-confirm-pdf');

    if (btnCancel) {
        btnCancel.addEventListener('click', () => {
            const modal = document.getElementById('pdf-filter-modal');
            if (modal) modal.classList.add('hidden');
        });
    }

    if (btnConfirm) {
        btnConfirm.addEventListener('click', () => {
            if (!window.tm || !window.pdfService) return;

            // 1. Get Selected Categories
            const checkboxes = document.querySelectorAll('.checkbox-item input[type="checkbox"]:checked');
            const selectedCategories = Array.from(checkboxes).map(cb => cb.value);

            if (selectedCategories.length === 0) {
                window.showToast("Selecciona al menos una categoría", "warning");
                return;
            }

            // 2. Filter Transactions
            const allTransactions = window.tm.getAll();
            const filteredTransactions = allTransactions.filter(t => selectedCategories.includes(t.category));

            if (filteredTransactions.length === 0) {
                window.showToast("ℹ️ No hay movimientos con las categorías seleccionadas.", "warning");
                return;
            }

            // 3. Recalculate Totals
            let income = 0;
            let expense = 0;
            filteredTransactions.forEach(t => {
                if (t.type === 'income') income += t.amount;
                else expense += t.amount;
            });
            const totals = { income, expense, total: income - expense };

            // 4. Generate PDF
            window.showToast("Generando PDF Personalizado...", "info");

            setTimeout(() => {
                const success = window.pdfService.generatePDF(filteredTransactions, totals);
                if (success) {
                    window.showToast("PDF Generado correctamente", "success");
                    // Close Modal
                    const modal = document.getElementById('pdf-filter-modal');
                    if (modal) modal.classList.add('hidden');
                }
            }, 100);
        });
    }
}

function openPDFModal() {
    if (!window.cm) return;

    const modal = document.getElementById('pdf-filter-modal');
    const list = document.getElementById('pdf-category-list');

    if (!modal || !list) return;

    // 1. Clear List
    list.innerHTML = '';

    // 2. Get Categories & Populate
    const categories = window.cm.getAll();
    if (categories.length === 0) {
        list.innerHTML = '<p>No hay categorías</p>';
    } else {
        categories.forEach(cat => {
            const wrapper = document.createElement('label');
            wrapper.className = 'checkbox-item';

            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.value = cat.name;
            checkbox.checked = true; // Default All checked

            const span = document.createElement('span');
            span.innerText = cat.name;

            wrapper.appendChild(checkbox);
            wrapper.appendChild(span);
            list.appendChild(wrapper);
        });
    }

    // 3. Show Modal
    modal.classList.remove('hidden');
}

function setupLanguageSelector() {
    const btnEs = document.getElementById('lang-es');
    const btnEn = document.getElementById('lang-en');

    if (btnEs) {
        btnEs.addEventListener('click', (e) => {
            e.preventDefault();
            window.i18n.setLanguage('es');
            updateActiveLangButton('es');
            renderCategorySelects(); // Re-render to update translations if we had any (dynamic cats are usually user defined though)
            renderTransactions(); // Re-render transactions for labels
        });
    }

    if (btnEn) {
        btnEn.addEventListener('click', (e) => {
            e.preventDefault();
            window.i18n.setLanguage('en');
            updateActiveLangButton('en');
            renderCategorySelects();
            renderTransactions();
        });
    }

    if (window.i18n) {
        updateActiveLangButton(window.i18n.currentLang);
    }
}

function updateActiveLangButton(lang) {
    document.querySelectorAll('.lang-btn').forEach(btn => btn.classList.remove('active'));
    const activeBtn = document.getElementById(`lang-${lang}`);
    if (activeBtn) activeBtn.classList.add('active');
}

/**
 * Render Selects from CategoryManager
 */
function renderCategorySelects() {
    if (!window.cm) return;
    const categories = window.cm.getAll();

    // 1. Add Form Select
    const addSelect = document.getElementById('category');
    if (addSelect) {
        const currentVal = addSelect.value;
        let html = '<option value="" disabled selected>Selecciona una opción</option>';
        categories.forEach(cat => {
            html += `<option value="${cat.name}">${cat.name}</option>`;
        });
        addSelect.innerHTML = html;
        if (currentVal) addSelect.value = currentVal; // Try to restore selection
    }

    // 2. Transaction Filter Select
    const filterSelect = document.getElementById('category-filter-select');
    if (filterSelect) {
        const currentVal = window.activeCategoryFilter || 'all';
        let html = `<option value="all" ${currentVal === 'all' ? 'selected' : ''}>${window.i18n ? window.i18n.t('filter_all') : 'Todas las Categorías'}</option>`;

        categories.forEach(cat => {
            const isSelected = cat.name === currentVal ? 'selected' : '';
            html += `<option value="${cat.name}" ${isSelected}>${cat.name}</option>`;
        });

        filterSelect.innerHTML = html;

        // Ensure change listener is set ONE time or re-set safely
        filterSelect.onchange = (e) => {
            const val = e.target.value;
            window.activeCategoryFilter = val === 'all' ? null : val;
            renderTransactions();
        };
    }
}

let editingTransactionId = null;

function resetAddForm() {
    const form = document.getElementById('add-form');
    if (form) form.reset();

    editingTransactionId = null;

    // Reset Defaults
    const submitBtn = document.getElementById('btn-save-transaction');
    if (submitBtn) {
        submitBtn.innerText = "Guardar Movimiento";
    } else {
        const formBtn = form ? form.querySelector('button[type="submit"]') : null;
        if (formBtn) formBtn.innerText = "Guardar Movimiento";
    }

    // Reset Title
    const sectionTitle = document.querySelector('#add h2');
    if (sectionTitle) sectionTitle.innerText = "Añadir Movimiento";

    const dateInput = document.getElementById('input-date');
    if (dateInput) dateInput.valueAsDate = new Date();

    const currSel = document.getElementById('currency-selector');
    if (currSel) currSel.value = 'EUR';

    const catSel = document.getElementById('category');
    if (catSel) catSel.value = "";

    const fileInput = document.getElementById('receipt-input');
    if (fileInput && fileInput.previousElementSibling) {
        fileInput.previousElementSibling.innerText = 'Haz clic para subir imagen o PDF';
    }

    const expenseRadio = document.getElementById('type-expense');
    if (expenseRadio) expenseRadio.checked = true;
}

function setupAddForm() {
    const form = document.getElementById('add-form');
    // Date Init
    const dateInput = document.getElementById('input-date');
    if (dateInput && !dateInput.value) dateInput.valueAsDate = new Date();

    // ADD CATEGORY BUTTON
    const btnAddCat = document.getElementById('btn-add-category');
    if (btnAddCat) {
        btnAddCat.onclick = (e) => {
            e.preventDefault(); // Prevent accidental caching
            const modal = document.getElementById('category-modal');
            if (modal) {
                modal.classList.remove('hidden');
                // Focus name input for better UX
                setTimeout(() => {
                    const input = document.getElementById('cat-name-input');
                    if (input) input.focus();
                }, 100);
            }
        };
    }

    if (form) {
        form.addEventListener('submit', async (e) => {
            e.preventDefault();

            const submitBtn = form.querySelector('button[type="submit"]');
            const originalText = submitBtn.innerText;

            const title = document.getElementById('input-title').value;
            let amount = parseFloat(document.getElementById('input-amount').value);
            const currency = document.getElementById('currency-selector').value;

            const typeInput = document.querySelector('input[name="type"]:checked');
            const catSelect = document.getElementById('category');
            const dateVal = document.getElementById('input-date').value;

            // New: Capture File
            const fileInput = document.getElementById('receipt-input');
            const file = fileInput ? fileInput.files[0] : null;

            if (title && amount && typeInput && catSelect.value) {
                try {
                    submitBtn.disabled = true;
                    submitBtn.innerText = 'Procesando...';

                    // Currency Conversion Check
                    if (currency !== 'EUR') {
                        try {
                            const rate = await window.currency.getRate(currency, 'EUR');
                            const converted = amount * rate;
                            const msg = `Se guardarán ${converted.toFixed(2)} EUR.\n(Cambio: 1 ${currency} = ${rate} EUR)`;
                            const userConfirmed = await showConfirmModal(msg);
                            if (!userConfirmed) throw new Error('Operación cancelada por el usuario');
                            amount = converted;
                        } catch (convErr) {
                            if (convErr.message === 'Operación cancelada por el usuario') throw convErr;
                            console.warn('API Error', convErr);
                            window.showToast("Error cambio divisa. Se guarda valor original.", 'info');
                        }
                    }

                    // --- EDIT MODE ---
                    if (editingTransactionId) {
                        // Prepare updates
                        const updates = {
                            title,
                            amount,
                            type: typeInput.value,
                            category: catSelect.value,
                            date: dateVal
                        };

                        // Handle File Upload if NEW file selected
                        if (file) {
                            const fileName = `${Date.now()}_${file.name}`;
                            const { error: upErr } = await window.supabaseClient.storage
                                .from('receipts')
                                .upload(fileName, file);

                            if (upErr) throw upErr;

                            const { data: urlData } = window.supabaseClient.storage
                                .from('receipts')
                                .getPublicUrl(fileName);

                            updates.receipt_url = urlData.publicUrl;
                        }

                        await window.tm.update(editingTransactionId, updates);
                        window.showToast('Movimiento actualizado', 'success');

                    } else {
                        // --- CREATE MODE ---
                        await window.tm.add({
                            title,
                            amount,
                            type: typeInput.value,
                            category: catSelect.value,
                            date: dateVal
                        }, file);
                        window.showToast('Movimiento guardado correctamente', 'success');
                    }

                    // Reset & Navigate
                    resetAddForm();
                    window.router.navigate('home');
                    updateDashboard();
                    renderTransactions();

                } catch (err) {
                    console.error(err);
                    if (err.message !== 'Operación cancelada por el usuario') {
                        window.showToast("Error: " + err.message, 'error');
                    }
                } finally {
                    submitBtn.disabled = false;
                    // Text will be reset by resetAddForm or router
                }
            }
        });
    }
}


// --- RENDERING ---

function updateDashboard() {
    if (!window.tm) return;
    const summary = window.tm.getSummary();

    const balanceEl = document.getElementById('display-balance');
    const incomeEl = document.getElementById('display-income');
    const expenseEl = document.getElementById('display-expense');

    if (balanceEl) balanceEl.innerText = formatCurrency(summary.total);
    if (incomeEl) incomeEl.innerText = formatCurrency(summary.income);
    if (expenseEl) expenseEl.innerText = formatCurrency(summary.expense);

    // Update Chart
    window.chartManager.render(window.tm.getAll());
}

function renderTransactions() {
    if (!window.tm) return;
    let transactions = window.tm.getAll();
    // Logic for loading selects moved to renderCategorySelects()

    // FILTER LOGIC
    if (window.activeCategoryFilter && window.activeCategoryFilter !== 'all') {
        transactions = transactions.filter(t => t.category === window.activeCategoryFilter);
    }

    // Preview
    const previewList = document.getElementById('recent-transactions-list');
    if (previewList) {
        previewList.innerHTML = '';
        if (transactions.length === 0) {
            const msg = window.i18n ? window.i18n.t('empty_state') : 'No transactions';
            previewList.innerHTML = `<div class="empty-state"><p>${msg}</p></div>`;
        } else {
            transactions.slice(0, 3).forEach(t => {
                previewList.appendChild(createTransactionElement(t));
            });
        }
    }

    // Full List
    const fullList = document.getElementById('full-transactions-list');
    if (fullList) {
        fullList.innerHTML = '';

        if (transactions.length === 0) {
            const msg = window.i18n ? window.i18n.t('empty_state') : 'No transactions';

            fullList.innerHTML = `<div class="empty-state"><p>${msg}</p></div>`;
        } else {
            transactions.forEach(t => {
                fullList.appendChild(createTransactionElement(t, true));
            });
        }
    }
}

function createTransactionElement(t, allowDelete = false) {
    const li = document.createElement('li');
    li.className = 'transaction-item';

    // Dynamic left border: green for income, red for expense
    const borderColor = t.type === 'income' ? 'var(--success)' : 'var(--danger)';
    li.style.borderLeftColor = borderColor;

    // 1. Resolve Category Details
    // Attempt to find the full category object from the manager to get icon/color
    // The 't.category' holds the NAME.
    let catObj = null;
    if (window.cm) {
        catObj = window.cm.getAll().find(c => c.name === t.category);
    }

    // Defaults
    let iconClass = catObj && catObj.icon ? catObj.icon : 'fa-tag';
    let colorHex = catObj && catObj.color ? catObj.color : '#6366f1'; // Default Indigo

    // Heuristic Fallback if no custom object found (legacy support or default cats without metadata)
    if (!catObj) {
        const lowerCat = t.category.toLowerCase();
        if (lowerCat.includes('comida') || lowerCat.includes('food')) iconClass = 'fa-utensils';
        else if (lowerCat.includes('transporte')) iconClass = 'fa-bus';
        else if (lowerCat.includes('hogar')) iconClass = 'fa-house';
        else if (lowerCat.includes('ocio')) iconClass = 'fa-gamepad';
        else if (lowerCat.includes('salud')) iconClass = 'fa-heart-pulse';
        else if (lowerCat.includes('educación')) iconClass = 'fa-graduation-cap';
        else if (lowerCat.includes('ingreso') || lowerCat.includes('nómina')) iconClass = 'fa-money-bill-wave';

        // Basic colors for defaults if falling back
        if (iconClass === 'fa-utensils' || iconClass === 'fa-house') colorHex = '#d97706'; // Grocery-like
        else if (iconClass === 'fa-bus') colorHex = '#2563eb';
        else if (iconClass === 'fa-money-bill-wave') colorHex = '#16a34a'; // Salary
        else colorHex = '#9333ea';
    }

    // Amount Styles
    const isIncome = t.type === 'income';
    const amountClass = isIncome ? 'positive' : 'negative';
    const sign = isIncome ? '+' : '-';

    // Apply custom color to icon box
    // Using inline style for dynamic user colors
    const iconStyle = `background-color: ${colorHex}20; color: ${colorHex};`;

    let html = `
        <div class="icon-box" style="${iconStyle}"><i class="fa-solid ${iconClass}"></i></div>
        <div class="details">
            <h4>${t.title}</h4>
            <small>${t.category} • ${formatDate(t.date)}</small>
        </div>
        <div class="price ${amountClass}">${sign} ${formatCurrency(t.amount, false)}</div>
    `;

    // Add Receipt Link
    if (t.receipt_url) {
        html += `
            <a href="${t.receipt_url}" target="_blank" class="delete-btn" style="color: var(--primary-color); display:flex; align-items:center; justify-content:center; text-decoration:none;" title="Ver Recibo">
                <i class="fa-solid fa-paperclip"></i>
            </a>
        `;
    }

    if (allowDelete) {
        li.innerHTML = html + `
            <div class="actions" style="display:flex; gap:8px; margin-left:8px; flex-shrink:0;">
                <button class="edit-btn" role="button" aria-label="Edit" style="background:var(--bg-color); border:1px solid var(--border-color); cursor:pointer; color:var(--text-muted); font-size:1rem; min-width:44px; min-height:44px; border-radius:10px; display:flex; align-items:center; justify-content:center; transition:all 0.15s;">
                    <i class="fa-solid fa-pencil"></i>
                </button>
                <button class="delete-btn" role="button" aria-label="Delete" style="min-width:44px; min-height:44px; border-radius:10px; display:flex; align-items:center; justify-content:center; font-size:1rem; transition:all 0.15s;">
                    <i class="fa-solid fa-trash"></i>
                </button>
            </div>
        `;

        // DELETE Logic
        const delBtn = li.querySelector('button.delete-btn');
        if (delBtn) {
            delBtn.addEventListener('click', async () => {
                const confirmMsg = window.i18n ? window.i18n.t('confirm_delete') : '¿Eliminar movimiento?';
                const userConfirmed = await showConfirmModal(confirmMsg);
                if (userConfirmed) {
                    try {
                        await window.tm.remove(t.id);
                        window.showToast("Movimiento eliminado", 'success');
                        updateDashboard();
                        renderTransactions();
                    } catch (err) {
                        window.showToast("Error al eliminar", 'error');
                    }
                }
            });
        }

        // EDIT Logic
        const editBtn = li.querySelector('button.edit-btn');
        if (editBtn) {
            editBtn.addEventListener('click', () => {
                // 1. Set State
                editingTransactionId = t.id;

                // 2. Populate Form
                const titleInput = document.getElementById('input-title');
                const amountInput = document.getElementById('input-amount');
                const dateInput = document.getElementById('input-date');
                const catSelect = document.getElementById('category');

                if (titleInput) titleInput.value = t.title;
                if (amountInput) amountInput.value = t.amount;
                // Date needs format YYYY-MM-DD
                if (dateInput && t.date) {
                    dateInput.value = t.date.split('T')[0];
                }
                if (catSelect) catSelect.value = t.category;

                // Set Type Radio
                const typeRadio = document.querySelector(`input[name="type"][value="${t.type}"]`);
                if (typeRadio) typeRadio.checked = true;

                // 3. Update UI Text
                const form = document.getElementById('add-form');
                const submitBtn = form ? form.querySelector('button[type="submit"]') : null;
                if (submitBtn) submitBtn.innerText = "Actualizar Movimiento";

                const sectionTitle = document.querySelector('#add h2');
                if (sectionTitle) sectionTitle.innerText = "Editar Movimiento";

                // 4. Navigate
                window.router.navigate('add');
            });
        }

    } else {
        li.innerHTML = html;
    }

    return li;
}

// Helpers
function formatCurrency(amount, withSymbol = true) {
    const formatted = parseFloat(amount).toLocaleString('es-ES', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    });
    return withSymbol ? `€ ${formatted}` : formatted;
}

function formatDate(dateString) {
    if (!dateString) return '';
    const date = new Date(dateString);
    return date.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });
}

// Globals
window.updateDashboard = updateDashboard;
window.renderTransactions = renderTransactions;
window.renderCategorySelects = renderCategorySelects; // Expose

// NEW: Category Modal Logic
function setupCategoryModal() {
    const modal = document.getElementById('category-modal');
    const btnSave = document.getElementById('btn-save-cat');
    const btnCancel = document.getElementById('btn-cancel-cat');
    const nameInput = document.getElementById('cat-name-input');
    const colorInput = document.getElementById('cat-color-input');

    if (!modal) return;

    // Close Modal Helper
    const closeModal = () => {
        modal.classList.add('hidden');
        nameInput.value = ''; // Reset name
        // Reset defaults
        colorInput.value = '#6366f1';
        const defaultIcon = document.querySelector('input[name="icon"][value="fa-tag"]');
        if (defaultIcon) defaultIcon.checked = true;
    };

    // CLOSE ACTIONS
    if (btnCancel) {
        btnCancel.onclick = (e) => {
            e.preventDefault(); // Prevent form submission if inside one
            closeModal();
        };
    }

    // Click outside to close
    modal.onclick = (e) => {
        if (e.target === modal) closeModal();
    };

    // SAVE ACTION
    if (btnSave) {
        btnSave.onclick = async (e) => {
            e.preventDefault();

            // 1. Get Values
            const name = nameInput.value.trim();
            const color = colorInput.value;
            const iconChecked = document.querySelector('input[name="icon"]:checked');
            const icon = iconChecked ? iconChecked.value : 'fa-tag';

            // 2. Validate
            if (!name) {
                window.showToast("⚠️ El nombre de la categoría es obligatorio", "error");
                return;
            }

            // 3. Save
            try {
                const originalText = btnSave.innerText;
                btnSave.innerText = "Guardando...";
                btnSave.disabled = true;

                await window.cm.add(name, icon, color);

                window.showToast("Categoría creada con éxito", 'success');

                // 4. Update UI
                renderCategorySelects();

                // NEW: If we are in Settings > Categories, reload that list
                const settingsCats = document.getElementById('settings-categories');
                if (settingsCats && !settingsCats.classList.contains('hidden')) {
                    renderSettingsCategories();
                }

                // Auto-select the new category in the add form
                const select = document.getElementById('category');
                if (select) select.value = name;

                closeModal();

            } catch (err) {
                console.error(err);
                if (err.message) {
                    window.showToast("Error: " + err.message, 'error');
                } else {
                    window.showToast("Error al guardar categoría", 'error');
                }
            } finally {
                btnSave.innerText = "Guardar";
                btnSave.disabled = false;
            }
        };
    }
}

// --- SETTINGS LOGIC ---
function setupSettingsLogic() {
    // 1. Navigation to Categories
    const btnGoCats = document.getElementById('btn-settings-categories');
    const menu = document.getElementById('settings-menu');
    const catsView = document.getElementById('settings-categories');
    const btnBack = document.getElementById('btn-back-settings');
    const fabAdd = document.getElementById('fab-add-category');

    if (btnGoCats) {
        btnGoCats.addEventListener('click', () => {
            menu.classList.add('hidden');
            catsView.classList.remove('hidden');
            fabAdd.style.display = 'flex'; // Show FAB
            renderSettingsCategories();
        });
    }

    // 2. Back Button
    if (btnBack) {
        btnBack.addEventListener('click', () => {
            catsView.classList.add('hidden');
            menu.classList.remove('hidden');
            fabAdd.style.display = 'none'; // Hide FAB
        });
    }

    // 3. FAB Add Category (Opens existing modal)
    if (fabAdd) {
        fabAdd.addEventListener('click', () => {
            const modal = document.getElementById('category-modal');
            if (modal) {
                modal.classList.remove('hidden');
                // Focus
                setTimeout(() => {
                    const input = document.getElementById('cat-name-input');
                    if (input) input.focus();
                }, 100);
            }
        });
    }
}

function renderSettingsCategories() {
    if (!window.cm) return;
    const list = document.getElementById('categories-management-list');
    if (!list) return;

    list.innerHTML = '';
    const categories = window.cm.getAll();

    categories.forEach(cat => {
        const item = document.createElement('div');
        item.className = 'category-item';

        // Icon & Color
        const iconStyle = `background: ${cat.color}20; color: ${cat.color}; width: 36px; height: 36px; display:flex; align-items:center; justify-content:center; border-radius:10px;`;

        item.innerHTML = `
            <div class="category-info">
                <div style="${iconStyle}">
                    <i class="fa-solid ${cat.icon || 'fa-tag'}"></i>
                </div>
                <span>${cat.name}</span>
            </div>
            <button class="btn-delete-cat" data-id="${cat.id}" title="Eliminar">
                <i class="fa-solid fa-trash"></i>
            </button>
        `;

        // Delete Action
        const delBtn = item.querySelector('.btn-delete-cat');
        delBtn.addEventListener('click', async (e) => {
            e.stopPropagation();

            const confirmed = await showConfirmModal(`¿Eliminar la categoría "${cat.name}"?`);
            if (confirmed) {
                try {
                    await window.cm.remove(cat.id);
                    window.showToast("Categoría eliminada", "success");
                    renderSettingsCategories(); // Refresh list
                    renderCategorySelects(); // Update globals
                } catch (err) {
                    console.error(err);
                    window.showToast("Error al eliminar categoría", "error");
                }
            }
        });

        list.appendChild(item);
    });
}
