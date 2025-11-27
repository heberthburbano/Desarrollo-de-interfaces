import { auth, db } from './firebase-config.js';
import { 
    collection, addDoc, doc, updateDoc, deleteDoc, query, where, onSnapshot, 
    orderBy, arrayUnion, arrayRemove, serverTimestamp, getDoc, getDocs, deleteField
} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';

// ESPERAR A QUE EL DOM ESTÉ LISTO
document.addEventListener('DOMContentLoaded', initializeApp);

function initializeApp() {
    console.log('🚀 Inicializando aplicación Trello Clone (v2025)...');

    // ========================================
    // ESTADO GLOBAL
    // ========================================
    let currentUser = null;
    let currentBoardId = null;
    let currentBoardData = null;
    let currentUserRole = null;
    let currentCardData = null; 
    let unsubscribeBoards = null;
    let unsubscribeLists = null;
    let unsubscribeCards = {}; 
    let unsubscribeActivity = null;
    let unsubscribeNotifications = null; // [FIX] Faltaba declarar esta variable

    // Elementos DOM Principales
    const boardsContainer = document.getElementById('boards-container');
    const boardView = document.getElementById('board-view');
    const listsContainer = document.getElementById('lists-container');
    const boardModal = document.getElementById('board-modal');
    const listModal = document.getElementById('list-modal');
    const cardModal = document.getElementById('card-modal');
    const inviteModal = document.getElementById('invite-modal');

    // ========================================
    // MODO OSCURO [FIX]
    // ========================================
    function initDarkMode() {
        const darkModeToggle = document.getElementById('dark-mode-toggle');
        const html = document.documentElement;
        
        // Cargar preferencia guardada
        if (localStorage.getItem('theme') === 'dark') {
            html.classList.add('dark');
        }

        darkModeToggle?.addEventListener('click', () => {
            html.classList.toggle('dark');
            const isDark = html.classList.contains('dark');
            localStorage.setItem('theme', isDark ? 'dark' : 'light');
            
            // Actualizar iconos por si alguno cambia según el tema
            if(window.lucide) lucide.createIcons();
        });
    }
    initDarkMode();

    // ========================================
    // PERMISOS Y ROLES
    // ========================================
    const PERMISSIONS = {
        owner: { viewBoard: true, editBoard: true, deleteBoard: true, createList: true, editCard: true, deleteCard: true },
        editor: { viewBoard: true, editBoard: false, deleteBoard: false, createList: true, editCard: true, deleteCard: true },
        viewer: { viewBoard: true, editBoard: false, deleteBoard: false, createList: false, editCard: false, deleteCard: false }
    };

    function hasPermission(action) {
        if (!currentUserRole) return false;
        return PERMISSIONS[currentUserRole]?.[action] || false;
    }

    // ========================================
    // AUTENTICACIÓN
    // ========================================
    window.addEventListener('user-authenticated', (e) => {
        currentUser = e.detail.user;
        console.log('👤 Usuario detectado:', currentUser.email);
        
        // UI de Usuario
        const avatar = document.getElementById('user-avatar');
        if(avatar) avatar.textContent = (currentUser.displayName || currentUser.email).charAt(0).toUpperCase();
        const nameDisplay = document.getElementById('user-name');
        if(nameDisplay) nameDisplay.textContent = currentUser.displayName || currentUser.email;

        loadBoards();
        // loadNotifications(); // Descomentar si implementas notificaciones
    });

    // ========================================
    // 1. GESTIÓN DE TABLEROS
    // ========================================

    function loadBoards() {
        if (unsubscribeBoards) unsubscribeBoards();

        const q = query(
            collection(db, 'boards'),
            where('memberEmails', 'array-contains', currentUser.email)
        );

        unsubscribeBoards = onSnapshot(q, (snapshot) => {
            boardsContainer.innerHTML = '';
            
            if (snapshot.empty) {
                boardsContainer.innerHTML = `
                    <div class="col-span-full text-center py-10 text-slate-500">
                        <p>No tienes tableros aún.</p>
                        <button onclick="document.getElementById('create-board-btn').click()" class="text-blue-600 font-bold hover:underline">¡Crea el primero!</button>
                    </div>`;
                return;
            }

            snapshot.forEach((docSnap) => {
                const board = docSnap.data();
                const card = createBoardCard(docSnap.id, board);
                boardsContainer.appendChild(card);
            });
            if(window.lucide) lucide.createIcons();
        });
    }

    function createBoardCard(id, board) {
        const div = document.createElement('div');
        div.className = 'bg-white dark:bg-slate-800 p-4 rounded shadow hover:shadow-lg transition cursor-pointer h-32 flex flex-col justify-between border-l-4 border-[#0079BF] relative group';
        
        div.innerHTML = `
            <h3 class="font-bold text-slate-800 dark:text-white truncate">${board.title}</h3>
            <div class="flex justify-between items-end">
                <span class="text-xs text-slate-500 flex items-center gap-1"><i data-lucide="users" class="w-3 h-3"></i> ${Object.keys(board.members || {}).length}</span>
                ${board.ownerId === currentUser.uid ? 
                    `<button class="delete-board-btn opacity-0 group-hover:opacity-100 text-red-500 hover:bg-red-50 p-1 rounded" title="Eliminar"><i data-lucide="trash-2" class="w-4 h-4"></i></button>` 
                    : ''}
            </div>
        `;

        div.addEventListener('click', (e) => {
            if(!e.target.closest('.delete-board-btn')) openBoard(id, board);
        });

        // Borrar tablero
        const deleteBtn = div.querySelector('.delete-board-btn');
        if(deleteBtn) {
            deleteBtn.addEventListener('click', async (e) => {
                e.stopPropagation();
                if(confirm('¿Borrar tablero permanentemente?')) {
                    await deleteDoc(doc(db, 'boards', id));
                }
            });
        }
        
        return div;
    }

    // CREAR TABLERO [FIX: Lógica de Modal Corregida]
    document.getElementById('save-board-btn')?.addEventListener('click', async () => {
        const nameInput = document.getElementById('board-name-input');
        const title = nameInput.value.trim();
        if(!title) return alert('Escribe un nombre');

        try {
            await addDoc(collection(db, 'boards'), {
                title,
                ownerId: currentUser.uid,
                memberEmails: [currentUser.email],
                members: {
                    [currentUser.uid]: {
                        email: currentUser.email,
                        role: 'owner',
                        name: currentUser.displayName || 'Usuario'
                    }
                },
                createdAt: serverTimestamp()
            });
            closeModal('board-modal'); // Usar función helper
            nameInput.value = '';
        } catch (e) {
            console.error(e);
            alert('Error al crear tablero');
        }
    });

    // ========================================
    // 2. VISTA DE TABLERO ÚNICO
    // ========================================

    async function openBoard(boardId, boardData) {
        currentBoardId = boardId;
        currentBoardData = boardData;
        
        const memberData = boardData.members?.[currentUser.uid];
        currentUserRole = memberData ? memberData.role : 'viewer';

        // Actualizar UI
        document.getElementById('board-title').textContent = boardData.title;
        const roleBadge = document.getElementById('user-role-badge');
        if(roleBadge) {
            roleBadge.textContent = currentUserRole === 'owner' ? 'Propietario' : (currentUserRole === 'editor' ? 'Editor' : 'Observador');
            roleBadge.classList.remove('hidden');
        }

        // Transición de Vistas
        document.querySelector('.boards-section').style.display = 'none'; 
        boardView.classList.remove('hidden');
        boardView.style.display = 'flex'; // Necesario para mantener el layout vertical

        loadLists(boardId);
    }

    // Botón Volver
    document.getElementById('back-to-boards-btn')?.addEventListener('click', () => {
        boardView.style.display = 'none';
        boardView.classList.add('hidden');
        document.querySelector('.boards-section').style.display = 'block';
        
        if(unsubscribeLists) unsubscribeLists();
        Object.values(unsubscribeCards).forEach(unsub => unsub());
        unsubscribeCards = {};
        currentBoardId = null;
    });

    // ========================================
    // 3. GESTIÓN DE LISTAS
    // ========================================

    function loadLists(boardId) {
        if (unsubscribeLists) unsubscribeLists();

        const q = query(
            collection(db, 'boards', boardId, 'lists'),
            orderBy('position', 'asc')
        );

        unsubscribeLists = onSnapshot(q, (snapshot) => {
            // Mantener el botón "Añadir lista" al final
            const existingLists = Array.from(listsContainer.querySelectorAll('.list-wrapper:not(:last-child)'));
            existingLists.forEach(el => el.remove());

            const addListBtnWrapper = listsContainer.lastElementChild; 

            snapshot.forEach((docSnap) => {
                const listEl = createListElement(docSnap.id, docSnap.data());
                listsContainer.insertBefore(listEl, addListBtnWrapper);
                
                loadCards(boardId, docSnap.id, listEl.querySelector('.cards-container'));
            });
            
            if(window.lucide) lucide.createIcons();
        });
    }

    function createListElement(listId, listData) {
        // [REPORT] Ancho fijo 272px controlado por CSS .list-wrapper
        const wrapper = document.createElement('div');
        wrapper.className = 'list-wrapper';

        const listDiv = document.createElement('div');
        listDiv.className = 'list';
        listDiv.dataset.listId = listId;

        const canEdit = hasPermission('createList');

        listDiv.innerHTML = `
            <div class="list-header group">
                <h3 class="truncate text-sm font-semibold text-[#172B4D] dark:text-white">${listData.name}</h3>
                ${canEdit ? `<button class="delete-list opacity-0 group-hover:opacity-100 text-slate-400 hover:text-red-600 transition"><i data-lucide="more-horizontal" class="w-4 h-4"></i></button>` : ''}
            </div>
            
            <div class="cards-container custom-scrollbar min-h-[10px]" data-list-id="${listId}"></div>

            ${hasPermission('createCard') ? `
                <div class="p-2">
                    <button class="add-card-trigger w-full text-left p-2 text-slate-600 hover:bg-slate-200/50 dark:text-slate-300 dark:hover:bg-slate-700 rounded flex items-center gap-2 text-sm transition">
                        <i data-lucide="plus" class="w-4 h-4"></i> Añadir tarjeta
                    </button>
                </div>
            ` : ''}
        `;

        // Borrar lista
        const deleteBtn = listDiv.querySelector('.delete-list');
        if(deleteBtn) {
            deleteBtn.addEventListener('click', async () => {
                if(confirm('¿Borrar lista y todas sus tarjetas?')) {
                    await deleteDoc(doc(db, 'boards', currentBoardId, 'lists', listId));
                }
            });
        }

        // Añadir Tarjeta
        const addCardBtn = listDiv.querySelector('.add-card-trigger');
        if(addCardBtn) {
            addCardBtn.addEventListener('click', () => {
                openCardModal(listId);
            });
        }

        setupDropZone(listDiv.querySelector('.cards-container'), listId);

        wrapper.appendChild(listDiv);
        return wrapper;
    }

    // CREAR LISTA
    document.getElementById('save-list-btn')?.addEventListener('click', async () => {
        const input = document.getElementById('list-name-input');
        const name = input.value.trim();
        if(!name) return;

        await addDoc(collection(db, 'boards', currentBoardId, 'lists'), {
            name,
            position: Date.now(),
            createdAt: serverTimestamp()
        });

        closeModal('list-modal');
        input.value = '';
    });

    // ========================================
    // 4. GESTIÓN DE TARJETAS
    // ========================================

    function loadCards(boardId, listId, container) {
        if(unsubscribeCards[listId]) unsubscribeCards[listId]();

        const q = query(
            collection(db, 'boards', boardId, 'lists', listId, 'cards'),
            orderBy('position', 'asc')
        );

        unsubscribeCards[listId] = onSnapshot(q, (snapshot) => {
            container.innerHTML = '';
            snapshot.forEach((docSnap) => {
                const cardEl = createCardElement(docSnap.id, listId, docSnap.data());
                container.appendChild(cardEl);
            });
            if(window.lucide) lucide.createIcons({ root: container });
        });
    }

    function createCardElement(cardId, listId, card) {
        const div = document.createElement('div');
        div.className = 'list-card group relative'; // Estilos definidos en style.css
        div.draggable = hasPermission('editCard');
        div.dataset.cardId = cardId;
        div.dataset.listId = listId;

        // [REPORT] Etiquetas Expandibles (Interacción Source 182)
        let labelsHtml = '';
        if(card.labels && card.labels.length > 0) {
            labelsHtml = `<div class="flex flex-wrap mb-1 gap-1">${card.labels.map(l => 
                `<span class="card-label ${l.color}" title="${l.name}"></span>`
            ).join('')}</div>`;
        }

        div.innerHTML = `
            ${labelsHtml}
            <span class="block text-sm text-[#172B4D] dark:text-slate-200 mb-1 leading-tight">${card.title}</span>
            <div class="flex items-center gap-3 text-xs text-[#5e6c84] dark:text-slate-400 mt-1">
                ${card.description ? `<span title="Tiene descripción"><i data-lucide="align-left" class="w-3 h-3"></i></span>` : ''}
                ${card.checklist?.length > 0 ? `<div class="flex items-center gap-1"><i data-lucide="check-square" class="w-3 h-3"></i> ${card.checklist.filter(i=>i.completed).length}/${card.checklist.length}</div>` : ''}
            </div>
            
            <button class="icon-edit absolute top-1 right-1 p-1.5 bg-[#f4f5f7]/80 hover:bg-[#ebecf0] dark:bg-slate-700 dark:hover:bg-slate-600 rounded opacity-0 group-hover:opacity-100 transition z-20">
                <i data-lucide="pencil" class="w-3 h-3 text-[#42526E] dark:text-slate-300"></i>
            </button>
        `;

        div.addEventListener('click', (e) => {
            // [REPORT] Lógica de Etiquetas Expandibles
            if (e.target.closest('.card-label')) {
                e.stopPropagation();
                div.querySelectorAll('.card-label').forEach(lbl => lbl.classList.toggle('expanded')); // CSS debe manejar .expanded { width: auto; height: 16px; }
                return;
            }
            openCardModal(listId, cardId, card);
        });

        if(div.draggable) {
            div.addEventListener('dragstart', handleDragStart);
            div.addEventListener('dragend', handleDragEnd);
        }

        return div;
    }

    // ========================================
    // 5. DRAG & DROP (FÍSICA MEJORADA)
    // ========================================
    
    let draggedItem = null;

    function handleDragStart(e) {
        draggedItem = this;
        // [REPORT] Física: Rotación al levantar 
        this.style.transform = 'rotate(3deg)'; 
        this.classList.add('dragging'); 
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', JSON.stringify({
            cardId: this.dataset.cardId,
            sourceListId: this.dataset.listId
        }));
    }

    function handleDragEnd(e) {
        // [REPORT] Restaurar estado físico
        this.style.transform = 'none';
        this.classList.remove('dragging');
        draggedItem = null;
        document.querySelectorAll('.drag-over').forEach(el => el.classList.remove('drag-over'));
    }

    function setupDropZone(container, listId) {
        container.addEventListener('dragover', (e) => {
            e.preventDefault();
            // [REPORT] Feedback visual en zona de drop
            container.classList.add('drag-over');
        });

        container.addEventListener('dragleave', () => {
            container.classList.remove('drag-over');
        });

        container.addEventListener('drop', async (e) => {
            e.preventDefault();
            container.classList.remove('drag-over');
            
            try {
                const data = JSON.parse(e.dataTransfer.getData('text/plain'));
                const { cardId, sourceListId } = data;
                
                if (sourceListId === listId) return; 

                // Movimiento Optimista (UI First) - Opcional para mayor velocidad
                
                // Lógica Firestore: Copiar y Borrar
                const oldRef = doc(db, 'boards', currentBoardId, 'lists', sourceListId, 'cards', cardId);
                const snap = await getDoc(oldRef);
                const cardData = snap.data();

                await addDoc(collection(db, 'boards', currentBoardId, 'lists', listId, 'cards'), {
                    ...cardData,
                    position: Date.now() 
                });

                await deleteDoc(oldRef);

            } catch (err) {
                console.error("Error drop:", err);
            }
        });
    }

    // ========================================
    // 6. MODAL DE TARJETA (SIMPLIFICADO)
    // ========================================

    function openCardModal(listId, cardId = null, cardData = null) {
        currentCardData = { listId, cardId, data: cardData };
        
        // Reset Inputs
        document.getElementById('card-title-input').value = cardData ? cardData.title : '';
        document.getElementById('card-description-input').value = cardData ? (cardData.description || '') : '';
        document.getElementById('card-modal-title').innerHTML = cardData ? '<i data-lucide="credit-card" class="w-3 h-3"></i> Editar Tarjeta' : '<i data-lucide="plus" class="w-3 h-3"></i> Nueva Tarjeta';

        // Mostrar Modal
        cardModal.classList.remove('hidden');
        cardModal.style.display = 'flex';
        lucide.createIcons();
    }

    // GUARDAR TARJETA
    document.getElementById('save-card-btn')?.addEventListener('click', async () => {
        const title = document.getElementById('card-title-input').value.trim();
        const desc = document.getElementById('card-description-input').value.trim();
        if(!title) return;

        const newData = {
            title,
            description: desc,
            updatedAt: serverTimestamp()
        };

        if (currentCardData.cardId) {
            await updateDoc(doc(db, 'boards', currentBoardId, 'lists', currentCardData.listId, 'cards', currentCardData.cardId), newData);
        } else {
            await addDoc(collection(db, 'boards', currentBoardId, 'lists', currentCardData.listId, 'cards'), {
                ...newData,
                position: Date.now(),
                createdAt: serverTimestamp()
            });
        }
        closeModal('card-modal');
    });

    // ELIMINAR TARJETA
    document.getElementById('delete-card-btn')?.addEventListener('click', async () => {
        if(!currentCardData.cardId) return;
        if(confirm('¿Eliminar tarjeta?')) {
            await deleteDoc(doc(db, 'boards', currentBoardId, 'lists', currentCardData.listId, 'cards', currentCardData.cardId));
            closeModal('card-modal');
        }
    });

    // ========================================
    // UTILIDADES DE UI
    // ========================================

    // [FIX] Función helper para cerrar modales limpiamente
    function closeModal(modalId) {
        const modal = document.getElementById(modalId);
        if (modal) {
            modal.style.display = 'none'; // Quitar estilo inline
            modal.classList.add('hidden'); // Asegurar clase Tailwind
        }
    }

    // Listeners de cierre (Generic)
    document.querySelectorAll('[id^="cancel-"]').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const modal = e.target.closest('.fixed'); // Buscar el modal padre
            if(modal) closeModal(modal.id);
        });
    });

    // Botones específicos que fallaban
    document.getElementById('cancel-board-btn')?.addEventListener('click', () => closeModal('board-modal'));
    document.getElementById('cancel-list-btn')?.addEventListener('click', () => closeModal('list-modal'));
    document.getElementById('cancel-card-btn')?.addEventListener('click', () => closeModal('card-modal'));

    // Listeners de Apertura Globales
    document.getElementById('create-board-btn')?.addEventListener('click', () => {
        boardModal.classList.remove('hidden');
        boardModal.style.display = 'flex';
    });

    document.getElementById('add-list-btn')?.addEventListener('click', () => {
        listModal.classList.remove('hidden');
        listModal.style.display = 'flex';
    });

} // Fin initializeApp
