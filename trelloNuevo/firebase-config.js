// Importar funciones necesarias del SDK de Firebase v9
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js';
import { getAuth } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js';
import { getFirestore } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';

// REEMPLAZA ESTO CON TU CONFIGURACIÓN DE FIREBASE
// La obtienes de Firebase Console -> Configuración del proyecto -> Tu app web
const firebaseConfig = {
  apiKey: "AIzaSyDUwexNK1QdNvmR6qxfpbGh3RL3UZ-hvGM",
  authDomain: "trello-colaborativo-4a252.firebaseapp.com",
  projectId: "trello-colaborativo-4a252",
  storageBucket: "trello-colaborativo-4a252.firebasestorage.app",
  messagingSenderId: "275354260370",
  appId: "1:275354260370:web:102d72a0f33b2ce0fb274b",
  measurementId: "G-WPF2PW401C"
};

// Inicializar Firebase
const app = initializeApp(firebaseConfig);

// Inicializar servicios
const auth = getAuth(app);
const db = getFirestore(app);

// Exportar para usar en otros archivos
export { auth, db };
