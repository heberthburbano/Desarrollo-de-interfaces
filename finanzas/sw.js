/**
 * Service Worker - Finanzas App
 * Estrategia: Cache First para App Shell, Network Only para API (Supabase)
 */

const CACHE_NAME = 'finanzas-app-v1';

const ASSETS_TO_CACHE = [
    './',
    './index.html',
    './style.css',
    './main.js',
    './router.js',
    './transactionManager.js',
    './categoryManager.js',
    './chartManager.js',
    './currencyService.js',
    './authManager.js',
    './supabaseClient.js',
    './pdfService.js',
    './toast.js',
    './i18n.js',
    './manifest.json',
    './assets/icon-192.png',
    './assets/icon-512.png',
    // CDN Libraries
    'https://cdn.jsdelivr.net/npm/chart.js',
    'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css',
    'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js',
    'https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.5.31/jspdf.plugin.autotable.min.js',
    'https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700&display=swap'
];

// ============================================
// INSTALL: Descarga y cachea el App Shell
// ============================================
self.addEventListener('install', (event) => {
    console.log('[SW] Instalando...');
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => {
                console.log('[SW] Cacheando App Shell...');
                return cache.addAll(ASSETS_TO_CACHE);
            })
            .then(() => self.skipWaiting()) // Fuerza activación inmediata
    );
});

// ============================================
// ACTIVATE: Limpia cachés antiguas
// ============================================
self.addEventListener('activate', (event) => {
    console.log('[SW] Activado.');
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames
                    .filter((name) => name !== CACHE_NAME)
                    .map((name) => {
                        console.log('[SW] Borrando caché antigua:', name);
                        return caches.delete(name);
                    })
            );
        }).then(() => self.clients.claim()) // Toma control de las páginas abiertas
    );
});

// ============================================
// FETCH: Interceptor de peticiones
// ============================================
self.addEventListener('fetch', (event) => {
    const url = event.request.url;

    // --- NETWORK ONLY para Supabase API (datos siempre frescos) ---
    if (url.includes('supabase.co')) {
        event.respondWith(fetch(event.request));
        return;
    }

    // --- CACHE FIRST para todo lo demás (App Shell) ---
    event.respondWith(
        caches.match(event.request)
            .then((cachedResponse) => {
                if (cachedResponse) {
                    return cachedResponse; // Respuesta instantánea desde caché
                }
                // Si no está en caché, ir a la red y cachear para futuro
                return fetch(event.request).then((networkResponse) => {
                    // Solo cachear peticiones GET exitosas
                    if (networkResponse && networkResponse.status === 200 && event.request.method === 'GET') {
                        const responseClone = networkResponse.clone();
                        caches.open(CACHE_NAME).then((cache) => {
                            cache.put(event.request, responseClone);
                        });
                    }
                    return networkResponse;
                });
            })
            .catch(() => {
                // Fallback offline: si es una navegación, devolver index.html cacheado
                if (event.request.mode === 'navigate') {
                    return caches.match('./index.html');
                }
            })
    );
});
