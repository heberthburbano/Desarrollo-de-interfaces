import { auth, db } from './firebase-config.js';
import { 
    collection, addDoc, doc, updateDoc, deleteDoc, query, where, onSnapshot, 
    orderBy, serverTimestamp, getDoc, getDocs, arrayUnion
} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';

document.addEventListener('DOMContentLoaded', initializeApp);

function initializeApp() {
    console.log('🚀 Inicializando Trello Clone (Search Engine v3.0)...');

    // ========================================
    // ESTADO GLOBAL
    // ========================================
    let currentUser = null;
    let currentBoardId = null;
    let currentBoardData = null;
    let currentUserRole = null;
    
    // CACHÉ DE BÚSQUEDA (Todo en un solo array plano para velocidad)
    let allSearchCache = []; // [{ id, type: 'board'|'list'|'card', title, ...context }]
    let selectedResultIndex = -1;

    // Estado Edición
    let currentCardData = null; 
    let currentCardCover = { color: null, mode: 'banner', url: null };
    let currentChecklist = []; 
    let currentAttachments = []; 
    let currentCardLabels = [];
    let currentCardMembers = [];
    
    let unsubscribeBoards, unsubscribeLists, unsubscribeActivity, unsubscribeNotifications; 
    let unsubscribeCards = {}; 

    // NUEVAS VARIABLES GLOBALES
    let unsubscribeComments = null;
    let checklistHideCompleted = false; // Estado para ocultar/mostrar checklist

    // HELPER: Tiempo Relativo (para comentarios y actividad)
    function timeAgo(date) {
        if (!date) return 'hace un momento';
        const seconds = Math.floor((new Date() - date) / 1000);
        let interval = seconds / 31536000;
        if (interval > 1) return "hace " + Math.floor(interval) + " años";
        interval = seconds / 2592000;
        if (interval > 1) return "hace " + Math.floor(interval) + " meses";
        interval = seconds / 86400;
        if (interval > 1) return "hace " + Math.floor(interval) + " días";
        interval = seconds / 3600;
        if (interval > 1) return "hace " + Math.floor(interval) + " h";
        interval = seconds / 60;
        if (interval > 1) return "hace " + Math.floor(interval) + " min";
        return "hace unos segundos";
    }

    // HELPER: Inicializar Atajos de Teclado
    function initGlobalShortcuts() {
        document.addEventListener('keydown', (e) => {
            // Ignorar si el usuario está escribiendo en un input o textarea
            if (e.target.matches('input, textarea')) return;

            if (e.key === '/') {
                e.preventDefault();
                document.getElementById('global-search').focus();
            }
            if (e.key === 'Escape') {
                // Cerrar cualquier modal abierto
                document.querySelectorAll('.fixed').forEach(m => {
                    if (!m.classList.contains('hidden')) closeModal(m.id);
                });
            }
            if (e.key === 'n' || e.key === 'N') {
                // Solo si estamos en la vista de un tablero
                if (currentBoardId && !document.getElementById('board-view').classList.contains('hidden')) {
                    e.preventDefault();
                    // Intentar abrir modal en la primera lista disponible
                    const firstList = document.querySelector('.list');
                    if (firstList) openCardModal(firstList.dataset.listId);
                }
            }
        });
    }
    // Llamamos a esto al final de initializeApp()

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
    
    // Search & Panels
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

    // MODO OSCURO
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

    const PERMISSIONS = { owner: {createList:true, editCard:true}, editor: {createList:true, editCard:true}, viewer: {createList:false, editCard:false} };
    function hasPermission(a) { return currentUserRole && PERMISSIONS[currentUserRole]?.[a]; }

    window.addEventListener('user-authenticated', (e) => {
        currentUser = e.detail.user;
        const av = document.getElementById('user-avatar');
        if(av) av.textContent = (currentUser.displayName||currentUser.email).charAt(0).toUpperCase();
        loadBoards();
        loadNotifications();
        buildGlobalIndex(); // Construir índice completo
        initSearchListeners();
    });

    // ========================================
    // MOTOR DE BÚSQUEDA GLOBAL (INDEXACIÓN COMPLETA)
    // ========================================
    async function buildGlobalIndex() {
        console.log("🔍 Indexando TODO el contenido...");
        allSearchCache = [];

        try {
            // 1. Obtener TABLEROS
            const qBoards = query(collection(db, 'boards'), where('memberEmails', 'array-contains', currentUser.email));
            const snapBoards = await getDocs(qBoards);

            const promises = snapBoards.docs.map(async (boardDoc) => {
                const b = boardDoc.data();
                const bId = boardDoc.id;
                
                // Add Board
                allSearchCache.push({ id: bId, type: 'board', title: b.title, score: 0 });

                // 2. Obtener LISTAS
                const snapLists = await getDocs(query(collection(db, 'boards', bId, 'lists')));
                
                for (const listDoc of snapLists.docs) {
                    const l = listDoc.data();
                    const lId = listDoc.id;
                    
                    // Add List
                    allSearchCache.push({ 
                        id: lId, type: 'list', title: l.name, 
                        boardId: bId, boardTitle: b.title, score: 0 
                    });

                    // 3. Obtener TARJETAS
                    const snapCards = await getDocs(query(collection(db, 'boards', bId, 'lists', lId, 'cards')));
                    snapCards.forEach(cardDoc => {
                        const c = cardDoc.data();
                        // Add Card
                        allSearchCache.push({
                            id: cardDoc.id, type: 'card', title: c.title, description: c.description||'',
                            listId: lId, listName: l.name,
                            boardId: bId, boardTitle: b.title, score: 0
                        });
                    });
                }
            });

            await Promise.all(promises);
            console.log(`✅ Indexado: ${allSearchCache.length} elementos.`);
        } catch (e) { console.error("Error indexando:", e); }
    }

    // Algoritmo de Scoring (Tu código original)
    function calculateScore(text, searchTerm) {
        const lowerText = (text || '').toLowerCase();
        const lowerTerm = searchTerm.toLowerCase();
        if (lowerText === lowerTerm) return 100; // Exacto
        if (lowerText.startsWith(lowerTerm)) return 80; // Empieza con
        if (lowerText.includes(` ${lowerTerm}`)) return 60; // Palabra completa
        if (lowerText.includes(lowerTerm)) return 40; // Contiene
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
            
            // 1. Calcular Score y Filtrar
            const results = allSearchCache
                .map(item => {
                    // Buscar en título y descripción (si es tarjeta)
                    const titleScore = calculateScore(item.title, term);
                    const descScore = item.description ? calculateScore(item.description, term) : 0;
                    return { ...item, score: Math.max(titleScore, descScore) };
                })
                .filter(item => item.score > 0)
                .sort((a, b) => b.score - a.score); // Ordenar por relevancia

            // 2. Renderizar
            renderSearchResults(results.slice(0, 10), term); // Max 10 resultados
        });

        // Navegación Teclado
        searchInput?.addEventListener('keydown', (e) => {
            const items = document.querySelectorAll('.search-result-item');
            if (items.length === 0) return;
            
            if (e.key === 'ArrowDown') {
                e.preventDefault();
                selectedResultIndex = Math.min(selectedResultIndex + 1, items.length - 1);
                updateSelection(items);
            } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                selectedResultIndex = Math.max(selectedResultIndex - 1, 0);
                updateSelection(items);
            } else if (e.key === 'Enter') {
                e.preventDefault();
                if (selectedResultIndex >= 0) items[selectedResultIndex].click();
            } else if (e.key === 'Escape') {
                searchResults.classList.add('hidden');
            }
        });

        document.addEventListener('click', (e) => { 
            if(!searchInput.contains(e.target) && !searchResults.contains(e.target)) searchResults.classList.add('hidden'); 
        });
    }

    function updateSelection(items) {
        items.forEach((item, index) => {
            if (index === selectedResultIndex) {
                item.classList.add('keyboard-selected');
                item.scrollIntoView({ block: 'nearest' });
            } else {
                item.classList.remove('keyboard-selected');
            }
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
            
            // Renderizado Condicional según Tipo
            if (res.type === 'board') {
                div.innerHTML = `
                    <div class="flex items-center gap-2 mb-1">
                        <span class="result-type-badge result-type-board">Tablero</span>
                        <span class="text-sm font-bold text-slate-800">${titleHtml}</span>
                    </div>`;
            } else if (res.type === 'list') {
                div.innerHTML = `
                    <div class="flex items-center gap-2 mb-1">
                        <span class="result-type-badge result-type-list">Lista</span>
                        <span class="text-sm font-bold text-slate-800">${titleHtml}</span>
                    </div>
                    <div class="result-breadcrumbs">
                        <span>En: <strong>${res.boardTitle}</strong></span>
                    </div>`;
            } else if (res.type === 'card') {
                div.innerHTML = `
                    <div class="flex items-center gap-2 mb-1">
                        <span class="result-type-badge result-type-card">Tarjeta</span>
                        <span class="text-sm font-bold text-slate-800">${titleHtml}</span>
                    </div>
                    <div class="result-breadcrumbs">
                        <span>${res.boardTitle}</span>
                        <i data-lucide="chevron-right" class="w-3 h-3"></i>
                        <span>${res.listName}</span>
                    </div>`;
            }

            // Click Handler Unificado
            div.addEventListener('click', () => handleSearchResultClick(res));
            searchResultsList.appendChild(div);
        });

        searchResults.classList.remove('hidden');
        if(window.lucide) lucide.createIcons();
    }

    async function handleSearchResultClick(res) {
        searchResults.classList.add('hidden');
        searchInput.value = '';

        // Lógica de Navegación Cruzada
        if (currentBoardId !== res.boardId && res.boardId) {
            // Estamos en otro tablero o dashboard: Cargar el tablero destino primero
            const bSnap = await getDoc(doc(db, 'boards', res.boardId));
            if (bSnap.exists()) {
                await openBoard(res.boardId, bSnap.data());
                // Pequeño delay para que el DOM se construya antes de buscar el elemento
                setTimeout(() => focusTarget(res), 800); 
            }
        } else {
            // Ya estamos en el tablero correcto
            focusTarget(res);
        }
    }

    async function focusTarget(res) {
        if (res.type === 'board') return; // Ya estamos ahí

        if (res.type === 'list') {
            const el = document.querySelector(`[data-list-id="${res.id}"]`);
            if (el) {
                el.scrollIntoView({ behavior: 'smooth', inline: 'center' });
                el.style.boxShadow = '0 0 0 4px #FFAB00'; // Highlight visual
                setTimeout(() => el.style.boxShadow = '', 2000);
            }
        } else if (res.type === 'card') {
            // Abrir modal de tarjeta
            const cSnap = await getDoc(doc(db, 'boards', res.boardId, 'lists', res.listId, 'cards', res.id));
            if (cSnap.exists()) openCardModal(res.listId, res.id, cSnap.data());
        }
    }

    // ========================================
    // LOGICA CORE (Tableros, Listas, Tarjetas)
    // ========================================
    function loadBoards() {
        if(unsubscribeBoards) unsubscribeBoards();
        unsubscribeBoards = onSnapshot(query(collection(db, 'boards'), where('memberEmails', 'array-contains', currentUser.email)), (snap) => {
            boardsContainer.innerHTML = '';
            if(snap.empty) { boardsContainer.innerHTML = `<div class="col-span-full text-center py-10 text-slate-500">Sin tableros. <b onclick="document.getElementById('create-board-btn').click()" class="cursor-pointer text-blue-600">Crear uno</b></div>`; return; }
            snap.forEach(doc => boardsContainer.appendChild(createBoardCard(doc.id, doc.data())));
            if(window.lucide) lucide.createIcons();
        });
    }

    function createBoardCard(id, board) {
        const d = document.createElement('div');
        d.className = 'bg-white dark:bg-slate-800 p-4 rounded shadow hover:shadow-lg transition cursor-pointer h-32 flex flex-col justify-between border-l-4 border-[#0079BF] relative group';
        d.innerHTML = `<h3 class="font-bold text-slate-800 dark:text-white truncate">${board.title}</h3>
        <div class="flex justify-between items-end"><span class="text-xs text-slate-500"><i data-lucide="users" class="w-3 h-3 inline"></i> ${Object.keys(board.members||{}).length}</span>
        ${board.ownerId===currentUser.uid?`<button class="del-btn opacity-0 group-hover:opacity-100 text-red-500 p-1"><i data-lucide="trash-2" class="w-4 h-4"></i></button>`:''}</div>`;
        d.addEventListener('click', (e) => !e.target.closest('.del-btn') && openBoard(id, board));
        d.querySelector('.del-btn')?.addEventListener('click', async (e) => { e.stopPropagation(); if(confirm('¿Borrar?')) await deleteDoc(doc(db, 'boards', id)); });
        return d;
    }

    async function openBoard(id, data) {
        currentBoardId = id; 
        currentBoardData = data; 
        currentUserRole = data.members?.[currentUser.uid]?.role||'viewer';
        document.getElementById('board-title').textContent = data.title;
        renderBoardMembers(data.members);
        document.querySelector('.boards-section').style.display='none'; boardView.classList.remove('hidden'); boardView.style.display='flex';
        loadLists(id);
        loadActivity(id);
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
        d.innerHTML = `<div class="list-header group"><h3 class="truncate text-sm font-semibold text-[#172B4D] dark:text-white">${data.name}</h3>${hasPermission('createList')?`<button class="del-list opacity-0 group-hover:opacity-100 text-slate-400 hover:text-red-600"><i data-lucide="more-horizontal" class="w-4 h-4"></i></button>`:''}</div><div class="cards-container custom-scrollbar min-h-[10px]" data-list-id="${lid}"></div>${hasPermission('createCard')?`<div class="p-2"><button class="add-card w-full text-left p-2 text-slate-600 hover:bg-slate-200/50 rounded flex items-center gap-2 text-sm"><i data-lucide="plus" class="w-4 h-4"></i> Añadir tarjeta</button></div>`:''}`;
        d.querySelector('.del-list')?.addEventListener('click', async()=>{if(confirm('¿Borrar lista?')) await deleteDoc(doc(db,'boards',currentBoardId,'lists',lid))});
        d.querySelector('.add-card')?.addEventListener('click', ()=>openCardModal(lid));
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

        let coverHtml = '', fullClass = '';
        if(card.cover?.url && card.cover.mode === 'full') { fullClass='full-cover'; d.style.backgroundImage=`url('${card.cover.url}')`; }
        else if(card.cover?.url) coverHtml = `<div class="card-cover-image" style="background-image: url('${card.cover.url}')"></div>`;
        else if(card.cover?.color) coverHtml = `<div class="card-cover ${card.cover.color}"></div>`;
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
        return d;
    }

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
                        const data = snap.data();
                        await addDoc(collection(db,'boards',currentBoardId,'lists',lid,'cards'),{...data, position:Date.now()}); 
                        await deleteDoc(snap.ref); 
                        logActivity('moved_card', 'card', cid, { cardTitle: data.title, fromList: slid, toList: lid });
                        // Actualizar Índice (Simulado eliminando y re-cargando sería costoso, mejor confiar en next reload)
                    }
                } else await updateDoc(doc(db,'boards',currentBoardId,'lists',slid,'cards',cid),{position:Date.now()});
            } catch(er){console.error(er);}
        });
    }

    function openCardModal(lid, cid=null, data=null) {
        currentCardData = { lid, cid, data };
        document.getElementById('card-title-input').value = data?.title||'';
        document.getElementById('card-description-input').value = data?.description||'';
        document.getElementById('card-due-date-input').value = data?.dueDate||'';
        document.getElementById('card-modal-title').innerHTML = data?'<i data-lucide="credit-card" class="w-3 h-3"></i> Editar':'<i data-lucide="plus" class="w-3 h-3"></i> Nueva';
        
        currentChecklist = data?.checklist||[];
        currentCardCover = data?.cover||{color:null,mode:'banner',url:null};
        currentAttachments = data?.attachments||[];
        currentCardLabels = data?.labels||[];
        currentCardMembers = data?.assignedTo||[]; 

        renderChecklist();
        renderAttachments();
        renderLabelsInModal();
        renderAssignedMembersInput();

        cardModal.classList.remove('hidden'); cardModal.style.display='flex';
        lucide.createIcons();
    }

    // SIDEBAR ACTIONS
    document.getElementById('card-labels-btn')?.addEventListener('click', () => { labelsModal.classList.remove('hidden'); labelsModal.style.display='flex'; });
    document.getElementById('cancel-labels-btn')?.addEventListener('click', () => closeModal('labels-modal'));
    document.querySelectorAll('.label-checkbox').forEach(cb => cb.addEventListener('change', (e) => {
        const label = { name: e.target.dataset.label, color: e.target.dataset.color };
        if (e.target.checked) { if (!currentCardLabels.find(l => l.name === label.name)) currentCardLabels.push(label); } 
        else { currentCardLabels = currentCardLabels.filter(l => l.name !== label.name); }
        renderLabelsInModal();
    }));

    function renderLabelsInModal() {
        const c = document.getElementById('card-labels-display'); c.innerHTML='';
        if (currentCardLabels.length) c.classList.remove('hidden'); else c.classList.add('hidden');
        currentCardLabels.forEach(l => { const s = document.createElement('span'); s.className=`px-2 py-1 rounded text-xs font-bold text-white ${l.color.split(' ')[0]}`; s.textContent=l.name; c.appendChild(s); });
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
                if(found) {
                    const [uid] = found;
                    currentCardMembers = currentCardMembers.includes(uid) ? currentCardMembers.filter(id => id !== uid) : [...currentCardMembers, uid];
                    renderAssignedMembersInput();
                } else alert("Miembro no encontrado.");
            }
        };
    }

    document.getElementById('card-checklist-btn')?.addEventListener('click', () => { document.getElementById('new-checklist-item-input').focus(); });
    document.getElementById('card-due-date-btn')?.addEventListener('click', () => { document.getElementById('card-due-date-input').showPicker?.() || document.getElementById('card-due-date-input').focus(); });
    document.getElementById('attach-file-btn')?.addEventListener('click', () => { const u=prompt("URL:"); if(u) { const i=u.match(/\.(jpeg|jpg|png|webp)/); currentAttachments.push({name:i?'Imagen':'Enlace', url:u, type:i?'image':'link', addedAt:new Date().toISOString()}); renderAttachments(); }});
    document.getElementById('card-cover-btn')?.addEventListener('click', () => { coverModal.classList.remove('hidden'); coverModal.style.display='flex'; });

    // INVITACIONES
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
            await addDoc(collection(db, 'notifications'), {
                userId: uid, type: 'board_invitation', boardId: currentBoardId, boardTitle: currentBoardData.title,
                invitedBy: currentUser.displayName, invitedByEmail: currentUser.email, role: 'editor', read: false, createdAt: serverTimestamp()
            });
            logActivity('invited_member', 'board', currentBoardId, { email });
            alert("Invitación enviada.");
            closeModal('invite-modal');
        } catch(e) { console.error(e); alert("Error al invitar"); }
    });

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
                const msgs = { moved_card: `movió la tarjeta "${a.details.cardTitle}"`, invited_member: `invitó a ${a.details.email}`, created_card: `creó una tarjeta`, deleted_card: `eliminó una tarjeta` };
                div.innerHTML = `<div class="activity-user">${a.userName}</div><div>${msgs[a.action] || a.action}</div><div class="activity-meta">${new Date(a.timestamp?.toDate()).toLocaleString()}</div>`;
                activityList.appendChild(div);
            });
        });
    }

    document.getElementById('toggle-activity-btn')?.addEventListener('click', () => { activityPanel.classList.toggle('hidden'); membersPanel.classList.add('hidden'); });
    document.getElementById('close-activity-btn')?.addEventListener('click', () => activityPanel.classList.add('hidden'));
    document.getElementById('toggle-members-btn')?.addEventListener('click', () => { membersPanel.classList.toggle('hidden'); activityPanel.classList.add('hidden'); });
    document.getElementById('close-members-btn')?.addEventListener('click', () => membersPanel.classList.add('hidden'));

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

    function renderChecklist() {
        const c = document.getElementById('checklist-items'); c.innerHTML='';
        currentChecklist.forEach((i,x)=>{
            const d = document.createElement('div'); d.className='checklist-item group';
            d.innerHTML=`<input type="checkbox" ${i.completed?'checked':''} class="cursor-pointer"><span class="flex-1 text-sm ${i.completed?'line-through text-slate-400':''}">${i.text}</span><button class="delete-item-btn"><i data-lucide="trash-2" class="w-3 h-3"></i></button>`;
            d.querySelector('input').addEventListener('change',e=>{i.completed=e.target.checked; renderChecklist();});
            d.querySelector('.delete-item-btn').addEventListener('click',()=>{currentChecklist.splice(x,1); renderChecklist();});
            c.appendChild(d);
        });
        const p = document.getElementById('checklist-progress'); if(p) p.innerText = currentChecklist.length?Math.round((currentChecklist.filter(i=>i.completed).length/currentChecklist.length)*100)+'%':'0%';
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
    document.querySelectorAll('.cover-color').forEach(b => b.addEventListener('click', () => { currentCardCover={color:b.dataset.color, mode:'color', url:null}; closeModal('card-cover-modal'); }));
    document.getElementById('remove-cover-btn')?.addEventListener('click', () => { currentCardCover={color:null}; closeModal('card-cover-modal'); });

    document.getElementById('save-card-btn')?.addEventListener('click', async () => {
        const title = document.getElementById('card-title-input').value.trim(); if(!title) return;
        const payload = { title, description: document.getElementById('card-description-input').value.trim(), dueDate: document.getElementById('card-due-date-input').value, checklist: currentChecklist, cover: currentCardCover, attachments: currentAttachments, labels: currentCardLabels, assignedTo: currentCardMembers, updatedAt: serverTimestamp() };
        if(currentCardData.cid) {
            await updateDoc(doc(db,'boards',currentBoardId,'lists',currentCardData.lid,'cards',currentCardData.cid), payload);
            logActivity('updated_card', 'card', currentCardData.cid, { cardTitle: title });
            // Actualizar Índice Local
            const idx = allSearchCache.findIndex(x => x.id === currentCardData.cid);
            if(idx >= 0) { allSearchCache[idx].title = title; allSearchCache[idx].description = payload.description; }
        } else {
            const ref = await addDoc(collection(db,'boards',currentBoardId,'lists',currentCardData.lid,'cards'), {...payload, position:Date.now(), createdAt:serverTimestamp()});
            logActivity('created_card', 'card', ref.id, { cardTitle: title });
            // Añadir al Índice
            allSearchCache.push({ id: ref.id, type: 'card', title, description: payload.description, listId: currentCardData.lid, boardId: currentBoardId, boardTitle: currentBoardData.title, listName: '...' });
        }
        closeModal('card-modal');
    });

    document.getElementById('delete-card-btn')?.addEventListener('click', async()=>{if(confirm('¿Borrar?')){
        await deleteDoc(doc(db,'boards',currentBoardId,'lists',currentCardData.lid,'cards',currentCardData.cid)); 
        logActivity('deleted_card', 'card', currentCardData.cid, { cardTitle: currentCardData.data.title }); 
        allSearchCache = allSearchCache.filter(x => x.id !== currentCardData.cid); // Remover del índice
        closeModal('card-modal');
    }});

    function closeModal(id){const m=document.getElementById(id);if(m){m.classList.add('hidden');m.style.display='none';}}
    document.querySelectorAll('[id^="cancel-"]').forEach(b=>b.addEventListener('click',e=>closeModal(e.target.closest('.fixed').id)));
    document.getElementById('create-board-btn').addEventListener('click',()=>{boardModal.classList.remove('hidden');boardModal.style.display='flex'});
    document.getElementById('add-list-btn').addEventListener('click',()=>{listModal.classList.remove('hidden');listModal.style.display='flex'});
    document.getElementById('save-list-btn').addEventListener('click',async()=>{
        const v=document.getElementById('list-name-input').value.trim(); if(v){
            const ref = await addDoc(collection(db,'boards',currentBoardId,'lists'),{name:v,position:Date.now(),createdAt:serverTimestamp()}); 
            logActivity('created_list', 'list', null, { listName: v }); 
            allSearchCache.push({ id: ref.id, type: 'list', title: v, boardId: currentBoardId, boardTitle: currentBoardData.title });
            closeModal('list-modal'); document.getElementById('list-name-input').value='';
        }
    });
    document.getElementById('save-board-btn').addEventListener('click',async()=>{
        const v=document.getElementById('board-name-input').value.trim(); if(v){
            const ref = await addDoc(collection(db,'boards'),{title:v,ownerId:currentUser.uid,memberEmails:[currentUser.email],members:{[currentUser.uid]:{email:currentUser.email,name:currentUser.displayName||'User',role:'owner'}},createdAt:serverTimestamp()}); 
            allSearchCache.push({ id: ref.id, type: 'board', title: v });
            closeModal('board-modal');
        }
    });
    document.getElementById('back-to-boards-btn').addEventListener('click', ()=>{boardView.style.display='none'; document.querySelector('.boards-section').style.display='block'; if(unsubscribeLists) unsubscribeLists(); if(unsubscribeActivity) unsubscribeActivity(); currentBoardId=null;});
}
