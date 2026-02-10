/**
 * PDFService
 * Generates PDF reports using jsPDF and AutoTable
 */
class PDFService {
    constructor() {
        // Ensure jsPDF is loaded
        if (!window.jspdf) {
            console.error("jsPDF script not loaded");
        }
    }

    /**
     * Generate PDF Report
     * @param {Array} transactions 
     * @param {Object} totals { income, expense, total }
     */
    generatePDF(transactions, totals) {
        if (!window.jspdf) {
            alert('Librería PDF no cargada. Recarga la página.');
            return;
        }

        const { jsPDF } = window.jspdf;
        const doc = new jsPDF();

        // --- HEADER ---
        doc.setFontSize(22);
        doc.setTextColor(99, 102, 241); // Indigo Primary
        doc.text("Informe Financiero", 14, 20);

        doc.setFontSize(10);
        doc.setTextColor(100);
        doc.text(`Generado el: ${new Date().toLocaleDateString('es-ES')} ${new Date().toLocaleTimeString('es-ES')}`, 14, 28);
        doc.text("Mi Billetera App", 14, 33);

        // --- SUMMARY SECTION ---
        // Draw Box
        doc.setDrawColor(220);
        doc.setFillColor(245, 247, 255);
        doc.roundedRect(14, 40, 180, 25, 3, 3, 'FD');

        // Balances
        doc.setFontSize(12);
        doc.setTextColor(50);

        doc.text(`Ingresos:`, 20, 52);
        doc.text(`Gastos:`, 80, 52);
        doc.text(`Balance:`, 140, 52);

        doc.setFont("helvetica", "bold");
        doc.setTextColor(22, 163, 74); // Green
        doc.text(`€ ${totals.income.toFixed(2)}`, 20, 59);

        doc.setTextColor(220, 38, 38); // Red
        doc.text(`€ ${totals.expense.toFixed(2)}`, 80, 59);

        const balanceColor = totals.total >= 0 ? [22, 163, 74] : [220, 38, 38];
        doc.setTextColor(...balanceColor);
        doc.text(`€ ${totals.total.toFixed(2)}`, 140, 59);

        // --- TRANSACTIONS TABLE ---
        doc.setFont("helvetica", "normal");
        doc.setTextColor(0);

        // Prepare Data
        const tableBody = transactions.map(t => [
            new Date(t.date).toLocaleDateString('es-ES'),
            t.title,
            t.category,
            t.type === 'income' ? 'Ingreso' : 'Gasto',
            `€ ${parseFloat(t.amount).toFixed(2)}`
        ]);

        doc.autoTable({
            startY: 75,
            head: [['Fecha', 'Concepto', 'Categoría', 'Tipo', 'Cantidad']],
            body: tableBody,
            headStyles: {
                fillColor: [99, 102, 241],
                fontSize: 11,
                fontStyle: 'bold'
            },
            styles: {
                fontSize: 10,
                cellPadding: 3
            },
            alternateRowStyles: {
                fillColor: [249, 250, 251]
            },
            columnStyles: {
                4: { halign: 'right', fontStyle: 'bold' } // Amount column
            },
            didDrawPage: (data) => {
                // Footer Page Number
                doc.setFontSize(10);
                doc.setTextColor(150);
                doc.text(
                    `Página ${doc.internal.getNumberOfPages()}`,
                    data.settings.margin.left,
                    doc.internal.pageSize.height - 10
                );
            }
        });

        // --- SAVE ---
        const fileName = `informe_finanzas_${new Date().toISOString().split('T')[0]}.pdf`;
        doc.save(fileName);
        return true;
    }
}

// Make globally available
window.PDFService = PDFService;
