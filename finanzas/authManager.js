class AuthManager {
    constructor() {
        this.client = window.supabaseClient;
    }

    async signUp(email, password) {
        const { data, error } = await this.client.auth.signUp({
            email,
            password,
        });
        if (error) throw error;
        return data;
    }

    async signIn(email, password) {
        const { data, error } = await this.client.auth.signInWithPassword({
            email,
            password,
        });
        if (error) throw error;
        return data;
    }

    async signOut() {
        const { error } = await this.client.auth.signOut();
        if (error) throw error;
    }

    async getUser() {
        const { data: { user } } = await this.client.auth.getUser();
        return user;
    }

    // Listener for auth state changes
    onAuthStateChange(callback) {
        this.client.auth.onAuthStateChange((event, session) => {
            callback(event, session);
        });
    }
}

window.AuthManager = AuthManager;
