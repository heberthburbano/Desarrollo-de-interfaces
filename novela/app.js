// 1. CONFIGURACIÓN DE FIREBASE (Rellena con tus datos reales de la consola de Firebase)
const firebaseConfig = {
    apiKey: "AIzaSyBLq1vH7hqrwNeFexdcxwNQtUW-HvYnZCQ",
    authDomain: "cybernoir-demo.firebaseapp.com",
    projectId: "cybernoir-demo",
    storageBucket: "cybernoir-demo.firebasestorage.app",
    messagingSenderId: "304607551276",
    appId: "1:304607551276:web:8d556feaa6d9aed1351689"
};

// Inicializar Firebase (Evita errores si ya está inicializado)
if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
}
const auth = firebase.auth();
const db = firebase.firestore();
const provider = new firebase.auth.GoogleAuthProvider();

// 2. MOTOR DEL JUEGO
// --- COPIA DESDE AQUÍ HACIA ABAJO ---

class GameEngine {
    constructor(storyData) {
        this.storyData = storyData;
        this.currentUser = null;
        
        // Estado inicial del juego
        this.state = {
            currentSceneId: 'start',
            inventory: []
        };

        // Referencias al DOM principales
        this.container = document.getElementById('comic-container');

        // Iniciar listeners y renderizado
        this.initListeners();
        this.renderScene(this.state.currentSceneId);

        // ESCUCHA DE AUTENTICACIÓN
        // Usamos .bind(this) para no perder la referencia a la clase
        auth.onAuthStateChanged(this.handleAuthState.bind(this));
    }

    // ==========================================
    // 1. LÓGICA DEL JUEGO (Renderizado)
    // ==========================================
    renderScene(sceneId) {
        const scene = this.storyData[sceneId];
        if (!scene) return console.error(`Escena ${sceneId} no encontrada`);

        this.state.currentSceneId = sceneId;

        // Limpiar contenedor
        this.container.innerHTML = '';
        this.container.className = `comic-container ${scene.layout}`;

        // Renderizar Paneles
        scene.panels.forEach(panel => {
            const div = document.createElement('div');
            div.className = 'panel';
            if (panel.style) div.style = panel.style;

            if (panel.type === 'image') {
                div.innerHTML = `
                    <img src="${panel.src}" alt="Panel">
                    ${panel.caption ? `<div class="panel-caption">${panel.caption}</div>` : ''}
                `;
            } else if (panel.type === 'text') {
                div.innerHTML = `<div style="padding:20px; font-size:1.1rem;">${panel.content.replace(/\n/g, '<br>')}</div>`;
            }
            this.container.appendChild(div);
        });

        // Renderizar Decisiones
        if (scene.choices) {
            const choicesContainer = document.createElement('div');
            choicesContainer.className = 'choices-container';
            
            scene.choices.forEach(choice => {
                const btn = document.createElement('button');
                btn.className = 'btn-primary';
                btn.textContent = choice.text;
                btn.onclick = () => this.renderScene(choice.target);
                choicesContainer.appendChild(btn);
            });
            this.container.appendChild(choicesContainer);
        }
    }

    // ==========================================
    // 2. GESTIÓN DE UI (Usuario y Modales)
    // ==========================================
    
    // Controla qué se muestra en la barra de navegación
    handleAuthState(user) {
        const btnLogin = document.getElementById('btn-login');
        const userInfo = document.getElementById('user-info');
        const btnSave = document.getElementById('btn-save-cloud');
        const btnLoad = document.getElementById('btn-load-cloud');

        if (user) {
            this.currentUser = user;
            btnLogin.style.display = 'none';
            userInfo.style.display = 'flex';
            document.getElementById('user-name').textContent = user.displayName || user.email;
            document.getElementById('user-photo').src = user.photoURL || "https://placehold.co/30";
            
            // Habilitar botones nube
            btnSave.disabled = false;
            btnLoad.disabled = false;
            btnSave.style.opacity = "1";
            btnLoad.style.opacity = "1";
            
            // Si el modal de login seguía abierto, lo cerramos
            this.closeLoginModal();
        } else {
            this.currentUser = null;
            btnLogin.style.display = 'block';
            userInfo.style.display = 'none';
            
            // Deshabilitar botones nube
            btnSave.disabled = true;
            btnLoad.disabled = true;
            btnSave.style.opacity = "0.5";
            btnLoad.style.opacity = "0.5";
        }
    }

    // Modal de Login/Registro
    openLoginModal() {
        document.getElementById('modal-login').showModal();
    }

    closeLoginModal() {
        document.getElementById('modal-login').close();
    }

    // Modal de Importar/Exportar
    openModal(mode) {
        this.modalMode = mode;
        const modal = document.getElementById('modal-share');
        const input = document.getElementById('modal-input');
        const title = document.getElementById('modal-title');
        
        modal.showModal();

        if (mode === 'export') {
            title.textContent = "Copiar Código";
            const jsonState = JSON.stringify(this.state);
            input.value = btoa(jsonState); 
            input.select();
        } else {
            title.textContent = "Pegar Código";
            input.value = "";
            input.placeholder = "Pega aquí tu código...";
            input.focus();
        }
    }

    closeModal() {
        document.getElementById('modal-share').close();
    }

    // ==========================================
    // 3. MÉTODOS DE AUTENTICACIÓN (NUEVOS)
    // ==========================================

    async loginWithGoogle() {
        try {
            await auth.signInWithPopup(provider);
            // El handleAuthState se encargará de cerrar el modal
        } catch (error) {
            console.error(error);
            alert("Error Google: " + error.message);
        }
    }

    async loginWithEmail() {
        const email = document.getElementById('input-email').value;
        const pass = document.getElementById('input-pass').value;

        if (!email || !pass) return alert("Rellena email y contraseña");

        try {
            await auth.signInWithEmailAndPassword(email, pass);
        } catch (error) {
            let msg = "Error al entrar.";
            if (error.code === 'auth/user-not-found') msg = "Usuario no encontrado.";
            if (error.code === 'auth/wrong-password') msg = "Contraseña incorrecta.";
            if (error.code === 'auth/invalid-email') msg = "Email inválido.";
            alert("❌ " + msg);
        }
    }

    async registerWithEmail() {
        const email = document.getElementById('input-email').value;
        const pass = document.getElementById('input-pass').value;

        if (!email || !pass) return alert("Rellena todos los campos");
        if (pass.length < 6) return alert("La contraseña debe tener 6 caracteres o más");

        try {
            const result = await auth.createUserWithEmailAndPassword(email, pass);
            // Nombre por defecto
            await result.user.updateProfile({ displayName: "Agente Nuevo" });
            alert("✅ Usuario registrado correctamente");
            // La página detectará el login automáticamente
        } catch (error) {
            let msg = "Error al registrar.";
            if (error.code === 'auth/email-already-in-use') msg = "El correo ya existe.";
            alert("⚠️ " + msg);
        }
    }

    async logout() {
        await auth.signOut();
        // Opcional: Recargar página
        // window.location.reload();
    }

    // ==========================================
    // 4. GUARDADO EN NUBE Y LOCAL
    // ==========================================

    async saveToCloud() {
        if (!this.currentUser) return alert("Inicia sesión primero.");
        const userId = this.currentUser.uid;
        
        try {
            await db.collection('partidas').doc(userId).set({
                ...this.state,
                savedAt: firebase.firestore.FieldValue.serverTimestamp(),
                userEmail: this.currentUser.email
            });
            alert("☁️ Partida guardada.");
        } catch (e) {
            console.error(e);
            alert("Error al guardar: " + e.message);
        }
    }

    async loadFromCloud() {
        if (!this.currentUser) return;
        try {
            const doc = await db.collection('partidas').doc(this.currentUser.uid).get();
            if (doc.exists) {
                const data = doc.data();
                this.state = data; // Restaurar estado
                this.renderScene(this.state.currentSceneId); // Pintar escena
                alert("📂 Partida cargada.");
            } else {
                alert("No hay partidas guardadas.");
            }
        } catch (e) {
            console.error(e);
            alert("Error al cargar.");
        }
    }

    handleModalAction() {
        // Lógica del botón "Confirmar" del modal de Importar/Exportar
        if (this.modalMode === 'export') {
            this.closeModal();
        } else {
            try {
                const input = document.getElementById('modal-input');
                const jsonState = atob(input.value.trim());
                const newState = JSON.parse(jsonState);
                if (newState.currentSceneId) {
                    this.state = newState;
                    this.renderScene(this.state.currentSceneId);
                    alert("✅ Partida importada.");
                    this.closeModal();
                }
            } catch (e) {
                alert("❌ Código inválido.");
            }
        }
    }

    // ==========================================
    // 5. INICIALIZAR EVENTOS (LISTENERS)
    // ==========================================
    initListeners() {
        // --- BARRA DE NAVEGACIÓN ---
        // Botón "G Login" -> Abre el modal
        const btnLogin = document.getElementById('btn-login');
        if (btnLogin) btnLogin.addEventListener('click', () => this.openLoginModal());

        const btnLogout = document.getElementById('btn-logout');
        if (btnLogout) btnLogout.addEventListener('click', () => this.logout());

        // --- BOTONES DE LA NUBE ---
        document.getElementById('btn-save-cloud').addEventListener('click', () => this.saveToCloud());
        document.getElementById('btn-load-cloud').addEventListener('click', () => this.loadFromCloud());

        // --- BOTONES LOCALES (EXP/IMP) ---
        document.getElementById('btn-export').addEventListener('click', () => this.openModal('export'));
        document.getElementById('btn-import').addEventListener('click', () => this.openModal('import'));

        // --- MODAL DE LOGIN (NUEVO) ---
        document.getElementById('btn-do-login').addEventListener('click', () => this.loginWithEmail());
        document.getElementById('btn-do-register').addEventListener('click', () => this.registerWithEmail());
        document.getElementById('btn-do-google').addEventListener('click', () => this.loginWithGoogle());
        document.getElementById('btn-close-login').addEventListener('click', () => this.closeLoginModal());

        // --- MODAL DE IMPORTAR/EXPORTAR ---
        document.getElementById('btn-modal-close').addEventListener('click', () => this.closeModal());
        document.getElementById('btn-modal-action').addEventListener('click', () => this.handleModalAction());
    }
}

// Arrancar la app
    document.addEventListener('DOMContentLoaded', () => {
    if (typeof STORY_DATA !== 'undefined') {
            const game = new GameEngine(STORY_DATA);
        } else {
            console.error("Falta story-data.js");
    }
});