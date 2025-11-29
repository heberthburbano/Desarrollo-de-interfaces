import { auth, db } from './firebase-config.js';
import { 
    collection, addDoc, doc, updateDoc, deleteDoc, query, where, onSnapshot, 
    orderBy, serverTimestamp, getDoc, getDocs, arrayUnion, arrayRemove, setDoc 
} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';

document.addEventListener('DOMContentLoaded', initializeApp);

function initializeApp() {
    console.log('🚀 Inicializando Trello Clone (Versión Final Integrada)...');

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
    
    // Suscripciones
    let unsubscribeBoards, unsubscribeLists, unsubscribeActivity, unsubscribeNotifications, unsubscribeComments; 
    let unsubscribeCards = {}; 

    // DOM Elements
    const boardsContainer = document.getElementById('boards-container');
    const boardView = document.getElementById('board-view');
    const listsContainer = document.getElementById('lists-container');
    const boardModal = document.getElementById('board-modal');
    const listModal = document.getElementById('list-modal');
    const cardModal = document.getElementById('card-modal');
    const coverModal = document.getElementById('card-cover-modal');
    const labelsModal = document.getElementById('labels-modal');
    const inviteModal = document.getElementById('invite-modal');
    
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

    function initSearchListeners() {
        searchInput?.addEventListener('input', (e) => {
            const term = e.target.value.trim().toLowerCase();
            if(term.length < 2) { searchResults.classList.add('hidden'); selectedResultIndex = -1; return; }
            const results = allSearchCache.map(item => {
                const titleScore = calculateScore(item.title, term);
                const descScore = item.description ? calculateScore(item.description, term) : 0;
                return { ...item, score: Math.max(titleScore, descScore) };
            }).filter(item => item.score > 0).sort((a, b) => b.score - a.score);
            renderSearchResults(results.slice(0, 10), term);
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

    function loadLists(bid) {
        if(unsubscribeLists) unsubscribeLists();
        unsubscribeLists = onSnapshot(query(collection(db, 'boards', bid, 'lists'), orderBy('position')), (snap) => {
            Array.from(listsContainer.querySelectorAll('.list-wrapper:not(:last-child)')).forEach(el=>el.remove());
            const btn = listsContainer.lastElementChild;
            snap.forEach(doc => {
                const el = createListElement(doc.id, doc.data());
                listsContainer.insertBefore(el, btn);
                loadCards(bid, doc.id, el.querySelector('.cards-container'));
            });
            if(window.lucide) lucide.createIcons();
        });
    }

    function createListElement(lid, data) {
        const w = document.createElement('div'); w.className = 'list-wrapper';
        const d = document.createElement('div'); d.className = 'list'; d.dataset.listId = lid;
        d.innerHTML = `
            <div class="list-header group flex justify-between items-center p-2">
                <h3 class="truncate text-sm font-semibold text-[#172B4D] dark:text-white px-2">${data.name}</h3>
                ${hasPermission('createList') ? `<button class="del-list opacity-0 group-hover:opacity-100 p-1 text-slate-400 hover:text-red-600 rounded hover:bg-slate-200 dark:hover:bg-slate-700 transition"><i data-lucide="trash-2" class="w-4 h-4"></i></button>` : ''}
            </div>
            <div class="cards-container custom-scrollbar min-h-[10px]" data-list-id="${lid}"></div>
            ${hasPermission('createCard') ? `<div class="p-2"><button class="add-card w-full text-left py-1.5 px-2 text-slate-600 hover:bg-slate-200/50 dark:text-slate-400 dark:hover:bg-slate-700 rounded flex items-center gap-2 text-sm transition"><i data-lucide="plus" class="w-4 h-4"></i> Añadir tarjeta</button></div>` : ''}`;
        d.querySelector('.del-list')?.addEventListener('click', async()=>{ if(confirm('¿Borrar lista?')) await deleteDoc(doc(db,'boards',currentBoardId,'lists',lid)) });
        const addCardBtn = d.querySelector('.add-card');
        if (addCardBtn) addCardBtn.addEventListener('click', () => openCardModal(lid));
        setupDropZone(d.querySelector('.cards-container'), lid);
        w.appendChild(d); return w;
    }

    function loadCards(bid, lid, cont) {
        if(unsubscribeCards[lid]) unsubscribeCards[lid]();
        unsubscribeCards[lid] = onSnapshot(query(collection(db, 'boards', bid, 'lists', lid, 'cards'), orderBy('position')), (snap) => {
            cont.innerHTML = '';
            snap.forEach(doc => cont.appendChild(createCardElement(doc.id, lid, doc.data())));
            if(window.lucide) lucide.createIcons({root:cont});
        });
    }

    function createCardElement(cid, lid, card) {
        const d = document.createElement('div'); d.className = 'list-card group relative';
        d.draggable = hasPermission('editCard'); d.dataset.cardId = cid; d.dataset.listId = lid;
        
        // Data Attributes para Filtros
        const labelString = card.labels?.map(l => l.name).join(',') || '';
        const memberString = card.assignedTo?.join(',') || '';
        d.dataset.labels = labelString;
        d.dataset.members = memberString;

        let coverHtml = '', fullClass = '';
        if(card.cover?.url && card.cover.mode === 'full') { fullClass='full-cover'; d.style.backgroundImage=`url('${card.cover.url}')`; } 
        else if(card.cover?.url) { coverHtml = `<div class="card-cover-image" style="background-image: url('${card.cover.url}')"></div>`; } 
        else if(card.cover?.emoji) { coverHtml = `<div class="h-[32px] bg-slate-100 dark:bg-slate-700 flex items-center justify-center text-2xl rounded-t mb-2 select-none">${card.cover.emoji}</div>`; } 
        else if(card.cover?.color) { coverHtml = `<div class="card-cover ${card.cover.color}"></div>`; }
        if(fullClass) d.classList.add(fullClass);

        let labelsHtml = '';
        if(card.labels?.length) labelsHtml = `<div class="flex flex-wrap mb-1 gap-1">${card.labels.map(l=>`<span class="card-label ${l.color}" title="${l.name}"></span>`).join('')}</div>`;

        let membersHtml = '';
        if(card.assignedTo && card.assignedTo.length > 0) {
            membersHtml = `<div class="card-members">`;
            card.assignedTo.forEach(uid => {
                const memberName = currentBoardData.members[uid]?.name || '?';
                membersHtml += `<div class="member-avatar" style="width:24px; height:24px; font-size:10px;" title="${memberName}">${memberName.charAt(0).toUpperCase()}</div>`;
            });
            membersHtml += `</div>`;
        }

        let checkHtml = '';
        if(card.checklist?.length) {
            const c = card.checklist.filter(i=>i.completed).length, t=card.checklist.length, p=Math.round((c/t)*100);
            checkHtml = `<div class="flex items-center gap-1.5 text-xs ${c===t?'text-green-600':'text-slate-500'} mt-1"><i data-lucide="check-square" class="w-3 h-3"></i> <span>${c}/${t}</span></div><div class="checklist-progress-bar"><div class="checklist-progress-value ${c===t?'complete':''}" style="width:${p}%"></div></div>`;
        }
        let dateHtml = '';
        if(card.dueDate) {
            const diff = (new Date(card.dueDate).setHours(0,0,0,0) - new Date().setHours(0,0,0,0))/(1000*60*60*24);
            const cls = diff<0?'bg-red-500 text-white':(diff<=1?'bg-yellow-400 text-slate-800':'bg-transparent text-slate-500');
            dateHtml = `<div class="due-date-badge ${cls} inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] font-bold"><i data-lucide="calendar" class="w-3 h-3"></i><span>${new Date(card.dueDate).toLocaleDateString('es-ES',{day:'numeric',month:'short'})}</span></div>`;
        }

        d.innerHTML = `${coverHtml}${labelsHtml}<span class="block text-sm text-[#172B4D] dark:text-slate-200 mb-1 font-medium card-title">${card.title}</span>
        <div class="flex flex-wrap gap-2 items-center">${dateHtml}${checkHtml}${card.description?`<i data-lucide="align-left" class="w-3 h-3 text-slate-400 card-description-icon"></i>`:''}${card.attachments?.length?`<i data-lucide="paperclip" class="w-3 h-3 text-slate-400"></i>`:''}</div>
        ${membersHtml}
        <button class="edit-btn absolute top-1 right-1 p-1.5 bg-[#f4f5f7]/80 hover:bg-[#ebecf0] rounded opacity-0 group-hover:opacity-100 z-20"><i data-lucide="pencil" class="w-3 h-3 text-[#42526E]"></i></button>`;
        
        d.addEventListener('click', (e) => {
            if(e.target.closest('.card-label')) { e.stopPropagation(); d.querySelectorAll('.card-label').forEach(l=>l.classList.toggle('expanded')); return; }
            openCardModal(lid, cid, card);
        });
        if(d.draggable) { d.addEventListener('dragstart', handleDragStart); d.addEventListener('dragend', handleDragEnd); }
        
        if (typeof activeFilters !== 'undefined' && (activeFilters.labels.length > 0 || activeFilters.members.length > 0)) {
             applyFiltersToCard(d);
        }
        return d;
    }

    // Drag & Drop
    let draggedItem = null;
    function handleDragStart(e) { draggedItem=this; this.style.transform='rotate(3deg)'; this.classList.add('dragging'); e.dataTransfer.setData('text/plain', JSON.stringify({cid:this.dataset.cardId, slid:this.dataset.listId})); }
    function handleDragEnd() { this.style.transform='none'; this.classList.remove('dragging'); draggedItem=null; document.querySelectorAll('.drag-over').forEach(e=>e.classList.remove('drag-over')); }
    function setupDropZone(cont, lid) {
        cont.addEventListener('dragover', e=>{e.preventDefault(); cont.classList.add('drag-over')});
        cont.addEventListener('dragleave', ()=>cont.classList.remove('drag-over'));
        cont.addEventListener('drop', async e=>{
            e.preventDefault(); cont.classList.remove('drag-over'); if(!draggedItem)return;
            const {cid, slid} = JSON.parse(e.dataTransfer.getData('text/plain'));
            try {
                if(slid!==lid) {
                    const snap = await getDoc(doc(db,'boards',currentBoardId,'lists',slid,'cards',cid));
                    if(snap.exists()) { 
                        await addDoc(collection(db,'boards',currentBoardId,'lists',lid,'cards'),{...snap.data(), position:Date.now()}); 
                        await deleteDoc(snap.ref); 
                        logActivity('moved_card', 'card', cid, { cardTitle: snap.data().title, fromList: slid, toList: lid });
                    }
                } else await updateDoc(doc(db,'boards',currentBoardId,'lists',slid,'cards',cid),{position:Date.now()});
            } catch(er){console.error(er);}
        });
    }

    // ========================================
    // 7. MODALES Y FUNCIONES EXTRA
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

    document.getElementById('card-labels-btn')?.addEventListener('click', () => { labelsModal.classList.remove('hidden'); labelsModal.style.display='flex'; });
    document.getElementById('cancel-labels-btn')?.addEventListener('click', () => closeModal('labels-modal'));
    document.querySelectorAll('.label-checkbox').forEach(cb => cb.addEventListener('change', (e) => {
        const label = { name: e.target.dataset.label, color: e.target.dataset.color };
        if (e.target.checked) { if (!currentCardLabels.find(l => l.name === label.name)) currentCardLabels.push(label); } else { currentCardLabels = currentCardLabels.filter(l => l.name !== label.name); }
        renderLabelsInModal();
    }));
    function renderLabelsInModal() { const c = document.getElementById('card-labels-display'); c.innerHTML=''; if (currentCardLabels.length) c.classList.remove('hidden'); else c.classList.add('hidden'); currentCardLabels.forEach(l => { const s = document.createElement('span'); s.className=`px-2 py-1 rounded text-xs font-bold text-white ${l.color.split(' ')[0]}`; s.textContent=l.name; c.appendChild(s); }); }

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
    document.getElementById('delete-card-btn')?.addEventListener('click', async()=>{if(confirm('¿Borrar?')){ await deleteDoc(doc(db,'boards',currentBoardId,'lists',currentCardData.lid,'cards',currentCardData.cid)); logActivity('deleted_card', 'card', currentCardData.cid, { cardTitle: currentCardData.data.title }); closeModal('card-modal'); }});

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
    // 8. PANELES LATERALES (MIEMBROS, ACTIVIDAD)
    // ========================================
    // GESTIÓN DE MIEMBROS
    document.getElementById('toggle-members-btn')?.addEventListener('click', () => {
        const panel = document.getElementById('members-panel');
        const activity = document.getElementById('activity-panel');
        if (panel.classList.contains('hidden')) {
            renderMembersPanel(); // CARGA DINÁMICA
            panel.classList.remove('hidden');
            activity.classList.add('hidden');
        } else {
            panel.classList.add('hidden');
        }
    });
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

    // ACTIVIDAD
    document.getElementById('toggle-activity-btn')?.addEventListener('click', () => { 
        const act = document.getElementById('activity-panel'); 
        const mem = document.getElementById('members-panel');
        if (act.classList.contains('hidden')) { act.classList.remove('hidden'); mem.classList.add('hidden'); }
        else { act.classList.add('hidden'); }
    });
    document.getElementById('close-activity-btn')?.addEventListener('click', () => document.getElementById('activity-panel').classList.add('hidden'));

    async function logActivity(action, targetType, targetId, details) {
        try { await addDoc(collection(db, 'activity_logs'), { boardId: currentBoardId, userId: currentUser.uid, userName: currentUser.displayName, action, targetType, targetId, details, timestamp: serverTimestamp() }); } catch(e){console.error(e);}
    }
    function loadActivity(boardId) {
        if(unsubscribeActivity) unsubscribeActivity();
        unsubscribeActivity = onSnapshot(query(collection(db, 'activity_logs'), where('boardId', '==', boardId), orderBy('timestamp', 'desc')), (snap) => {
            activityList.innerHTML = '';
            if(snap.empty) { activityList.innerHTML='<p class="text-center text-sm text-slate-500 p-4">Sin actividad.</p>'; return; }
            snap.forEach(doc => {
                const a = doc.data();
                const div = document.createElement('div'); div.className='activity-item';
                const msgs = { moved_card: `movió la tarjeta "${a.details.cardTitle}"`, invited_member: `invitó a ${a.details.email}`, created_card: `creó una tarjeta`, deleted_card: `eliminó una tarjeta`, added_comment: `comentó en "${a.details.cardTitle}"`, removed_member: `expulsó a ${a.details.memberName}` };
                div.innerHTML = `<div class="activity-user">${a.userName}</div><div>${msgs[a.action] || a.action}</div><div class="activity-meta">${new Date(a.timestamp?.toDate()).toLocaleString()}</div>`;
                activityList.appendChild(div);
            });
        });
    }

    // ========================================
    // 9. INVITACIONES & NOTIFICACIONES
    // ========================================
    document.getElementById('invite-member-btn')?.addEventListener('click', () => { inviteModal.classList.remove('hidden'); inviteModal.style.display='flex'; });
    document.getElementById('cancel-invite-btn')?.addEventListener('click', () => closeModal('invite-modal'));
    document.getElementById('send-invite-btn')?.addEventListener('click', async () => {
        const email = document.getElementById('invite-email-input').value.trim();
        if(!email) return alert("Escribe un email");
        try {
            const q = query(collection(db, 'users'), where('email', '==', email));
            const snap = await getDocs(q);
            if(snap.empty) return alert("Usuario no registrado en la app.");
            const uid = snap.docs[0].id;
            await addDoc(collection(db, 'notifications'), { userId: uid, type: 'board_invitation', boardId: currentBoardId, boardTitle: currentBoardData.title, invitedBy: currentUser.displayName, invitedByEmail: currentUser.email, role: 'editor', read: false, createdAt: serverTimestamp() });
            logActivity('invited_member', 'board', currentBoardId, { email });
            alert("Invitación enviada."); closeModal('invite-modal');
        } catch(e) { console.error(e); alert("Error al invitar"); }
    });

    function loadNotifications() {
        if(unsubscribeNotifications) unsubscribeNotifications();
        unsubscribeNotifications = onSnapshot(query(collection(db, 'notifications'), where('userId', '==', currentUser.uid), orderBy('createdAt', 'desc')), (snap) => {
            notifList.innerHTML = '';
            const unread = snap.docs.filter(d => !d.data().read).length;
            if(unread > 0) { notifBadge.classList.remove('hidden'); notifBadge.textContent = unread; } else notifBadge.classList.add('hidden');
            if(snap.empty) { notifList.innerHTML = '<p class="p-4 text-center text-sm text-slate-500">No tienes notificaciones.</p>'; return; }
            snap.forEach(doc => {
                const n = doc.data();
                const div = document.createElement('div');
                div.className = `p-3 border-b border-slate-100 hover:bg-slate-50 cursor-pointer ${!n.read?'bg-blue-50':''}`;
                if(n.type === 'board_invitation') {
                    div.innerHTML = `<div class="text-sm"><span class="font-bold text-blue-600">${n.invitedBy}</span> te invitó a <span class="font-bold text-slate-800">${n.boardTitle}</span></div><div class="flex gap-2 mt-2"><button class="accept-btn px-2 py-1 bg-green-500 text-white text-xs rounded">Aceptar</button><button class="reject-btn px-2 py-1 bg-red-500 text-white text-xs rounded">Rechazar</button></div>`;
                    div.querySelector('.accept-btn').addEventListener('click', () => acceptInvitation(doc.id, n));
                    div.querySelector('.reject-btn').addEventListener('click', () => rejectInvitation(doc.id));
                } else { div.innerHTML = `<div class="text-sm">${n.message || 'Nueva notificación'}</div>`; }
                notifList.appendChild(div);
            });
        });
    }
    async function acceptInvitation(notifId, data) {
        try {
            const boardRef = doc(db, 'boards', data.boardId);
            await updateDoc(boardRef, { [`members.${currentUser.uid}`]: { email: currentUser.email, name: currentUser.displayName || currentUser.email, role: data.role }, memberEmails: arrayUnion(currentUser.email) });
            await deleteDoc(doc(db, 'notifications', notifId));
            alert(`¡Te has unido a ${data.boardTitle}!`); loadBoards();
        } catch(e) { console.error(e); alert("Error al unirse"); }
    }
    async function rejectInvitation(notifId) { if(confirm("¿Rechazar invitación?")) await deleteDoc(doc(db, 'notifications', notifId)); }
    notifBtn?.addEventListener('click', (e) => { e.stopPropagation(); notifDropdown.classList.toggle('hidden'); });
    document.addEventListener('click', (e) => { if(!notifBtn.contains(e.target) && !notifDropdown.contains(e.target)) notifDropdown.classList.add('hidden'); });

    // ========================================
    // 10. SISTEMA DE FILTROS (FINAL)
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
        const labelsContainer = document.getElementById('filter-labels-list'); labelsContainer.innerHTML = '';
        const standardLabels = [ { name: 'urgente', color: 'bg-red-100 text-red-700', labelClass: 'bg-red-500' }, { name: 'diseño', color: 'bg-purple-100 text-purple-700', labelClass: 'bg-purple-500' }, { name: 'dev', color: 'bg-green-100 text-green-700', labelClass: 'bg-green-500' } ];
        standardLabels.forEach(l => {
            const isChecked = activeFilters.labels.includes(l.name);
            const row = document.createElement('label'); row.className = 'flex items-center gap-3 cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-700 p-2 rounded -mx-2';
            row.innerHTML = `<input type="checkbox" class="filter-checkbox rounded border-slate-300 text-blue-600" value="${l.name}" data-type="label" ${isChecked ? 'checked' : ''}><span class="w-full h-8 rounded ${l.labelClass} text-white text-xs font-bold flex items-center px-2 capitalize shadow-sm">${l.name}${isChecked ? '<i data-lucide="check" class="ml-auto w-4 h-4"></i>' : ''}</span>`;
            row.querySelector('input').addEventListener('change', (e) => toggleFilter('labels', l.name, e.target.checked));
            labelsContainer.appendChild(row);
        });
        const membersContainer = document.getElementById('filter-members-list'); membersContainer.innerHTML = '';
        if (currentBoardData && currentBoardData.members) {
            Object.entries(currentBoardData.members).forEach(([uid, m]) => {
                const isChecked = activeFilters.members.includes(uid);
                const row = document.createElement('label'); row.className = 'flex items-center gap-3 cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-700 p-2 rounded -mx-2';
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
        const cardLabels = card.dataset.labels ? card.dataset.labels.split(',') : [];
        const cardMembers = card.dataset.members ? card.dataset.members.split(',') : [];
        let labelMatch = true; if (activeFilters.labels.length > 0) labelMatch = activeFilters.labels.some(l => cardLabels.includes(l));
        let memberMatch = true; if (activeFilters.members.length > 0) memberMatch = activeFilters.members.some(m => cardMembers.includes(m));
        if (labelMatch && memberMatch) card.classList.remove('hidden'); else card.classList.add('hidden');
    }

    // ========================================
    // 11. BÚSQUEDA GLOBAL
    // ========================================
    async function buildGlobalIndex() {
        allSearchCache = []; 
        try {
            const qBoards = query(collection(db, 'boards'), where('memberEmails', 'array-contains', currentUser.email));
            const snapBoards = await getDocs(qBoards);
            const promises = snapBoards.docs.map(async (boardDoc) => {
                const b = boardDoc.data(); const bId = boardDoc.id;
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
    function calculateScore(text, searchTerm) { const lowerText = (text || '').toLowerCase(); const lowerTerm = searchTerm.toLowerCase(); if (lowerText === lowerTerm) return 100; if (lowerText.startsWith(lowerTerm)) return 80; if (lowerText.includes(lowerTerm)) return 40; return 0; }
    function highlightText(text, term) { if (!text) return ''; const regex = new RegExp(`(${term})`, 'gi'); return text.replace(regex, '<span class="search-result-highlight">$1</span>'); }
    function initSearchListeners() {
        searchInput?.addEventListener('input', (e) => {
            const term = e.target.value.trim().toLowerCase(); if(term.length < 2) { searchResults.classList.add('hidden'); selectedResultIndex = -1; return; }
            const results = allSearchCache.map(item => { const titleScore = calculateScore(item.title, term); const descScore = item.description ? calculateScore(item.description, term) : 0; return { ...item, score: Math.max(titleScore, descScore) }; }).filter(item => item.score > 0).sort((a, b) => b.score - a.score);
            renderSearchResults(results.slice(0, 10), term);
        });
        searchInput?.addEventListener('keydown', (e) => {
            const items = document.querySelectorAll('.search-result-item'); if (items.length === 0) return;
            if (e.key === 'ArrowDown') { e.preventDefault(); selectedResultIndex = Math.min(selectedResultIndex + 1, items.length - 1); updateSelection(items); } 
            else if (e.key === 'ArrowUp') { e.preventDefault(); selectedResultIndex = Math.max(selectedResultIndex - 1, 0); updateSelection(items); } 
            else if (e.key === 'Enter') { e.preventDefault(); if (selectedResultIndex >= 0) items[selectedResultIndex].click(); } 
            else if (e.key === 'Escape') searchResults.classList.add('hidden');
        });
        document.addEventListener('click', (e) => { if(!searchInput.contains(e.target) && !searchResults.contains(e.target)) searchResults.classList.add('hidden'); });
    }
    function updateSelection(items) { items.forEach((item, index) => { if (index === selectedResultIndex) { item.classList.add('keyboard-selected'); item.scrollIntoView({ block: 'nearest' }); } else { item.classList.remove('keyboard-selected'); } }); }
    function renderSearchResults(results, term) {
        searchResultsList.innerHTML = ''; selectedResultIndex = -1;
        if(results.length === 0) { searchResultsList.innerHTML = '<p class="p-4 text-sm text-slate-500 text-center">No se encontraron resultados.</p>'; searchResults.classList.remove('hidden'); return; }
        results.forEach((res, index) => {
            const div = document.createElement('div'); div.className = 'search-result-item'; div.dataset.index = index;
            const titleHtml = highlightText(res.title, term);
            if (res.type === 'board') div.innerHTML = `<div class="flex items-center gap-2 mb-1"><span class="result-type-badge result-type-board">Tablero</span><span class="text-sm font-bold text-slate-800">${titleHtml}</span></div>`;
            else if (res.type === 'list') div.innerHTML = `<div class="flex items-center gap-2 mb-1"><span class="result-type-badge result-type-list">Lista</span><span class="text-sm font-bold text-slate-800">${titleHtml}</span></div><div class="result-breadcrumbs"><span>En: <strong>${res.boardTitle}</strong></span></div>`;
            else if (res.type === 'card') div.innerHTML = `<div class="flex items-center gap-2 mb-1"><span class="result-type-badge result-type-card">Tarjeta</span><span class="text-sm font-bold text-slate-800">${titleHtml}</span></div><div class="result-breadcrumbs"><span>${res.boardTitle}</span><i data-lucide="chevron-right" class="w-3 h-3"></i><span>${res.listName}</span></div>`;
            div.addEventListener('click', () => handleSearchResultClick(res)); searchResultsList.appendChild(div);
        });
        searchResults.classList.remove('hidden'); if(window.lucide) lucide.createIcons();
    }
    async function handleSearchResultClick(res) {
        searchResults.classList.add('hidden'); searchInput.value = '';
        if (currentBoardId !== res.boardId && res.boardId) { const bSnap = await getDoc(doc(db, 'boards', res.boardId)); if (bSnap.exists()) { await openBoard(res.boardId, bSnap.data()); setTimeout(() => focusTarget(res), 800); } } else { focusTarget(res); }
    }
    async function focusTarget(res) {
        if (res.type === 'board') return; 
        if (res.type === 'list') { const el = document.querySelector(`[data-list-id="${res.id}"]`); if (el) { el.scrollIntoView({ behavior: 'smooth', inline: 'center' }); el.style.boxShadow = '0 0 0 4px #FFAB00'; setTimeout(() => el.style.boxShadow = '', 2000); } } 
        else if (res.type === 'card') { const cSnap = await getDoc(doc(db, 'boards', res.boardId, 'lists', res.listId, 'cards', res.id)); if (cSnap.exists()) openCardModal(res.listId, res.id, cSnap.data()); }
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
    
    function initGlobalShortcuts() {
        document.addEventListener('keydown', (e) => {
            if (e.target.matches('input, textarea')) return;
            if (e.key === '/') { e.preventDefault(); searchInput.focus(); }
            if (e.key === 'Escape') document.querySelectorAll('.fixed').forEach(m => { if(!m.classList.contains('hidden')) closeModal(m.id); });
            if ((e.key === 'n' || e.key === 'N') && currentBoardId && !boardView.classList.contains('hidden')) { e.preventDefault(); const firstList = document.querySelector('.list'); if (firstList) openCardModal(firstList.dataset.listId); }
        });
    }
}