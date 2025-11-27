import { auth, db } from './firebase-config.js';
import { 
    createUserWithEmailAndPassword, 
    signInWithEmailAndPassword,
    onAuthStateChanged,
    signOut,
    updateProfile
} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js';
import { doc, setDoc } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';

// Elementos del DOM
const authContainer = document.getElementById('auth-container');
const appContainer = document.getElementById('app-container');
const loginForm = document.getElementById('login-form');
const registerForm = document.getElementById('register-form');
const authError = document.getElementById('auth-error');

// Botones de navegación entre formularios
document.getElementById('show-register').addEventListener('click', (e) => {
    e.preventDefault();
    loginForm.style.display = 'none';
    registerForm.style.display = 'block';
    authError.textContent = '';
});

document.getElementById('show-login').addEventListener('click', (e) => {
    e.preventDefault();
    registerForm.style.display = 'none';
    loginForm.style.display = 'block';
    authError.textContent = '';
});

// Registro de usuario
document.getElementById('register-btn').addEventListener('click', async () => {
    const name = document.getElementById('register-name').value.trim();
    const email = document.getElementById('register-email').value.trim();
    const password = document.getElementById('register-password').value;

    if (!name || !email || !password) {
        authError.textContent = 'Por favor completa todos los campos';
        return;
    }

    if (password.length < 6) {
        authError.textContent = 'La contraseña debe tener al menos 6 caracteres';
        return;
    }

    try {
        // Crear usuario en Firebase Auth
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        
        // Actualizar perfil con el nombre
        await updateProfile(userCredential.user, { displayName: name });
        
        // Crear documento de usuario en Firestore
        await setDoc(doc(db, 'users', userCredential.user.uid), {
            name: name,
            email: email,
            createdAt: new Date().toISOString()
        });
        
        authError.textContent = '';
    } catch (error) {
        console.error('Error al registrar:', error);
        authError.textContent = getErrorMessage(error.code);
    }
});

// Inicio de sesión
document.getElementById('login-btn').addEventListener('click', async () => {
    const email = document.getElementById('login-email').value.trim();
    const password = document.getElementById('login-password').value;

    if (!email || !password) {
        authError.textContent = 'Por favor completa todos los campos';
        return;
    }

    try {
        await signInWithEmailAndPassword(auth, email, password);
        authError.textContent = '';
    } catch (error) {
        console.error('Error al iniciar sesión:', error);
        authError.textContent = getErrorMessage(error.code);
    }
});

// Cerrar sesión
document.getElementById('logout-btn').addEventListener('click', async () => {
    try {
        await signOut(auth);
    } catch (error) {
        console.error('Error al cerrar sesión:', error);
    }
});

// Observer de autenticación - detecta cambios en el estado de autenticación
onAuthStateChanged(auth, (user) => {
    if (user) {
        // Usuario autenticado - mostrar app
        authContainer.style.display = 'none';
        appContainer.style.display = 'block';
        document.getElementById('user-name').textContent = user.displayName || user.email;
        
        // Disparar evento personalizado para que app.js cargue los datos
        window.dispatchEvent(new CustomEvent('user-authenticated', { detail: { user } }));
    } else {
        // Usuario no autenticado - mostrar login
        authContainer.style.display = 'flex';
        appContainer.style.display = 'none';
    }
});

// Función auxiliar para traducir códigos de error
function getErrorMessage(errorCode) {
    const errors = {
        'auth/email-already-in-use': 'Este correo ya está registrado',
        'auth/invalid-email': 'Correo electrónico inválido',
        'auth/operation-not-allowed': 'Operación no permitida',
        'auth/weak-password': 'La contraseña es muy débil',
        'auth/user-disabled': 'Usuario deshabilitado',
        'auth/user-not-found': 'Usuario no encontrado',
        'auth/wrong-password': 'Contraseña incorrecta',
        'auth/too-many-requests': 'Demasiados intentos. Intenta más tarde'
    };
    return errors[errorCode] || 'Error al autenticar. Intenta nuevamente';
}

export { auth };
