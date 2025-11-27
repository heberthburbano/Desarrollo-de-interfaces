import { auth, db } from './firebase-config.js';
import { 
    collection, addDoc, doc, updateDoc, deleteDoc, query, where, onSnapshot, 
    orderBy, serverTimestamp, getDoc
} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';

document.addEventListener('DOMContentLoaded', initializeApp);

function initializeApp() {
    console.log('🚀 Inicializando Trello Clone (Fase 2: Checklists & Covers)...');

    // ========================================
    // VARIABLES DE ESTADO
    // ========================================
    let currentUser = null;
    let currentBoardId = null;
    let currentUserRole = null;
    
    // Estado de Edición (Tarjeta actual)
    let currentCardData = null; // { listId, cardId, data }
    let currentCardCover = { color: null }; // [NUEVO] Estado para portada
    let currentChecklist = []; // [NUEVO] Estado para checklist
    
    let unsubscribeBoards = null;
    let unsubscribeLists = null;
    let unsubscribeCards = {}; 

    // DOM Elements
    const boardsContainer = document.getElementById('boards-container');
    const boardView = document.getElementById('board-view');
    const listsContainer = document.getElementById('lists-container');
    const boardModal = document.getElementById('board-modal');
    const listModal = document.getElementById('list-modal');
    const cardModal = document.getElementById('card-modal');
    const coverModal = document.getElementById('card-cover-modal'); // [NUEVO]

    // ========================================
    // MODO OSCURO & AUTH
    // ========================================
    function initDarkMode() {
        const darkModeToggle = document.getElementById('dark-mode-toggle');
        const html = document.documentElement;
        if (localStorage.getItem('theme') === 'dark') html.classList.add('dark');
        darkModeToggle?.addEventListener('click', () => {
            html.classList.toggle('dark');
            localStorage.setItem('theme', html.classList.contains('dark') ? 'dark' : 'light');
            if(window.lucide) lucide.createIcons();
        });
    }
    initDarkMode();

    const PERMISSIONS = {
        owner: { editBoard: true, createList: true, editCard: true, deleteCard: true },
        editor: { editBoard: false, createList: true, editCard: true, deleteCard: true },
        viewer: { editBoard: false, createList: false, editCard: false, deleteCard: false }
    };

    function hasPermission(action) {
        if (!currentUserRole) return false;
        return PERMISSIONS[currentUserRole]?.[action] || false;
    }

    window.addEventListener('user-authenticated', (e) => {
        currentUser = e.detail.user;
        const avatar = document.getElementById('user-avatar');
        if(avatar) avatar.textContent = (currentUser.displayName || currentUser.email).charAt(0).toUpperCase();
        loadBoards();
    });

    // ========================================
    // GESTIÓN DE TABLEROS & LISTAS (Core)
    // ========================================

    function loadBoards() {
        if (unsubscribeBoards) unsubscribeBoards();
        const q = query(collection(db, 'boards'), where('memberEmails', 'array-contains', currentUser.email));
        
        unsubscribeBoards = onSnapshot(q, (snapshot) => {
            boardsContainer.innerHTML = '';
            if (snapshot.empty) {
                boardsContainer.innerHTML = `<div class="col-span-full text-center py-10 text-slate-500"><p>No tienes tableros.</p><button onclick="document.getElementById('create-board-btn').click()" class="text-blue-600 font-bold hover:underline">¡Crea uno!</button></div>`;
                return;
            }
            snapshot.forEach((doc) => boardsContainer.appendChild(createBoardCard(doc.id, doc.data())));
            if(window.lucide) lucide.createIcons();
        });
    }

    function createBoardCard(id, board) {
        const div = document.createElement('div');
        div.className = 'bg-white dark:bg-slate-800 p-4 rounded shadow hover:shadow-lg transition cursor-pointer h-32 flex flex-col justify-between border-l-4 border-[#0079BF] relative group';
        div.innerHTML = `
            <h3 class="font-bold text-slate-800 dark:text-white truncate">${board.title}</h3>
            <div class="flex justify-between items-end">
                <span class="text-xs text-slate-500"><i data-lucide="users" class="w-3 h-3 inline"></i> ${Object.keys(board.members || {}).length}</span>
                ${board.ownerId === currentUser.uid ? `<button class="delete-board-btn opacity-0 group-hover:opacity-100 text-red-500 p-1"><i data-lucide="trash-2" class="w-4 h-4"></i></button>` : ''}
            </div>`;
        div.addEventListener('click', (e) => !e.target.closest('.delete-board-btn') && openBoard(id, board));
        div.querySelector('.delete-board-btn')?.addEventListener('click', async (e) => {
            e.stopPropagation();
            if(confirm('¿Borrar tablero?')) await deleteDoc(doc(db, 'boards', id));
        });
        return div;
    }

    async function openBoard(boardId, boardData) {
        currentBoardId = boardId;
        currentUserRole = boardData.members?.[currentUser.uid]?.role || 'viewer';
        document.getElementById('board-title').textContent = boardData.title;
        
        document.querySelector('.boards-section').style.display = 'none'; 
        boardView.classList.remove('hidden');
        boardView.style.display = 'flex'; 
        loadLists(boardId);
    }

    function loadLists(boardId) {
        if (unsubscribeLists) unsubscribeLists();
        const q = query(collection(db, 'boards', boardId, 'lists'), orderBy('position', 'asc'));
        
        unsubscribeLists = onSnapshot(q, (snapshot) => {
            Array.from(listsContainer.querySelectorAll('.list-wrapper:not(:last-child)')).forEach(el => el.remove());
            const btnWrapper = listsContainer.lastElementChild; 
            snapshot.forEach((doc) => {
                const listEl = createListElement(doc.id, doc.data());
                listsContainer.insertBefore(listEl, btnWrapper);
                loadCards(boardId, doc.id, listEl.querySelector('.cards-container'));
            });
            if(window.lucide) lucide.createIcons();
        });
    }

    function createListElement(listId, listData) {
        const wrapper = document.createElement('div');
        wrapper.className = 'list-wrapper';
        const listDiv = document.createElement('div');
        listDiv.className = 'list';
        listDiv.dataset.listId = listId;

        listDiv.innerHTML = `
            <div class="list-header group">
                <h3 class="truncate text-sm font-semibold text-[#172B4D] dark:text-white">${listData.name}</h3>
                ${hasPermission('createList') ? `<button class="delete-list opacity-0 group-hover:opacity-100 text-slate-400 hover:text-red-600 transition"><i data-lucide="more-horizontal" class="w-4 h-4"></i></button>` : ''}
            </div>
            <div class="cards-container custom-scrollbar min-h-[10px]" data-list-id="${listId}"></div>
            ${hasPermission('createCard') ? `<div class="p-2"><button class="add-card-trigger w-full text-left p-2 text-slate-600 hover:bg-slate-200/50 dark:text-slate-300 dark:hover:bg-slate-700 rounded flex items-center gap-2 text-sm transition"><i data-lucide="plus" class="w-4 h-4"></i> Añadir tarjeta</button></div>` : ''}
        `;

        listDiv.querySelector('.delete-list')?.addEventListener('click', async () => {
            if(confirm('¿Borrar lista?')) await deleteDoc(doc(db, 'boards', currentBoardId, 'lists', listId));
        });
        listDiv.querySelector('.add-card-trigger')?.addEventListener('click', () => openCardModal(listId));
        setupDropZone(listDiv.querySelector('.cards-container'), listId);
        
        wrapper.appendChild(listDiv);
        return wrapper;
    }

    // ========================================
    // 4. GESTIÓN DE TARJETAS (Actualizada con Portadas y Checklist)
    // ========================================

    function loadCards(boardId, listId, container) {
        if(unsubscribeCards[listId]) unsubscribeCards[listId]();
        const q = query(collection(db, 'boards', boardId, 'lists', listId, 'cards'), orderBy('position', 'asc'));
        
        unsubscribeCards[listId] = onSnapshot(q, (snapshot) => {
            container.innerHTML = '';
            snapshot.forEach((doc) => container.appendChild(createCardElement(doc.id, listId, doc.data())));
            if(window.lucide) lucide.createIcons({ root: container });
        });
    }

    function createCardElement(cardId, listId, card) {
        const div = document.createElement('div');
        div.className = 'list-card group relative';
        div.draggable = hasPermission('editCard');
        div.dataset.cardId = cardId;
        div.dataset.listId = listId;

        // [NUEVO] Renderizado de Portada (Cover)
        let coverHtml = '';
        if(card.cover?.color) {
            // Usa clases de Tailwind para los colores (debes asegurarte que coinciden con los del modal)
            coverHtml = `<div class="card-cover ${card.cover.color}"></div>`;
        }

        // [NUEVO] Renderizado de Checklist (Barra de progreso)
        let checklistHtml = '';
        if(card.checklist && card.checklist.length > 0) {
            const total = card.checklist.length;
            const completed = card.checklist.filter(i => i.completed).length;
            const percent = Math.round((completed / total) * 100);
            const isDone = completed === total;
            
            checklistHtml = `
                <div class="flex items-center gap-1.5 text-xs ${isDone ? 'text-[#61BD4F]' : 'text-slate-500'} mt-1" title="Progreso del checklist">
                    <i data-lucide="check-square" class="w-3 h-3"></i> 
                    <span>${completed}/${total}</span>
                </div>
                <div class="checklist-progress-bar">
                    <div class="checklist-progress-value ${isDone ? 'complete' : ''}" style="width: ${percent}%"></div>
                </div>
            `;
        }

        // Renderizado de Fechas (Tu código anterior)
        let dateHtml = '';
        if (card.dueDate) {
            const dateObj = new Date(card.dueDate);
            const now = new Date(); now.setHours(0,0,0,0);
            const due = new Date(dateObj); due.setHours(0,0,0,0);
            const diff = (due - now) / (1000 * 60 * 60 * 24);
            
            let colorClass = 'text-slate-500 bg-transparent';
            let icon = 'calendar';
            if (diff < 0) { colorClass = 'bg-[#EB5A46] text-white'; icon = 'alert-circle'; }
            else if (diff <= 1) { colorClass = 'bg-[#F2D600] text-[#172B4D]'; icon = 'clock'; }
            
            dateHtml = `<div class="due-date-badge ${colorClass} inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] font-bold"><i data-lucide="${icon}" class="w-3 h-3"></i> <span>${dateObj.toLocaleDateString('es-ES', {day:'numeric', month:'short'})}</span></div>`;
        }

        div.innerHTML = `
            ${coverHtml}
            <span class="block text-sm text-[#172B4D] dark:text-slate-200 mb-1 leading-tight font-medium">${card.title}</span>
            <div class="flex flex-wrap gap-2 items-center">
                ${dateHtml}
                ${checklistHtml}
                ${card.description ? `<i data-lucide="align-left" class="w-3 h-3 text-slate-400"></i>` : ''}
            </div>
            <button class="icon-edit absolute top-1 right-1 p-1.5 bg-[#f4f5f7]/80 hover:bg-[#ebecf0] rounded opacity-0 group-hover:opacity-100 transition z-20"><i data-lucide="pencil" class="w-3 h-3 text-[#42526E]"></i></button>
        `;

        div.addEventListener('click', () => openCardModal(listId, cardId, card));
        if(div.draggable) {
            div.addEventListener('dragstart', handleDragStart);
            div.addEventListener('dragend', handleDragEnd);
        }
        return div;
    }

    // ========================================
    // 5. DRAG & DROP (Física & Lógica)
    // ========================================
    let draggedItem = null;

    function handleDragStart(e) {
        draggedItem = this;
        this.style.transform = 'rotate(3deg)'; 
        this.classList.add('dragging'); 
        e.dataTransfer.setData('text/plain', JSON.stringify({ cardId: this.dataset.cardId, sourceListId: this.dataset.listId }));
    }

    function handleDragEnd(e) {
        this.style.transform = 'none';
        this.classList.remove('dragging');
        draggedItem = null;
        document.querySelectorAll('.drag-over').forEach(el => el.classList.remove('drag-over'));
    }

    function setupDropZone(container, listId) {
        container.addEventListener('dragover', (e) => { e.preventDefault(); container.classList.add('drag-over'); });
        container.addEventListener('dragleave', () => container.classList.remove('drag-over'));
        container.addEventListener('drop', async (e) => {
            e.preventDefault();
            container.classList.remove('drag-over');
            if(!draggedItem) return;
            
            const { cardId, sourceListId } = JSON.parse(e.dataTransfer.getData('text/plain'));
            
            try {
                if (sourceListId !== listId) {
                    const oldRef = doc(db, 'boards', currentBoardId, 'lists', sourceListId, 'cards', cardId);
                    const snap = await getDoc(oldRef);
                    if(snap.exists()) {
                        await addDoc(collection(db, 'boards', currentBoardId, 'lists', listId, 'cards'), { ...snap.data(), position: Date.now() });
                        await deleteDoc(oldRef);
                    }
                } else {
                    await updateDoc(doc(db, 'boards', currentBoardId, 'lists', sourceListId, 'cards', cardId), { position: Date.now() });
                }
            } catch(err) { console.error(err); }
        });
    }

    // ========================================
    // 6. MODAL DE TARJETA (CHECKLIST & COVERS)
    // ========================================

    function openCardModal(listId, cardId = null, cardData = null) {
        currentCardData = { listId, cardId, data: cardData };
        
        // Reset Inputs
        document.getElementById('card-title-input').value = cardData ? cardData.title : '';
        document.getElementById('card-description-input').value = cardData?.description || '';
        document.getElementById('card-due-date-input').value = cardData?.dueDate || ''; 
        document.getElementById('card-modal-title').innerHTML = cardData ? '<i data-lucide="credit-card" class="w-3 h-3"></i> Editar Tarjeta' : '<i data-lucide="plus" class="w-3 h-3"></i> Nueva Tarjeta';

        // [NUEVO] Cargar estado de Checklist y Portada
        currentChecklist = cardData?.checklist || [];
        currentCardCover = cardData?.cover || { color: null };
        
        renderChecklist();
        
        cardModal.classList.remove('hidden');
        cardModal.style.display = 'flex';
        lucide.createIcons();
    }

    // [NUEVO] Función para renderizar el checklist en el modal con botón eliminar
    function renderChecklist() {
        const container = document.getElementById('checklist-items');
        container.innerHTML = '';
        
        currentChecklist.forEach((item, index) => {
            const div = document.createElement('div');
            div.className = 'checklist-item group flex items-center gap-2 py-1';
            div.innerHTML = `
                <input type="checkbox" ${item.completed ? 'checked' : ''} class="w-4 h-4 cursor-pointer accent-blue-600">
                <span class="flex-1 text-sm ${item.completed ? 'line-through text-slate-400' : 'text-slate-700 dark:text-slate-300'}">${item.text}</span>
                <button class="delete-item-btn text-slate-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition"><i data-lucide="trash-2" class="w-3 h-3"></i></button>
            `;
            
            // Toggle completado
            div.querySelector('input').addEventListener('change', (e) => {
                item.completed = e.target.checked;
                renderChecklist(); // Re-render para actualizar barra progreso
            });

            // Borrar item
            div.querySelector('.delete-item-btn').addEventListener('click', () => {
                currentChecklist.splice(index, 1);
                renderChecklist();
            });

            container.appendChild(div);
        });

        // Actualizar barra de progreso del modal
        const progress = document.getElementById('checklist-progress');
        const completed = currentChecklist.filter(i => i.completed).length;
        const total = currentChecklist.length;
        const percent = total === 0 ? 0 : Math.round((completed/total)*100);
        
        if (progress) progress.innerHTML = `${percent}%`;
        if(window.lucide) lucide.createIcons();
    }

    // Event Listeners Checklist
    document.getElementById('add-checklist-item-btn')?.addEventListener('click', () => {
        const input = document.getElementById('new-checklist-item-input');
        if(input.value.trim()) {
            currentChecklist.push({ text: input.value.trim(), completed: false });
            input.value = '';
            renderChecklist();
        }
    });

    // [NUEVO] Gestión de Portadas (Modal)
    document.getElementById('card-cover-btn')?.addEventListener('click', () => {
        coverModal.classList.remove('hidden');
        coverModal.style.display = 'flex';
    });

    document.querySelectorAll('.cover-color').forEach(btn => {
        btn.addEventListener('click', () => {
            const colorClass = btn.getAttribute('data-color'); // ej: 'bg-green-500'
            currentCardCover = { color: colorClass };
            closeModal('card-cover-modal');
        });
    });

    document.getElementById('remove-cover-btn')?.addEventListener('click', () => {
        currentCardCover = { color: null };
        closeModal('card-cover-modal');
    });

    // GUARDAR TARJETA (Ahora incluye cover y checklist)
    document.getElementById('save-card-btn')?.addEventListener('click', async () => {
        const title = document.getElementById('card-title-input').value.trim();
        if(!title) return;

        const dataToSave = {
            title,
            description: document.getElementById('card-description-input').value.trim(),
            dueDate: document.getElementById('card-due-date-input').value,
            checklist: currentChecklist, // Guardamos el array actualizado
            cover: currentCardCover,     // Guardamos la portada seleccionada
            updatedAt: serverTimestamp()
        };

        if (currentCardData.cardId) {
            await updateDoc(doc(db, 'boards', currentBoardId, 'lists', currentCardData.listId, 'cards', currentCardData.cardId), dataToSave);
        } else {
            await addDoc(collection(db, 'boards', currentBoardId, 'lists', currentCardData.listId, 'cards'), {
                ...dataToSave,
                position: Date.now(),
                createdAt: serverTimestamp()
            });
        }
        closeModal('card-modal');
    });

    document.getElementById('delete-card-btn')?.addEventListener('click', async () => {
        if(!currentCardData.cardId) return;
        if(confirm('¿Borrar tarjeta?')) {
            await deleteDoc(doc(db, 'boards', currentBoardId, 'lists', currentCardData.listId, 'cards', currentCardData.cardId));
            closeModal('card-modal');
        }
    });

    // ========================================
    // UTILIDADES
    // ========================================
    function closeModal(modalId) {
        const modal = document.getElementById(modalId);
        if(modal) { modal.classList.add('hidden'); modal.style.display = 'none'; }
    }

    document.querySelectorAll('[id^="cancel-"]').forEach(btn => btn.addEventListener('click', (e) => closeModal(e.target.closest('.fixed').id)));
    
    // Abrir modales globales
    document.getElementById('create-board-btn')?.addEventListener('click', () => { boardModal.classList.remove('hidden'); boardModal.style.display = 'flex'; });
    document.getElementById('add-list-btn')?.addEventListener('click', () => { listModal.classList.remove('hidden'); listModal.style.display = 'flex'; });
    document.getElementById('back-to-boards-btn')?.addEventListener('click', () => {
        boardView.style.display = 'none';
        document.querySelector('.boards-section').style.display = 'block';
        if(unsubscribeLists) unsubscribeLists();
        currentBoardId = null;
    });

}
