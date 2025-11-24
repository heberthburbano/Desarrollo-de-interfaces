import { auth, db } from './firebase-config.js';
import { 
    collection, 
    addDoc, 
    doc, 
    updateDoc, 
    deleteDoc, 
    query, 
    where, 
    onSnapshot,
    orderBy,
    arrayUnion,
    serverTimestamp,
    getDoc
} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';

// Variables globales
let currentUser = null;
let currentBoardId = null;
let currentCardData = null;
let unsubscribeBoards = null;
let unsubscribeLists = null;
let unsubscribeCards = {};

// Elementos del DOM
const boardsContainer = document.getElementById('boards-container');
const boardView = document.getElementById('board-view');
const boardTitle = document.getElementById('board-title');
const listsContainer = document.getElementById('lists-container');

// Modals
const boardModal = document.getElementById('board-modal');
const listModal = document.getElementById('list-modal');
const cardModal = document.getElementById('card-modal');

// Event listeners principales
document.getElementById('create-board-btn').addEventListener('click', () => {
    boardModal.style.display = 'flex';
    document.getElementById('board-name-input').value = '';
});

document.getElementById('cancel-board-btn').addEventListener('click', () => {
    boardModal.style.display = 'none';
});

document.getElementById('save-board-btn').addEventListener('click', createBoard);

document.getElementById('add-list-btn').addEventListener('click', () => {
    listModal.style.display = 'flex';
    document.getElementById('list-name-input').value = '';
});

document.getElementById('cancel-list-btn').addEventListener('click', () => {
    listModal.style.display = 'none';
});

document.getElementById('save-list-btn').addEventListener('click', createList);

document.getElementById('back-to-boards-btn').addEventListener('click', () => {
    boardView.style.display = 'none';
    document.querySelector('.boards-section').style.display = 'block';
    currentBoardId = null;
    
    // Limpiar listeners de listas
    if (unsubscribeLists) unsubscribeLists();
    Object.values(unsubscribeCards).forEach(unsub => unsub());
    unsubscribeCards = {};
});

document.getElementById('cancel-card-btn').addEventListener('click', () => {
    cardModal.style.display = 'none';
    currentCardData = null;
});

document.getElementById('save-card-btn').addEventListener('click', saveCard);
document.getElementById('delete-card-btn').addEventListener('click', deleteCard);
document.getElementById('add-comment-btn').addEventListener('click', addComment);

// Escuchar cuando el usuario se autentica
window.addEventListener('user-authenticated', (e) => {
    currentUser = e.detail.user;
    loadBoards();
});

// Función para crear un tablero
async function createBoard() {
    const name = document.getElementById('board-name-input').value.trim();
    
    if (!name) {
        alert('Por favor ingresa un nombre para el tablero');
        return;
    }

    try {
        await addDoc(collection(db, 'boards'), {
            name: name,
            members: [currentUser.uid],
            createdBy: currentUser.uid,
            createdAt: serverTimestamp()
        });
        
        boardModal.style.display = 'none';
    } catch (error) {
        console.error('Error al crear tablero:', error);
        alert('Error al crear el tablero');
    }
}

// Función para cargar tableros en tiempo real
function loadBoards() {
    if (unsubscribeBoards) unsubscribeBoards();

    const q = query(
        collection(db, 'boards'),
        where('members', 'array-contains', currentUser.uid)
    );

    unsubscribeBoards = onSnapshot(q, (snapshot) => {
        boardsContainer.innerHTML = '';
        
        snapshot.forEach((doc) => {
            const board = doc.data();
            const boardCard = createBoardCard(doc.id, board);
            boardsContainer.appendChild(boardCard);
        });
    });
}

// Crear card de tablero
function createBoardCard(id, board) {
    const card = document.createElement('div');
    card.className = 'board-card';
    card.innerHTML = `
        <h3>${board.name}</h3>
        <p>Creado: ${board.createdAt ? new Date(board.createdAt.toDate()).toLocaleDateString() : 'Hoy'}</p>
    `;
    
    card.addEventListener('click', () => openBoard(id, board.name));
    
    return card;
}

// Abrir un tablero
function openBoard(boardId, boardName) {
    currentBoardId = boardId;
    boardTitle.textContent = boardName;
    document.querySelector('.boards-section').style.display = 'none';
    boardView.style.display = 'block';
    
    loadLists(boardId);
}

// Crear una lista
async function createList() {
    const name = document.getElementById('list-name-input').value.trim();
    
    if (!name) {
        alert('Por favor ingresa un nombre para la lista');
        return;
    }

    try {
        await addDoc(collection(db, 'boards', currentBoardId, 'lists'), {
            name: name,
            position: Date.now(),
            createdAt: serverTimestamp()
        });
        
        listModal.style.display = 'none';
    } catch (error) {
        console.error('Error al crear lista:', error);
        alert('Error al crear la lista');
    }
}

// Cargar listas en tiempo real
function loadLists(boardId) {
    if (unsubscribeLists) unsubscribeLists();
    
    const q = query(
        collection(db, 'boards', boardId, 'lists'),
        orderBy('position')
    );

    unsubscribeLists = onSnapshot(q, (snapshot) => {
        listsContainer.innerHTML = '';
        
        snapshot.forEach((doc) => {
            const list = doc.data();
            const listElement = createListElement(doc.id, list);
            listsContainer.appendChild(listElement);
            
            // Cargar tarjetas de esta lista
            loadCards(boardId, doc.id, listElement.querySelector('.cards-container'));
        });
    });
}

// Crear elemento de lista
function createListElement(listId, list) {
    const listDiv = document.createElement('div');
    listDiv.className = 'list';
    listDiv.dataset.listId = listId;
    listDiv.innerHTML = `
        <div class="list-header">
            <h3>${list.name}</h3>
            <button class="add-card-btn" data-list-id="${listId}">+ Tarjeta</button>
        </div>
        <div class="cards-container" data-list-id="${listId}"></div>
    `;
    
    // Event listener para añadir tarjeta
    listDiv.querySelector('.add-card-btn').addEventListener('click', () => {
        openCardModal(listId);
    });
    
    // Hacer la zona de tarjetas un drop zone
    const cardsContainer = listDiv.querySelector('.cards-container');
    setupDropZone(cardsContainer, listId);
    
    return listDiv;
}

// Cargar tarjetas en tiempo real
function loadCards(boardId, listId, container) {
    // Limpiar listener anterior si existe
    if (unsubscribeCards[listId]) {
        unsubscribeCards[listId]();
    }
    
    const q = query(
        collection(db, 'boards', boardId, 'lists', listId, 'cards'),
        orderBy('position')
    );

    unsubscribeCards[listId] = onSnapshot(q, (snapshot) => {
        container.innerHTML = '';
        
        snapshot.forEach((doc) => {
            const card = doc.data();
            const cardElement = createCardElement(doc.id, listId, card);
            container.appendChild(cardElement);
        });
    });
}

// Crear elemento de tarjeta con drag and drop
function createCardElement(cardId, listId, card) {
    const cardDiv = document.createElement('div');
    cardDiv.className = 'card';
    cardDiv.draggable = true;
    cardDiv.dataset.cardId = cardId;
    cardDiv.dataset.listId = listId;
    
    cardDiv.innerHTML = `
        <h4>${card.title}</h4>
        ${card.description ? `<p>${card.description}</p>` : ''}
        ${card.assignedTo ? `<span class="assigned">👤 ${card.assignedTo}</span>` : ''}
    `;
    
    // Event listener para abrir modal de edición
    cardDiv.addEventListener('click', () => {
        openCardModal(listId, cardId, card);
    });
    
    // Drag and drop events
    cardDiv.addEventListener('dragstart', handleDragStart);
    cardDiv.addEventListener('dragend', handleDragEnd);
    
    return cardDiv;
}

// Configurar zona de drop
function setupDropZone(container, listId) {
    container.addEventListener('dragover', handleDragOver);
    container.addEventListener('drop', (e) => handleDrop(e, listId));
    container.addEventListener('dragenter', handleDragEnter);
    container.addEventListener('dragleave', handleDragLeave);
}

// Handlers de drag and drop
let draggedCard = null;

function handleDragStart(e) {
    draggedCard = e.target;
    e.target.style.opacity = '0.5';
    e.dataTransfer.effectAllowed = 'move';
}

function handleDragEnd(e) {
    e.target.style.opacity = '1';
}

function handleDragOver(e) {
    if (e.preventDefault) {
        e.preventDefault();
    }
    e.dataTransfer.dropEffect = 'move';
    return false;
}

function handleDragEnter(e) {
    if (e.target.classList.contains('cards-container')) {
        e.target.classList.add('drag-over');
    }
}

function handleDragLeave(e) {
    if (e.target.classList.contains('cards-container')) {
        e.target.classList.remove('drag-over');
    }
}

async function handleDrop(e, newListId) {
    if (e.stopPropagation) {
        e.stopPropagation();
    }
    
    e.target.classList.remove('drag-over');
    
    if (!draggedCard) return;
    
    const cardId = draggedCard.dataset.cardId;
    const oldListId = draggedCard.dataset.listId;
    
    if (oldListId === newListId) return;
    
    try {
        // Obtener datos de la tarjeta
        const oldCardRef = doc(db, 'boards', currentBoardId, 'lists', oldListId, 'cards', cardId);
        const cardSnap = await getDoc(oldCardRef);
        const cardData = cardSnap.data();
        
        // Crear tarjeta en la nueva lista
        await addDoc(collection(db, 'boards', currentBoardId, 'lists', newListId, 'cards'), {
            ...cardData,
            position: Date.now()
        });
        
        // Eliminar tarjeta de la lista anterior
        await deleteDoc(oldCardRef);
        
    } catch (error) {
        console.error('Error al mover tarjeta:', error);
        alert('Error al mover la tarjeta');
    }
    
    draggedCard = null;
}

// Abrir modal de tarjeta
function openCardModal(listId, cardId = null, cardData = null) {
    currentCardData = { listId, cardId, data: cardData };
    
    const modalTitle = document.getElementById('card-modal-title');
    const titleInput = document.getElementById('card-title-input');
    const descInput = document.getElementById('card-description-input');
    const assignedInput = document.getElementById('card-assigned-input');
    const deleteBtn = document.getElementById('delete-card-btn');
    const commentsSection = document.getElementById('card-comments-section');
    
    if (cardId && cardData) {
        // Modo edición
        modalTitle.textContent = 'Editar Tarjeta';
        titleInput.value = cardData.title || '';
        descInput.value = cardData.description || '';
        assignedInput.value = cardData.assignedTo || '';
        deleteBtn.style.display = 'block';
        commentsSection.style.display = 'block';
        loadComments(listId, cardId);
    } else {
        // Modo creación
        modalTitle.textContent = 'Nueva Tarjeta';
        titleInput.value = '';
        descInput.value = '';
        assignedInput.value = '';
        deleteBtn.style.display = 'none';
        commentsSection.style.display = 'none';
    }
    
    cardModal.style.display = 'flex';
}

// Guardar tarjeta
async function saveCard() {
    const title = document.getElementById('card-title-input').value.trim();
    const description = document.getElementById('card-description-input').value.trim();
    const assignedTo = document.getElementById('card-assigned-input').value.trim();
    
    if (!title) {
        alert('Por favor ingresa un título para la tarjeta');
        return;
    }

    const cardData = {
        title,
        description,
        assignedTo,
        updatedAt: serverTimestamp()
    };

    try {
        if (currentCardData.cardId) {
            // Actualizar tarjeta existente
            const cardRef = doc(db, 'boards', currentBoardId, 'lists', currentCardData.listId, 'cards', currentCardData.cardId);
            await updateDoc(cardRef, cardData);
        } else {
            // Crear nueva tarjeta
            await addDoc(collection(db, 'boards', currentBoardId, 'lists', currentCardData.listId, 'cards'), {
                ...cardData,
                position: Date.now(),
                createdAt: serverTimestamp(),
                createdBy: currentUser.uid
            });
        }
        
        cardModal.style.display = 'none';
        currentCardData = null;
    } catch (error) {
        console.error('Error al guardar tarjeta:', error);
        alert('Error al guardar la tarjeta');
    }
}

// Eliminar tarjeta
async function deleteCard() {
    if (!confirm('¿Estás seguro de que deseas eliminar esta tarjeta?')) {
        return;
    }

    try {
        const cardRef = doc(db, 'boards', currentBoardId, 'lists', currentCardData.listId, 'cards', currentCardData.cardId);
        await deleteDoc(cardRef);
        
        cardModal.style.display = 'none';
        currentCardData = null;
    } catch (error) {
        console.error('Error al eliminar tarjeta:', error);
        alert('Error al eliminar la tarjeta');
    }
}

// Cargar comentarios
function loadComments(listId, cardId) {
    const commentsList = document.getElementById('comments-list');
    
    const q = query(
        collection(db, 'boards', currentBoardId, 'lists', listId, 'cards', cardId, 'comments'),
        orderBy('createdAt')
    );

    onSnapshot(q, (snapshot) => {
        commentsList.innerHTML = '';
        
        snapshot.forEach((doc) => {
            const comment = doc.data();
            const commentDiv = document.createElement('div');
            commentDiv.className = 'comment';
            commentDiv.innerHTML = `
                <strong>${comment.userName}</strong>
                <p>${comment.text}</p>
                <small>${comment.createdAt ? new Date(comment.createdAt.toDate()).toLocaleString() : 'Ahora'}</small>
            `;
            commentsList.appendChild(commentDiv);
        });
    });
}

// Añadir comentario
async function addComment() {
    const commentText = document.getElementById('comment-input').value.trim();
    
    if (!commentText) {
        alert('Por favor escribe un comentario');
        return;
    }

    try {
        await addDoc(collection(db, 'boards', currentBoardId, 'lists', currentCardData.listId, 'cards', currentCardData.cardId, 'comments'), {
            text: commentText,
            userName: currentUser.displayName || currentUser.email,
            userId: currentUser.uid,
            createdAt: serverTimestamp()
        });
        
        document.getElementById('comment-input').value = '';
    } catch (error) {
        console.error('Error al añadir comentario:', error);
        alert('Error al añadir el comentario');
    }
}
