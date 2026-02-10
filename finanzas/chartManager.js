class ChartManager {
    constructor() {
        this.chartInstance = null;
        this.ctx = null;
        this.filterEl = null;
        this.currentType = 'expense';
        this.labels = [];
    }

    init() {
        this.ctx = document.getElementById('expenseChart');
        this.filterEl = document.getElementById('chart-filter');

        // Type Tabs
        const tabs = document.querySelectorAll('.chart-tab');
        tabs.forEach(tab => {
            tab.addEventListener('click', (e) => {
                // Update active state
                tabs.forEach(t => t.classList.remove('active'));
                e.target.classList.add('active');

                // Update type and render
                this.currentType = e.target.dataset.type;
                if (window.tm) {
                    this.render(window.tm.getAll());
                }
            });
        });

        if (this.filterEl) {
            this.filterEl.addEventListener('change', () => {
                if (window.tm) {
                    this.render(window.tm.getAll());
                }
            });
        }

        // Filter Pills (mobile-native replacement for select)
        const pillContainer = document.getElementById('chart-filter-pills');
        if (pillContainer) {
            pillContainer.addEventListener('click', (e) => {
                const pill = e.target.closest('.filter-pill');
                if (!pill) return;

                // Update active pill
                pillContainer.querySelectorAll('.filter-pill').forEach(p => p.classList.remove('active'));
                pill.classList.add('active');

                // Sync hidden select
                if (this.filterEl) {
                    this.filterEl.value = pill.dataset.value;
                    this.filterEl.dispatchEvent(new Event('change'));
                }
            });
        }
    }

    filterData(transactions, filterType) {
        const now = new Date();
        const currentMonth = now.getMonth();
        const currentYear = now.getFullYear();

        return transactions.filter(t => {
            if (t.type !== this.currentType) return false;

            const tDate = new Date(t.date);
            const timeDiff = now.getTime() - tDate.getTime();
            const daysDiff = timeDiff / (1000 * 3600 * 24);

            if (filterType === 'day') {
                return tDate.toDateString() === now.toDateString();
            } else if (filterType === 'week') {
                return daysDiff <= 7 && daysDiff >= 0;
            } else if (filterType === 'month') {
                return tDate.getMonth() === currentMonth && tDate.getFullYear() === currentYear;
            } else if (filterType === 'quarter') {
                // Last 90 days appx
                return daysDiff <= 90 && daysDiff >= 0;
            } else {
                return true; // All
            }
        });
    }

    render(transactions) {
        if (!this.ctx) return;

        const filterType = this.filterEl ? this.filterEl.value : 'month';
        const filtered = this.filterData(transactions, filterType);

        // Group by category
        const totals = {};
        filtered.forEach(t => {
            totals[t.category] = (totals[t.category] || 0) + parseFloat(t.amount);
        });

        // Store labels for drill-down
        const categories = Object.keys(totals);
        this.labels = categories; // Key names for internal use

        // Dynamic Labels & Colors
        const displayLabels = [];
        const bgColors = [];

        categories.forEach(catName => {
            // Find category object in manager
            let catObj = null;
            if (window.cm) {
                catObj = window.cm.getAll().find(c => c.name === catName);
            }

            // 1. Label
            // Use the name directly as it is user-defined
            displayLabels.push(catName);

            // 2. Color
            // Use custom color or fallback
            if (catObj && catObj.color) {
                bgColors.push(catObj.color);
            } else {
                // Heuristic Fallback (matching main.js logic for consistency)
                const lowerCat = catName.toLowerCase();
                if (lowerCat.includes('comida') || lowerCat.includes('food')) bgColors.push('#d97706');
                else if (lowerCat.includes('transporte')) bgColors.push('#2563eb');
                else if (lowerCat.includes('hogar')) bgColors.push('#d97706');
                else if (lowerCat.includes('ocio')) bgColors.push('#9333ea');
                else if (lowerCat.includes('salud')) bgColors.push('#ef4444');
                else if (lowerCat.includes('educación')) bgColors.push('#10b981');
                else if (lowerCat.includes('ingreso') || lowerCat.includes('nómina')) bgColors.push('#16a34a');
                else bgColors.push('#6366f1'); // Default Indigo
            }
        });

        const data = Object.values(totals);

        if (this.chartInstance) {
            this.chartInstance.destroy();
        }

        if (data.length === 0) {
            this.chartInstance = new Chart(this.ctx, {
                type: 'doughnut',
                data: {
                    labels: ['Sin datos'],
                    datasets: [{
                        data: [1],
                        backgroundColor: ['#e2e8f0'],
                        borderWidth: 0
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: { legend: { display: false }, tooltip: { enabled: false } },
                    events: []
                }
            });
            return;
        }

        this.chartInstance = new Chart(this.ctx, {
            type: 'doughnut',
            data: {
                labels: displayLabels,
                datasets: [{
                    label: this.currentType === 'expense' ? 'Gastos' : 'Ingresos',
                    data: data,
                    backgroundColor: bgColors,
                    borderWidth: 2,
                    borderColor: '#ffffff',
                    hoverOffset: 4
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                onClick: (e, elements) => {
                    if (elements.length > 0) {
                        const index = elements[0].index;
                        const category = this.labels[index];
                        if (window.filterTransactionByCategory) {
                            window.filterTransactionByCategory(category);
                        }
                    }
                },
                plugins: {
                    legend: {
                        position: 'right',
                        labels: {
                            font: { family: "'Outfit', sans-serif" },
                            usePointStyle: true,
                            boxWidth: 8
                        }
                    },
                    tooltip: {
                        callbacks: {
                            label: function (context) {
                                let label = context.label || '';
                                if (label) label += ': ';
                                if (context.parsed !== null) {
                                    label += new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(context.parsed);
                                }
                                return label;
                            }
                        }
                    }
                },
                cutout: '65%'
            }
        });
    }
}
