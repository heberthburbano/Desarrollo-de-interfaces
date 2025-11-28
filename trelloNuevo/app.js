import { auth, db } from './firebase-config.js';
import { 
    collection, addDoc, doc, updateDoc, deleteDoc, query, where, onSnapshot, 
    orderBy, serverTimestamp, getDoc, getDocs, arrayUnion
} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';

document.addEventListener('DOMContentLoaded', initializeApp);

function initializeApp() {
    console.log('🚀 Inicializando Trello Clone (Versión Final Reparada)...');

    // ========================================
    // ESTADO GLOBAL
    // ========================================
    let currentUser = null;
    let currentBoardId = null;
    let currentBoardData = null;
    let currentUserRole = null;
    
    // Cache de Búsqueda
    let globalSearchIndex = { boards: [], lists: [], cards: [] };
    let searchResultIndex = -1;

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

    // HELPER: Tiempo relativo
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

    // PERMISOS
    const PERMISSIONS = { owner: {createList:true, editCard:true}, editor: {createList:true, editCard:true}, viewer: {createList:false, editCard:false} };
    function hasPermission(a) { return currentUserRole && PERMISSIONS[currentUserRole]?.[a]; }

    // ========================================
    // INICIO DE SESIÓN Y CARGA INICIAL
    // ========================================
    window.addEventListener('user-authenticated', (e) => {
        currentUser = e.detail.user;
        const av = document.getElementById('user-avatar');
        if(av) av.textContent = (currentUser.displayName||currentUser.email).charAt(0).toUpperCase();
        
        loadBoards();
        loadNotifications();
        buildGlobalIndex(); // Indexar todo para búsqueda
        initSearchListeners();
        initGlobalShortcuts();
    });

    // ========================================
    // BÚSQUEDA GLOBAL V3 (CON MIGAS DE PAN)
    // ========================================
    async function buildGlobalIndex() {
        console.log("🔍 Indexando contenido...");
        globalSearchIndex = { boards: [], lists: [], cards: [] };
        try {
            const qBoards = query(collection(db, 'boards'), where('memberEmails', 'array-contains', currentUser.email));
            const snapBoards = await getDocs(qBoards);
            
            await Promise.all(snapBoards.docs.map(async (boardDoc) => {
                const b = boardDoc.data();
                globalSearchIndex.boards.push({ id: boardDoc.id, title: b.title, type: 'board' });

                const snapLists = await getDocs(query(collection(db, 'boards', boardDoc.id, 'lists')));
                for (const listDoc of snapLists.docs) {
                    const l = listDoc.data();
                    globalSearchIndex.lists.push({ id: listDoc.id, name: l.name, boardId: boardDoc.id, boardTitle: b.title, type: 'list' });

                    const snapCards = await getDocs(query(collection(db, 'boards', boardDoc.id, 'lists', listDoc.id, 'cards')));
                    snapCards.forEach(cardDoc => {
                        const c = cardDoc.data();
                        globalSearchIndex.cards.push({
                            id: cardDoc.id, title: c.title, description: c.description||'',
                            listId: listDoc.id, listName: l.name, boardId: boardDoc.id, boardTitle: b.title, type: 'card'
                        });
                    });
                }
            }));
            console.log(`✅ Indexado completado: ${globalSearchIndex.cards.length} tarjetas.`);
        } catch (e) { console.error("Error indexando:", e); }
    }

    function initSearchListeners() {
        searchInput?.addEventListener('input', (e) => {
            const term = e.target.value.trim().toLowerCase();
            if(term.length < 2) { searchResults.classList.add('hidden'); searchResultIndex = -1; return; }
            
            const matches = [
                ...globalSearchIndex.boards.filter(b => b.title.toLowerCase().includes(term)),
                ...globalSearchIndex.lists.filter(l => l.name.toLowerCase().includes(term)),
                ...globalSearchIndex.cards.filter(c => c.title.toLowerCase().includes(term) || c.description.toLowerCase().includes(term))
            ].slice(0, 15); // Limitar resultados

            searchResultsList.innerHTML = '';
            if(matches.length === 0) {
                searchResultsList.innerHTML = '<p class="p-4 text-sm text-slate-500 text-center">No hay resultados</p>';
            } else {
                matches.forEach((res, idx) => {
                    const div = document.createElement('div');
                    div.className = 'search-result-item p-2 hover:bg-slate-100 cursor-pointer border-b border-slate-50';
                    div.dataset.index = idx;
                    
                    let icon = 'layout', typeLabel = 'Tablero', sub = '';
                    if(res.type === 'list') { icon='list'; typeLabel='Lista'; sub=`En: ${res.boardTitle}`; }
                    if(res.type === 'card') { 
                        icon='credit-card'; typeLabel='Tarjeta'; 
                        // Migas de Pan (Breadcrumbs)
                        sub=`<span class="flex items-center gap-1 text-[10px] text-slate-400">${res.boardTitle} <i data-lucide="chevron-right" class="w-2 h-2"></i> ${res.listName}</span>`; 
                    }

                    div.innerHTML = `
                        <div class="flex items-center gap-3">
                            <div class="p-1.5 bg-slate-200 rounded text-slate-600"><i data-lucide="${icon}" class="w-4 h-4"></i></div>
                            <div class="flex-1 min-w-0">
                                <div class="text-sm font-semibold text-slate-800 truncate">${highlightText(res.title || res.name, term)}</div>
                                <div class="text-xs text-slate-500">${sub}</div>
                            </div>
                            <span class="text-[9px] uppercase font-bold text-slate-400 bg-slate-100 px-1 rounded">${typeLabel}</span>
                        </div>
                    `;
                    div.addEventListener('click', () => handleSearchResultClick(res));
                    searchResultsList.appendChild(div);
                });
            }
            searchResults.classList.remove('hidden');
            if(window.lucide) lucide.createIcons();
        });

        // Click fuera para cerrar
        document.addEventListener('click', (e) => { 
            if(!searchInput.contains(e.target) && !searchResults.contains(e.target)) searchResults.classList.add('hidden'); 
        });
    }

    function highlightText(text, term) {
        if (!text) return '';
        const regex = new RegExp(`(${term})`, 'gi');
        return text.replace(regex, '<span class="search-result-highlight bg-yellow-200 text-yellow-900 rounded px-0.5">$1</span>');
    }

    async function handleSearchResultClick(res) {
        searchResults.classList.add('hidden');
        searchInput.value = '';

        // Navegación Cruzada
        if (currentBoardId !== res.boardId && res.boardId) {
            const bSnap = await getDoc(doc(db, 'boards', res.boardId));
            if (bSnap.exists()) {
                await openBoard(res.boardId, bSnap.data());
                // Delay para esperar renderizado de listas
                if(res.type !== 'board') setTimeout(() => focusResult(res), 800); 
            }
        } else {
            focusResult(res);
        }
    }

    async function focusResult(res) {
        if(res.type === 'list') {
            const el = document.querySelector(`[data-list-id="${res.id}"]`);
            if(el) { el.scrollIntoView({behavior:'smooth', inline:'center'}); el.classList.add('ring-4', 'ring-blue-300'); setTimeout(()=>el.classList.remove('ring-4', 'ring-blue-300'), 1500); }
        } else if(res.type === 'card') {
            const snap = await getDoc(doc(db, 'boards', res.boardId, 'lists', res.listId, 'cards', res.id));
            if(snap.exists()) openCardModal(res.listId, res.id, snap.data());
        }
    }

    // ========================================
    // TABLEROS & LISTAS
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
        currentBoardId = id; currentBoardData = data; 
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

    // TARJETAS
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
        
        // --- LOGICA DE PORTADAS (Corregida con Emoji) ---
        if(card.cover?.url && card.cover.mode === 'full') { 
            fullClass='full-cover'; d.style.backgroundImage=`url('${card.cover.url}')`; 
        } else if(card.cover?.url) {
            coverHtml = `<div class="card-cover-image" style="background-image: url('${card.cover.url}')"></div>`;
        } else if(card.cover?.emoji) {
            coverHtml = `<div class="h-[32px] bg-slate-100 flex items-center justify-center text-2xl rounded-t mb-2">${card.cover.emoji}</div>`;
        } else if(card.cover?.color) {
            coverHtml = `<div class="card-cover ${card.cover.color}"></div>`;
        }
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

        let checkHtml = '', dateHtml = '';
        if(card.checklist?.length) {
            const c = card.checklist.filter(i=>i.completed).length, t=card.checklist.length, p=Math.round((c/t)*100);
            checkHtml = `<div class="flex items-center gap-1.5 text-xs ${c===t?'text-green-600':'text-slate-500'} mt-1"><i data-lucide="check-square" class="w-3 h-3"></i> <span>${c}/${t}</span></div><div class="checklist-progress-bar"><div class="checklist-progress-value ${c===t?'complete':''}" style="width:${p}%"></div></div>`;
        }
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
                    if(snap.exists()) { await addDoc(collection(db,'boards',currentBoardId,'lists',lid,'cards'),{...snap.data(),position:Date.now()}); await deleteDoc(snap.ref); logActivity('moved_card', 'card', cid, { cardTitle: snap.data().title, fromList: slid, toList: lid }); }
                } else await updateDoc(doc(db,'boards',currentBoardId,'lists',slid,'cards',cid),{position:Date.now()});
            } catch(er){console.error(er);}
        });
    }

    // ========================================
    // MODAL DE TARJETA (REPARADO)
    // ========================================
    function openCardModal(lid, cid=null, data=null) {
        currentCardData = { lid, cid, data };
        checklistHideCompleted = false;

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

        // CARGAR COMENTARIOS (REPARADO)
        if(cid) {
            loadComments(lid, cid);
        } else {
            const listDiv = document.getElementById('comments-list');
            if(listDiv) listDiv.innerHTML = '';
        }

        cardModal.classList.remove('hidden'); cardModal.style.display='flex';
        lucide.createIcons();
    }

    // COMENTARIOS (Función que faltaba)
    function loadComments(lid, cid) {
        if (unsubscribeComments) unsubscribeComments();
        const listDiv = document.getElementById('comments-list');
        if (!listDiv) return; // Protección

        unsubscribeComments = onSnapshot(query(collection(db, 'boards', currentBoardId, 'lists', lid, 'cards', cid, 'comments'), orderBy('createdAt', 'desc')), (snap) => {
            listDiv.innerHTML = '';
            if (snap.empty) { listDiv.innerHTML = '<p class="text-xs text-slate-400 italic pl-2">No hay comentarios aún.</p>'; return; }
            snap.forEach(doc => {
                const c = doc.data();
                const div = document.createElement('div'); div.className = 'flex gap-3 items-start mb-3';
                div.innerHTML = `
                    <div class="w-8 h-8 rounded-full bg-slate-200 flex items-center justify-center text-xs font-bold text-slate-700 shrink-0">${(c.userName||'U').charAt(0).toUpperCase()}</div>
                    <div class="flex-1 min-w-0"><div class="flex items-baseline gap-2"><span class="text-sm font-bold text-[#172B4D]">${c.userName}</span><span class="text-xs text-slate-500">${timeAgo(c.createdAt?.toDate())}</span></div><div class="p-2 bg-white border border-slate-200 rounded-lg shadow-sm mt-1 text-sm text-slate-800 break-words">${c.text}</div></div>
                `;
                listDiv.appendChild(div);
            });
        });
    }

    document.getElementById('add-comment-btn')?.addEventListener('click', async () => {
        const inp = document.getElementById('comment-input'); const t=inp.value.trim();
        if(!t || !currentCardData.cid) return;
        try {
            await addDoc(collection(db, 'boards', currentBoardId, 'lists', currentCardData.lid, 'cards', currentCardData.cid, 'comments'), {
                text: t, userId: currentUser.uid, userName: currentUser.displayName||currentUser.email, createdAt: serverTimestamp()
            });
            logActivity('added_comment', 'card', currentCardData.cid, { cardTitle: currentCardData.data.title, commentSnippet: t.substring(0,15)+'...' });
            inp.value = '';
        } catch(e) { console.error(e); }
    });

    // --- UTILS ---
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
    
    // --- LÓGICA PORTADAS Y EMOJIS ---
    document.getElementById('card-cover-btn')?.addEventListener('click', () => { 
        coverModal.classList.remove('hidden'); 
        coverModal.style.display='flex'; 

        // INYECCIÓN DE BOTÓN EMOJI (Corregido)
        const coverModalContent = document.querySelector('#card-cover-modal > div');
        const removeBtn = document.getElementById('remove-cover-btn');
        
        if (coverModalContent && removeBtn && !document.getElementById('emoji-btn-injected')) {
            const emojiBtn = document.createElement('button');
            emojiBtn.id = 'emoji-btn-injected';
            emojiBtn.className = "w-full text-xs py-1 mt-1 bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 dark:hover:bg-slate-600 dark:text-white rounded mb-2 font-medium";
            emojiBtn.innerText = "😊 Usar Emoji";
            emojiBtn.onclick = () => {
                const emoji = prompt("Introduce un emoji (Win+. o Cmd+Ctrl+Espacio):", "⚡");
                if(emoji) {
                    currentCardCover = { color: null, mode: 'color', url: null, emoji: emoji }; 
                    closeModal('card-cover-modal');
                }
            };
            coverModalContent.insertBefore(emojiBtn, removeBtn);
        }
    });

    document.querySelectorAll('.cover-color').forEach(b => b.addEventListener('click', () => { currentCardCover={color:b.dataset.color, mode:'color', url:null}; closeModal('card-cover-modal'); }));
    document.getElementById('remove-cover-btn')?.addEventListener('click', () => { currentCardCover={color:null}; closeModal('card-cover-modal'); });

    // GUARDAR Y SALIR (CON ACTUALIZACIÓN DE ÍNDICE)
    document.getElementById('save-card-btn')?.addEventListener('click', async () => {
        const title = document.getElementById('card-title-input').value.trim(); if(!title) return;
        const payload = { title, description: document.getElementById('card-description-input').value.trim(), dueDate: document.getElementById('card-due-date-input').value, checklist: currentChecklist, cover: currentCardCover, attachments: currentAttachments, labels: currentCardLabels, assignedTo: currentCardMembers, updatedAt: serverTimestamp() };
        if(currentCardData.cid) {
            await updateDoc(doc(db,'boards',currentBoardId,'lists',currentCardData.lid,'cards',currentCardData.cid), payload);
            logActivity('updated_card', 'card', currentCardData.cid, { cardTitle: title });
            // Actualizar Índice Local
            const idx = globalSearchIndex.cards.findIndex(x => x.id === currentCardData.cid);
            if(idx >= 0) { globalSearchIndex.cards[idx].title = title; globalSearchIndex.cards[idx].description = payload.description; }
        } else {
            const ref = await addDoc(collection(db,'boards',currentBoardId,'lists',currentCardData.lid,'cards'), {...payload, position:Date.now(), createdAt:serverTimestamp()});
            logActivity('created_card', 'card', ref.id, { cardTitle: title });
            // Añadir al Índice
            globalSearchIndex.cards.push({ id: ref.id, type: 'card', title, description: payload.description, listId: currentCardData.lid, boardId: currentBoardId, boardTitle: currentBoardData.title, listName: '...' });
        }
        closeModal('card-modal');
    });

    document.getElementById('delete-card-btn')?.addEventListener('click', async()=>{if(confirm('¿Borrar?')){
        await deleteDoc(doc(db,'boards',currentBoardId,'lists',currentCardData.lid,'cards',currentCardData.cid)); 
        logActivity('deleted_card', 'card', currentCardData.cid, { cardTitle: currentCardData.data.title }); 
        globalSearchIndex.cards = globalSearchIndex.cards.filter(x => x.id !== currentCardData.cid); // Remover del índice
        closeModal('card-modal');
    }});

    // CIERRE MODAL UNIFICADO
    function closeModal(id) {
        const m = document.getElementById(id);
        if (m) {
            m.classList.add('hidden'); m.style.display = 'none';
            if (id === 'card-modal' && unsubscribeComments) { unsubscribeComments(); unsubscribeComments = null; }
        }
    }

    document.querySelectorAll('[id^="cancel-"]').forEach(b => b.addEventListener('click',e=>closeModal(e.target.closest('.fixed').id)));
    document.getElementById('create-board-btn').addEventListener('click',()=>{boardModal.classList.remove('hidden');boardModal.style.display='flex'});
    document.getElementById('add-list-btn').addEventListener('click',()=>{listModal.classList.remove('hidden');listModal.style.display='flex'});
    document.getElementById('save-list-btn').addEventListener('click',async()=>{
        const v=document.getElementById('list-name-input').value.trim(); if(v){
            const ref = await addDoc(collection(db,'boards',currentBoardId,'lists'),{name:v,position:Date.now(),createdAt:serverTimestamp()}); 
            logActivity('created_list', 'list', null, { listName: v }); 
            globalSearchIndex.lists.push({ id: ref.id, type: 'list', title: v, boardId: currentBoardId, boardTitle: currentBoardData.title });
            closeModal('list-modal'); document.getElementById('list-name-input').value='';
        }
    });
    document.getElementById('save-board-btn').addEventListener('click',async()=>{
        const v=document.getElementById('board-name-input').value.trim(); if(v){
            const ref = await addDoc(collection(db,'boards'),{title:v,ownerId:currentUser.uid,memberEmails:[currentUser.email],members:{[currentUser.uid]:{email:currentUser.email,name:currentUser.displayName||'User',role:'owner'}},createdAt:serverTimestamp()}); 
            globalSearchIndex.boards.push({ id: ref.id, type: 'board', title: v });
            closeModal('board-modal');
        }
    });
    document.getElementById('back-to-boards-btn').addEventListener('click', ()=>{boardView.style.display='none'; document.querySelector('.boards-section').style.display='block'; if(unsubscribeLists) unsubscribeLists(); if(unsubscribeActivity) unsubscribeActivity(); currentBoardId=null;});

    // ATAJOS
    function initGlobalShortcuts() {
        document.addEventListener('keydown', (e) => {
            if (e.target.matches('input, textarea')) return;
            if (e.key === '/') { e.preventDefault(); searchInput.focus(); }
            if (e.key === 'Escape') document.querySelectorAll('.fixed').forEach(m => { if(!m.classList.contains('hidden')) closeModal(m.id); });
        });
    }
}
