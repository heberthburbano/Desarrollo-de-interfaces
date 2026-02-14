/**
 * TransactionManager (Supabase Version)
 * Handles Cloud Data Persistence
 */
class TransactionManager {
    constructor() {
        this.client = window.supabaseClient;
        this.transactions = []; // Local cache
        this.initialized = false;
    }

    /**
     * Initialize: Fetch data from Cloud
     */
    async init() {
        try {
            const { data: { user } } = await this.client.auth.getUser();
            if (!user) return; // No user, no data

            const { data, error } = await this.client
                .from('transactions')
                .select('*')
                .order('date', { ascending: false }); // Newest first

            if (error) throw error;

            this.transactions = data || [];
            this.initialized = true;
        } catch (err) {
            console.error('Error loading transactions:', err);
            // Fallback or Alert could go here
        }
    }

    /**
     * Upload a receipt file to Supabase Storage (Fortified for Mobile)
     * Validates type, size, and sanitizes the filename.
     * @param {File} file - The file to upload
     * @returns {string} publicUrl of the uploaded file
     */
    async uploadReceipt(file) {
        // 1. Validate File Type
        const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'application/pdf'];
        if (!allowedTypes.includes(file.type)) {
            throw new Error('Tipo de archivo no permitido. Solo imágenes (JPG, PNG, WEBP) o PDF.');
        }

        // 2. Validate File Size (Max 5MB)
        const MAX_SIZE = 5 * 1024 * 1024; // 5MB
        if (file.size > MAX_SIZE) {
            throw new Error('⚠️ La imagen es muy pesada (Máx 5MB). Intenta con una foto más ligera.');
        }

        // 3. Get current user for folder path
        const { data: { user } } = await this.client.auth.getUser();
        if (!user) throw new Error('User not logged in');

        // 4. Generate safe filename (Timestamp + clean extension)
        const fileExt = file.name.split('.').pop().toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg';
        const fileName = `${user.id}/${Date.now()}.${fileExt}`;

        // 5. Upload
        const { error: uploadError } = await this.client.storage
            .from('receipts')
            .upload(fileName, file, { upsert: false });

        if (uploadError) throw uploadError;

        // 6. Get and return public URL
        const { data: urlData } = this.client.storage
            .from('receipts')
            .getPublicUrl(fileName);

        return urlData.publicUrl;
    }

    /**
     * Add a new transaction (Wait for DB)
     */
    async add(transaction, file) {
        try {
            const { data: { user } } = await this.client.auth.getUser();
            if (!user) throw new Error('User not logged in');

            let receiptUrl = null;

            // 1. Upload File if exists (using fortified method)
            if (file) {
                receiptUrl = await this.uploadReceipt(file);
            }

            const payload = {
                title: transaction.title,
                amount: parseFloat(transaction.amount),
                type: transaction.type,
                category: transaction.category,
                date: transaction.date || new Date().toISOString(),
                user_id: user.id, // Foreign Key
                receipt_url: receiptUrl
            };

            // Insert and return Single object
            const { data, error } = await this.client
                .from('transactions')
                .insert([payload])
                .select()
                .single();

            if (error) throw error;

            // Success: Add real DB object to local cache
            this.transactions.unshift(data);
            return data;

        } catch (err) {
            console.error('Error adding transaction:', err);
            throw err;
        }
    }

    /**
     * Remove a transaction from Cloud
     */
    async remove(id) {
        try {
            // Optimistic Update (Optional) - Removing locally first improves perceived speed
            // But if it fails, we should rollback. For now, doing parallel.

            const { error } = await this.client
                .from('transactions')
                .delete()
                .eq('id', id);

            if (error) throw error;

            // Update local cache
            this.transactions = this.transactions.filter(t => t.id !== id);

        } catch (err) {
            console.error('Error deleting transaction:', err);
            throw err; // Let main.js handle UI
        }
    }

    /**
     * Get all currently loaded transactions
     */
    getAll() {
        return this.transactions;
    }

    /**
     * Update a transaction
     */
    async update(id, updates) {
        try {
            const { data: { user } } = await this.client.auth.getUser();
            if (!user) throw new Error('User not logged in');

            // 1. Update in Supabase
            const { data, error } = await this.client
                .from('transactions')
                .update(updates)
                .eq('id', id)
                .select(); // SIN .single()

            if (error) throw error;

            // Handle Array response manual check
            const updatedTransaction = (Array.isArray(data) && data.length > 0) ? data[0] : null;

            if (!updatedTransaction) {
                throw new Error("No se pudo actualizar la transacción (ID no encontrado o permisos insuficientes).");
            }

            // 2. Update Local Cache
            const index = this.transactions.findIndex(t => t.id === id);
            if (index !== -1) {
                // Merge updates into local object
                this.transactions[index] = { ...this.transactions[index], ...updatedTransaction };

                // Re-sort if date changed
                if (updates.date) {
                    this.transactions.sort((a, b) => new Date(b.date) - new Date(a.date));
                }
            }

            return updatedTransaction;
        } catch (err) {
            console.error('Error updating transaction:', err);
            throw err;
        }
    }

    /**
     * Export transactions to CSV
     */
    exportToCSV() {
        if (!this.transactions || this.transactions.length === 0) {
            return false;
        }

        // 1. Headers
        const headers = ['Fecha', 'Título', 'Cantidad', 'Tipo', 'Categoría'];
        const rows = [];

        // Add Headers
        rows.push(headers.join(','));

        // 2. Data
        this.transactions.forEach(t => {
            const date = new Date(t.date).toLocaleDateString('es-ES'); // DD/MM/YYYY
            const type = t.type === 'income' ? 'Ingreso' : 'Gasto';
            const cleanTitle = t.title ? t.title.replace(/,/g, ' ') : ''; // Avoid CSV break

            // Format: Date, Title, Amount, Type, Category
            const row = [
                date,
                cleanTitle,
                t.amount.toFixed(2),
                type,
                t.category || ''
            ];
            rows.push(row.join(','));
        });

        // 3. Join
        const csvContent = rows.join('\n');

        // 4. Download Trigger (with BOM for Excel)
        const blob = new Blob(["\uFEFF" + csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.setAttribute("href", url);
        link.setAttribute("download", `mis_finanzas_${new Date().toISOString().split('T')[0]}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        return true;
    }

    /**
     * Get financial summary
     */
    getSummary() {
        let income = 0;
        let expense = 0;

        this.transactions.forEach(t => {
            if (t.type === 'income') {
                income += t.amount;
            } else {
                expense += t.amount;
            }
        });

        return {
            income,
            expense,
            total: income - expense
        };
    }
}

// Make globally available
window.TransactionManager = TransactionManager;
