import { auth, db } from './firebase-config.js';
import { 
    collection, addDoc, doc, updateDoc, deleteDoc, query, where, onSnapshot, 
    orderBy, arrayUnion, arrayRemove, serverTimestamp, getDoc, getDocs, deleteField
} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';

// INICIALIZACIÓN
document.addEventListener('DOMContentLoaded', initializeApp);

function initializeApp() {
    console.log('🚀 Inicializando lógica de Trello Clone...');

    // ========================================
    // ESTADO GLOBAL
    // ========================================
    let currentUser = null;
    let currentBoardId = null;
    let currentBoardData = null;
    let currentUserRole = null;
    
    // Variables para Edición de Tarjeta
    let currentCardData = null; // { listId, cardId, data }
    let currentCardLabels = [];
    let currentChecklist = [];
    
    // Suscripciones (para cancelar al salir)
    let unsubscribeBoards = null;
    let unsubscribeLists = null;
    let unsubscribeCards = {}; // Objeto para guardar unsubs por lista
    let unsubscribeActivity = null;

    // Elementos DOM Principales
    const boardsContainer = document.getElementById('boards-container');
    const boardView = document.getElementById('board-view');
    const listsContainer = document.getElementById('lists-container'); // Ojo: este es el div con clase .board-canvas

    // ========================================
    // PERMISOS Y ROLES
    // ========================================
    const PERMISSIONS = {
        owner: { editBoard: true, createList: true, editCard: true, deleteCard: true },
        editor: { editBoard: false, createList: true, editCard: true, deleteCard: true },
        viewer: { editBoard: false, createList: false, editCard: false, deleteCard: false }
    };

    function hasPermission(action) {
        if (!currentUserRole) return false;
        return PERMISSIONS[currentUserRole]?.[action] || false;
    }

    // ========================================
    // AUTENTICACIÓN (Escuchar evento de auth.js)
    // ========================================
    window.addEventListener('user-authenticated', (e) => {
        currentUser = e.detail.user;
        console.log('👤 Usuario detectado en app.js:', currentUser.email);
        
        // Cargar avatar
        const avatar = document.getElementById('user-avatar');
        if(avatar) avatar.textContent = (currentUser.displayName || currentUser.email).charAt(0).toUpperCase();
        const nameDisplay = document.getElementById('user-name');
        if(nameDisplay) nameDisplay.textContent = currentUser.displayName || currentUser.email;

        loadBoards();
    });

    // ========================================
    // 1. GESTIÓN DE TABLEROS
    // ========================================

    function loadBoards() {
        if (unsubscribeBoards) unsubscribeBoards();

        // Consulta: Tableros donde soy miembro (por email)
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
        });
    }

    function createBoardCard(id, board) {
        const div = document.createElement('div');
        // Estilo de tarjeta de tablero
        div.className = 'bg-white dark:bg-slate-800 p-4 rounded shadow hover:shadow-lg transition cursor-pointer h-32 flex flex-col justify-between border-l-4 border-trello-blue relative group';
        
        div.innerHTML = `
            <h3 class="font-bold text-slate-800 dark:text-white truncate">${board.title}</h3>
            <div class="flex justify-between items-end">
                <span class="text-xs text-slate-500">${Object.keys(board.members || {}).length} miembros</span>
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
        
        // Renderizar iconos lucide insertados
        if(window.lucide) lucide.createIcons({ root: div });
        
        return div;
    }

    // CREAR TABLERO
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
            document.getElementById('board-modal').style.display = 'none'; // Ocultar modal manual si Tailwind hidden falla
            document.getElementById('board-modal').classList.add('hidden');
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
        
        // Determinar rol
        const memberData = boardData.members?.[currentUser.uid];
        currentUserRole = memberData ? memberData.role : 'viewer';

        // Actualizar UI Header
        document.getElementById('board-title').textContent = boardData.title;
        const roleBadge = document.getElementById('user-role-badge');
        roleBadge.textContent = currentUserRole === 'owner' ? 'Propietario' : (currentUserRole === 'editor' ? 'Editor' : 'Observador');
        roleBadge.classList.remove('hidden');

        // Cambiar Vistas
        document.querySelector('.boards-section').style.display = 'none'; // Ocultar home
        boardView.classList.remove('hidden');
        boardView.style.display = 'flex'; // Forzar flex para layout vertical

        // Cargar Listas
        loadLists(boardId);
        
        // Cargar Actividad (Opcional)
        // loadActivity(boardId);
    }

    // Botón Volver
    document.getElementById('back-to-boards-btn')?.addEventListener('click', () => {
        boardView.style.display = 'none';
        boardView.classList.add('hidden');
        document.querySelector('.boards-section').style.display = 'block';
        
        // Limpiar suscripciones
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
            // Limpiar contenedor pero MANTENER el botón de "Añadir lista" al final
            // Estrategia: Borrar todo lo que sea clase .list-wrapper que no sea el botón
            const existingLists = Array.from(listsContainer.querySelectorAll('.list-wrapper:not(:last-child)'));
            existingLists.forEach(el => el.remove());

            const addListBtnWrapper = listsContainer.lastElementChild; // El botón placeholder

            snapshot.forEach((docSnap) => {
                const listEl = createListElement(docSnap.id, docSnap.data());
                listsContainer.insertBefore(listEl, addListBtnWrapper);
                
                // Cargar tarjetas de esta lista
                loadCards(boardId, docSnap.id, listEl.querySelector('.cards-container'));
            });
            
            if(window.lucide) lucide.createIcons();
        });
    }

    function createListElement(listId, listData) {
        // IMPORTANTE: Wrapper para el ancho de 272px definido en CSS
        const wrapper = document.createElement('div');
        wrapper.className = 'list-wrapper';

        const listDiv = document.createElement('div');
        listDiv.className = 'list'; // Clase CSS con estilos de fondo y borde
        listDiv.dataset.listId = listId;

        const canEdit = hasPermission('createList'); // Simplificado

        listDiv.innerHTML = `
            <div class="list-header">
                <h3 class="truncate">${listData.name}</h3>
                ${canEdit ? `<button class="delete-list text-slate-400 hover:text-red-600"><i data-lucide="more-horizontal" class="w-4 h-4"></i></button>` : ''}
            </div>
            
            <div class="cards-container custom-scrollbar" data-list-id="${listId}">
                </div>

            ${hasPermission('createCard') ? `
                <button class="add-card-trigger w-full text-left p-2 text-slate-600 hover:bg-slate-200/50 rounded flex items-center gap-2 text-sm m-1">
                    <i data-lucide="plus" class="w-4 h-4"></i> Añadir tarjeta
                </button>
            ` : ''}
        `;

        // Evento borrar lista (simulado con el botón more-horizontal por ahora)
        const deleteBtn = listDiv.querySelector('.delete-list');
        if(deleteBtn) {
            deleteBtn.addEventListener('click', async () => {
                if(confirm('¿Borrar lista?')) {
                    await deleteDoc(doc(db, 'boards', currentBoardId, 'lists', listId));
                }
            });
        }

        // Evento Añadir Tarjeta
        const addCardBtn = listDiv.querySelector('.add-card-trigger');
        if(addCardBtn) {
            addCardBtn.addEventListener('click', () => {
                openCardModal(listId); // Abrir modal modo creación
            });
        }

        // Configurar Dropzone para tarjetas
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

        document.getElementById('list-modal').classList.add('hidden');
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
        div.className = 'list-card group'; // Clase CSS definida en style.css
        div.draggable = hasPermission('editCard');
        div.dataset.cardId = cardId;
        div.dataset.listId = listId;

        // Cover check
        let coverHtml = '';
        if(card.cover?.color) {
            coverHtml = `<div class="card-cover ${card.cover.color}"></div>`;
        }

        // Labels check
        let labelsHtml = '';
        if(card.labels && card.labels.length > 0) {
            labelsHtml = `<div class="flex flex-wrap mb-1">${card.labels.map(l => `<span class="card-label ${l.color}"></span>`).join('')}</div>`;
        }

        div.innerHTML = `
            ${coverHtml}
            ${labelsHtml}
            <span class="block text-sm text-slate-700 dark:text-slate-200 mb-1">${card.title}</span>
            <div class="flex items-center gap-2 text-xs text-slate-400">
                ${card.description ? `<i data-lucide="align-left" class="w-3 h-3"></i>` : ''}
                ${card.checklist?.length > 0 ? `<div class="flex items-center gap-1"><i data-lucide="check-square" class="w-3 h-3"></i> ${card.checklist.filter(i=>i.completed).length}/${card.checklist.length}</div>` : ''}
            </div>
            <button class="icon-edit absolute top-1 right-1 p-1 bg-slate-100 hover:bg-slate-200 rounded opacity-0 group-hover:opacity-100 transition"><i data-lucide="pencil" class="w-3 h-3 text-slate-600"></i></button>
        `;

        // Click para abrir modal
        div.addEventListener('click', (e) => {
            // Evitar abrir si click en boton editar rapido (futuro feature)
            openCardModal(listId, cardId, card);
        });

        // Drag events
        if(div.draggable) {
            div.addEventListener('dragstart', handleDragStart);
            div.addEventListener('dragend', handleDragEnd);
        }

        return div;
    }

    // ========================================
    // 5. DRAG & DROP LOGIC
    // ========================================
    
    let draggedItem = null;

    function handleDragStart(e) {
        draggedItem = this;
        this.classList.add('dragging');
        e.dataTransfer.effectAllowed = 'move';
        // Datos para transferir
        e.dataTransfer.setData('text/plain', JSON.stringify({
            cardId: this.dataset.cardId,
            sourceListId: this.dataset.listId
        }));
    }

    function handleDragEnd(e) {
        this.classList.remove('dragging');
        draggedItem = null;
        document.querySelectorAll('.drag-over').forEach(el => el.classList.remove('drag-over'));
    }

    function setupDropZone(container, listId) {
        container.addEventListener('dragover', (e) => {
            e.preventDefault();
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
                
                if (sourceListId === listId) return; // Mismo lugar (por ahora no reordenamos en misma lista)

                // MOVER: Copiar a nueva lista y borrar de vieja (Firestore way)
                // 1. Obtener data
                const oldRef = doc(db, 'boards', currentBoardId, 'lists', sourceListId, 'cards', cardId);
                const snap = await getDoc(oldRef);
                const cardData = snap.data();

                // 2. Crear en nueva
                await addDoc(collection(db, 'boards', currentBoardId, 'lists', listId, 'cards'), {
                    ...cardData,
                    position: Date.now() // Al final
                });

                // 3. Borrar vieja
                await deleteDoc(oldRef);

            } catch (err) {
                console.error("Error drop:", err);
            }
        });
    }

    // ========================================
    // 6. MODAL DE TARJETA (DETALLES)
    // ========================================

    function openCardModal(listId, cardId = null, cardData = null) {
        currentCardData = { listId, cardId, data: cardData };
        const modal = document.getElementById('card-modal');
        
        // Reset Inputs
        document.getElementById('card-title-input').value = cardData ? cardData.title : '';
        document.getElementById('card-description-input').value = cardData ? (cardData.description || '') : '';
        document.getElementById('card-modal-title').textContent = cardData ? 'Editar Tarjeta' : 'Nueva Tarjeta';

        // Checklist Logic (Simplificada para demo)
        currentChecklist = cardData ? (cardData.checklist || []) : [];
        renderChecklist();

        // Etiquetas (Simplificado)
        currentCardLabels = cardData ? (cardData.labels || []) : [];
        renderLabels();

        modal.classList.remove('hidden');
        modal.style.display = 'flex';
    }

    // GUARDAR TARJETA
    document.getElementById('save-card-btn')?.addEventListener('click', async () => {
        const title = document.getElementById('card-title-input').value.trim();
        const desc = document.getElementById('card-description-input').value.trim();
        if(!title) return;

        const newData = {
            title,
            description: desc,
            checklist: currentChecklist,
            labels: currentCardLabels,
            // Mantener cover si existía
            cover: currentCardData.data?.cover || { color: null }
        };

        if (currentCardData.cardId) {
            // EDITAR
            await updateDoc(doc(db, 'boards', currentBoardId, 'lists', currentCardData.listId, 'cards', currentCardData.cardId), newData);
        } else {
            // CREAR
            await addDoc(collection(db, 'boards', currentBoardId, 'lists', currentCardData.listId, 'cards'), {
                ...newData,
                position: Date.now(),
                createdAt: serverTimestamp()
            });
        }

        document.getElementById('card-modal').classList.add('hidden');
    });

    // ELIMINAR TARJETA
    document.getElementById('delete-card-btn')?.addEventListener('click', async () => {
        if(!currentCardData.cardId) return;
        if(confirm('¿Eliminar tarjeta?')) {
            await deleteDoc(doc(db, 'boards', currentBoardId, 'lists', currentCardData.listId, 'cards', currentCardData.cardId));
            document.getElementById('card-modal').classList.add('hidden');
        }
    });

    // CERRAR MODAL
    document.getElementById('cancel-card-btn')?.addEventListener('click', () => {
        document.getElementById('card-modal').classList.add('hidden');
    });

    // --- FUNCIONES AUXILIARES MODAL (CHECKLIST/LABELS) ---
    
    function renderChecklist() {
        const container = document.getElementById('checklist-items');
        container.innerHTML = '';
        currentChecklist.forEach((item, index) => {
            const div = document.createElement('div');
            div.className = 'flex items-center gap-2';
            div.innerHTML = `
                <input type="checkbox" ${item.completed ? 'checked' : ''} class="w-4 h-4">
                <span class="${item.completed ? 'line-through text-slate-400' : ''}">${item.text}</span>
            `;
            // Listener simple para toggle
            div.querySelector('input').addEventListener('change', (e) => {
                item.completed = e.target.checked;
                renderChecklist();
            });
            container.appendChild(div);
        });
        
        // Actualizar barra progreso
        const completed = currentChecklist.filter(i => i.completed).length;
        const total = currentChecklist.length;
        const progress = document.getElementById('checklist-progress');
        if(progress) progress.textContent = total > 0 ? `${Math.round((completed/total)*100)}%` : '';
    }

    document.getElementById('add-checklist-item-btn')?.addEventListener('click', () => {
        const input = document.getElementById('new-checklist-item-input');
        if(input.value.trim()) {
            currentChecklist.push({ text: input.value, completed: false });
            input.value = '';
            renderChecklist();
        }
    });

    function renderLabels() {
        const container = document.getElementById('card-labels-display');
        container.innerHTML = '';
        if(currentCardLabels.length > 0) container.classList.remove('hidden');
        currentCardLabels.forEach(l => {
            const span = document.createElement('span');
            span.className = `px-2 py-1 rounded text-xs font-bold ${l.color}`;
            span.textContent = l.name;
            container.appendChild(span);
        });
    }

    // EVENT LISTENERS MODALES GLOBALES
    document.getElementById('create-board-btn')?.addEventListener('click', () => {
        document.getElementById('board-modal').classList.remove('hidden');
        document.getElementById('board-modal').style.display = 'flex';
    });
    
    document.getElementById('cancel-board-btn')?.addEventListener('click', () => {
        document.getElementById('board-modal').classList.add('hidden');
    });

    document.getElementById('add-list-btn')?.addEventListener('click', () => {
        document.getElementById('list-modal').classList.remove('hidden');
        document.getElementById('list-modal').style.display = 'flex';
    });

    document.getElementById('cancel-list-btn')?.addEventListener('click', () => {
        document.getElementById('list-modal').classList.add('hidden');
    });

} // Fin initializeApp