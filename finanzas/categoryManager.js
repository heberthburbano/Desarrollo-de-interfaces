/**
 * CategoryManager
 * Handles dynamic categories from Supabase
 */
class CategoryManager {
    constructor() {
        this.categories = [];
        this.tableName = 'categories';
    }

    /**
     * Initializes categories.
     * Fetches from DB. If empty, inserts defaults.
     */
    async init() {
        try {
            // 1. Fetch existing
            const { data, error } = await window.supabaseClient
                .from(this.tableName)
                .select('*')
                .order('name', { ascending: true });

            if (error) throw error;

            this.categories = data || [];

            // 2. Check if empty (New User / Fresh DB)
            if (this.categories.length === 0) {
                console.log("No categories found. Creating defaults...");
                await this.createDefaults();
            } else {
                console.log(`Loaded ${this.categories.length} categories.`);
            }

        } catch (err) {
            console.error("Error initializing CategoryManager:", err);
            // Fallback to local defaults if DB fails so app doesn't break
            this.categories = [
                { id: 'default-1', name: 'Hogar' },
                { id: 'default-2', name: 'Comida' },
                { id: 'default-3', name: 'Transporte' },
                { id: 'default-4', name: 'Ocio' },
                { id: 'default-5', name: 'Salud' },
                { id: 'default-6', name: 'Educación' },
                { id: 'default-7', name: 'Ingresos' } // Unified list as per plan
            ];
        }
    }

    /**
     * Inserts default categories for a new user
     */
    async createDefaults() {
        const defaults = ['Hogar', 'Comida', 'Transporte', 'Ocio', 'Salud', 'Educación', 'Ingresos'];

        // Prepare objects for insertion
        // Note: Assuming 'user_id' is handled by RLS (Row Level Security) or defaults to authenticated user usually.
        // If the table has a user_id column and RLS is on, simple insert works.
        // We'll map them to objects.
        const objects = defaults.map(name => ({ name }));

        const { data, error } = await window.supabaseClient
            .from(this.tableName)
            .insert(objects)
            .select();

        if (error) {
            console.error("Error creating default categories:", error);
            return;
        }

        // Update local cache
        if (data) {
            this.categories = data.sort((a, b) => a.name.localeCompare(b.name));
        }
    }

    /**
     * Returns cached categories
     */
    getAll() {
        return this.categories;
    }

    /**
     * Adds a new category
     * @param {string} name 
     */
    async add(name, icon = 'fa-tag', color = '#6366f1') {
        if (!name) return null;

        try {
            // RLS FIX: Get Data of User
            const { data: { user } } = await window.supabaseClient.auth.getUser();
            if (!user) throw new Error("User not authenticated");

            const { data, error } = await window.supabaseClient
                .from(this.tableName)
                .insert([{
                    name,
                    icon,
                    color,
                    user_id: user.id // Critical for RLS
                }])
                .select(); // SIN .single()

            if (error) {
                throw error;
            }

            // Handle Array or Object response
            const newCategory = Array.isArray(data) ? data[0] : data;

            if (newCategory) {
                this.categories.push(newCategory);
                this.categories.sort((a, b) => a.name.localeCompare(b.name));
                return newCategory;
            }
        } catch (err) {
            console.error("Error adding category:", err);
            throw err;
        }
        return null;
    }

    /**
     * Optional: Removes a category
     */
    async remove(id) {
        const { error } = await window.supabaseClient
            .from(this.tableName)
            .delete()
            .eq('id', id);

        if (error) throw error;

        this.categories = this.categories.filter(c => c.id !== id);
    }
}
