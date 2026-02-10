const SUPABASE_URL = "https://gvjqqaccgxnphagzzvjb.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imd2anFxYWNjZ3hucGhhZ3p6dmpiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjkzNTcxMjksImV4cCI6MjA4NDkzMzEyOX0.VnayThYPVSnj-OD-pgoyfGI8Andldx4kPy7lM9ZWtpo";

// Verificación de seguridad
if (!window.supabase) {
    console.error("CRITICAL: La librería de Supabase no se ha cargado desde el CDN.");
} else {
    // Usamos 'client' para evitar conflicto de nombres con la variable global 'supabase'
    const client = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

    // Exponemos el cliente globalmente para que AuthManager y TransactionManager lo usen
    window.supabaseClient = client;

    console.log("✅ Supabase Client inicializado correctamente.");
}
