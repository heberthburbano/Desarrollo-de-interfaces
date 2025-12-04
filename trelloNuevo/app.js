import { auth, db } from './firebase-config.js';
import { 
    collection, addDoc, doc, updateDoc, deleteDoc, query, where, onSnapshot, 
    orderBy, serverTimestamp, getDoc, getDocs, arrayUnion, arrayRemove, setDoc, deleteField 
} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';

document.addEventListener('DOMContentLoaded', initializeApp);

function initializeApp() {
    console.log('🚀 Inicializando Trello Clone (Versión PRO: A+B Integrado)...');

    // ========================================
    // 1. ESTADO GLOBAL
    // ========================================
    let currentUser = null;
    let currentBoardId = null;
    let currentBoardData = null;
    let currentUserRole = null;
    
    let starredBoards = []; 
    let boardsCache = [];
    
    // Estado Filtros
    let activeFilters = { labels: [], members: [] };

    // Estado Edición (Modal)
    let currentCardData = null; 
    let currentCardCover = { color: null, mode: 'banner', url: null };
    let currentChecklist = []; 
    let currentAttachments = []; 
    let currentCardLabels = [];
    let currentCardMembers = [];
    let checklistHideCompleted = false;
    
    // Variables Drag & Drop (Listas)
    let draggedList = null;

    // Suscripciones
    let unsubscribeBoards, unsubscribeLists, unsubscribeActivity, unsubscribeNotifications, unsubscribeComments; 
    let unsubscribeCards = {}; 

    // DOM Elements
    const boardsContainer = document.getElementById('boards-container');
    const boardView = document.getElementById('board-view');
    const listsContainer = document.getElementById('lists-container');
    
    // Modales
    const boardModal = document.getElementById('board-modal');
    const listModal = document.getElementById('list-modal');
    const cardModal = document.getElementById('card-modal');
    const coverModal = document.getElementById('card-cover-modal');
    const labelsModal = document.getElementById('labels-modal');
    const inviteModal = document.getElementById('invite-modal');
    const archiveModal = document.getElementById('archive-modal');
    
    // Paneles & Búsqueda
    const searchInput = document.getElementById('global-search');
    const searchResults = document.getElementById('search-results');
    const searchResultsList = document.getElementById('search-results-list');
    const membersPanel = document.getElementById('members-panel');
    const activityPanel = document.getElementById('activity-panel');
    const activityList = document.getElementById('activity-list');
    const notifBtn = document.getElementById('notifications-btn');
    const notifDropdown = document.getElementById('notifications-dropdown');
    const notifList = document.getElementById('notifications-list');
    const notifBadge = document.getElementById('notifications-badge');
    
    // Colección de Fondos
    const BACKGROUNDS = [
        { type: 'image', thumb: 'https://images.unsplash.com/photo-1472214103451-9374bd1c798e?w=150&q=80', url: 'https://images.unsplash.com/photo-1472214103451-9374bd1c798e?w=1920&q=80', name: 'Naturaleza' },
        { type: 'image', thumb: 'https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?w=150&q=80', url: 'https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?w=1920&q=80', name: 'Montañas' },
        { type: 'image', thumb: 'https://images.unsplash.com/photo-1470770841072-f978cf4d019e?w=150&q=80', url: 'https://images.unsplash.com/photo-1470770841072-f978cf4d019e?w=1920&q=80', name: 'Islandia' },
        { type: 'image', thumb: 'https://images.unsplash.com/photo-1506744038136-46273834b3fb?w=150&q=80', url: 'https://images.unsplash.com/photo-1506744038136-46273834b3fb?w=1920&q=80', name: 'Yosemite' },
        { type: 'color', val: '#0079BF', name: 'Azul Trello' },
        { type: 'color', val: '#D29034', name: 'Naranja' },
        { type: 'color', val: '#519839', name: 'Verde' },
        { type: 'color', val: '#B04632', name: 'Rojo' },
        { type: 'color', val: '#89609E', name: 'Morado' },
    ];

    // Caché de Búsqueda
    let allSearchCache = []; 
    let selectedResultIndex = -1;

    // ========================================
    // 2. HELPERS Y UTILIDADES
    // ========================================
    function timeAgo(date) {
        if (!date) return 'justo ahora';
        const seconds = Math.floor((new Date() - date) / 1000);
        const intervals = { año: 31536000, mes: 2592000, día: 86400, h: 3600, min: 60 };
        for (const [key, val] of Object.entries(intervals)) {
            const count = Math.floor(seconds / val);
            if (count >= 1) return `hace ${count} ${key}${count > 1 ? 's' : ''}`;
        }
        return "hace unos segundos";
    }

    function initDarkMode() {
        const t = document.getElementById('dark-mode-toggle');
        const h = document.documentElement;
        if (localStorage.getItem('theme') === 'dark') h.classList.add('dark');
        t?.addEventListener('click', () => {
            h.classList.toggle('dark');
            localStorage.setItem('theme', h.classList.contains('dark') ? 'dark' : 'light');
            if(window.lucide) lucide.createIcons();
        });
    }
    initDarkMode();

    const PERMISSIONS = { 
        owner: { createList: true, editCard: true, createCard: true }, 
        editor: { createList: true, editCard: true, createCard: true }, 
        viewer: { createList: false, editCard: false, createCard: false } 
    };
    function hasPermission(a) { 
        if (!currentUserRole) return false;
        return PERMISSIONS[currentUserRole]?.[a] || false; 
    }
    
    // Modal de Fondo
    function openBackgroundPicker() {
        let bgModal = document.getElementById('bg-picker-modal');
        if (!bgModal) {
            bgModal = document.createElement('div');
            bgModal.id = 'bg-picker-modal';
            bgModal.className = 'fixed inset-0 bg-black/60 z-[90] flex items-center justify-center hidden';
            bgModal.innerHTML = `
                <div class="bg-white dark:bg-slate-800 rounded-lg shadow-2xl w-96 p-4 max-h-[85vh] overflow-y-auto flex flex-col">
                    <div class="flex justify-between items-center mb-4 shrink-0">
                        <h3 class="font-bold text-slate-700 dark:text-white">Cambiar fondo</h3>
                        <button id="close-bg-modal" class="text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-700 rounded p-1 transition"><i data-lucide="x" class="w-5 h-5"></i></button>
                    </div>
                    <div class="mb-4 border-b border-slate-200 dark:border-slate-700 pb-4">
                        <label class="text-xs font-bold text-slate-500 uppercase block mb-2">Imagen de Internet</label>
                        <div class="flex gap-2">
                            <input type="text" id="custom-bg-input" placeholder="Pega aquí la URL..." class="flex-1 p-2 bg-slate-50 dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded text-sm outline-none dark:text-white">
                            <button id="apply-custom-bg" class="bg-blue-600 hover:bg-blue-700 text-white px-3 py-1 rounded text-sm font-medium">Usar</button>
                        </div>
                    </div>
                    <label class="text-xs font-bold text-slate-500 uppercase block mb-2">Galería Trello</label>
                    <div class="grid grid-cols-2 gap-2 overflow-y-auto" id="bg-grid"></div>
                </div>`;
            document.body.appendChild(bgModal);
            
            const grid = bgModal.querySelector('#bg-grid');
            BACKGROUNDS.forEach(bg => {
                const opt = document.createElement('div');
                opt.className = 'bg-picker-option h-20 w-full rounded-lg bg-cover bg-center cursor-pointer hover:opacity-90 hover:scale-[1.02] transition shadow-sm border border-transparent hover:border-blue-500';
                if(bg.type === 'image') opt.style.backgroundImage = `url('${bg.thumb}')`;
                else opt.style.backgroundColor = bg.val;
                opt.onclick = () => changeBoardBackground(bg);
                grid.appendChild(opt);
            });
            bgModal.querySelector('#close-bg-modal').onclick = () => closeModal('bg-picker-modal');
            bgModal.querySelector('#apply-custom-bg').onclick = () => {
                const url = document.getElementById('custom-bg-input').value.trim();
                if(url) { changeBoardBackground({ type: 'image', url: url }); document.getElementById('custom-bg-input').value = ''; }
            };
            if(window.lucide) lucide.createIcons();
        }
        bgModal.classList.remove('hidden'); bgModal.style.display = 'flex';
    }
    window.openBackgroundPicker = openBackgroundPicker;

    async function changeBoardBackground(bg) {
        if (!currentBoardId) return;
        const container = document.querySelector('.board-view-container');
        if (bg.type === 'image') {
            container.style.backgroundImage = `url('${bg.url}')`;
            container.style.backgroundColor = 'transparent';
        } else {
            container.style.backgroundImage = 'none';
            container.style.backgroundColor = bg.val;
        }
        try {
            await updateDoc(doc(db, 'boards', currentBoardId), { background: bg.type === 'image' ? bg.url : bg.val });
            closeModal('bg-picker-modal');
        } catch (e) { console.error("Error guardando fondo", e); }
    }
        // ========================================
    // FUNCIONES DE ACTIVIDAD Y NOTIFICACIONES (CRÍTICAS)
    // ========================================
    
    async function logActivity(action, entityType, entityId, details = {}) {
        if (!currentBoardId || !currentUser) return;
        try {
            await addDoc(collection(db, 'activity_logs'), {
                boardId: currentBoardId,
                userId: currentUser.uid,
                userName: currentUser.displayName || currentUser.email,
                action: action,
                entityType: entityType,
                entityId: entityId,
                details: details,
                timestamp: serverTimestamp()
            });
        } catch (e) {
            console.error('Error registrando actividad:', e);
        }
    }
    
    function loadActivity(boardId) {
        if(unsubscribeActivity) unsubscribeActivity();
        unsubscribeActivity = onSnapshot(
            query(
                collection(db, 'activity_logs'), 
                where('boardId', '==', boardId), 
                orderBy('timestamp', 'desc')
            ), 
            (snap) => {
                activityList.innerHTML = '';
                if(snap.empty) { 
                    activityList.innerHTML='<p class="text-center text-sm text-slate-500 p-4">Sin actividad.</p>'; 
                    return; 
                }
                snap.forEach(doc => {
                    const a = doc.data();
                    const div = document.createElement('div'); 
                    div.className='activity-item';
                    
                    const msgs = { 
                        moved_card: `movió la tarjeta "${a.details?.cardTitle || 'sin título'}"`, 
                        invited_member: `invitó a ${a.details?.email || 'un miembro'}`, 
                        created_card: `creó una tarjeta`, 
                        deleted_card: `eliminó una tarjeta`, 
                        added_comment: `comentó en "${a.details?.cardTitle || 'una tarjeta'}"`,
                        archived_list: `archivó la lista "${a.details?.listName || 'sin nombre'}"`,
                        archived_card: `archivó "${a.details?.cardTitle || 'una tarjeta'}"`
                    };
                    
                    div.innerHTML = `
                        <div class="activity-user">${a.userName || 'Usuario'}</div>
                        <div>${msgs[a.action] || a.action}</div>
                        <div class="activity-meta">${a.timestamp ? new Date(a.timestamp.toDate()).toLocaleString() : 'Fecha desconocida'}</div>
                    `;
                    activityList.appendChild(div);
                });
            }
        );
    }

    function loadNotifications() {
        if(unsubscribeNotifications) unsubscribeNotifications();
        unsubscribeNotifications = onSnapshot(
            query(
                collection(db, 'notifications'), 
                where('userId', '==', currentUser.uid), 
                orderBy('createdAt', 'desc')
            ), 
            (snap) => {
                notifList.innerHTML = '';
                
                const unread = snap.docs.filter(d => !d.data().read).length;
                if(unread > 0) { 
                    notifBadge.classList.remove('hidden'); 
                    notifBadge.textContent = unread; 
                } else {
                    notifBadge.classList.add('hidden');
                }
                
                if(snap.empty) { 
                    notifList.innerHTML = '<p class="p-4 text-center text-sm text-slate-500">No tienes notificaciones.</p>'; 
                    return; 
                }
                
                snap.forEach(doc => {
                    const n = doc.data();
                    const div = document.createElement('div');
                    div.className = `p-3 border-b border-slate-100 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700 cursor-pointer ${!n.read ? 'bg-blue-50 dark:bg-blue-900/20' : ''}`;
                    
                    if(n.type === 'board_invitation') {
                        div.innerHTML = `
                            <div class="text-sm">
                                <span class="font-bold text-blue-600">${n.invitedBy || 'Alguien'}</span> 
                                te invitó a 
                                <span class="font-bold text-slate-800 dark:text-slate-200">${n.boardTitle || 'un tablero'}</span>
                            </div>
                            <div class="flex gap-2 mt-2">
                                <button class="accept-btn px-2 py-1 bg-green-500 hover:bg-green-600 text-white text-xs rounded transition">Aceptar</button>
                                <button class="reject-btn px-2 py-1 bg-red-500 hover:bg-red-600 text-white text-xs rounded transition">Rechazar</button>
                            </div>
                        `;
                        
                        div.querySelector('.accept-btn').addEventListener('click', () => acceptInvitation(doc.id, n));
                        div.querySelector('.reject-btn').addEventListener('click', () => rejectInvitation(doc.id));
                    } else { 
                        div.innerHTML = `
                            <div class="text-sm text-slate-700 dark:text-slate-300">${n.message || 'Nueva notificación'}</div>
                            <div class="text-xs text-slate-500 mt-1">${n.createdAt ? timeAgo(n.createdAt.toDate()) : ''}</div>
                        `; 
                    }
                    
                    notifList.appendChild(div);
                });
            }
        );
    }
    
    async function acceptInvitation(notifId, notifData) {
        try {
            await updateDoc(doc(db, 'boards', notifData.boardId), {
                [`members.${currentUser.uid}`]: {
                    name: currentUser.displayName || currentUser.email,
                    email: currentUser.email,
                    role: 'editor'
                },
                memberEmails: arrayUnion(currentUser.email)
            });
            
            await deleteDoc(doc(db, 'notifications', notifId));
            alert('¡Te has unido al tablero!');
            loadBoards();
        } catch (e) {
            console.error('Error aceptando invitación:', e);
            alert('Error al aceptar la invitación');
        }
    }
    
    async function rejectInvitation(notifId) {
        try {
            await deleteDoc(doc(db, 'notifications', notifId));
            alert('Invitación rechazada');
        } catch (e) {
            console.error('Error rechazando invitación:', e);
        }
    }

    // ========================================
    // PANELES Y TOGGLES (COMPARTIR, ACTIVIDAD, MIEMBROS)
    // ========================================
    
    // Toggle del panel de invitaciones
    document.getElementById('invite-member-btn')?.addEventListener('click', () => {
        inviteModal.classList.remove('hidden');
        inviteModal.style.display = 'flex';
    });
    
    document.getElementById('close-invite-modal')?.addEventListener('click', () => {
        closeModal('invite-modal');
    });
    
    document.getElementById('send-invite-btn')?.addEventListener('click', async () => {
        // Esperar un momento para que el DOM se actualice
        setTimeout(() => {
            const emailInput = document.getElementById('invite-email-input');
            
            if (!emailInput) {
                console.error('No se encontró el input de email');
                alert('Error: No se puede acceder al campo de email. Intenta cerrar y abrir el modal de nuevo.');
                return;
            }
            
            const email = emailInput.value.trim();
            
            if (!email) {
                alert('Por favor ingresa un email');
                return;
            }
            
            if (!currentBoardId || !currentBoardData) {
                alert('No hay tablero activo');
                return;
            }
            
            sendInvitation(email);
        }, 100);
    });

    // Función separada para enviar la invitación
    async function sendInvitation(email) {
        try {
            console.log('Buscando usuario con email:', email);
            
            const usersSnap = await getDocs(query(collection(db, 'users'), where('email', '==', email)));
            
            if (usersSnap.empty) {
                alert('Usuario no encontrado. Debe tener una cuenta en la plataforma.');
                return;
            }
            
            const targetUser = usersSnap.docs[0];
            const targetUserId = targetUser.id;
            
            await addDoc(collection(db, 'notifications'), {
                userId: targetUserId,
                type: 'board_invitation',
                boardId: currentBoardId,
                boardTitle: currentBoardData.title,
                invitedBy: currentUser.displayName || currentUser.email,
                read: false,
                createdAt: serverTimestamp()
            });
            
            alert(`Invitación enviada a ${email}`);
            document.getElementById('invite-email-input').value = '';
            closeModal('invite-modal');
            
            logActivity('invited_member', 'board', currentBoardId, { email: email });
        } catch (e) {
            console.error('Error enviando invitación:', e);
            alert('Error al enviar invitación: ' + e.message);
        }
    }

    
    // Toggle del panel de miembros
    document.getElementById('members-btn')?.addEventListener('click', () => {
        const isHidden = membersPanel.classList.contains('hidden');
        
        // Cerrar otros paneles
        activityPanel?.classList.add('hidden');
        notifDropdown?.classList.add('hidden');
        
        if (isHidden) {
            membersPanel.classList.remove('hidden');
            membersPanel.style.display = 'block';
        } else {
            membersPanel.classList.add('hidden');
            membersPanel.style.display = 'none';
        }
    });
    
    document.getElementById('close-members-panel')?.addEventListener('click', () => {
        membersPanel.classList.add('hidden');
        membersPanel.style.display = 'none';
    });
    
    document.getElementById('close-activity-panel')?.addEventListener('click', () => {
        activityPanel.classList.add('hidden');
        activityPanel.style.display = 'none';
    });
    
    // Toggle de notificaciones
    notifBtn?.addEventListener('click', (e) => {
        e.stopPropagation();
        const isHidden = notifDropdown.classList.contains('hidden');
        
        // Cerrar otros paneles
        membersPanel?.classList.add('hidden');
        activityPanel?.classList.add('hidden');
        
        if (isHidden) {
            notifDropdown.classList.remove('hidden');
            notifDropdown.style.display = 'block';
        } else {
            notifDropdown.classList.add('hidden');
            notifDropdown.style.display = 'none';
        }
    });
    
    // Cerrar dropdown de notificaciones al hacer click fuera
    document.addEventListener('click', (e) => {
        if (!notifBtn?.contains(e.target) && !notifDropdown?.contains(e.target)) {
            notifDropdown?.classList.add('hidden');
            if (notifDropdown) notifDropdown.style.display = 'none';
        }
    });
    
    // Botón de cerrar notificaciones (si existe)
    document.getElementById('close-notif-dropdown')?.addEventListener('click', () => {
        notifDropdown.classList.add('hidden');
        notifDropdown.style.display = 'none';
    });


    // ========================================
    // 3. INICIO Y AUTH
    // ========================================
    window.addEventListener('user-authenticated', (e) => {
        currentUser = e.detail.user;
        const av = document.getElementById('user-avatar');
        if(av) av.textContent = (currentUser.displayName||currentUser.email).charAt(0).toUpperCase();
        
        // Listener de Usuario (Favoritos)
        onSnapshot(doc(db, 'users', currentUser.uid), (docSnap) => {
            if (docSnap.exists()) {
                const userData = docSnap.data();
                starredBoards = userData.starredBoards || []; 
                if (!currentBoardId) renderBoards(); 
                else updateStarButtonVisuals();
            }
        });

        loadBoards(); 
        loadNotifications();
        buildGlobalIndex(); 
        initSearchListeners();
        initGlobalShortcuts();
    });

    // ========================================
    // 4. BÚSQUEDA GLOBAL
    // ========================================
    async function buildGlobalIndex() {
        console.log("🔍 Indexando contenido...");
        allSearchCache = []; 
        try {
            const qBoards = query(collection(db, 'boards'), where('memberEmails', 'array-contains', currentUser.email));
            const snapBoards = await getDocs(qBoards);
            
            const promises = snapBoards.docs.map(async (boardDoc) => {
                const b = boardDoc.data();
                const bId = boardDoc.id;
                allSearchCache.push({ id: bId, type: 'board', title: b.title, score: 0 });
                const snapLists = await getDocs(query(collection(db, 'boards', bId, 'lists')));
                for (const listDoc of snapLists.docs) {
                    const l = listDoc.data();
                    allSearchCache.push({ id: listDoc.id, type: 'list', title: l.name, boardId: bId, boardTitle: b.title, score: 0 });
                    const snapCards = await getDocs(query(collection(db, 'boards', bId, 'lists', listDoc.id, 'cards')));
                    snapCards.forEach(cardDoc => {
                        const c = cardDoc.data();
                        allSearchCache.push({ id: cardDoc.id, type: 'card', title: c.title, description: c.description||'', listId: listDoc.id, listName: l.name, boardId: bId, boardTitle: b.title, score: 0 });
                    });
                }
            });
            await Promise.all(promises);
        } catch (e) { console.error("Error indexando:", e); }
    }

    function calculateScore(text, searchTerm) {
        const lowerText = (text || '').toLowerCase();
        const lowerTerm = searchTerm.toLowerCase();
        if (lowerText === lowerTerm) return 100; 
        if (lowerText.startsWith(lowerTerm)) return 80; 
        if (lowerText.includes(lowerTerm)) return 40; 
        return 0;
    }

    function highlightText(text, term) {
        if (!text) return '';
        const regex = new RegExp(`(${term})`, 'gi');
        return text.replace(regex, '<span class="search-result-highlight">$1</span>');
    }

        // === FILTROS DE BÚSQUEDA ===
    let currentSearchFilter = 'all';
    let lastSearchTerm = '';
    let lastSearchResults = [];

    document.querySelectorAll('.search-filter').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            
            // Actualizar estado visual de botones
            document.querySelectorAll('.search-filter').forEach(b => {
                b.classList.remove('active', 'bg-slate-100', 'dark:bg-slate-700');
                b.classList.add('hover:bg-slate-100', 'dark:hover:bg-slate-700');
            });
            
            btn.classList.add('active', 'bg-slate-100', 'dark:bg-slate-700');
            btn.classList.remove('hover:bg-slate-100', 'dark:hover:bg-slate-700');
            
            // Obtener el filtro seleccionado
            const filter = btn.dataset.filter; // 'all', 'boards', 'cards'
            currentSearchFilter = filter;
            
            // Aplicar filtro a los resultados actuales
            if (lastSearchResults.length > 0) {
                applySearchFilter(lastSearchResults, lastSearchTerm);
            }
        });
    });

    function applySearchFilter(results, term) {
        let filteredResults = results;
        
        if (currentSearchFilter === 'boards') {
            filteredResults = results.filter(r => r.type === 'board');
        } else if (currentSearchFilter === 'cards') {
            filteredResults = results.filter(r => r.type === 'card');
        }
        // 'all' muestra todo
        
        renderSearchResults(filteredResults, term);
        
        // Actualizar contador
        const count = document.getElementById('search-results-count');
        if (count) {
            count.textContent = `${filteredResults.length} resultado${filteredResults.length !== 1 ? 's' : ''}`;
        }
    }

    function initSearchListeners() {
        searchInput?.addEventListener('input', (e) => {
            const term = e.target.value.trim().toLowerCase();
            if(term.length < 2) { searchResults.classList.add('hidden'); selectedResultIndex = -1; return; }
            const results = allSearchCache.map(item => {
                const titleScore = calculateScore(item.title, term);
                const descScore = item.description ? calculateScore(item.description, term) : 0;
                return { ...item, score: Math.max(titleScore, descScore) };
            }).filter(item => item.score > 0).sort((a, b) => b.score - a.score);
            lastSearchResults = results.slice(0, 50); // Guardamos más resultados
            lastSearchTerm = term;
            applySearchFilter(lastSearchResults, term);

        });

        searchInput?.addEventListener('keydown', (e) => {
            const items = document.querySelectorAll('.search-result-item');
            if (items.length === 0) return;
            if (e.key === 'ArrowDown') { e.preventDefault(); selectedResultIndex = Math.min(selectedResultIndex + 1, items.length - 1); updateSelection(items); } 
            else if (e.key === 'ArrowUp') { e.preventDefault(); selectedResultIndex = Math.max(selectedResultIndex - 1, 0); updateSelection(items); } 
            else if (e.key === 'Enter') { e.preventDefault(); if (selectedResultIndex >= 0) items[selectedResultIndex].click(); } 
            else if (e.key === 'Escape') { searchResults.classList.add('hidden'); }
        });
        document.addEventListener('click', (e) => { 
            if(!searchInput.contains(e.target) && !searchResults.contains(e.target)) searchResults.classList.add('hidden'); 
        });
    }

    // === BOTÓN PARA CERRAR BÚSQUEDA ===
    const closeSearchBtn = document.getElementById('close-search');
    if (closeSearchBtn) {
        closeSearchBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            searchResults.classList.add('hidden');
            searchInput.value = ''; // Limpiar el input también
        });
    }

    function updateSelection(items) {
        items.forEach((item, index) => {
            if (index === selectedResultIndex) { item.classList.add('keyboard-selected'); item.scrollIntoView({ block: 'nearest' }); } 
            else { item.classList.remove('keyboard-selected'); }
        });
    }

    function renderSearchResults(results, term) {
        searchResultsList.innerHTML = '';
        selectedResultIndex = -1;
        if(results.length === 0) { 
            searchResultsList.innerHTML = '<p class="p-4 text-sm text-slate-500 text-center">No se encontraron resultados.</p>'; 
            searchResults.classList.remove('hidden');
            return;
        }
        results.forEach((res, index) => {
            const div = document.createElement('div');
            div.className = 'search-result-item';
            div.dataset.index = index;
            const titleHtml = highlightText(res.title, term);
            if (res.type === 'board') div.innerHTML = `<div class="flex items-center gap-2 mb-1"><span class="result-type-badge result-type-board">Tablero</span><span class="text-sm font-bold text-slate-800">${titleHtml}</span></div>`;
            else if (res.type === 'list') div.innerHTML = `<div class="flex items-center gap-2 mb-1"><span class="result-type-badge result-type-list">Lista</span><span class="text-sm font-bold text-slate-800">${titleHtml}</span></div><div class="result-breadcrumbs"><span>En: <strong>${res.boardTitle}</strong></span></div>`;
            else if (res.type === 'card') div.innerHTML = `<div class="flex items-center gap-2 mb-1"><span class="result-type-badge result-type-card">Tarjeta</span><span class="text-sm font-bold text-slate-800">${titleHtml}</span></div><div class="result-breadcrumbs"><span>${res.boardTitle}</span><i data-lucide="chevron-right" class="w-3 h-3"></i><span>${res.listName}</span></div>`;
            div.addEventListener('click', () => handleSearchResultClick(res));
            searchResultsList.appendChild(div);
        });
        searchResults.classList.remove('hidden');
        // Actualizar contador de resultados
        const count = document.getElementById('search-results-count');
        if (count) {
            count.textContent = `${results.length} resultado${results.length !== 1 ? 's' : ''}`;
        }
        if(window.lucide) lucide.createIcons();
    }

    async function handleSearchResultClick(res) {
        searchResults.classList.add('hidden');
        searchInput.value = '';
        if (currentBoardId !== res.boardId && res.boardId) {
            const bSnap = await getDoc(doc(db, 'boards', res.boardId));
            if (bSnap.exists()) {
                await openBoard(res.boardId, bSnap.data());
                setTimeout(() => focusTarget(res), 800); 
            }
        } else { focusTarget(res); }
    }

    async function focusTarget(res) {
        if (res.type === 'board') return; 
        if (res.type === 'list') {
            const el = document.querySelector(`[data-list-id="${res.id}"]`);
            if (el) {
                el.scrollIntoView({ behavior: 'smooth', inline: 'center' });
                el.style.boxShadow = '0 0 0 4px #FFAB00'; 
                setTimeout(() => el.style.boxShadow = '', 2000);
            }
        } else if (res.type === 'card') {
            const cSnap = await getDoc(doc(db, 'boards', res.boardId, 'lists', res.listId, 'cards', res.id));
            if (cSnap.exists()) openCardModal(res.listId, res.id, cSnap.data());
        }
    }

    // === SISTEMA DE GESTIÓN DE ETIQUETAS ===
    let boardLabels = []; // Etiquetas definidas para el tablero actual
    let editingLabelId = null; // ID de la etiqueta siendo editada
    let selectedLabelColor = { bg: 'bg-green-500', text: 'text-green-700' }; // Color seleccionado

    // Cargar etiquetas del tablero
    async function loadBoardLabels() {
        if (!currentBoardId) return;
        
        try {
            const boardDoc = await getDoc(doc(db, 'boards', currentBoardId));
            if (boardDoc.exists()) {
                boardLabels = boardDoc.data().labels || [];
                renderLabelsInLabelModal();
                renderLabelsInFilterPopover();
            }
        } catch (e) {
            console.error('Error cargando etiquetas:', e);
        }
    }

    // Renderizar etiquetas en el modal de selección
    function renderLabelsInLabelModal() {
        const container = document.getElementById('labels-list-container');
        if (!container) return;
        
        container.innerHTML = '';
        
        if (boardLabels.length === 0) {
            container.innerHTML = '<p class="text-sm text-slate-400 text-center py-4">No hay etiquetas. Crea una nueva.</p>';
            return;
        }
        
        boardLabels.forEach((label, index) => {
            const isSelected = currentCardLabels.some(l => l.name === label.name);
            
            const div = document.createElement('div');
            div.className = 'flex items-center gap-2 group';
            div.innerHTML = `
                <label class="flex items-center gap-2 cursor-pointer p-2 hover:bg-slate-50 dark:hover:bg-slate-700 rounded flex-1">
                    <input type="checkbox" class="label-checkbox w-4 h-4" ${isSelected ? 'checked' : ''} data-label-index="${index}">
                    <span class="px-3 py-1 ${label.bg} ${label.text} text-xs rounded font-bold flex-1">${label.name}</span>
                </label>
                <button class="edit-label-btn opacity-0 group-hover:opacity-100 p-1 hover:bg-slate-200 dark:hover:bg-slate-600 rounded transition" data-label-index="${index}">
                    <i data-lucide="pencil" class="w-3 h-3 text-slate-600 dark:text-slate-400"></i>
                </button>
            `;
            
            // Evento checkbox
            const checkbox = div.querySelector('.label-checkbox');
            checkbox.addEventListener('change', (e) => {
                const labelData = boardLabels[index];
                if (e.target.checked) {
                    if (!currentCardLabels.some(l => l.name === labelData.name)) {
                        currentCardLabels.push(labelData);
                    }
                } else {
                    currentCardLabels = currentCardLabels.filter(l => l.name !== labelData.name);
                }
                renderLabelsInModal();
            });
            
            // Evento editar
            const editBtn = div.querySelector('.edit-label-btn');
            editBtn.addEventListener('click', () => openLabelEditor(index));
            
            container.appendChild(div);
        });
        
        if (window.lucide) lucide.createIcons();
    }

    // Abrir editor de etiquetas
    function openLabelEditor(labelIndex = null) {
        const modal = document.getElementById('label-editor-modal');
        const title = document.getElementById('label-editor-title');
        const nameInput = document.getElementById('label-name-input');
        const deleteBtn = document.getElementById('delete-label-btn');
        
        editingLabelId = labelIndex;
        
        if (labelIndex !== null) {
            // Modo edición
            const label = boardLabels[labelIndex];
            title.textContent = 'Editar etiqueta';
            nameInput.value = label.name;
            selectedLabelColor = { bg: label.bg, text: label.text };
            deleteBtn.classList.remove('hidden');
        } else {
            // Modo creación
            title.textContent = 'Nueva etiqueta';
            nameInput.value = '';
            selectedLabelColor = { bg: 'bg-green-500', text: 'text-green-700' };
            deleteBtn.classList.add('hidden');
        }
        
        // Resaltar color seleccionado
        document.querySelectorAll('.label-color-option').forEach(opt => {
            if (opt.dataset.color === selectedLabelColor.bg) {
                opt.classList.add('ring-4', 'ring-blue-500');
            } else {
                opt.classList.remove('ring-4', 'ring-blue-500');
            }
        });
        
        modal.classList.remove('hidden');
        modal.style.display = 'flex';
        nameInput.focus();
    }

    // Guardar etiqueta (crear o actualizar)
    async function saveBoardLabel() {
        const nameInput = document.getElementById('label-name-input');
        const name = nameInput.value.trim();
        
        if (!name) {
            alert('Por favor ingresa un nombre para la etiqueta');
            return;
        }
        
        try {
            const newLabel = {
                name: name,
                bg: selectedLabelColor.bg,
                text: selectedLabelColor.text
            };
            
            if (editingLabelId !== null) {
                // Actualizar etiqueta existente
                boardLabels[editingLabelId] = newLabel;
            } else {
                // Crear nueva etiqueta
                boardLabels.push(newLabel);
            }
            
            // Guardar en Firestore
            await updateDoc(doc(db, 'boards', currentBoardId), {
                labels: boardLabels
            });
            
            closeModal('label-editor-modal');
            renderLabelsInLabelModal();
            renderLabelsInFilterPopover();
            
            await logActivity(
                editingLabelId !== null ? 'updatedlabel' : 'createdlabel',
                'board',
                currentBoardId,
                { labelName: name }
            );
        } catch (e) {
            console.error('Error guardando etiqueta:', e);
            alert('Error al guardar la etiqueta');
        }
    }

    // Eliminar etiqueta
    async function deleteBoardLabel() {
        if (editingLabelId === null) return;
        
        if (!confirm('¿Eliminar esta etiqueta? Se quitará de todas las tarjetas.')) return;
        
        try {
            const deletedLabel = boardLabels[editingLabelId];
            boardLabels.splice(editingLabelId, 1);
            
            // Guardar en Firestore
            await updateDoc(doc(db, 'boards', currentBoardId), {
                labels: boardLabels
            });
            
            // Eliminar de tarjetas actuales si aplica
            if (currentCardLabels) {
                currentCardLabels = currentCardLabels.filter(l => l.name !== deletedLabel.name);
                renderLabelsInModal();
            }
            
            closeModal('label-editor-modal');
            renderLabelsInLabelModal();
            renderLabelsInFilterPopover();
            
            await logActivity('deletedlabel', 'board', currentBoardId, { labelName: deletedLabel.name });
        } catch (e) {
            console.error('Error eliminando etiqueta:', e);
            alert('Error al eliminar la etiqueta');
        }
    }

    // Renderizar etiquetas en el popover de filtros
    function renderLabelsInFilterPopover() {
        const container = document.getElementById('filter-labels-list');
        if (!container) return;
        
        container.innerHTML = '';
        
        if (boardLabels.length === 0) {
            container.innerHTML = '<p class="text-xs text-slate-400 italic">No hay etiquetas en este tablero</p>';
            return;
        }
        
        boardLabels.forEach(label => {
            const isActive = activeFilters.labels.includes(label.name);
            
            const labelDiv = document.createElement('label');
            labelDiv.className = 'flex items-center gap-2 cursor-pointer p-2 hover:bg-slate-50 dark:hover:bg-slate-700 rounded transition';
            labelDiv.innerHTML = `
                <input type="checkbox" class="filter-label-checkbox w-4 h-4" ${isActive ? 'checked' : ''} data-label="${label.name}">
                <span class="px-3 py-1 ${label.bg} ${label.text} text-xs rounded font-bold flex-1">${label.name}</span>
            `;
            
            const checkbox = labelDiv.querySelector('.filter-label-checkbox');
            checkbox.addEventListener('change', (e) => {
                if (e.target.checked) {
                    if (!activeFilters.labels.includes(label.name)) {
                        activeFilters.labels.push(label.name);
                    }
                } else {
                    activeFilters.labels = activeFilters.labels.filter(l => l !== label.name);
                }
                updateFilterState();
                document.querySelectorAll('.list-card').forEach(card => applyFiltersToCard(card));
            });
            
            container.appendChild(labelDiv);
        });
    }// === FIN SISTEMA DE GESTIÓN DE ETIQUETAS ===
    
    // ========================================
    // 5. TABLEROS Y LISTAS
    // ========================================
    function renderBoards() {
        if (!boardsContainer) return;
        boardsContainer.innerHTML = '';
        boardsContainer.className = 'flex flex-col gap-8'; 

        if (boardsCache.length === 0) {
            boardsContainer.innerHTML = `<div class="col-span-full text-center py-10 text-slate-500">Sin tableros. <b onclick="document.getElementById('create-board-btn').click()" class="cursor-pointer text-blue-600">Crear uno</b></div>`;
            return;
        }

        const starredDocs = [];
        const normalDocs = [];
        boardsCache.forEach(item => {
            if (starredBoards.includes(item.id)) starredDocs.push(item);
            normalDocs.push(item);
        });

        if (starredDocs.length > 0) {
            const starSection = document.createElement('div');
            starSection.innerHTML = `<h3 class="font-bold text-slate-700 dark:text-slate-200 mb-3 flex items-center gap-2"><i data-lucide="star" class="w-4 h-4 fill-yellow-400 text-yellow-400"></i> Tableros destacados</h3><div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4" id="starred-grid"></div>`;
            boardsContainer.appendChild(starSection);
            const starGrid = starSection.querySelector('#starred-grid');
            starredDocs.forEach(item => starGrid.appendChild(createBoardCard(item.id, item.data)));
        }

        const mainSection = document.createElement('div');
        mainSection.innerHTML = `<h3 class="font-bold text-slate-700 dark:text-slate-200 mb-3 flex items-center gap-2"><i data-lucide="briefcase" class="w-4 h-4"></i> Tus espacios de trabajo</h3><div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4" id="main-grid"></div>`;
        boardsContainer.appendChild(mainSection);
        const mainGrid = mainSection.querySelector('#main-grid');
        normalDocs.forEach(item => mainGrid.appendChild(createBoardCard(item.id, item.data)));

        if(window.lucide) lucide.createIcons();
    }

    function loadBoards() {
        if(unsubscribeBoards) unsubscribeBoards();
        unsubscribeBoards = onSnapshot(query(collection(db, 'boards'), where('memberEmails', 'array-contains', currentUser.email)), (snap) => {
            boardsCache = [];
            snap.forEach(doc => { boardsCache.push({ id: doc.id, data: doc.data() }); });
            renderBoards();
        });
    }

    function createBoardCard(id, board) {
        const d = document.createElement('div');
        d.className = 'bg-white dark:bg-slate-800 p-4 rounded shadow hover:shadow-lg transition cursor-pointer h-32 flex flex-col justify-between border-l-4 border-[#0079BF] relative group';
        if(board.background && board.background.startsWith('http')) {
            d.style.backgroundImage = `url(${board.background})`;
            d.style.backgroundSize = 'cover';
            d.classList.add('text-white', 'shadow-md'); 
            d.innerHTML = `<div class="absolute inset-0 bg-black/20 rounded"></div><div class="relative z-10 h-full flex flex-col justify-between"><h3 class="font-bold text-white text-shadow truncate">${board.title}</h3><div class="flex justify-between items-end"><span class="text-xs text-white/90"><i data-lucide="users" class="w-3 h-3 inline"></i> ${Object.keys(board.members||{}).length}</span>${board.ownerId===currentUser.uid?`<button class="del-btn opacity-0 group-hover:opacity-100 text-white hover:text-red-300 p-1"><i data-lucide="trash-2" class="w-4 h-4"></i></button>`:''}</div></div>`;
        } else if (board.background) {
            d.style.backgroundColor = board.background;
            d.style.borderColor = 'transparent';
            d.innerHTML = `<h3 class="font-bold text-white truncate">${board.title}</h3><div class="flex justify-between items-end"><span class="text-xs text-white"><i data-lucide="users" class="w-3 h-3 inline"></i> ${Object.keys(board.members||{}).length}</span>${board.ownerId===currentUser.uid?`<button class="del-btn opacity-0 group-hover:opacity-100 text-white hover:text-red-200 p-1"><i data-lucide="trash-2" class="w-4 h-4"></i></button>`:''}</div>`;
        } else {
            d.innerHTML = `<h3 class="font-bold text-slate-800 dark:text-white truncate">${board.title}</h3><div class="flex justify-between items-end"><span class="text-xs text-slate-500"><i data-lucide="users" class="w-3 h-3 inline"></i> ${Object.keys(board.members||{}).length}</span>${board.ownerId===currentUser.uid?`<button class="del-btn opacity-0 group-hover:opacity-100 text-red-500 p-1"><i data-lucide="trash-2" class="w-4 h-4"></i></button>`:''}</div>`;
        }
        d.addEventListener('click', (e) => !e.target.closest('.del-btn') && openBoard(id, board));
        d.querySelector('.del-btn')?.addEventListener('click', async (e) => { e.stopPropagation(); if(confirm('¿Borrar?')) await deleteDoc(doc(db, 'boards', id)); });
        return d;
    }

    async function openBoard(id, data) {
        currentBoardId = id; 
        currentBoardData = data; 
        const memberData = data.members?.[currentUser.uid];
        currentUserRole = memberData ? memberData.role : 'viewer';
        // --- NUEVA LÓGICA: MOSTRAR/OCULTAR BOTÓN ABANDONAR ---
        const leaveBtn = document.getElementById('leave-board-btn');
        if (leaveBtn) {
            // Si eres el dueño (ownerId), NO puedes abandonar (debes borrar el tablero).
            // Si eres invitado, SÍ puedes abandonar.
            if (data.ownerId === currentUser.uid) {
                leaveBtn.classList.add('hidden');
            } else {
                leaveBtn.classList.remove('hidden');
            }
        }
        document.getElementById('board-title').textContent = data.title;
        renderBoardMembers(data.members);
        
        const container = document.querySelector('.board-view-container');
        if (data.background) {
            if (data.background.startsWith('http') || data.background.startsWith('url')) {
                container.style.backgroundImage = `url('${data.background}')`;
                container.style.backgroundColor = 'transparent';
            } else {
                container.style.backgroundImage = 'none';
                container.style.backgroundColor = data.background;
            }
        } else {
            container.style.backgroundImage = 'none';
            container.style.backgroundColor = '#0079BF';
        }

        // LÓGICA ESTRELLA
        updateStarButtonVisuals();
        const starBtn = document.getElementById('board-star-btn');
        const newStarBtn = starBtn.cloneNode(true);
        starBtn.parentNode.replaceChild(newStarBtn, starBtn);
        newStarBtn.addEventListener('click', async () => {
            const userRef = doc(db, 'users', currentUser.uid);
            const isStarred = starredBoards.includes(currentBoardId);
            const icon = newStarBtn.querySelector('svg') || newStarBtn.querySelector('i');
            if (isStarred) { icon.classList.remove('fill-yellow-400', 'text-yellow-400'); newStarBtn.classList.remove('scale-110'); } 
            else { icon.classList.add('fill-yellow-400', 'text-yellow-400'); newStarBtn.classList.add('scale-110'); }
            try { await setDoc(userRef, { starredBoards: isStarred ? arrayRemove(currentBoardId) : arrayUnion(currentBoardId) }, { merge: true }); } 
            catch (e) { console.error("Error favorito:", e); }
        });

        if(window.lucide) lucide.createIcons();
        document.getElementById('create-board-btn').classList.add('hidden');
        document.querySelector('.boards-section').style.display='none'; 
        boardView.classList.remove('hidden'); 
        boardView.style.display='flex';
        loadLists(id);
        loadBoardLabels(); // Agregar esta línea
        loadActivity(id);
    }

    function updateStarButtonVisuals() {
        const starBtn = document.getElementById('board-star-btn');
        if (!starBtn) return;
        const starIcon = starBtn.querySelector('svg') || starBtn.querySelector('i');
        if (!starIcon) return;
        const isStarred = starredBoards.includes(currentBoardId);
        if (isStarred) { starIcon.classList.add('fill-yellow-400', 'text-yellow-400'); starBtn.classList.add('bg-white/20'); } 
        else { starIcon.classList.remove('fill-yellow-400', 'text-yellow-400'); starBtn.classList.remove('bg-white/20'); }
    }

    function renderBoardMembers(members) {
        const container = document.getElementById('members-preview');
        if(!container) return;
        container.innerHTML = '';
        Object.values(members).slice(0, 5).forEach(m => {
            const div = document.createElement('div');
            div.className = 'member-avatar header-avatar';
            div.title = m.name;
            div.textContent = m.name.charAt(0).toUpperCase();
            container.appendChild(div);
        });
    }

    // ========================================
    // 6. LISTAS (CON DRAG & DROP Y ARCHIVADO)
    // ========================================
    function loadLists(bid) {
        if(unsubscribeLists) unsubscribeLists();
        unsubscribeLists = onSnapshot(query(collection(db, 'boards', bid, 'lists'), orderBy('position')), (snap) => {
            Array.from(listsContainer.querySelectorAll('.list-wrapper:not(:last-child)')).forEach(el=>el.remove());
            const btn = listsContainer.lastElementChild;
            snap.forEach(doc => {
                const data = doc.data();
                // --- FILTRO ARCHIVADO ---
                if (data.archived) return; 
                const el = createListElement(doc.id, data);
                listsContainer.insertBefore(el, btn);
                loadCards(bid, doc.id, el.querySelector('.cards-container'));
            });
            if(window.lucide) lucide.createIcons();
        });
    }

    function createListElement(lid, data) {
        const w = document.createElement('div'); 
        w.className = 'list-wrapper';
        
        // --- HACER LISTA ARRASTRABLE ---
        if (hasPermission('createList')) {
            w.draggable = true;
            w.dataset.listId = lid;
            w.dataset.position = data.position;
            w.addEventListener('dragstart', handleListDragStart);
            w.addEventListener('dragend', handleListDragEnd);
            w.addEventListener('dragover', handleListDragOver);
            w.addEventListener('drop', handleListDrop);
        }

        const d = document.createElement('div'); d.className = 'list'; d.dataset.listId = lid;
        d.innerHTML = `
            <div class="list-header group flex justify-between items-center p-2 cursor-grab active:cursor-grabbing">
                <h3 class="truncate text-sm font-semibold text-[#172B4D] dark:text-white px-2">${data.name}</h3>
                ${hasPermission('createList') ? 
                    `<div class="flex gap-1 opacity-0 group-hover:opacity-100 transition">
                        <button class="archive-list-btn p-1 text-slate-400 hover:text-slate-600 rounded hover:bg-slate-200 dark:hover:bg-slate-700" title="Archivar lista">
                            <i data-lucide="archive" class="w-4 h-4"></i>
                        </button>
                    </div>` : ''}
            </div>
            <div class="cards-container custom-scrollbar min-h-[10px]" data-list-id="${lid}"></div>
            ${hasPermission('createCard') ? `<div class="p-2"><button class="add-card w-full text-left py-1.5 px-2 text-slate-600 hover:bg-slate-200/50 dark:text-slate-400 dark:hover:bg-slate-700 rounded flex items-center gap-2 text-sm transition"><i data-lucide="plus" class="w-4 h-4"></i> Añadir tarjeta</button></div>` : ''}`;
        
        // Acción Archivar Lista
        d.querySelector('.archive-list-btn')?.addEventListener('click', async()=>{ 
            if(confirm('¿Archivar esta lista?')) {
                await updateDoc(doc(db,'boards',currentBoardId,'lists',lid), { archived: true });
                logActivity('archived_list', 'list', lid, { listName: data.name });
            }
        });
        
        const addCardBtn = d.querySelector('.add-card');
        if (addCardBtn) addCardBtn.addEventListener('click', () => openCardModal(lid));
        
        setupDropZone(d.querySelector('.cards-container'), lid);
        w.appendChild(d); 
        return w;
    }

    // --- FUNCIONES DRAG & DROP LISTAS ---
    function handleListDragStart(e) {
        if (!e.target.classList.contains('list-wrapper')) return;
        draggedList = this;
        e.dataTransfer.setData('type', 'list');
        setTimeout(() => this.classList.add('opacity-50'), 0);
    }
    function handleListDragEnd() {
        this.classList.remove('opacity-50');
        this.style.opacity = '';
        this.style.transform = '';
        draggedList = null;
        
        // Limpiar estilos de todas las listas
        document.querySelectorAll('.list-wrapper').forEach(l => {
            l.style.opacity = '';
            l.style.transform = '';
        });
    }

    function handleListDragOver(e) {
        if(draggedList && e.dataTransfer.types.includes('type')) {
            e.preventDefault();
            // Agregar indicador visual
            this.style.opacity = '0.5';
            this.style.transform = 'scale(1.02)';
        }
    }

    async function handleListDrop(e) {
        if (!draggedList || draggedList === this) return;
        e.preventDefault();
        
        const fromId = draggedList.dataset.listId;
        const toId = this.dataset.listId;
        const fromPos = parseFloat(draggedList.dataset.position);
        const toPos = parseFloat(this.dataset.position);

        try {
            await updateDoc(doc(db, 'boards', currentBoardId, 'lists', fromId), { position: toPos });
            await updateDoc(doc(db, 'boards', currentBoardId, 'lists', toId), { position: fromPos });
        } catch(e) { console.error("Error reordenando lista", e); }
    }

    // ========================================
    // 7. TARJETAS (CON ARCHIVADO)
    // ========================================
    function loadCards(bid, lid, cont) {
        if(unsubscribeCards[lid]) unsubscribeCards[lid]();
        unsubscribeCards[lid] = onSnapshot(query(collection(db, 'boards', bid, 'lists', lid, 'cards'), orderBy('position')), (snap) => {
            cont.innerHTML = '';
            snap.forEach(doc => {
                const data = doc.data();
                // --- FILTRO ARCHIVADO ---
                if (data.archived) return;
                cont.appendChild(createCardElement(doc.id, lid, data));
            });
            if(window.lucide) lucide.createIcons({root:cont});
        });
    }

    function createCardElement(cid, lid, card) {
        const d = document.createElement('div'); d.className = 'list-card group relative';
        d.draggable = hasPermission('editCard'); d.dataset.cardId = cid; d.dataset.listId = lid;
        
        const labelString = card.labels?.map(l => l.name).join(',') || '';
        const memberString = card.assignedTo?.join(',') || '';
        d.dataset.labels = labelString; d.dataset.members = memberString;

        let coverHtml = '', fullClass = '';
        if(card.cover?.url && card.cover.mode === 'full') { fullClass='full-cover'; d.style.backgroundImage=`url('${card.cover.url}')`; } 
        else if(card.cover?.url) { coverHtml = `<div class="card-cover-image" style="background-image: url('${card.cover.url}')"></div>`; } 
        else if(card.cover?.emoji) { coverHtml = `<div class="h-[32px] bg-slate-100 dark:bg-slate-700 flex items-center justify-center text-2xl rounded-t mb-2 select-none">${card.cover.emoji}</div>`; } 
        else if(card.cover?.color) { coverHtml = `<div class="card-cover ${card.cover.color}"></div>`; }
        if(fullClass) d.classList.add(fullClass);

        let labelsHtml = ''; if(card.labels?.length) { labelsHtml = `<div class="flex flex-wrap mb-1 gap-1">${card.labels.map(l => `<span class="card-label ${l.bg} ${l.text}" title="${l.name}"></span>`).join('')}</div>`;}
        let membersHtml = ''; if(card.assignedTo && card.assignedTo.length > 0) { membersHtml = `<div class="card-members">`; card.assignedTo.forEach(uid => { const memberName = currentBoardData.members[uid]?.name || '?'; membersHtml += `<div class="member-avatar" style="width:24px; height:24px; font-size:10px;" title="${memberName}">${memberName.charAt(0).toUpperCase()}</div>`; }); membersHtml += `</div>`; }
        let checkHtml = ''; if(card.checklist?.length) { const c = card.checklist.filter(i=>i.completed).length, t=card.checklist.length, p=Math.round((c/t)*100); checkHtml = `<div class="flex items-center gap-1.5 text-xs ${c===t?'text-green-600':'text-slate-500'} mt-1"><i data-lucide="check-square" class="w-3 h-3"></i> <span>${c}/${t}</span></div><div class="checklist-progress-bar"><div class="checklist-progress-value ${c===t?'complete':''}" style="width:${p}%"></div></div>`; }
        let dateHtml = ''; if(card.dueDate) { const diff = (new Date(card.dueDate).setHours(0,0,0,0) - new Date().setHours(0,0,0,0))/(1000*60*60*24); const cls = diff<0?'bg-red-500 text-white':(diff<=1?'bg-yellow-400 text-slate-800':'bg-transparent text-slate-500'); dateHtml = `<div class="due-date-badge ${cls} inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] font-bold"><i data-lucide="calendar" class="w-3 h-3"></i><span>${new Date(card.dueDate).toLocaleDateString('es-ES',{day:'numeric',month:'short'})}</span></div>`; }

        d.innerHTML = `${coverHtml}${labelsHtml}<span class="block text-sm text-[#172B4D] dark:text-slate-200 mb-1 font-medium card-title">${card.title}</span><div class="flex flex-wrap gap-2 items-center">${dateHtml}${checkHtml}${card.description?`<i data-lucide="align-left" class="w-3 h-3 text-slate-400 card-description-icon"></i>`:''}${card.attachments?.length?`<i data-lucide="paperclip" class="w-3 h-3 text-slate-400"></i>`:''}</div>${membersHtml}<button class="edit-btn absolute top-1 right-1 p-1.5 bg-[#f4f5f7]/80 hover:bg-[#ebecf0] rounded opacity-0 group-hover:opacity-100 z-20"><i data-lucide="pencil" class="w-3 h-3 text-[#42526E]"></i></button>`;
        d.addEventListener('click', (e) => { if(e.target.closest('.card-label')) { e.stopPropagation(); d.querySelectorAll('.card-label').forEach(l=>l.classList.toggle('expanded')); return; } openCardModal(lid, cid, card); });
        if(d.draggable) {
            d.addEventListener('dragstart', function(e) {
                    if(this.classList.contains('list-wrapper')) return;
                    draggedItem = this;
                    this.style.transform = 'rotate(3deg)';
                    this.classList.add('dragging');
                    e.dataTransfer.setData('text/plain', JSON.stringify({
                    cid: this.dataset.cardId, 
                    slid: this.dataset.listId
                }));
        });
  
  d.addEventListener('dragend', function() {
    this.style.transform = 'none';
    this.classList.remove('dragging');
    draggedItem = null;
    document.querySelectorAll('.drag-over').forEach(e => e.classList.remove('drag-over'));
  });
}
        if (typeof activeFilters !== 'undefined' && (activeFilters.labels.length > 0 || activeFilters.members.length > 0)) applyFiltersToCard(d);
        return d;
    }

    // Drag & Drop Cards
    let draggedItem = null;
    function handleDragStart(e) { 
        // CORRECCIÓN PARA EVITAR CONFLICTO CON LISTAS
        if(e.target.classList.contains('list-wrapper')) return; 
        draggedItem=this; 
        this.style.transform='rotate(3deg)'; 
        this.classList.add('dragging'); 
        e.dataTransfer.setData('text/plain', JSON.stringify({cid:this.dataset.cardId, slid:this.dataset.listId})); 
    }

    function setupDropZone(cont, lid) {
        // Aumentar la altura mínima del contenedor
        cont.style.minHeight = '10px';
        
        cont.addEventListener('dragover', (e) => {
            if(draggedItem) {
            e.preventDefault();
            e.stopPropagation();
            cont.classList.add('drag-over');
            }
        });
        
        cont.addEventListener('dragleave', (e) => {
            // Solo quitar si salimos completamente del contenedor
            if (!cont.contains(e.relatedTarget)) {
            cont.classList.remove('drag-over');
            }
        });
        
        cont.addEventListener('drop', async (e) => {
            e.preventDefault();
            e.stopPropagation();
            cont.classList.remove('drag-over');
            
            if(!draggedItem) return;
            
            const {cid, slid} = JSON.parse(e.dataTransfer.getData('text/plain'));
            
            try {
            if(slid !== lid) {
                // Mover a otra lista
                const snap = await getDoc(doc(db,'boards',currentBoardId,'lists',slid,'cards',cid));
                if(snap.exists()) {
                await addDoc(collection(db,'boards',currentBoardId,'lists',lid,'cards'), {
                    ...snap.data(), 
                    position: Date.now()
                });
                await deleteDoc(snap.ref);
                logActivity('movedcard', 'card', cid, {
                    cardTitle: snap.data().title, 
                    fromList: slid, 
                    toList: lid
                });
                }
            } else {
                // Reordenar en la misma lista
                await updateDoc(doc(db,'boards',currentBoardId,'lists',slid,'cards',cid), {
                position: Date.now()
                });
            }
            } catch(err) { 
            console.error('Error en drop:', err); 
            }
        });
    }



    // ========================================
    // 8. GESTIÓN DE ARCHIVOS (MODAL Y LÓGICA) - CORREGIDO
    // ========================================
    document.getElementById('archive-btn')?.addEventListener('click', () => {
        loadArchivedItems('cards'); // Cargar pestaña por defecto
        const modal = document.getElementById('archive-modal');
        modal.classList.remove('hidden');
        modal.style.display = 'flex'; // Forzar flex para centrado
    });

    // CORRECCIÓN AQUÍ: Usamos la función global closeModal para limpiar estilos inline
    document.getElementById('close-archive-btn')?.addEventListener('click', () => {
        closeModal('archive-modal');
    });

    document.querySelectorAll('.archive-tab').forEach(btn => {
        btn.addEventListener('click', (e) => {
            // Resetear estilos de tabs
            document.querySelectorAll('.archive-tab').forEach(b => { 
                b.classList.remove('text-blue-600', 'border-b-2', 'border-blue-600', 'dark:text-blue-400', 'dark:border-blue-400'); 
                b.classList.add('text-slate-500', 'dark:text-slate-400'); 
            });
            // Activar tab actual
            e.target.classList.add('text-blue-600', 'border-b-2', 'border-blue-600', 'dark:text-blue-400', 'dark:border-blue-400'); 
            e.target.classList.remove('text-slate-500', 'dark:text-slate-400');
            
            loadArchivedItems(e.target.dataset.tab);
        });
    });

    async function loadArchivedItems(type) {
        const container = document.getElementById('archived-content');
        container.innerHTML = '<p class="text-center text-slate-400 py-4">Cargando...</p>';
        
        let html = '';
        if (type === 'cards') {
            // Buscar tarjetas archivadas
            const listsSnap = await getDocs(collection(db, 'boards', currentBoardId, 'lists'));
            let found = false;
            
            for (const listDoc of listsSnap.docs) {
                const cardsSnap = await getDocs(query(collection(db, 'boards', currentBoardId, 'lists', listDoc.id, 'cards'), where('archived', '==', true)));
                cardsSnap.forEach(cardDoc => {
                    found = true;
                    const c = cardDoc.data();
                    const listTitle = allSearchCache.find(x => x.id === listDoc.id)?.title || 'lista desconocida';
                    
                    html += `
                        <div class="bg-white dark:bg-slate-800 p-3 rounded shadow-sm border border-slate-200 dark:border-slate-700 flex justify-between items-center mb-2">
                            <div class="flex flex-col">
                                <span class="font-medium text-sm text-slate-700 dark:text-slate-200">${c.title}</span>
                                <span class="text-xs text-slate-400">Lista original: ${listTitle}</span>
                            </div>
                            <div class="flex gap-2 shrink-0">
                                <button onclick="restoreItem('card', '${listDoc.id}', '${cardDoc.id}')" class="text-xs bg-blue-50 hover:bg-blue-100 text-blue-700 px-2 py-1 rounded border border-blue-200 transition">Recuperar</button>
                                <button onclick="deleteItemForever('card', '${listDoc.id}', '${cardDoc.id}')" class="text-xs bg-red-50 hover:bg-red-100 text-red-700 px-2 py-1 rounded border border-red-200 transition">Eliminar</button>
                            </div>
                        </div>`;
                });
            }
            if(!found) html = '<div class="flex flex-col items-center justify-center h-full text-slate-400"><i data-lucide="inbox" class="w-8 h-8 mb-2 opacity-50"></i><p class="text-sm">No hay tarjetas archivadas</p></div>';
        } else {
            // Buscar listas archivadas
            const listsSnap = await getDocs(query(collection(db, 'boards', currentBoardId, 'lists'), where('archived', '==', true)));
            if (listsSnap.empty) {
                html = '<div class="flex flex-col items-center justify-center h-full text-slate-400"><i data-lucide="inbox" class="w-8 h-8 mb-2 opacity-50"></i><p class="text-sm">No hay listas archivadas</p></div>';
            } else {
                listsSnap.forEach(doc => {
                    const l = doc.data();
                    html += `
                        <div class="bg-white dark:bg-slate-800 p-3 rounded shadow-sm border border-slate-200 dark:border-slate-700 flex justify-between items-center mb-2">
                            <span class="font-medium text-sm text-slate-700 dark:text-slate-200">${l.name}</span>
                            <div class="flex gap-2 shrink-0">
                                <button onclick="restoreItem('list', null, '${doc.id}')" class="text-xs bg-blue-50 hover:bg-blue-100 text-blue-700 px-2 py-1 rounded border border-blue-200 transition">Recuperar</button>
                                <button onclick="deleteItemForever('list', null, '${doc.id}')" class="text-xs bg-red-50 hover:bg-red-100 text-red-700 px-2 py-1 rounded border border-red-200 transition">Eliminar</button>
                            </div>
                        </div>`;
                });
            }
        }
        container.innerHTML = html;
        if(window.lucide) lucide.createIcons();
    }

    window.restoreItem = async (type, lid, id) => {
        try {
            if (type === 'card') await updateDoc(doc(db, 'boards', currentBoardId, 'lists', lid, 'cards', id), { archived: false });
            else await updateDoc(doc(db, 'boards', currentBoardId, 'lists', id), { archived: false });
            loadArchivedItems(type === 'card' ? 'cards' : 'lists'); 
        } catch(e){console.error(e);}
    };
    window.deleteItemForever = async (type, lid, id) => {
        if(!confirm("Esta acción es irreversible. ¿Eliminar para siempre?")) return;
        try {
            if (type === 'card') await deleteDoc(doc(db, 'boards', currentBoardId, 'lists', lid, 'cards', id));
            else await deleteDoc(doc(db, 'boards', currentBoardId, 'lists', id));
            loadArchivedItems(type === 'card' ? 'cards' : 'lists');
        } catch(e){console.error(e);}
    };

    // ========================================
    // 9. MODALES Y COMENTARIOS
    // ========================================
    function loadComments(lid, cid) {
        if (unsubscribeComments) unsubscribeComments();
        const listDiv = document.getElementById('comments-list');
        unsubscribeComments = onSnapshot(query(collection(db, 'boards', currentBoardId, 'lists', lid, 'cards', cid, 'comments'), orderBy('createdAt', 'desc')), (snap) => {
            if(!listDiv) return;
            listDiv.innerHTML = '';
            if (snap.empty) { listDiv.innerHTML = '<p class="text-xs text-slate-400 italic pl-2">No hay comentarios aún.</p>'; return; }
            snap.forEach(doc => {
                const c = doc.data();
                const div = document.createElement('div'); div.className = 'flex gap-3 items-start mb-3';
                div.innerHTML = `<div class="w-8 h-8 rounded-full bg-slate-200 dark:bg-slate-600 flex items-center justify-center text-xs font-bold text-slate-700 dark:text-slate-200 shrink-0">${(c.userName||'U').charAt(0).toUpperCase()}</div><div class="flex-1 min-w-0"><div class="flex items-baseline gap-2"><span class="text-sm font-bold text-[#172B4D] dark:text-slate-200">${c.userName}</span><span class="text-xs text-slate-500">${timeAgo(c.createdAt?.toDate())}</span></div><div class="p-2 bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg shadow-sm mt-1 text-sm text-slate-800 dark:text-slate-100 break-words">${c.text}</div></div>`;
                listDiv.appendChild(div);
            });
        });
    }

    function openCardModal(lid, cid=null, data=null) {
        currentCardData = { lid, cid, data };
        checklistHideCompleted = false;
        document.getElementById('card-title-input').value = data?.title||'';
        document.getElementById('card-description-input').value = data?.description||'';
        document.getElementById('card-due-date-input').value = data?.dueDate||'';
        document.getElementById('card-modal-title').innerHTML = data?'<i data-lucide="credit-card" class="w-3 h-3"></i> Editar':'<i data-lucide="plus" class="w-3 h-3"></i> Nueva';
        currentChecklist = data?.checklist||[]; currentCardCover = data?.cover||{color:null,mode:'banner',url:null}; currentAttachments = data?.attachments||[]; currentCardLabels = data?.labels||[]; currentCardMembers = data?.assignedTo||[]; 
        renderChecklist(); renderAttachments(); renderLabelsInModal(); renderAssignedMembersInput();
        if(cid) loadComments(lid, cid); else { const listDiv = document.getElementById('comments-list'); if(listDiv) listDiv.innerHTML = ''; }
        cardModal.classList.remove('hidden'); cardModal.style.display='flex'; lucide.createIcons();
    }

    document.getElementById('add-comment-btn')?.addEventListener('click', async () => {
        const inp = document.getElementById('comment-input'); const t=inp.value.trim();
        if(!t || !currentCardData.cid) return;
        try { await addDoc(collection(db, 'boards', currentBoardId, 'lists', currentCardData.lid, 'cards', currentCardData.cid, 'comments'), { text: t, userId: currentUser.uid, userName: currentUser.displayName||currentUser.email, createdAt: serverTimestamp() }); logActivity('added_comment', 'card', currentCardData.cid, { cardTitle: currentCardData.data.title, commentSnippet: t.substring(0,15)+'...' }); inp.value = ''; } catch(e) { console.error(e); }
    });

    function renderLabelsInModal() {
        const c = document.getElementById('card-labels-display');
        c.innerHTML = '';
        if (currentCardLabels.length) c.classList.remove('hidden'); else c.classList.add('hidden');
        currentCardLabels.forEach(l => {
            const s = document.createElement('span');
            s.className = `px-2 py-1 rounded text-xs font-bold ${l.bg} ${l.text}`;
            s.textContent = l.name;
            c.appendChild(s);
        });
    }

    function renderAssignedMembersInput() {
        const input = document.getElementById('card-assigned-input');
        const names = currentCardMembers.map(uid => currentBoardData.members[uid]?.name).join(', ');
        input.value = names;
        input.onclick = () => {
            const options = Object.entries(currentBoardData.members).map(([uid, m]) => `${m.email} (${m.name})`).join('\n');
            const email = prompt(`Escribe el email para asignar/quitar:\n\n${options}`);
            if(email) {
                const found = Object.entries(currentBoardData.members).find(([uid, m]) => m.email === email.trim());
                if(found) { const [uid] = found; currentCardMembers = currentCardMembers.includes(uid) ? currentCardMembers.filter(id => id !== uid) : [...currentCardMembers, uid]; renderAssignedMembersInput(); } else alert("Miembro no encontrado.");
            }
        };
    }

    document.getElementById('card-checklist-btn')?.addEventListener('click', () => { document.getElementById('new-checklist-item-input').focus(); });
    document.getElementById('card-due-date-btn')?.addEventListener('click', () => { document.getElementById('card-due-date-input').showPicker?.() || document.getElementById('card-due-date-input').focus(); });
    document.getElementById('attach-file-btn')?.addEventListener('click', () => { const u=prompt("URL:"); if(u) { const i=u.match(/\.(jpeg|jpg|png|webp)/); currentAttachments.push({name:i?'Imagen':'Enlace', url:u, type:i?'image':'link', addedAt:new Date().toISOString()}); renderAttachments(); }});
    document.getElementById('card-cover-btn')?.addEventListener('click', () => { 
        coverModal.classList.remove('hidden'); coverModal.style.display='flex'; 
        const coverModalContent = document.querySelector('#card-cover-modal > div'); const removeBtn = document.getElementById('remove-cover-btn');
        if (coverModalContent && removeBtn && !document.getElementById('emoji-btn-injected')) {
            const emojiBtn = document.createElement('button'); emojiBtn.id = 'emoji-btn-injected'; emojiBtn.className = "w-full text-xs py-1 mt-1 bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 dark:hover:bg-slate-600 dark:text-white rounded mb-2 font-medium"; emojiBtn.innerText = "😊 Usar Emoji"; emojiBtn.type = "button";
            emojiBtn.onclick = (e) => { e.preventDefault(); e.stopPropagation(); const emoji = prompt("Emoji:", "⚡"); if(emoji) { currentCardCover = { color: null, mode: 'color', url: null, emoji: emoji }; closeModal('card-cover-modal'); } };
            coverModalContent.insertBefore(emojiBtn, removeBtn);
        }
    });
    document.querySelectorAll('.cover-color').forEach(b => b.addEventListener('click', () => { currentCardCover={color:b.dataset.color, mode:'color', url:null}; closeModal('card-cover-modal'); }));
    document.getElementById('remove-cover-btn')?.addEventListener('click', () => { currentCardCover={color:null}; closeModal('card-cover-modal'); });

    document.getElementById('save-card-btn')?.addEventListener('click', async () => {
        const title = document.getElementById('card-title-input').value.trim(); if(!title) return;
        const payload = { title, description: document.getElementById('card-description-input').value.trim(), dueDate: document.getElementById('card-due-date-input').value, checklist: currentChecklist, cover: currentCardCover, attachments: currentAttachments, labels: currentCardLabels, assignedTo: currentCardMembers, updatedAt: serverTimestamp() };
        if(currentCardData.cid) { await updateDoc(doc(db,'boards',currentBoardId,'lists',currentCardData.lid,'cards',currentCardData.cid), payload); logActivity('updated_card', 'card', currentCardData.cid, { cardTitle: title }); } 
        else { const ref = await addDoc(collection(db,'boards',currentBoardId,'lists',currentCardData.lid,'cards'), {...payload, position:Date.now(), createdAt:serverTimestamp()}); logActivity('created_card', 'card', ref.id, { cardTitle: title }); }
        closeModal('card-modal');
    });

    // MODIFICADO PARA ARCHIVAR EN VEZ DE BORRAR
    document.getElementById('delete-card-btn')?.addEventListener('click', async()=>{
        if(confirm('¿Archivar esta tarjeta?')) { 
            await updateDoc(doc(db,'boards',currentBoardId,'lists',currentCardData.lid,'cards',currentCardData.cid), { archived: true }); 
            logActivity('archived_card', 'card', currentCardData.cid, { cardTitle: currentCardData.data.title }); 
            closeModal('card-modal'); 
        }
    });

    function renderChecklist() {
        const c = document.getElementById('checklist-items'); c.innerHTML='';
        const itemsToShow = checklistHideCompleted ? currentChecklist.filter(i => !i.completed) : currentChecklist;
        itemsToShow.forEach((i,x)=>{
            const realIndex = currentChecklist.indexOf(i);
            const d = document.createElement('div'); d.className='checklist-item group flex items-center gap-2 mb-1';
            d.innerHTML=`<input type="checkbox" ${i.completed?'checked':''} class="cursor-pointer rounded border-slate-300"><span class="flex-1 text-sm ${i.completed?'line-through text-slate-400':''} transition-all">${i.text}</span><button class="delete-item-btn opacity-0 group-hover:opacity-100 text-slate-400 hover:text-red-500"><i data-lucide="trash-2" class="w-3 h-3"></i></button>`;
            d.querySelector('input').addEventListener('change',e=>{ currentChecklist[realIndex].completed=e.target.checked; renderChecklist(); });
            d.querySelector('.delete-item-btn').addEventListener('click',()=>{ currentChecklist.splice(realIndex,1); renderChecklist(); });
            c.appendChild(d);
        });
        const total = currentChecklist.length; const completed = currentChecklist.filter(i=>i.completed).length;
        const p = document.getElementById('checklist-progress'); if(p) p.innerText = total ? Math.round((completed/total)*100)+'%' : '0%';
        const hideBtn = document.getElementById('hide-checklist-btn'); if(hideBtn) { hideBtn.innerHTML = checklistHideCompleted ? '<i data-lucide="eye" class="w-3 h-3"></i> Mostrar' : '<i data-lucide="eye-off" class="w-3 h-3"></i> Ocultar'; hideBtn.onclick = () => { checklistHideCompleted = !checklistHideCompleted; renderChecklist(); }; }
        if(window.lucide) lucide.createIcons();
    }
    function renderAttachments() {
        const c = document.getElementById('attachments-list'); c.innerHTML='';
        currentAttachments.forEach((a,x)=>{
            const d = document.createElement('div'); d.className='attachment-item';
            d.innerHTML=`<div class="attachment-thumbnail" style="background-image:url('${a.type==='image'?a.url:''}')"></div><div class="flex-1"><p class="text-sm font-bold truncate">${a.name}</p><button class="text-xs text-red-500 del">Eliminar</button>${a.type==='image'?`<button class="text-xs text-blue-500 ml-2 cover">Hacer Portada</button>`:''}</div>`;
            d.querySelector('.del').addEventListener('click',()=>{currentAttachments.splice(x,1); renderAttachments();});
            d.querySelector('.cover')?.addEventListener('click',()=>{ currentCardCover={mode:'banner',url:a.url}; alert('Portada puesta'); });
            c.appendChild(d);
        });
        if(window.lucide) lucide.createIcons();
    }
    document.getElementById('add-checklist-item-btn')?.addEventListener('click', () => { const inp = document.getElementById('new-checklist-item-input'); if(inp.value.trim()){ currentChecklist.push({text:inp.value.trim(), completed:false}); inp.value=''; renderChecklist(); } });

    // ========================================
    // 10. SISTEMA DE FILTROS
    // ========================================
    document.getElementById('filter-btn')?.addEventListener('click', (e) => {
        e.stopPropagation();
        const popover = document.getElementById('filter-popover');
        if (popover.classList.contains('hidden')) { renderFilterMenu(); popover.classList.remove('hidden'); } 
        else { popover.classList.add('hidden'); }
    });
    document.getElementById('close-filter-btn')?.addEventListener('click', () => document.getElementById('filter-popover').classList.add('hidden'));
    document.getElementById('clear-filters-btn')?.addEventListener('click', () => { activeFilters = { labels: [], members: [] }; updateFilterState(); });

function renderFilterMenu() {
        const labelsContainer = document.getElementById('filter-labels-list'); 
        labelsContainer.innerHTML = '';
        
        // CORRECCIÓN: Usar boardLabels (dinámicas) en vez de standardLabels (fijas)
        if (boardLabels.length === 0) {
            labelsContainer.innerHTML = '<p class="text-xs text-slate-400 italic">No hay etiquetas en este tablero</p>';
        } else {
            boardLabels.forEach(l => {
                const isChecked = activeFilters.labels.includes(l.name);
                const row = document.createElement('label'); 
                row.className = 'flex items-center gap-3 cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-700 p-2 rounded -mx-2';
                // Usamos l.bg y l.text que vienen de tus etiquetas personalizadas
                row.innerHTML = `<input type="checkbox" class="filter-checkbox rounded border-slate-300 text-blue-600" value="${l.name}" data-type="label" ${isChecked ? 'checked' : ''}><span class="w-full h-8 rounded ${l.bg} ${l.text} text-xs font-bold flex items-center px-2 capitalize shadow-sm">${l.name}${isChecked ? '<i data-lucide="check" class="ml-auto w-4 h-4"></i>' : ''}</span>`;
                row.querySelector('input').addEventListener('change', (e) => toggleFilter('labels', l.name, e.target.checked));
                labelsContainer.appendChild(row);
            });
        }

        // Renderizado de Miembros (Esto ya estaba bien, lo dejamos igual)
        const membersContainer = document.getElementById('filter-members-list'); 
        membersContainer.innerHTML = '';
        if (currentBoardData && currentBoardData.members) {
            Object.entries(currentBoardData.members).forEach(([uid, m]) => {
                const isChecked = activeFilters.members.includes(uid);
                const row = document.createElement('label'); 
                row.className = 'flex items-center gap-3 cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-700 p-2 rounded -mx-2';
                row.innerHTML = `<input type="checkbox" class="filter-checkbox rounded border-slate-300" value="${uid}" data-type="member" ${isChecked ? 'checked' : ''}><div class="w-6 h-6 rounded-full bg-slate-200 flex items-center justify-center text-[10px] font-bold text-slate-700 border border-slate-300">${m.name.charAt(0).toUpperCase()}</div><span class="text-sm text-slate-700 dark:text-slate-300 truncate flex-1">${m.name}</span>`;
                row.querySelector('input').addEventListener('change', (e) => toggleFilter('members', uid, e.target.checked));
                membersContainer.appendChild(row);
            });
        }
        if(window.lucide) lucide.createIcons();
    }

    function toggleFilter(type, value, isChecked) {
        if (isChecked) activeFilters[type].push(value); else activeFilters[type] = activeFilters[type].filter(v => v !== value);
        updateFilterState(); renderFilterMenu();
    }
    function updateFilterState() {
        const total = activeFilters.labels.length + activeFilters.members.length;
        const btn = document.getElementById('filter-btn'); const badge = document.getElementById('filter-badge'); const clear = document.getElementById('clear-filters-btn');
        if (total > 0) { btn.classList.add('bg-white', 'text-blue-700'); btn.classList.remove('bg-white/20', 'text-white'); badge.textContent = total; badge.classList.remove('hidden'); clear.disabled = false; } 
        else { btn.classList.remove('bg-white', 'text-blue-700'); btn.classList.add('bg-white/20', 'text-white'); badge.classList.add('hidden'); clear.disabled = true; }
        document.querySelectorAll('.list-card').forEach(card => applyFiltersToCard(card));
    }
    function applyFiltersToCard(card) {
        const cardLabels = card.dataset.labels ? card.dataset.labels.split(',').filter(l => l.trim() !== '') : [];
        const cardMembers = card.dataset.members ? card.dataset.members.split(',').filter(m => m.trim() !== '') : [];
        
        let labelMatch = true;
        if (activeFilters.labels.length > 0) {
            labelMatch = activeFilters.labels.some(l => cardLabels.includes(l));
        }
        
        let memberMatch = true;
        if (activeFilters.members.length > 0) {
            memberMatch = activeFilters.members.some(m => cardMembers.includes(m));
        }
        
        if (labelMatch && memberMatch) {
            card.classList.remove('hidden');
        } else {
            card.classList.add('hidden');
        }
    }


    // ========================================
    // 11. GESTIÓN DE MIEMBROS
    // ========================================
    /*document.getElementById('toggle-members-btn')?.addEventListener('click', () => {
        const panel = document.getElementById('members-panel');
        const activity = document.getElementById('activity-panel');
        const notif = document.getElementById('notifications-dropdown');
        
        if (!panel) return;
        
        const isHidden = panel.classList.contains('hidden') || panel.style.display === 'none';
        
        // Cerrar otros paneles
        if (activity) {
            activity.classList.add('hidden');
            activity.style.display = 'none';
        }
        if (notif) {
            notif.classList.add('hidden');
            notif.style.display = 'none';
        }
        
        // Toggle del panel de miembros
        if (isHidden) {
            renderMembersPanel(); // ← AGREGAR ESTA LÍNEA
            panel.classList.remove('hidden');
            panel.style.display = 'block';
        } else {
            panel.classList.add('hidden');
            panel.style.display = 'none';
        }
    });*/

    document.getElementById('close-members-btn')?.addEventListener('click', () => document.getElementById('members-panel').classList.add('hidden'));

    function renderMembersPanel() {
        const container = document.getElementById('members-list');
        if (!container || !currentBoardData) return;
        container.innerHTML = '';
        const membersArr = Object.entries(currentBoardData.members).map(([uid, data]) => ({ uid, ...data }));
        membersArr.sort((a, b) => { if (a.role === 'owner') return -1; if (b.role === 'owner') return 1; return a.name.localeCompare(b.name); });

        membersArr.forEach(m => {
            const isMe = m.uid === currentUser.uid;
            const isOwner = m.role === 'owner';
            const iAmOwner = currentBoardData.ownerId === currentUser.uid;
            const canRemove = iAmOwner && !isMe;
            const div = document.createElement('div');
            div.className = 'flex items-center gap-3 p-2 hover:bg-slate-50 dark:hover:bg-slate-700 rounded transition group';
            div.innerHTML = `
                <div class="w-8 h-8 rounded-full bg-slate-200 flex items-center justify-center text-xs font-bold text-slate-700 border border-slate-300 shrink-0">${m.name.charAt(0).toUpperCase()}</div>
                <div class="flex-1 min-w-0 overflow-hidden"><div class="flex items-center gap-2"><p class="text-sm font-bold text-slate-700 dark:text-slate-200 truncate">${m.name} ${isMe ? '(Tú)' : ''}</p>${isOwner ? '<span class="text-[10px] bg-yellow-100 text-yellow-700 px-1.5 rounded font-bold">👑</span>' : ''}</div><p class="text-xs text-slate-500 truncate">${m.email}</p></div>
                ${canRemove ? `<button class="remove-member-btn opacity-0 group-hover:opacity-100 text-slate-400 hover:text-red-600 p-1.5 rounded hover:bg-red-50 transition"><i data-lucide="user-x" class="w-4 h-4"></i></button>` : ''}`;
            if (canRemove) div.querySelector('.remove-member-btn').addEventListener('click', () => removeMemberFromBoard(m));
            container.appendChild(div);
        });
        if(window.lucide) lucide.createIcons();
    }

    async function removeMemberFromBoard(member) {
        if (!confirm(`¿Expulsar a ${member.name}?`)) return;
        try {
            const boardRef = doc(db, 'boards', currentBoardId);
            const newMembers = { ...currentBoardData.members };
            delete newMembers[member.uid];
            await updateDoc(boardRef, { members: newMembers, memberEmails: arrayRemove(member.email) });
            logActivity('removed_member', 'board', currentBoardId, { memberName: member.name, memberEmail: member.email });
            alert('Usuario expulsado.');
        } catch (e) { console.error(e); alert("Error al expulsar"); }
    }

    // ========================================
    // 12. UTILIDADES FINALES
    // ========================================
    function closeModal(id) { const m = document.getElementById(id); if (m) { m.classList.add('hidden'); m.style.display = 'none'; if (id === 'card-modal' && unsubscribeComments) { unsubscribeComments(); unsubscribeComments = null; } } }
    document.querySelectorAll('[id^="cancel-"]').forEach(b => b.addEventListener('click',e=>closeModal(e.target.closest('.fixed').id)));
    document.getElementById('create-board-btn').addEventListener('click',()=>{boardModal.classList.remove('hidden');boardModal.style.display='flex'});
    document.getElementById('add-list-btn').addEventListener('click',()=>{listModal.classList.remove('hidden');listModal.style.display='flex'});
    document.getElementById('save-list-btn').addEventListener('click',async()=>{ const v=document.getElementById('list-name-input').value.trim(); if(v){ const ref = await addDoc(collection(db,'boards',currentBoardId,'lists'),{name:v,position:Date.now(),createdAt:serverTimestamp()}); logActivity('created_list', 'list', null, { listName: v }); allSearchCache.push({ id: ref.id, type: 'list', title: v, boardId: currentBoardId, boardTitle: currentBoardData.title }); closeModal('list-modal'); document.getElementById('list-name-input').value=''; } });
    document.getElementById('save-board-btn').addEventListener('click',async()=>{ const v=document.getElementById('board-name-input').value.trim(); if(v){ const ref = await addDoc(collection(db,'boards'),{title:v,ownerId:currentUser.uid,memberEmails:[currentUser.email],members:{[currentUser.uid]:{email:currentUser.email,name:currentUser.displayName||'User',role:'owner'}},createdAt:serverTimestamp()}); allSearchCache.push({ id: ref.id, type: 'board', title: v }); closeModal('board-modal'); } });
    document.getElementById('back-to-boards-btn').addEventListener('click', ()=>{ boardView.style.display='none'; document.querySelector('.boards-section').style.display='block'; document.getElementById('create-board-btn').classList.remove('hidden'); if(unsubscribeLists) unsubscribeLists(); if(unsubscribeActivity) unsubscribeActivity(); currentBoardId=null; renderBoards(); });

// Conectar botones de cierre de Exportar/Importar
    document.getElementById('close-export-modal')?.addEventListener('click', () => closeModal('export-modal'));
    document.getElementById('close-import-modal')?.addEventListener('click', () => {
        closeModal('import-modal');
        // Limpiamos el input y deshabilitamos el botón al cerrar
        document.getElementById('import-file-input').value = '';
        document.getElementById('confirm-import-btn').disabled = true;
    });
    
    function initGlobalShortcuts() {
        document.addEventListener('keydown', (e) => {
            // 1. SEGURIDAD: Ignorar si el usuario escribe en un input o textarea
            if (e.target.matches('input, textarea') || e.target.isContentEditable) return;

            // 2. CONTEXTO: Comprobar si hay un tablero abierto (si no, no hacemos nada)
            const isBoardOpen = currentBoardId && !boardView.classList.contains('hidden');
            
            // Excepción: Esc siempre debe funcionar para cerrar modales, incluso fuera del tablero
            if (e.key === 'Escape') {
                document.querySelectorAll('.fixed').forEach(m => {
                    if (!m.classList.contains('hidden')) closeModal(m.id);
                });
                // Cerrar paneles y limpiar búsqueda
                document.getElementById('filter-popover')?.classList.add('hidden');
                searchResults?.classList.add('hidden');
                document.getElementById('members-panel')?.classList.add('hidden');
                document.getElementById('activity-panel')?.classList.add('hidden');
                return;
            }

            // Si no hay tablero abierto, detener aquí
            if (!isBoardOpen) return;

            switch (e.key.toLowerCase()) {
                // --- BÚSQUEDA (/) ---
                case '/':
                    e.preventDefault();
                    searchInput.focus();
                    break;
                    
                case 'escape': 
                    // Cierra cualquier modal abierto (busca todos los elementos con clase .fixed)
                    document.querySelectorAll('.fixed').forEach(m => {
                        // Si no está oculto, ciérralo usando la función corregida
                        if (!m.classList.contains('hidden')) closeModal(m.id);
                    });
                    
                    // Cierra paneles y búsqueda
                    document.getElementById('filter-popover')?.classList.add('hidden');
                    searchResults?.classList.add('hidden');
                    document.getElementById('members-panel')?.classList.add('hidden');
                    document.getElementById('activity-panel')?.classList.add('hidden');
                    
                    // Limpiar estado visual de filtros si se cierra con Esc
                    document.getElementById('members-panel')?.style.display = 'none'; // Asegurar cierre
                    break;    

                // --- NUEVA TARJETA (N) ---
                case 'n': 
                    e.preventDefault();
                    if (hasPermission('createCard')) {
                        const firstList = document.querySelector('.list');
                        // Intenta abrir en la primera lista disponible
                        if (firstList) openCardModal(firstList.dataset.listId);
                    }
                    break;

                // --- NUEVA LISTA (L) --- 
                case 'l': 
                    e.preventDefault();
                    if (hasPermission('createList')) {
                        // Simulamos clic en el botón de añadir lista
                        const addListBtn = document.getElementById('add-list-btn');
                        if (addListBtn) addListBtn.click();
                        // Damos foco al input inmediatamente (pequeño delay para que el modal abra)
                        setTimeout(() => document.getElementById('list-name-input')?.focus(), 50);
                    }
                    break;

                // --- FILTROS (F) ---
                case 'f': 
                    e.preventDefault();
                    const filterBtn = document.getElementById('filter-btn');
                    if (filterBtn) filterBtn.click();
                    break;

                // --- ATAJO PRO: "Q" (SOLO MIS TARJETAS) ---
                case 'q':
                    e.preventDefault();
                    const myId = currentUser.uid;
                    
                    // Lógica de Toggle: Si ya me estoy filtrando, me quito. Si no, me pongo.
                    if (activeFilters.members.includes(myId)) {
                        activeFilters.members = activeFilters.members.filter(id => id !== myId);
                        // Feedback visual: Quitar borde verde del botón filtro
                        document.getElementById('filter-btn').classList.remove('ring-2', 'ring-green-400', 'border-green-500');
                    } else {
                        activeFilters.members.push(myId);
                        // Feedback visual: Poner borde verde para indicar "Filtro activo"
                        document.getElementById('filter-btn').classList.add('ring-2', 'ring-green-400');
                    }
                    
                    // Esta función ya la tienes, se encarga de ocultar/mostrar las tarjetas
                    updateFilterState();
                    break;
                
                // --- SCROLL HORIZONTAL (Flechas) ---
                case 'arrowright':
                    const containerR = document.getElementById('lists-container');
                    if (containerR) containerR.scrollBy({ left: 300, behavior: 'smooth' });
                    break;

                case 'arrowleft':
                    const containerL = document.getElementById('lists-container');
                    if (containerL) containerL.scrollBy({ left: -300, behavior: 'smooth' });
                    break;
            }
        });
    }

    // ========================================
    // 13. SCROLL LATERAL (DRAG TO SCROLL)
    // ========================================
    function initDragToScroll() {
        const slider = document.getElementById('lists-container');
        let isDown = false;
        let startX;
        let scrollLeft;

        slider.addEventListener('mousedown', (e) => {
            // CRÍTICO: Solo activar si clicamos en el fondo, NO en una lista o tarjeta
            // Si clicamos en una tarjeta o lista, dejamos que el Drag&Drop nativo actúe
            if (e.target.closest('.list') || e.target.closest('.list-card')) return;
            
            isDown = true;
            slider.classList.add('active'); // Cambia cursor a grabbing (CSS)
            startX = e.pageX - slider.offsetLeft;
            scrollLeft = slider.scrollLeft;
        });

        slider.addEventListener('mouseleave', () => {
            isDown = false;
            slider.classList.remove('active');
        });

        slider.addEventListener('mouseup', () => {
            isDown = false;
            slider.classList.remove('active');
        });

        slider.addEventListener('mousemove', (e) => {
            if (!isDown) return;
            e.preventDefault(); // Evitar selección de texto
            const x = e.pageX - slider.offsetLeft;
            const walk = (x - startX) * 2; // Velocidad del scroll (x2 para que sea fluido)
            slider.scrollLeft = scrollLeft - walk;
        });
    }
    initDragToScroll(); // Iniciar la lógica

    // === EVENT LISTENERS PARA GESTIÓN DE ETIQUETAS ===
    // Cerrar modal de etiquetas
    document.getElementById('close-labels-modal')?.addEventListener('click', () => {
        closeModal('labels-modal');
    });
    // Abrir modal de etiquetas desde tarjeta
    document.getElementById('card-labels-btn')?.addEventListener('click', async () => {
        await loadBoardLabels();
        labelsModal.classList.remove('hidden');
        labelsModal.style.display = 'flex';
    });

    // Cancelar modal de etiquetas
    document.getElementById('cancel-labels-btn')?.addEventListener('click', () => closeModal('labels-modal'));

    // Crear nueva etiqueta
    document.getElementById('create-new-label-btn')?.addEventListener('click', () => {
        openLabelEditor(null);
    });

    // Cerrar editor de etiquetas
    document.getElementById('close-label-editor')?.addEventListener('click', () => {
        closeModal('label-editor-modal');
    });

    // Seleccionar color en el editor
    document.querySelectorAll('.label-color-option').forEach(option => {
        option.addEventListener('click', (e) => {
            selectedLabelColor = {
                bg: e.target.dataset.color,
                text: e.target.dataset.text
            };
            
            document.querySelectorAll('.label-color-option').forEach(opt => {
                opt.classList.remove('ring-4', 'ring-blue-500');
            });
            e.target.classList.add('ring-4', 'ring-blue-500');
        });
    });

    // Guardar etiqueta
    document.getElementById('save-label-btn')?.addEventListener('click', saveBoardLabel);

    // Eliminar etiqueta
    document.getElementById('delete-label-btn')?.addEventListener('click', deleteBoardLabel);

    // Enter para guardar en el input de nombre
    document.getElementById('label-name-input')?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            saveBoardLabel();
        }
    });


    // ========================================
    // DELEGACIÓN DE EVENTOS PARA PANELES (IDS CORRECTOS)
    // ========================================
    document.body.addEventListener('click', (e) => {
        // Botón de actividad (ID CORRECTO: toggle-activity-btn)
        if (e.target.closest('#toggle-activity-btn')) {
            e.preventDefault();
            e.stopPropagation();
            
            const panel = document.getElementById('activity-panel');
            const members = document.getElementById('members-panel');
            const notif = document.getElementById('notifications-dropdown');
            
            if (!panel) return;
            
            const isHidden = panel.classList.contains('hidden') || panel.style.display === 'none';
            
            // Cerrar otros paneles
            if (members) {
                members.classList.add('hidden');
                members.style.display = 'none';
            }
            if (notif) {
                notif.classList.add('hidden');
                notif.style.display = 'none';
            }
            
            // Toggle del panel de actividad
            if (isHidden) {
                panel.classList.remove('hidden');
                panel.style.display = 'block';
            } else {
                panel.classList.add('hidden');
                panel.style.display = 'none';
            }
        }
        
        // Cerrar panel de actividad
        if (e.target.closest('#close-activity-btn')) {
            const panel = document.getElementById('activity-panel');
            if (panel) {
                panel.classList.add('hidden');
                panel.style.display = 'none';
            }
        }
        
        // Botón de miembros (ID CORRECTO: toggle-members-btn)
        if (e.target.closest('#toggle-members-btn')) {
            e.preventDefault();
            e.stopPropagation();
            
            const panel = document.getElementById('members-panel');
            const activity = document.getElementById('activity-panel');
            const notif = document.getElementById('notifications-dropdown');
            
            if (!panel) return;
            
            const isHidden = panel.classList.contains('hidden') || panel.style.display === 'none';
            
            // Cerrar otros paneles
            if (activity) {
                activity.classList.add('hidden');
                activity.style.display = 'none';
            }
            if (notif) {
                notif.classList.add('hidden');
                notif.style.display = 'none';
            }
            
            // Toggle del panel de miembros
            if (isHidden) {
                renderMembersPanel();
                panel.classList.remove('hidden');
                panel.style.display = 'block';
            } else {
                panel.classList.add('hidden');
                panel.style.display = 'none';
            }
        }
        
        // Cerrar panel de miembros
        if (e.target.closest('#close-members-btn')) {
            const panel = document.getElementById('members-panel');
            if (panel) {
                panel.classList.add('hidden');
                panel.style.display = 'none';
            }
        }
    }, true);

    // ========================================
    // 14. MEJORA UX: TECLA ENTER EN INPUTS
    // ========================================
    function setupEnterKeys() {
        // Función helper para vincular un Input con su Botón
        const bindEnter = (inputId, btnId) => {
            const input = document.getElementById(inputId);
            const btn = document.getElementById(btnId);
            
            if(input && btn) {
                input.addEventListener('keydown', (e) => {
                    if(e.key === 'Enter') {
                        e.preventDefault(); // Evita saltos de línea innecesarios
                        btn.click();        // Simula el click en el botón
                    }
                });
            }
        };

        // --- Configuración de Enlaces ---

        // 1. Autenticación (Login y Registro)
        bindEnter('login-password', 'login-btn');
        bindEnter('register-password', 'register-btn');
        // También permitimos enter en el email por si el usuario ya escribió la pass
        bindEnter('login-email', 'login-btn'); 

        // 2. Creación (Tableros y Listas)
        bindEnter('board-name-input', 'save-board-btn');
        bindEnter('list-name-input', 'save-list-btn');

        // 3. Dentro de la Tarjeta (Checklist y Comentarios)
        bindEnter('new-checklist-item-input', 'add-checklist-item-btn');
        bindEnter('comment-input', 'add-comment-btn');
        
        // 4. Invitaciones
        bindEnter('invite-email-input', 'send-invite-btn');
        
        // 5. Búsqueda Global (Opcional, si quieres que Enter abra el primer resultado)
        const searchInp = document.getElementById('global-search');
        if(searchInp) {
            searchInp.addEventListener('keydown', (e) => {
                if(e.key === 'Enter') {
                    // Si no hay resultado seleccionado con flechas, abrir el primero
                    const firstResult = document.querySelector('.search-result-item');
                    if(firstResult && selectedResultIndex === -1) {
                        firstResult.click();
                    }
                }
            });
        }
    }

    // ========================================
    // 15. ABANDONAR TABLERO
    // ========================================
    
    document.getElementById('leave-board-btn')?.addEventListener('click', leaveCurrentBoard);

    async function leaveCurrentBoard() {
        if (!currentBoardId || !currentUser) return;

        if (!confirm(`¿Estás seguro de que quieres abandonar el tablero "${currentBoardData.title}"? Ya no podrás verlo a menos que te inviten de nuevo.`)) {
            return;
        }

        try {
            const boardRef = doc(db, 'boards', currentBoardId);

            // Operación atómica: Borrar la clave del usuario del mapa 'members'
            // y quitar el email del array 'memberEmails'
            await updateDoc(boardRef, {
                [`members.${currentUser.uid}`]: deleteField(),
                memberEmails: arrayRemove(currentUser.email)
            });

            // Registrar actividad antes de perder acceso visual
            // Nota: Técnicamente ya no tienes acceso, pero el log se intenta enviar.
            // Si falla por reglas de seguridad, no es crítico.
            try {
                await addDoc(collection(db, 'activity_logs'), {
                    boardId: currentBoardId,
                    userId: currentUser.uid,
                    userName: currentUser.displayName || currentUser.email,
                    action: 'left_board',
                    entityType: 'board',
                    entityId: currentBoardId,
                    timestamp: serverTimestamp()
                });
            } catch (logError) {
                console.warn("No se pudo registrar log de salida (posible falta de permisos tras salir).");
            }

            alert('Has abandonado el tablero exitosamente.');

            // Simular clic en "Volver" para ir a la lista de tableros
            document.getElementById('back-to-boards-btn').click();
            
            // Recargar la lista de tableros para que desaparezca el actual
            loadBoards();

        } catch (error) {
            console.error('Error al abandonar tablero:', error);
            alert('Hubo un error al intentar salir del tablero: ' + error.message);
        }
    }

// ========================================
    // 16. EXPORTAR E IMPORTAR (JSON & XML) - VERSIÓN CORREGIDA
    // ========================================

    // --- HELPERS XML ---
    const OBJtoXML = (obj) => {
        let xml = '';
        for (let prop in obj) {
            if (obj[prop] instanceof Array) {
                for (let array in obj[prop]) {
                    xml += `<${prop}>` + OBJtoXML(new Object(obj[prop][array])) + `</${prop}>`;
                }
            } else if (typeof obj[prop] == "object" && obj[prop] !== null) {
                xml += `<${prop}>` + OBJtoXML(new Object(obj[prop])) + `</${prop}>`;
            } else {
                xml += `<${prop}>` + (obj[prop] || '') + `</${prop}>`;
            }
        }
        return xml;
    }

    const XMLtoOBJ = (xmlText) => {
        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(xmlText, "text/xml");
        
        // Función recursiva para convertir DOM XML a Objeto JS
        function xmlToJson(xml) {
            let obj = {};
            if (xml.nodeType == 1) { // element
                if (xml.attributes.length > 0) {
                    for (let j = 0; j < xml.attributes.length; j++) {
                        const attribute = xml.attributes.item(j);
                        obj[attribute.nodeName] = attribute.nodeValue;
                    }
                }
            } else if (xml.nodeType == 3) { // text
                obj = xml.nodeValue;
            }

            if (xml.hasChildNodes()) {
                for(let i = 0; i < xml.childNodes.length; i++) {
                    const item = xml.childNodes.item(i);
                    const nodeName = item.nodeName;
                    
                    if (typeof(obj[nodeName]) == "undefined") {
                        // Detectar nodos que deben ser Arrays siempre
                        if (['lists', 'cards', 'labels', 'checklist'].includes(nodeName)) {
                            const inner = xmlToJson(item);
                            obj[nodeName] = Array.isArray(inner) ? inner : [inner];
                        } else {
                            // Caso normal: texto o objeto
                            const inner = xmlToJson(item);
                            // Si el nodo es solo texto (#text), simplificar
                            if (item.childNodes.length === 1 && item.childNodes[0].nodeType === 3) {
                                obj[nodeName] = item.childNodes[0].nodeValue;
                            } else {
                                obj[nodeName] = inner;
                            }
                        }
                    } else {
                        if (typeof(obj[nodeName].push) == "undefined") {
                            const old = obj[nodeName];
                            obj[nodeName] = [];
                            obj[nodeName].push(old);
                        }
                        // Caso especial texto
                        if (item.childNodes.length === 1 && item.childNodes[0].nodeType === 3) {
                            obj[nodeName].push(item.childNodes[0].nodeValue);
                        } else {
                            obj[nodeName].push(xmlToJson(item));
                        }
                    }
                }
            }
            return obj;
        }
        
        const res = xmlToJson(xmlDoc);
        return res.root ? res.root : res;
    }

    // --- UI MODALES ---
    const exportModal = document.getElementById('export-modal');
    const importModal = document.getElementById('import-modal');
    const importInput = document.getElementById('import-file-input');
    const confirmImportBtn = document.getElementById('confirm-import-btn');

    document.getElementById('open-export-modal-btn')?.addEventListener('click', () => {
        exportModal.classList.remove('hidden'); 
        exportModal.style.display = 'flex'; // Forzamos flex
    });
    // CERRAR EXPORTAR (Corrección: Forzar display none)
    document.getElementById('close-export-modal')?.addEventListener('click', () => {
        exportModal.classList.add('hidden');
        exportModal.style.display = 'none'; // CRÍTICO: Limpia el estilo en línea
    });
    // Abrir Importar
    document.getElementById('open-import-modal-btn')?.addEventListener('click', () => {
        importModal.classList.remove('hidden'); 
        importModal.style.display = 'flex';
    });
    // CERRAR IMPORTAR (Corrección: Forzar display none y limpiar)
    document.getElementById('close-import-modal')?.addEventListener('click', () => {
        importModal.classList.add('hidden');
        importModal.style.display = 'none'; // CRÍTICO
        importInput.value = ''; 
        confirmImportBtn.disabled = true;
    });

    importInput?.addEventListener('change', () => {
        confirmImportBtn.disabled = !importInput.files.length;
    });

    // --- LÓGICA EXPORTAR ---
    const handleExport = async (format) => {
        if (!currentBoardId || !currentBoardData) return;
        
        try {
            // Obtener etiquetas limpias
            const boardDoc = await getDoc(doc(db, 'boards', currentBoardId));
            const boardLabels = boardDoc.data().labels || [];

            const exportData = {
                version: '1.0',
                type: 'trello-clone-board',
                board: {
                    title: currentBoardData.title,
                    background: currentBoardData.background || '#0079BF',
                    labels: boardLabels // <--- IMPORTANTE: Array de objetos {name, color...}
                },
                lists: [],
                cards: []
            };

            // Recopilar Listas
            const listsSnap = await getDocs(query(collection(db, 'boards', currentBoardId, 'lists'), orderBy('position')));
            for (const listDoc of listsSnap.docs) {
                const l = listDoc.data();
                exportData.lists.push({
                    oldId: listDoc.id,
                    name: l.name,
                    position: l.position,
                    archived: !!l.archived
                });

                // Recopilar Tarjetas
                const cardsSnap = await getDocs(query(collection(db, 'boards', currentBoardId, 'lists', listDoc.id, 'cards'), orderBy('position')));
                cardsSnap.forEach(cDoc => {
                    const c = cDoc.data();
                    exportData.cards.push({
                        listId: listDoc.id,
                        title: c.title,
                        description: c.description || '',
                        position: c.position,
                        cover: c.cover || null,
                        labels: c.labels || [],
                        checklist: c.checklist || [],
                        dueDate: c.dueDate || null,
                        dueComplete: !!c.dueComplete,
                        archived: !!c.archived
                    });
                });
            }

            let content, mime, ext;
            if (format === 'xml') {
                content = '<?xml version="1.0" encoding="UTF-8"?><root>' + OBJtoXML(exportData) + '</root>';
                mime = 'application/xml';
                ext = 'xml';
            } else {
                content = JSON.stringify(exportData, null, 2);
                mime = 'application/json';
                ext = 'json';
            }

            const blob = new Blob([content], { type: mime });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `tablero-${currentBoardData.title.replace(/\s+/g, '-').toLowerCase()}.${ext}`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            
            exportModal.classList.add('hidden');

        } catch (e) {
            console.error(e);
            alert("Error al exportar.");
        }
    };

    document.getElementById('export-json-btn')?.addEventListener('click', () => handleExport('json'));
    document.getElementById('export-xml-btn')?.addEventListener('click', () => handleExport('xml'));

    // --- LÓGICA IMPORTAR ---
    confirmImportBtn?.addEventListener('click', () => {
        const file = importInput.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = async (e) => {
            try {
                const txt = e.target.result;
                let data;
                
                // Detección simple de formato
                if (txt.trim().startsWith('<')) {
                    // XML
                    const rawData = XMLtoOBJ(txt);
                    // Normalizar estructura XML que a veces anida arrays
                    data = { 
                        board: rawData.board, 
                        lists: Array.isArray(rawData.lists) ? rawData.lists : (rawData.lists ? [rawData.lists] : []),
                        cards: Array.isArray(rawData.cards) ? rawData.cards : (rawData.cards ? [rawData.cards] : [])
                    };
                    
                    // Normalizar etiquetas de XML (pueden venir como string si están vacías o mal parseadas)
                    if (data.board.labels && !Array.isArray(data.board.labels)) {
                         // Intento de arreglo manual para XMLs raros
                         data.board.labels = data.board.labels.label ? (Array.isArray(data.board.labels.label) ? data.board.labels.label : [data.board.labels.label]) : [];
                    }
                } else {
                    // JSON
                    data = JSON.parse(txt);
                }

                if(!data.board || !data.board.title) throw new Error("Estructura inválida");

                // 1. Crear Tablero con Etiquetas
                const newBoard = {
                    title: data.board.title + ' (Importado)',
                    background: data.board.background,
                    labels: data.board.labels || [], // <--- AQUÍ CARGAMOS LAS ETIQUETAS
                    ownerId: currentUser.uid,
                    ownerEmail: currentUser.email,
                    members: { [currentUser.uid]: { email: currentUser.email, name: currentUser.displayName||'User', role: 'owner' } },
                    memberEmails: [currentUser.email],
                    createdAt: serverTimestamp()
                };

                const bRef = await addDoc(collection(db, 'boards'), newBoard);
                const bId = bRef.id;
                const listMap = {};

                // 2. Crear Listas
                const lists = data.lists || [];
                for(const l of lists) {
                    const ref = await addDoc(collection(db, 'boards', bId, 'lists'), {
                        name: l.name,
                        position: Number(l.position),
                        archived: l.archived === true || l.archived === 'true',
                        createdAt: serverTimestamp()
                    });
                    listMap[l.oldId] = ref.id;
                    
                    // ACTUALIZAR CACHÉ DE BÚSQUEDA MANUALMENTE
                    allSearchCache.push({ id: ref.id, type: 'list', title: l.name, boardId: bId, boardTitle: newBoard.title, score: 0 });
                }

                // 3. Crear Tarjetas
                const cards = data.cards || [];
                const batchPromises = cards.map(c => {
                    const lid = listMap[c.listId];
                    if(!lid) return null;
                    
                    const cardData = {
                        title: c.title,
                        description: c.description,
                        position: Number(c.position),
                        cover: c.cover,
                        labels: Array.isArray(c.labels) ? c.labels : [], // Asegurar array
                        checklist: Array.isArray(c.checklist) ? c.checklist : [],
                        dueDate: c.dueDate,
                        dueComplete: c.dueComplete === true || c.dueComplete === 'true',
                        archived: c.archived === true || c.archived === 'true',
                        createdAt: serverTimestamp()
                    };

                    // Promesa para crear tarjeta
                    return addDoc(collection(db, 'boards', bId, 'lists', lid, 'cards'), cardData)
                        .then(ref => {
                            // ACTUALIZAR CACHÉ DE BÚSQUEDA MANUALMENTE
                            allSearchCache.push({ 
                                id: ref.id, type: 'card', title: c.title, description: c.description, 
                                listId: lid, listName: '...', // Nombre de lista pendiente, no crítico para buscar
                                boardId: bId, boardTitle: newBoard.title, score: 0 
                            });
                        });
                });

                await Promise.all(batchPromises);

                // ACTUALIZAR CACHÉ DE BÚSQUEDA (TABLERO)
                allSearchCache.push({ id: bId, type: 'board', title: newBoard.title, score: 0 });

                importModal.classList.add('hidden');
                alert("Importado correctamente.");
                loadBoards(); // Refrescar dashboard

            } catch (err) {
                console.error(err);
                alert("Error importando: " + err.message);
            }
        };
        reader.readAsText(file);
    });
    
    // Ejecutar la configuración
    setupEnterKeys();

// ↓↓↓ ESTA ES LA LLAVE DE CIERRE QUE YA TIENES AL FINAL DEL ARCHIVO ↓↓↓

} // ← Este es el cierre de initializeApp

