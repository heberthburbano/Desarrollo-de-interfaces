import { auth, db } from './firebase-config.js';
import { 
    collection, addDoc, doc, updateDoc, deleteDoc, query, where, onSnapshot, 
    orderBy, arrayUnion, arrayRemove, serverTimestamp, getDoc, getDocs, setDoc, deleteField
} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';

// ESPERAR A QUE EL DOM ESTÉ LISTO
document.addEventListener('DOMContentLoaded', initializeApp);

function initializeApp() {
    console.log('🚀 Inicializando aplicación...');

    // ========================================
    // VARIABLES GLOBALES
    // ========================================
    let currentUser = null;
    let currentBoardId = null;
    let currentBoardData = null;
    let currentUserRole = null;
    let currentCardData = null;
    let currentCardCover = { color: null, emoji: null };
    let unsubscribeBoards = null;
    let unsubscribeLists = null;
    let unsubscribeCards = {};
    let unsubscribeNotifications = null;
    let unsubscribeActivity = null;
    let allCardsCache = [];

    // ========================================
    // MATRIZ DE PERMISOS
    // ========================================
    const PERMISSIONS = {
        owner: {
            viewBoard: true, editBoard: true, deleteBoard: true,
            inviteMembers: true, removeMembers: true, changeRoles: true,
            createList: true, editList: true, deleteList: true,
            createCard: true, editCard: true, deleteCard: true, addComment: true
        },
        editor: {
            viewBoard: true, editBoard: false, deleteBoard: false,
            inviteMembers: false, removeMembers: false, changeRoles: false,
            createList: true, editList: true, deleteList: false,
            createCard: true, editCard: true, deleteCard: true, addComment: true
        },
        viewer: {
            viewBoard: true, editBoard: false, deleteBoard: false,
            inviteMembers: false, removeMembers: false, changeRoles: false,
            createList: false, editList: false, deleteList: false,
            createCard: false, editCard: false, deleteCard: false, addComment: true
        }
    };

    // ========================================
    // ELEMENTOS DEL DOM
    // ========================================
    const boardsContainer = document.getElementById('boards-container');
    const boardView = document.getElementById('board-view');
    const boardTitle = document.getElementById('board-title');
    const listsContainer = document.getElementById('lists-container');
    const userRoleBadge = document.getElementById('user-role-badge');
    const boardModal = document.getElementById('board-modal');
    const listModal = document.getElementById('list-modal');
    const cardModal = document.getElementById('card-modal');
    const inviteModal = document.getElementById('invite-modal');
    const membersPanel = document.getElementById('members-panel');
    const activityPanel = document.getElementById('activity-panel');
    const membersList = document.getElementById('members-list');
    const activityList = document.getElementById('activity-list');
    const notificationsBtn = document.getElementById('notifications-btn');
    const notificationsBadge = document.getElementById('notifications-badge');
    const notificationsDropdown = document.getElementById('notifications-dropdown');
    const notificationsList = document.getElementById('notifications-list');
    const globalSearch = document.getElementById('global-search');
    const searchResults = document.getElementById('search-results');
    const searchResultsList = document.getElementById('search-results-list');
    const shortcutsModal = document.getElementById('shortcuts-modal');
    const cardCoverModal = document.getElementById('card-cover-modal');

    console.log('✅ Elementos cargados:', { boardModal: !!boardModal, listModal: !!listModal });

    // ========================================
    // MODO OSCURO
    // ========================================
    function initDarkMode() {
        const darkModeToggle = document.getElementById('dark-mode-toggle');
        const savedTheme = localStorage.getItem('theme') || 'light';
        
        if (savedTheme === 'dark') {
            document.documentElement.classList.add('dark');
        }
        
        darkModeToggle?.addEventListener('click', () => {
            document.documentElement.classList.toggle('dark');
            const isDark = document.documentElement.classList.contains('dark');
            localStorage.setItem('theme', isDark ? 'dark' : 'light');
            lucide.createIcons();
        });
    }

    initDarkMode();

    // ========================================
    // ATAJOS DE TECLADO
    // ========================================
    function initKeyboardShortcuts() {
        document.addEventListener('keydown', (e) => {
            // Ignorar si estamos escribiendo en un input
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
                // Permitir Esc para cerrar modales incluso en inputs
                if (e.key === 'Escape') {
                    closeAllModals();
                }
                return;
            }

            // Shortcuts
            switch(e.key) {
                case '/':
                    e.preventDefault();
                    globalSearch?.focus();
                    break;
                case '?':
                    e.preventDefault();
                    shortcutsModal.style.display = 'flex';
                    shortcutsModal.classList.remove('hidden');
                    lucide.createIcons();
                    break;
                case 'Escape':
                    closeAllModals();
                    break;
                case 'b':
                case 'B':
                    if (document.querySelector('.boards-section').style.display !== 'none') {
                        document.getElementById('create-board-btn')?.click();
                    }
                    break;
                case 'l':
                case 'L':
                    if (currentBoardId && hasPermission('createList')) {
                        document.getElementById('add-list-btn')?.click();
                    }
                    break;
                case 'n':
                case 'N':
                    if (currentBoardId && hasPermission('createCard')) {
                        const firstList = document.querySelector('.list');
                        if (firstList) {
                            firstList.querySelector('.add-card-btn')?.click();
                        }
                    }
                    break;
            }
        });

        // Cerrar modal de atajos
        document.getElementById('close-shortcuts')?.addEventListener('click', () => {
            shortcutsModal.style.display = 'none';
            shortcutsModal.classList.add('hidden');
        });

        // Abrir modal de atajos
        document.getElementById('shortcuts-btn')?.addEventListener('click', () => {
            shortcutsModal.style.display = 'flex';
            shortcutsModal.classList.remove('hidden');
            lucide.createIcons();
        });
    }

    initKeyboardShortcuts();

    function closeAllModals() {
        boardModal.style.display = 'none';
        listModal.style.display = 'none';
        cardModal.style.display = 'none';
        inviteModal.style.display = 'none';
        shortcutsModal.style.display = 'none';
        cardCoverModal.style.display = 'none';
        boardModal.classList.add('hidden');
        listModal.classList.add('hidden');
        cardModal.classList.add('hidden');
        inviteModal.classList.add('hidden');
        shortcutsModal.classList.add('hidden');
        cardCoverModal.classList.add('hidden');
        searchResults.classList.add('hidden');
    }

    // ========================================
    // BÚSQUEDA GLOBAL AVANZADA
    // ========================================
    let allBoardsCache = [];
    let allListsCache = [];
    let currentSearchFilter = 'all';
    let selectedResultIndex = -1;
    let filteredResults = [];

    function initGlobalSearch() {
        let searchTimeout;

        globalSearch?.addEventListener('input', (e) => {
            clearTimeout(searchTimeout);
            const searchTerm = e.target.value.trim().toLowerCase();

            if (searchTerm.length < 2) {
                searchResults.classList.add('hidden');
                selectedResultIndex = -1;
                return;
            }

            // Búsqueda en tiempo real (sin delay)
            performAdvancedSearch(searchTerm);
        });

        // Navegación con teclado
        globalSearch?.addEventListener('keydown', (e) => {
            if (!searchResults.classList.contains('hidden')) {
                handleSearchKeyNavigation(e);
            }
        });

        // Filtros
        document.querySelectorAll('.search-filter').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.search-filter').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                currentSearchFilter = btn.dataset.filter;
                
                const searchTerm = globalSearch.value.trim().toLowerCase();
                if (searchTerm.length >= 2) {
                    performAdvancedSearch(searchTerm);
                }
            });
        });

        document.getElementById('close-search')?.addEventListener('click', () => {
            searchResults.classList.add('hidden');
            globalSearch.value = '';
            selectedResultIndex = -1;
            currentSearchFilter = 'all';
            document.querySelectorAll('.search-filter').forEach(b => b.classList.remove('active'));
            document.querySelector('.search-filter[data-filter="all"]')?.classList.add('active');
        });

        // Cargar todos los datos para búsqueda global
        loadAllDataForSearch();
    }

    initGlobalSearch();

    function loadAllDataForSearch() {
        // Cargar todos los tableros del usuario
        if (!currentUser) return;

        const boardsQuery = query(
            collection(db, 'boards'),
            where('memberEmails', 'array-contains', currentUser.email)
        );

        onSnapshot(boardsQuery, async (snapshot) => {
            allBoardsCache = [];
            allListsCache = [];

            for (const boardDoc of snapshot.docs) {
                const boardData = boardDoc.data();
                allBoardsCache.push({
                    id: boardDoc.id,
                    type: 'board',
                    title: boardData.title,
                    ...boardData
                });

                // Cargar listas de cada tablero
                const listsQuery = query(collection(db, 'boards', boardDoc.id, 'lists'));
                const listsSnapshot = await getDocs(listsQuery);
                
                for (const listDoc of listsSnapshot.docs) {
                    const listData = listDoc.data();
                    allListsCache.push({
                        id: listDoc.id,
                        type: 'list',
                        boardId: boardDoc.id,
                        boardTitle: boardData.title,
                        name: listData.name,
                        ...listData
                    });

                    // Cargar tarjetas de cada lista
                    const cardsQuery = query(collection(db, 'boards', boardDoc.id, 'lists', listDoc.id, 'cards'));
                    const cardsSnapshot = await getDocs(cardsQuery);
                    
                    cardsSnapshot.forEach(cardDoc => {
                        const cardData = cardDoc.data();
                        const cardIndex = allCardsCache.findIndex(c => c.cardId === cardDoc.id);
                        const cardForSearch = {
                            ...cardData,
                            cardId: cardDoc.id,
                            type: 'card',
                            listId: listDoc.id,
                            listName: listData.name,
                            boardId: boardDoc.id,
                            boardTitle: boardData.title
                        };
                        
                        if (cardIndex >= 0) {
                            allCardsCache[cardIndex] = cardForSearch;
                        } else {
                            allCardsCache.push(cardForSearch);
                        }
                    });
                }
            }
        });
    }

    function performAdvancedSearch(searchTerm) {
        let results = [];

        // Buscar en tableros
        if (currentSearchFilter === 'all' || currentSearchFilter === 'boards') {
            const boardResults = allBoardsCache.filter(board => 
                board.title.toLowerCase().includes(searchTerm)
            ).map(board => ({ ...board, score: calculateScore(board.title, searchTerm) }));
            results = results.concat(boardResults);
        }

        // Buscar en listas
        if (currentSearchFilter === 'all' || currentSearchFilter === 'lists') {
            const listResults = allListsCache.filter(list => 
                list.name.toLowerCase().includes(searchTerm)
            ).map(list => ({ ...list, score: calculateScore(list.name, searchTerm) }));
            results = results.concat(listResults);
        }

        // Buscar en tarjetas
        if (currentSearchFilter === 'all' || currentSearchFilter === 'cards') {
            const cardResults = allCardsCache.filter(card => {
                return card.title.toLowerCase().includes(searchTerm) ||
                       (card.description && card.description.toLowerCase().includes(searchTerm)) ||
                       (card.assignedTo && card.assignedTo.toLowerCase().includes(searchTerm));
            }).map(card => ({ ...card, score: calculateScore(card.title, searchTerm) }));
            results = results.concat(cardResults);
        }

        // Ordenar por score (prioridad) y luego alfabéticamente
        results.sort((a, b) => b.score - a.score || a.title?.localeCompare(b.title) || a.name?.localeCompare(b.name));

        filteredResults = results;
        displayAdvancedSearchResults(results, searchTerm);
    }

    function calculateScore(text, searchTerm) {
        const lowerText = text.toLowerCase();
        const lowerTerm = searchTerm.toLowerCase();
        
        // Coincidencia exacta
        if (lowerText === lowerTerm) return 100;
        
        // Comienza con el término
        if (lowerText.startsWith(lowerTerm)) return 80;
        
        // Contiene el término al inicio de una palabra
        if (lowerText.includes(' ' + lowerTerm)) return 60;
        
        // Contiene el término en cualquier lugar
        if (lowerText.includes(lowerTerm)) return 40;
        
        return 0;
    }

    function displayAdvancedSearchResults(results, searchTerm) {
        searchResultsList.innerHTML = '';
        selectedResultIndex = -1;

        const resultsCount = document.getElementById('search-results-count');
        resultsCount.textContent = `${results.length} resultado${results.length !== 1 ? 's' : ''}`;

        if (results.length === 0) {
            searchResultsList.innerHTML = '<p class="text-center text-slate-500 dark:text-slate-400 py-4">No se encontraron resultados</p>';
            searchResults.classList.remove('hidden');
            return;
        }

        results.forEach((result, index) => {
            const resultDiv = createSearchResultElement(result, searchTerm, index);
            searchResultsList.appendChild(resultDiv);
        });

        searchResults.classList.remove('hidden');
        lucide.createIcons();
    }

    function createSearchResultElement(result, searchTerm, index) {
        const resultDiv = document.createElement('div');
        resultDiv.className = 'search-result-item bg-white dark:bg-slate-700 hover:bg-slate-50 dark:hover:bg-slate-600 p-3 rounded-lg cursor-pointer transition border border-slate-200 dark:border-slate-600';
        resultDiv.dataset.index = index;
        
        let content = '';
        
        if (result.type === 'board') {
            const highlightedTitle = highlightText(result.title, searchTerm);
            const membersCount = Object.keys(result.members || {}).length;
            
            content = `
                <div class="flex items-start justify-between mb-2">
                    <div class="flex items-center gap-2 flex-1">
                        <span class="result-type-badge result-type-board">📋 Tablero</span>
                        <h4 class="font-semibold text-slate-800 dark:text-slate-200 text-sm">${highlightedTitle}</h4>
                    </div>
                    <span class="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1">
                        <i data-lucide="users" class="w-3 h-3"></i> ${membersCount}
                    </span>
                </div>
            `;
        } else if (result.type === 'list') {
            const highlightedName = highlightText(result.name, searchTerm);
            
            content = `
                <div class="flex items-start justify-between mb-2">
                    <div class="flex items-center gap-2 flex-1">
                        <span class="result-type-badge result-type-list">📑 Lista</span>
                        <h4 class="font-semibold text-slate-800 dark:text-slate-200 text-sm">${highlightedName}</h4>
                    </div>
                </div>
                <div class="text-xs text-slate-500 dark:text-slate-400">
                    En tablero: <span class="font-medium">${result.boardTitle}</span>
                </div>
            `;
        } else if (result.type === 'card') {
            const highlightedTitle = highlightText(result.title, searchTerm);
            const highlightedDesc = result.description ? highlightText(result.description.substring(0, 100), searchTerm) : '';
            
            content = `
                <div class="flex items-start justify-between mb-2">
                    <div class="flex items-center gap-2 flex-1">
                        <span class="result-type-badge result-type-card">📄 Tarjeta</span>
                        <h4 class="font-semibold text-slate-800 dark:text-slate-200 text-sm">${highlightedTitle}</h4>
                    </div>
                </div>
                ${highlightedDesc ? `<p class="text-xs text-slate-600 dark:text-slate-300 mb-2">${highlightedDesc}...</p>` : ''}
                <div class="flex items-center gap-3 text-xs text-slate-500 dark:text-slate-400">
                    <span>📋 ${result.boardTitle}</span>
                    <span>→</span>
                    <span>📑 ${result.listName}</span>
                </div>
                ${result.assignedTo ? `<span class="text-xs px-2 py-1 bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 rounded-full inline-block mt-2">👤 ${result.assignedTo}</span>` : ''}
            `;
        }
        
        resultDiv.innerHTML = content;
        
        resultDiv.addEventListener('click', () => {
            openSearchResult(result);
        });
        
        return resultDiv;
    }

    function handleSearchKeyNavigation(e) {
        const results = document.querySelectorAll('.search-result-item');
        if (results.length === 0) return;

        switch(e.key) {
            case 'ArrowDown':
                e.preventDefault();
                selectedResultIndex = Math.min(selectedResultIndex + 1, results.length - 1);
                updateSelectedResult(results);
                break;
            case 'ArrowUp':
                e.preventDefault();
                selectedResultIndex = Math.max(selectedResultIndex - 1, -1);
                updateSelectedResult(results);
                break;
            case 'Enter':
                e.preventDefault();
                if (selectedResultIndex >= 0 && filteredResults[selectedResultIndex]) {
                    openSearchResult(filteredResults[selectedResultIndex]);
                }
                break;
            case 'Escape':
                e.preventDefault();
                searchResults.classList.add('hidden');
                globalSearch.value = '';
                selectedResultIndex = -1;
                break;
        }
    }

    function updateSelectedResult(results) {
        results.forEach((result, index) => {
            if (index === selectedResultIndex) {
                result.classList.add('keyboard-selected');
                result.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
            } else {
                result.classList.remove('keyboard-selected');
            }
        });
    }

    async function openSearchResult(result) {
        searchResults.classList.add('hidden');
        globalSearch.value = '';
        selectedResultIndex = -1;

        if (result.type === 'board') {
            // Abrir el tablero
            const boardDoc = await getDoc(doc(db, 'boards', result.id));
            if (boardDoc.exists()) {
                openBoard(result.id, boardDoc.data());
            }
        } else if (result.type === 'list') {
            // Abrir el tablero y hacer scroll a la lista
            const boardDoc = await getDoc(doc(db, 'boards', result.boardId));
            if (boardDoc.exists()) {
                openBoard(result.boardId, boardDoc.data());
                setTimeout(() => {
                    const listElement = document.querySelector(`[data-list-id="${result.id}"]`);
                    if (listElement) {
                        listElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
                        listElement.style.boxShadow = '0 0 0 3px rgba(59, 130, 246, 0.5)';
                        setTimeout(() => {
                            listElement.style.boxShadow = '';
                        }, 2000);
                    }
                }, 500);
            }
        } else if (result.type === 'card') {
            // Abrir el tablero y luego la tarjeta
            if (currentBoardId !== result.boardId) {
                const boardDoc = await getDoc(doc(db, 'boards', result.boardId));
                if (boardDoc.exists()) {
                    openBoard(result.boardId, boardDoc.data());
                    setTimeout(() => {
                        openCardModal(result.listId, result.cardId, result);
                    }, 500);
                }
            } else {
                openCardModal(result.listId, result.cardId, result);
            }
        }
    }

    function highlightText(text, term) {
        const regex = new RegExp(`(${term})`, 'gi');
        return text.replace(regex, '<span class="search-result-highlight">$1</span>');
    }


    // ========================================
    // PORTADAS DE TARJETAS
    // ========================================
    function initCardCover() {
        document.getElementById('card-cover-btn')?.addEventListener('click', () => {
            cardCoverModal.style.display = 'flex';
            cardCoverModal.classList.remove('hidden');
            lucide.createIcons();
        });

        document.getElementById('cancel-cover-btn')?.addEventListener('click', () => {
            cardCoverModal.style.display = 'none';
            cardCoverModal.classList.add('hidden');
        });

        document.getElementById('remove-cover-btn')?.addEventListener('click', () => {
            currentCardCover = { color: null, emoji: null };
            cardCoverModal.style.display = 'none';
            cardCoverModal.classList.add('hidden');
        });

        // Colores
        document.querySelectorAll('.cover-color').forEach(btn => {
            btn.addEventListener('click', () => {
                const color = btn.dataset.color;
                currentCardCover.color = color === 'none' ? null : color;
                currentCardCover.emoji = null;
                cardCoverModal.style.display = 'none';
                cardCoverModal.classList.add('hidden');
            });
        });

        // Emojis
        document.querySelectorAll('.cover-emoji').forEach(btn => {
            btn.addEventListener('click', () => {
                const emoji = btn.dataset.emoji;
                currentCardCover.emoji = emoji;
                currentCardCover.color = null;
                cardCoverModal.style.display = 'none';
                cardCoverModal.classList.add('hidden');
            });
        });
    }

    initCardCover();

    // ========================================
    // UTILIDADES
    // ========================================
    function hasPermission(permission) {
        if (!currentUserRole) return false;
        return PERMISSIONS[currentUserRole]?.[permission] || false;
    }

    function showError(message) { alert(message); }
    function showSuccess(message) { console.log('✅', message); }

    function getTimeAgo(timestamp) {
        if (!timestamp) return 'Ahora';
        const now = new Date();
        const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
        const seconds = Math.floor((now - date) / 1000);
        if (seconds < 60) return 'Hace un momento';
        if (seconds < 3600) return `Hace ${Math.floor(seconds / 60)} minutos`;
        if (seconds < 86400) return `Hace ${Math.floor(seconds / 3600)} horas`;
        return `Hace ${Math.floor(seconds / 86400)} días`;
    }

    // ========================================
    // EVENT LISTENERS PRINCIPALES
    // ========================================

    document.getElementById('create-board-btn')?.addEventListener('click', () => {
        boardModal.style.display = 'flex';
        boardModal.classList.remove('hidden');
        document.getElementById('board-name-input').value = '';
    });

    document.getElementById('cancel-board-btn')?.addEventListener('click', () => {
        boardModal.style.display = 'none';
        boardModal.classList.add('hidden');
    });

    document.getElementById('save-board-btn')?.addEventListener('click', createBoard);

    document.getElementById('add-list-btn')?.addEventListener('click', () => {
        if (!hasPermission('createList')) {
            showError('No tienes permisos para crear listas');
            return;
        }
        listModal.style.display = 'flex';
        listModal.classList.remove('hidden');
        document.getElementById('list-name-input').value = '';
    });

    document.getElementById('cancel-list-btn')?.addEventListener('click', () => {
        listModal.style.display = 'none';
        listModal.classList.add('hidden');
    });

    document.getElementById('save-list-btn')?.addEventListener('click', createList);

    document.getElementById('cancel-card-btn')?.addEventListener('click', () => {
        cardModal.style.display = 'none';
        cardModal.classList.add('hidden');
        currentCardData = null;
        currentCardCover = { color: null, emoji: null };
    });

    document.getElementById('save-card-btn')?.addEventListener('click', saveCard);
    document.getElementById('delete-card-btn')?.addEventListener('click', deleteCard);
    document.getElementById('add-comment-btn')?.addEventListener('click', addComment);

    document.getElementById('back-to-boards-btn')?.addEventListener('click', () => {
        boardView.style.display = 'none';
        document.querySelector('.boards-section').style.display = 'block';
        currentBoardId = null;
        currentBoardData = null;
        currentUserRole = null;
        membersPanel?.classList.add('hidden');
        activityPanel?.classList.add('hidden');
        if (unsubscribeLists) unsubscribeLists();
        if (unsubscribeActivity) unsubscribeActivity();
        Object.values(unsubscribeCards).forEach(unsub => unsub());
        unsubscribeCards = {};
        allCardsCache = [];
    });

    document.getElementById('invite-member-btn')?.addEventListener('click', () => {
        if (!hasPermission('inviteMembers')) {
            showError('No tienes permisos para invitar miembros');
            return;
        }
        inviteModal.style.display = 'flex';
        inviteModal.classList.remove('hidden');
        document.getElementById('invite-email-input').value = '';
    });

    document.getElementById('cancel-invite-btn')?.addEventListener('click', () => {
        inviteModal.style.display = 'none';
        inviteModal.classList.add('hidden');
    });

    document.getElementById('send-invite-btn')?.addEventListener('click', sendInvitation);

    document.getElementById('toggle-members-btn')?.addEventListener('click', () => {
        const isHidden = membersPanel.classList.contains('hidden');
        membersPanel.classList.toggle('hidden');
        activityPanel.classList.add('hidden');
        if (isHidden) loadMembers();
    });

    document.getElementById('close-members-btn')?.addEventListener('click', () => {
        membersPanel.classList.add('hidden');
    });

    document.getElementById('toggle-activity-btn')?.addEventListener('click', () => {
        const isHidden = activityPanel.classList.contains('hidden');
        activityPanel.classList.toggle('hidden');
        membersPanel.classList.add('hidden');
        if (isHidden) loadActivity();
    });

    document.getElementById('close-activity-btn')?.addEventListener('click', () => {
        activityPanel.classList.add('hidden');
    });

    notificationsBtn?.addEventListener('click', () => {
        notificationsDropdown.classList.toggle('hidden');
    });

    document.getElementById('mark-all-read-btn')?.addEventListener('click', markAllNotificationsRead);

    document.addEventListener('click', (e) => {
        if (notificationsBtn && notificationsDropdown) {
            if (!notificationsBtn.contains(e.target) && !notificationsDropdown.contains(e.target)) {
                notificationsDropdown.classList.add('hidden');
            }
        }
    });

    window.addEventListener('user-authenticated', (e) => {
        currentUser = e.detail.user;
        console.log('👤 Usuario autenticado:', currentUser.email);
        loadBoards();
        loadNotifications();
    });

    // ========================================
    // GESTIÓN DE TABLEROS
    // ========================================

    async function createBoard() {
        const name = document.getElementById('board-name-input').value.trim();
        if (!name) {
            showError('Por favor ingresa un nombre para el tablero');
            return;
        }

        try {
            const newBoard = {
                title: name,
                ownerId: currentUser.uid,
                ownerEmail: currentUser.email,
                members: {
                    [currentUser.uid]: {
                        email: currentUser.email,
                        name: currentUser.displayName || currentUser.email,
                        role: 'owner',
                        addedAt: serverTimestamp()
                    }
                },
                memberEmails: [currentUser.email],
                createdAt: serverTimestamp()
            };
            
            await addDoc(collection(db, 'boards'), newBoard);
            boardModal.style.display = 'none';
            boardModal.classList.add('hidden');
            showSuccess('Tablero creado exitosamente');
        } catch (error) {
            console.error('Error al crear tablero:', error);
            showError('Error al crear el tablero: ' + error.message);
        }
    }

    function loadBoards() {
        if (unsubscribeBoards) unsubscribeBoards();

        const q = query(
            collection(db, 'boards'),
            where('memberEmails', 'array-contains', currentUser.email)
        );

        unsubscribeBoards = onSnapshot(q, (snapshot) => {
            boardsContainer.innerHTML = '';
            
            if (snapshot.empty) {
                boardsContainer.innerHTML = '<p class="col-span-full text-center text-slate-500 dark:text-slate-400 py-10">No hay tableros aún. ¡Crea uno!</p>';
                return;
            }

            snapshot.forEach((docSnap) => {
                const board = docSnap.data();
                const boardCard = createBoardCard(docSnap.id, board);
                boardsContainer.appendChild(boardCard);
            });
            
            lucide.createIcons();
        });
    }

    function createBoardCard(id, board) {
        const card = document.createElement('div');
        card.className = 'board-card bg-white dark:bg-slate-800 p-6 rounded-xl shadow-sm hover:shadow-lg transition cursor-pointer border border-slate-200 dark:border-slate-700 group';
        
        const userMember = board.members?.[currentUser.uid];
        const userRole = userMember?.role || 'viewer';
        const roleColors = {
            owner: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300',
            editor: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300',
            viewer: 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300'
        };
        const roleLabels = {
            owner: '👑 Propietario',
            editor: '✏️ Editor',
            viewer: '👁️ Observador'
        };
        
        const membersCount = Object.keys(board.members || {}).length;
        
        card.innerHTML = `
            <div class="flex justify-between items-start mb-3">
                <h3 class="font-bold text-lg text-slate-800 dark:text-slate-200 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition">${board.title}</h3>
                ${board.ownerId === currentUser.uid ? `
                    <button class="delete-board opacity-0 group-hover:opacity-100 text-slate-400 hover:text-red-500 transition" data-id="${id}">
                        <i data-lucide="trash-2" class="w-4 h-4"></i>
                    </button>
                ` : ''}
            </div>
            <div class="flex items-center justify-between">
                <span class="text-xs px-2 py-1 rounded-full ${roleColors[userRole]} font-medium">
                    ${roleLabels[userRole]}
                </span>
                <span class="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1">
                    <i data-lucide="users" class="w-3 h-3"></i> ${membersCount}
                </span>
            </div>
        `;
        
        card.addEventListener('click', (e) => {
            if (!e.target.closest('.delete-board')) {
                openBoard(id, board);
            }
        });

        const deleteBtn = card.querySelector('.delete-board');
        if (deleteBtn) {
            deleteBtn.addEventListener('click', async (e) => {
                e.stopPropagation();
                if (confirm('¿Estás seguro de eliminar este tablero?')) {
                    try {
                        await deleteDoc(doc(db, 'boards', id));
                        showSuccess('Tablero eliminado');
                    } catch (error) {
                        showError('Error al eliminar el tablero');
                    }
                }
            });
        }

        return card;
    }

    function openBoard(boardId, boardData) {
        currentBoardId = boardId;
        currentBoardData = boardData;
        
        const userMember = boardData.members?.[currentUser.uid];
        currentUserRole = userMember?.role || 'viewer';
        
        boardTitle.textContent = boardData.title;
        
        const roleColors = {
            owner: 'bg-yellow-500 text-white',
            editor: 'bg-blue-500 text-white',
            viewer: 'bg-gray-500 text-white'
        };
        const roleLabels = {
            owner: '👑 Propietario',
            editor: '✏️ Editor',
            viewer: '👁️ Observador'
        };
        
        userRoleBadge.className = `px-3 py-1 text-xs font-bold rounded-full ${roleColors[currentUserRole]}`;
        userRoleBadge.textContent = roleLabels[currentUserRole];
        
        document.querySelector('.boards-section').style.display = 'none';
        boardView.style.display = 'flex';
        
        loadLists(boardId);
        lucide.createIcons();
    }

    // ========================================
    // GESTIÓN DE LISTAS
    // ========================================

    async function createList() {
        const name = document.getElementById('list-name-input').value.trim();
        
        if (!name) {
            showError('Por favor ingresa un nombre para la lista');
            return;
        }

        try {
            await addDoc(collection(db, 'boards', currentBoardId, 'lists'), {
                name: name,
                position: Date.now(),
                createdAt: serverTimestamp()
            });
            
            await logActivity('created_list', 'list', null, { listName: name });
            
            listModal.style.display = 'none';
            listModal.classList.add('hidden');
            showSuccess('Lista creada');
        } catch (error) {
            console.error('Error al crear lista:', error);
            showError('Error al crear la lista');
        }
    }

    function loadLists(boardId) {
        if (unsubscribeLists) unsubscribeLists();
        
        const q = query(
            collection(db, 'boards', boardId, 'lists'),
            orderBy('position')
        );

        unsubscribeLists = onSnapshot(q, (snapshot) => {
            listsContainer.innerHTML = '';
            
            snapshot.forEach((docSnap) => {
                const list = docSnap.data();
                const listElement = createListElement(docSnap.id, list);
                listsContainer.appendChild(listElement);
                
                loadCards(boardId, docSnap.id, listElement.querySelector('.cards-container'));
            });
            
            lucide.createIcons();
        });
    }

    function createListElement(listId, list) {
        const listDiv = document.createElement('div');
        listDiv.className = 'list bg-slate-200/70 dark:bg-slate-700/70 rounded-xl p-4 min-w-[300px] max-w-[300px] flex flex-col border border-slate-300 dark:border-slate-600 shadow-sm';
        listDiv.dataset.listId = listId;
        
        const canDelete = hasPermission('deleteList');
        
        listDiv.innerHTML = `
            <div class="list-header flex justify-between items-center mb-3 pb-2 border-b border-slate-300 dark:border-slate-600">
                <h3 class="font-semibold text-slate-700 dark:text-slate-200 truncate flex-1">${list.name}</h3>
                ${canDelete ? `
                    <button class="delete-list text-slate-400 hover:text-red-500 transition p-1">
                        <i data-lucide="trash-2" class="w-4 h-4"></i>
                    </button>
                ` : ''}
            </div>
            <div class="cards-container flex-1 overflow-y-auto space-y-2 mb-3 min-h-[100px]" data-list-id="${listId}"></div>
            ${hasPermission('createCard') ? `
                <button class="add-card-btn w-full text-left text-slate-600 dark:text-slate-300 hover:bg-slate-300/50 dark:hover:bg-slate-600/50 p-2 rounded-lg text-sm font-medium flex items-center gap-2 transition">
                    <i data-lucide="plus" class="w-4 h-4"></i> Añadir tarjeta
                </button>
            ` : ''}
        `;
        
        const cardsContainer = listDiv.querySelector('.cards-container');
        setupDropZone(cardsContainer, listId);
        
        const addCardBtn = listDiv.querySelector('.add-card-btn');
        if (addCardBtn) {
            addCardBtn.addEventListener('click', () => {
                openCardModal(listId);
            });
        }

        const deleteListBtn = listDiv.querySelector('.delete-list');
        if (deleteListBtn) {
            deleteListBtn.addEventListener('click', async () => {
                if (confirm('¿Eliminar esta lista y todas sus tarjetas?')) {
                    try {
                        await deleteDoc(doc(db, 'boards', currentBoardId, 'lists', listId));
                        await logActivity('deleted_list', 'list', listId, { listName: list.name });
                        showSuccess('Lista eliminada');
                    } catch (error) {
                        showError('Error al eliminar la lista');
                    }
                }
            });
        }

        return listDiv;
    }

    // ========================================
    // GESTIÓN DE TARJETAS
    // ========================================

    function loadCards(boardId, listId, container) {
        if (unsubscribeCards[listId]) {
            unsubscribeCards[listId]();
        }
        
        const q = query(
            collection(db, 'boards', boardId, 'lists', listId, 'cards'),
            orderBy('position')
        );

        unsubscribeCards[listId] = onSnapshot(q, (snapshot) => {
            container.innerHTML = '';
            
            // Obtener nombre de la lista para búsqueda
            const listElement = container.closest('.list');
            const listName = listElement?.querySelector('h3')?.textContent || '';
            
            snapshot.forEach((docSnap) => {
                const card = docSnap.data();
                const cardElement = createCardElement(docSnap.id, listId, card);
                container.appendChild(cardElement);
                
                // Agregar al caché de búsqueda
                const cardIndex = allCardsCache.findIndex(c => c.cardId === docSnap.id);
                const cardForSearch = {
                    ...card,
                    cardId: docSnap.id,
                    listId: listId,
                    listName: listName,
                    boardId: boardId
                };
                
                if (cardIndex >= 0) {
                    allCardsCache[cardIndex] = cardForSearch;
                } else {
                    allCardsCache.push(cardForSearch);
                }
            });
            
            lucide.createIcons();
        });
    }

    function createCardElement(cardId, listId, card) {
        const cardDiv = document.createElement('div');
        cardDiv.className = 'card bg-white dark:bg-slate-800 p-3 rounded-lg shadow-sm border border-slate-200 dark:border-slate-700 cursor-grab hover:shadow-md transition group';
        cardDiv.draggable = hasPermission('editCard');
        cardDiv.dataset.cardId = cardId;
        cardDiv.dataset.listId = listId;
        
        let coverHTML = '';
        if (card.cover) {
            if (card.cover.color) {
                coverHTML = `<div class="card-cover ${card.cover.color}"></div>`;
            } else if (card.cover.emoji) {
                coverHTML = `<div class="card-cover bg-slate-100 dark:bg-slate-700">${card.cover.emoji}</div>`;
            }
        }
        
        cardDiv.innerHTML = `
            ${coverHTML}
            <h4 class="font-semibold text-slate-800 dark:text-slate-200 mb-2 text-sm">${card.title}</h4>
            ${card.description ? `<p class="text-xs text-slate-600 dark:text-slate-400 mb-2">${card.description}</p>` : ''}
            ${card.assignedTo ? `<span class="text-xs px-2 py-1 bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 rounded-full inline-block">👤 ${card.assignedTo}</span>` : ''}
        `;
        
        cardDiv.addEventListener('click', () => {
            openCardModal(listId, cardId, card);
        });
        
        if (hasPermission('editCard')) {
            cardDiv.addEventListener('dragstart', handleDragStart);
            cardDiv.addEventListener('dragend', handleDragEnd);
        }

        return cardDiv;
    }

    function openCardModal(listId, cardId = null, cardData = null) {
        currentCardData = { listId, cardId, data: cardData };
        
        const modalTitle = document.getElementById('card-modal-title');
        const titleInput = document.getElementById('card-title-input');
        const descInput = document.getElementById('card-description-input');
        const assignedInput = document.getElementById('card-assigned-input');
        const deleteBtn = document.getElementById('delete-card-btn');
        const commentsSection = document.getElementById('card-comments-section');
        const saveBtn = document.getElementById('save-card-btn');
        
        const canEdit = cardId ? hasPermission('editCard') : hasPermission('createCard');
        const canDelete = hasPermission('deleteCard');
        
        if (!canEdit) {
            titleInput.disabled = true;
            descInput.disabled = true;
            assignedInput.disabled = true;
            saveBtn.style.display = 'none';
        } else {
            titleInput.disabled = false;
            descInput.disabled = false;
            assignedInput.disabled = false;
            saveBtn.style.display = 'block';
        }
        
        if (cardId && cardData) {
            modalTitle.textContent = canEdit ? 'Editar Tarjeta' : 'Ver Tarjeta';
            titleInput.value = cardData.title || '';
            descInput.value = cardData.description || '';
            assignedInput.value = cardData.assignedTo || '';
            deleteBtn.style.display = canDelete ? 'block' : 'none';
            commentsSection.style.display = 'block';
            currentCardCover = cardData.cover || { color: null, emoji: null };
            loadComments(listId, cardId);
        } else {
            modalTitle.textContent = 'Nueva Tarjeta';
            titleInput.value = '';
            descInput.value = '';
            assignedInput.value = '';
            deleteBtn.style.display = 'none';
            commentsSection.style.display = 'none';
            currentCardCover = { color: null, emoji: null };
        }
        
        cardModal.style.display = 'flex';
        cardModal.classList.remove('hidden');
    }

    async function saveCard() {
        const title = document.getElementById('card-title-input').value.trim();
        const description = document.getElementById('card-description-input').value.trim();
        const assignedTo = document.getElementById('card-assigned-input').value.trim();
        
        if (!title) {
            showError('Por favor ingresa un título para la tarjeta');
            return;
        }

        const cardData = {
            title,
            description,
            assignedTo,
            cover: currentCardCover,
            updatedAt: serverTimestamp()
        };

        try {
            if (currentCardData.cardId) {
                const cardRef = doc(db, 'boards', currentBoardId, 'lists', currentCardData.listId, 'cards', currentCardData.cardId);
                await updateDoc(cardRef, cardData);
                await logActivity('updated_card', 'card', currentCardData.cardId, { cardTitle: title });
            } else {
                const newCard = {
                    ...cardData,
                    position: Date.now(),
                    createdAt: serverTimestamp(),
                    createdBy: currentUser.uid
                };
                await addDoc(collection(db, 'boards', currentBoardId, 'lists', currentCardData.listId, 'cards'), newCard);
                await logActivity('created_card', 'card', null, { cardTitle: title });
            }
            
            cardModal.style.display = 'none';
            cardModal.classList.add('hidden');
            currentCardData = null;
            currentCardCover = { color: null, emoji: null };
            showSuccess('Tarjeta guardada');
        } catch (error) {
            console.error('Error al guardar tarjeta:', error);
            showError('Error al guardar la tarjeta');
        }
    }

    async function deleteCard() {
        if (!confirm('¿Estás seguro de eliminar esta tarjeta?')) return;

        try {
            const cardRef = doc(db, 'boards', currentBoardId, 'lists', currentCardData.listId, 'cards', currentCardData.cardId);
            await deleteDoc(cardRef);
            await logActivity('deleted_card', 'card', currentCardData.cardId, { cardTitle: currentCardData.data.title });
            
            // Eliminar del caché de búsqueda
            allCardsCache = allCardsCache.filter(c => c.cardId !== currentCardData.cardId);
            
            cardModal.style.display = 'none';
            cardModal.classList.add('hidden');
            currentCardData = null;
            showSuccess('Tarjeta eliminada');
        } catch (error) {
            console.error('Error al eliminar tarjeta:', error);
            showError('Error al eliminar la tarjeta');
        }
    }

    // ========================================
    // DRAG & DROP
    // ========================================

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
        if (e.preventDefault) e.preventDefault();
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

    function setupDropZone(container, listId) {
        container.addEventListener('dragover', handleDragOver);
        container.addEventListener('drop', (e) => handleDrop(e, listId));
        container.addEventListener('dragenter', handleDragEnter);
        container.addEventListener('dragleave', handleDragLeave);
    }

    async function handleDrop(e, newListId) {
        if (e.stopPropagation) e.stopPropagation();
        e.target.classList.remove('drag-over');
        
        if (!draggedCard) return;
        
        const cardId = draggedCard.dataset.cardId;
        const oldListId = draggedCard.dataset.listId;
        
        if (oldListId === newListId) return;
        
        try {
            const oldCardRef = doc(db, 'boards', currentBoardId, 'lists', oldListId, 'cards', cardId);
            const cardSnap = await getDoc(oldCardRef);
            const cardData = cardSnap.data();
            
            await addDoc(collection(db, 'boards', currentBoardId, 'lists', newListId, 'cards'), {
                ...cardData,
                position: Date.now()
            });
            
            await deleteDoc(oldCardRef);
            await logActivity('moved_card', 'card', cardId, { cardTitle: cardData.title, fromList: oldListId, toList: newListId });
            
        } catch (error) {
            console.error('Error al mover tarjeta:', error);
            showError('Error al mover la tarjeta');
        }
        
        draggedCard = null;
    }

    // ========================================
    // COMENTARIOS
    // ========================================

    function loadComments(listId, cardId) {
        const commentsList = document.getElementById('comments-list');
        
        const q = query(
            collection(db, 'boards', currentBoardId, 'lists', listId, 'cards', cardId, 'comments'),
            orderBy('createdAt')
        );

        onSnapshot(q, (snapshot) => {
            commentsList.innerHTML = '';
            
            snapshot.forEach((docSnap) => {
                const comment = docSnap.data();
                const commentDiv = document.createElement('div');
                commentDiv.className = 'comment bg-slate-50 dark:bg-slate-700 p-3 rounded-lg border border-slate-200 dark:border-slate-600';
                commentDiv.innerHTML = `
                    <strong class="text-blue-600 dark:text-blue-400 text-sm block mb-1">${comment.userName}</strong>
                    <p class="text-slate-700 dark:text-slate-300 text-sm mb-1">${comment.text}</p>
                    <small class="text-slate-400 text-xs">${getTimeAgo(comment.createdAt)}</small>
                `;
                commentsList.appendChild(commentDiv);
            });
        });
    }

    async function addComment() {
        const commentText = document.getElementById('comment-input').value.trim();
        
        if (!commentText) {
            showError('Por favor escribe un comentario');
            return;
        }

        try {
            await addDoc(collection(db, 'boards', currentBoardId, 'lists', currentCardData.listId, 'cards', currentCardData.cardId, 'comments'), {
                text: commentText,
                userName: currentUser.displayName || currentUser.email,
                userId: currentUser.uid,
                createdAt: serverTimestamp()
            });
            
            await logActivity('added_comment', 'comment', currentCardData.cardId, { 
                cardTitle: currentCardData.data.title, 
                comment: commentText.substring(0, 50) 
            });
            
            document.getElementById('comment-input').value = '';
            showSuccess('Comentario añadido');
        } catch (error) {
            console.error('Error al añadir comentario:', error);
            showError('Error al añadir el comentario');
        }
    }

    // ========================================
    // INVITACIONES Y MIEMBROS
    // ========================================

    async function sendInvitation() {
        const email = document.getElementById('invite-email-input').value.trim();
        const roleInputs = document.getElementsByName('invite-role');
        let selectedRole = 'editor';
        
        roleInputs.forEach(input => {
            if (input.checked) selectedRole = input.value;
        });
        
        if (!email) {
            showError('Por favor ingresa un correo electrónico');
            return;
        }
        
        if (email === currentUser.email) {
            showError('No puedes invitarte a ti mismo');
            return;
        }
        
        try {
            const usersQuery = query(collection(db, 'users'), where('email', '==', email));
            const userSnapshot = await getDocs(usersQuery);
            
            if (userSnapshot.empty) {
                showError('No se encontró un usuario con ese correo');
                return;
            }
            
            const invitedUserDoc = userSnapshot.docs[0];
            const invitedUserId = invitedUserDoc.id;
            const invitedUserData = invitedUserDoc.data();
            
            if (currentBoardData.members?.[invitedUserId]) {
                showError('Este usuario ya es miembro del tablero');
                return;
            }
            
            const boardRef = doc(db, 'boards', currentBoardId);
            await updateDoc(boardRef, {
                [`members.${invitedUserId}`]: {
                    email: email,
                    name: invitedUserData.name || email,
                    role: selectedRole,
                    addedAt: serverTimestamp()
                },
                memberEmails: arrayUnion(email)
            });
            
            await addDoc(collection(db, 'notifications'), {
                userId: invitedUserId,
                type: 'invite',
                boardId: currentBoardId,
                boardTitle: currentBoardData.title,
                invitedBy: currentUser.displayName || currentUser.email,
                role: selectedRole,
                message: `${currentUser.displayName || currentUser.email} te invitó a "${currentBoardData.title}"`,
                read: false,
                createdAt: serverTimestamp()
            });
            
            await logActivity('invited_member', 'board', currentBoardId, { 
                memberEmail: email, 
                role: selectedRole 
            });
            
            inviteModal.style.display = 'none';
            inviteModal.classList.add('hidden');
            showSuccess('Invitación enviada exitosamente');
            
            if (!membersPanel.classList.contains('hidden')) {
                loadMembers();
            }
        } catch (error) {
            console.error('Error al enviar invitación:', error);
            showError('Error al enviar la invitación');
        }
    }

    function loadMembers() {
        membersList.innerHTML = '';
        
        if (!currentBoardData.members) return;
        
        Object.entries(currentBoardData.members).forEach(([uid, member]) => {
            const memberDiv = document.createElement('div');
            memberDiv.className = 'member-item p-3 bg-slate-50 dark:bg-slate-700 rounded-lg border border-slate-200 dark:border-slate-600 flex justify-between items-center';
            
            const roleLabels = {
                owner: '👑 Propietario',
                editor: '✏️ Editor',
                viewer: '👁️ Observador'
            };
            
            const isCurrentUser = uid === currentUser.uid;
            const canRemove = hasPermission('removeMembers') && !isCurrentUser && member.role !== 'owner';
            
            memberDiv.innerHTML = `
                <div class="flex-1">
                    <div class="font-medium text-slate-800 dark:text-slate-200 text-sm">${member.name}${isCurrentUser ? ' (Tú)' : ''}</div>
                    <div class="text-xs text-slate-500 dark:text-slate-400">${member.email}</div>
                    <div class="text-xs text-blue-600 dark:text-blue-400 font-medium mt-1">${roleLabels[member.role]}</div>
                </div>
                ${canRemove ? `
                    <button class="remove-member text-red-500 hover:text-red-700 p-1" data-uid="${uid}" data-email="${member.email}">
                        <i data-lucide="x" class="w-4 h-4"></i>
                    </button>
                ` : ''}
            `;
            
            const removeBtn = memberDiv.querySelector('.remove-member');
            if (removeBtn) {
                removeBtn.addEventListener('click', () => removeMember(uid, member.email));
            }
            
            membersList.appendChild(memberDiv);
        });
        
        lucide.createIcons();
    }

    async function removeMember(uid, email) {
        if (!confirm('¿Eliminar a este miembro del tablero?')) return;
        
        try {
            const boardRef = doc(db, 'boards', currentBoardId);
            await updateDoc(boardRef, {
                [`members.${uid}`]: deleteField(),
                memberEmails: arrayRemove(email)
            });
            
            await logActivity('removed_member', 'board', currentBoardId, { memberEmail: email });
            showSuccess('Miembro eliminado');
            loadMembers();
        } catch (error) {
            console.error('Error al eliminar miembro:', error);
            showError('Error al eliminar el miembro');
        }
    }

    // ========================================
    // ACTIVIDAD
    // ========================================

    async function logActivity(action, targetType, targetId, details) {
        try {
            await addDoc(collection(db, 'activity_logs'), {
                boardId: currentBoardId,
                userId: currentUser.uid,
                userName: currentUser.displayName || currentUser.email,
                action,
                targetType,
                targetId,
                details,
                timestamp: serverTimestamp()
            });
        } catch (error) {
            console.error('Error al registrar actividad:', error);
        }
    }

    function loadActivity() {
        if (unsubscribeActivity) unsubscribeActivity();
        
        const q = query(
            collection(db, 'activity_logs'),
            where('boardId', '==', currentBoardId),
            orderBy('timestamp', 'desc')
        );
        
        unsubscribeActivity = onSnapshot(q, (snapshot) => {
            activityList.innerHTML = '';
            
            if (snapshot.empty) {
                activityList.innerHTML = '<p class="text-center text-slate-500 dark:text-slate-400 text-sm py-4">No hay actividad reciente</p>';
                return;
            }
            
            snapshot.forEach((docSnap) => {
                const activity = docSnap.data();
                const activityDiv = createActivityElement(activity);
                activityList.appendChild(activityDiv);
            });
            
            lucide.createIcons();
        });
    }

    function createActivityElement(activity) {
        const div = document.createElement('div');
        div.className = 'activity-item p-3 bg-slate-50 dark:bg-slate-700 rounded-lg border border-slate-200 dark:border-slate-600';
        
        const icons = {
            created_card: { icon: 'plus-circle', color: 'text-green-500' },
            updated_card: { icon: 'edit-3', color: 'text-blue-500' },
            deleted_card: { icon: 'trash-2', color: 'text-red-500' },
            moved_card: { icon: 'move', color: 'text-purple-500' },
            created_list: { icon: 'list', color: 'text-green-500' },
            deleted_list: { icon: 'x-circle', color: 'text-red-500' },
            added_comment: { icon: 'message-circle', color: 'text-blue-500' },
            invited_member: { icon: 'user-plus', color: 'text-green-500' },
            removed_member: { icon: 'user-minus', color: 'text-red-500' }
        };
        
        const actionInfo = icons[activity.action] || { icon: 'activity', color: 'text-slate-500' };
        
        const messages = {
            created_card: `creó la tarjeta "${activity.details?.cardTitle}"`,
            updated_card: `actualizó la tarjeta "${activity.details?.cardTitle}"`,
            deleted_card: `eliminó la tarjeta "${activity.details?.cardTitle}"`,
            moved_card: `movió la tarjeta "${activity.details?.cardTitle}"`,
            created_list: `creó la lista "${activity.details?.listName}"`,
            deleted_list: `eliminó la lista "${activity.details?.listName}"`,
            added_comment: `comentó en "${activity.details?.cardTitle}"`,
            invited_member: `invitó a ${activity.details?.memberEmail}`,
            removed_member: `eliminó a ${activity.details?.memberEmail}`
        };
        
        div.innerHTML = `
            <div class="flex items-start gap-2">
                <i data-lucide="${actionInfo.icon}" class="w-4 h-4 ${actionInfo.color} mt-0.5"></i>
                <div class="flex-1">
                    <p class="text-sm text-slate-700 dark:text-slate-300">
                        <span class="font-medium">${activity.userName}</span> ${messages[activity.action] || activity.action}
                    </p>
                    <p class="text-xs text-slate-400 mt-1">${getTimeAgo(activity.timestamp)}</p>
                </div>
            </div>
        `;
        
        return div;
    }

    // ========================================
    // NOTIFICACIONES
    // ========================================

    function loadNotifications() {
        if (unsubscribeNotifications) unsubscribeNotifications();
        
        const q = query(
            collection(db, 'notifications'),
            where('userId', '==', currentUser.uid),
            orderBy('createdAt', 'desc')
        );
        
        unsubscribeNotifications = onSnapshot(q, (snapshot) => {
            notificationsList.innerHTML = '';
            
            const unreadCount = snapshot.docs.filter(d => !d.data().read).length;
            
            if (unreadCount > 0) {
                notificationsBadge.classList.remove('hidden');
                notificationsBadge.textContent = unreadCount > 9 ? '9+' : unreadCount;
            } else {
                notificationsBadge.classList.add('hidden');
            }
            
            if (snapshot.empty) {
                notificationsList.innerHTML = '<p class="p-4 text-center text-slate-500 dark:text-slate-400 text-sm">No hay notificaciones</p>';
                return;
            }
            
            snapshot.forEach((docSnap) => {
                const notif = docSnap.data();
                const notifDiv = createNotificationElement(docSnap.id, notif);
                notificationsList.appendChild(notifDiv);
            });
            
            lucide.createIcons();
        });
    }

    function createNotificationElement(id, notif) {
        const div = document.createElement('div');
        div.className = `notification-item p-3 hover:bg-slate-50 dark:hover:bg-slate-700 transition cursor-pointer ${!notif.read ? 'bg-blue-50 dark:bg-blue-900/20' : ''}`;
        
        div.innerHTML = `
            <div class="flex items-start gap-2">
                <i data-lucide="${notif.type === 'invite' ? 'user-plus' : 'bell'}" class="w-4 h-4 text-blue-600 dark:text-blue-400 mt-0.5"></i>
                <div class="flex-1">
                    <p class="text-sm text-slate-700 dark:text-slate-300">${notif.message}</p>
                    <p class="text-xs text-slate-400 mt-1">${getTimeAgo(notif.createdAt)}</p>
                </div>
                ${!notif.read ? '<div class="w-2 h-2 bg-blue-600 rounded-full"></div>' : ''}
            </div>
        `;
        
        div.addEventListener('click', async () => {
            if (!notif.read) {
                await updateDoc(doc(db, 'notifications', id), { read: true });
            }
            
            if (notif.type === 'invite' && notif.boardId) {
                const boardDoc = await getDoc(doc(db, 'boards', notif.boardId));
                if (boardDoc.exists()) {
                    notificationsDropdown.classList.add('hidden');
                    openBoard(notif.boardId, boardDoc.data());
                }
            }
        });
        
        return div;
    }

    async function markAllNotificationsRead() {
        try {
            const q = query(
                collection(db, 'notifications'),
                where('userId', '==', currentUser.uid),
                where('read', '==', false)
            );
            
            const snapshot = await getDocs(q);
            const batch = [];
            
            snapshot.forEach((docSnap) => {
                batch.push(updateDoc(docSnap.ref, { read: true }));
            });
            
            await Promise.all(batch);
            showSuccess('Notificaciones marcadas como leídas');
        } catch (error) {
            console.error('Error al marcar notificaciones:', error);
        }
    }

} // FIN de initializeApp
