import { auth, db } from './firebase-config.js';
import { 
    collection, addDoc, doc, updateDoc, deleteDoc, query, where, onSnapshot, 
    orderBy, serverTimestamp, getDoc
} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';

document.addEventListener('DOMContentLoaded', initializeApp);

function initializeApp() {
    console.log('🚀 Inicializando Trello Clone (Corrección Sidebar)...');

    // ESTADO
    let currentUser = null;
    let currentBoardId = null;
    let currentUserRole = null;
    let currentCardData = null; 
    let currentCardCover = { color: null, mode: 'banner', url: null };
    let currentChecklist = []; 
    let currentAttachments = []; 
    let currentCardLabels = []; // Estado para etiquetas
    
    let unsubscribeBoards, unsubscribeLists; 
    let unsubscribeCards = {}; 

    // DOM
    const boardsContainer = document.getElementById('boards-container');
    const boardView = document.getElementById('board-view');
    const listsContainer = document.getElementById('lists-container');
    const boardModal = document.getElementById('board-modal');
    const listModal = document.getElementById('list-modal');
    const cardModal = document.getElementById('card-modal');
    const coverModal = document.getElementById('card-cover-modal');
    const labelsModal = document.getElementById('labels-modal'); // [NUEVO]

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

    // AUTH & PERMISOS
    const PERMISSIONS = { owner: {createList:true, editCard:true}, editor: {createList:true, editCard:true}, viewer: {createList:false, editCard:false} };
    function hasPermission(a) { return currentUserRole && PERMISSIONS[currentUserRole]?.[a]; }

    window.addEventListener('user-authenticated', (e) => {
        currentUser = e.detail.user;
        const av = document.getElementById('user-avatar');
        if(av) av.textContent = (currentUser.displayName||currentUser.email).charAt(0).toUpperCase();
        loadBoards();
    });

    // CORE: TABLEROS
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
        currentBoardId = id; currentUserRole = data.members?.[currentUser.uid]?.role||'viewer';
        document.getElementById('board-title').textContent = data.title;
        document.querySelector('.boards-section').style.display='none'; boardView.classList.remove('hidden'); boardView.style.display='flex';
        loadLists(id);
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

        // Portada
        let coverHtml = '', fullClass = '';
        if(card.cover?.url && card.cover.mode === 'full') { fullClass='full-cover'; d.style.backgroundImage=`url('${card.cover.url}')`; }
        else if(card.cover?.url) coverHtml = `<div class="card-cover-image" style="background-image: url('${card.cover.url}')"></div>`;
        else if(card.cover?.color) coverHtml = `<div class="card-cover ${card.cover.color}"></div>`;
        if(fullClass) d.classList.add(fullClass);

        // Etiquetas
        let labelsHtml = '';
        if(card.labels?.length) labelsHtml = `<div class="flex flex-wrap mb-1 gap-1">${card.labels.map(l=>`<span class="card-label ${l.color}" title="${l.name}"></span>`).join('')}</div>`;

        // Checklist & Date
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
        <button class="edit-btn absolute top-1 right-1 p-1.5 bg-[#f4f5f7]/80 hover:bg-[#ebecf0] rounded opacity-0 group-hover:opacity-100 z-20"><i data-lucide="pencil" class="w-3 h-3 text-[#42526E]"></i></button>`;
        
        d.addEventListener('click', (e) => {
            if(e.target.closest('.card-label')) { e.stopPropagation(); d.querySelectorAll('.card-label').forEach(l=>l.classList.toggle('expanded')); return; }
            openCardModal(lid, cid, card);
        });
        if(d.draggable) { d.addEventListener('dragstart', handleDragStart); d.addEventListener('dragend', handleDragEnd); }
        return d;
    }

    // DRAG & DROP
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
                    if(snap.exists()) { await addDoc(collection(db,'boards',currentBoardId,'lists',lid,'cards'),{...snap.data(),position:Date.now()}); await deleteDoc(snap.ref); }
                } else await updateDoc(doc(db,'boards',currentBoardId,'lists',slid,'cards',cid),{position:Date.now()});
            } catch(er){console.error(er);}
        });
    }

    // ========================================
    // 6. MODAL DE TARJETA (COMPLETO)
    // ========================================
    function openCardModal(lid, cid=null, data=null) {
        currentCardData = { lid, cid, data };
        document.getElementById('card-title-input').value = data?.title||'';
        document.getElementById('card-description-input').value = data?.description||'';
        document.getElementById('card-due-date-input').value = data?.dueDate||'';
        document.getElementById('card-modal-title').innerHTML = data?'<i data-lucide="credit-card" class="w-3 h-3"></i> Editar':'<i data-lucide="plus" class="w-3 h-3"></i> Nueva';
        
        currentChecklist = data?.checklist||[];
        currentCardCover = data?.cover||{color:null,mode:'banner',url:null};
        currentAttachments = data?.attachments||[];
        currentCardLabels = data?.labels||[]; // Cargar etiquetas

        renderChecklist();
        renderAttachments();
        renderLabelsInModal(); // Renderizar etiquetas en modal

        cardModal.classList.remove('hidden'); cardModal.style.display='flex';
        lucide.createIcons();
    }

    // --- MANEJADORES DEL SIDEBAR (BOTONES LATERALES) ---
    
    // 1. ETIQUETAS
    document.getElementById('card-labels-btn')?.addEventListener('click', () => {
        labelsModal.classList.remove('hidden'); labelsModal.style.display='flex';
        // Marcar checkboxes según estado actual
        document.querySelectorAll('.label-checkbox').forEach(cb => {
            cb.checked = currentCardLabels.some(l => l.name === cb.dataset.label);
        });
    });

    document.querySelectorAll('.label-checkbox').forEach(cb => {
        cb.addEventListener('change', (e) => {
            const label = { name: e.target.dataset.label, color: e.target.dataset.color };
            if (e.target.checked) {
                if (!currentCardLabels.find(l => l.name === label.name)) currentCardLabels.push(label);
            } else {
                currentCardLabels = currentCardLabels.filter(l => l.name !== label.name);
            }
            renderLabelsInModal();
        });
    });

    document.getElementById('cancel-labels-btn')?.addEventListener('click', () => closeModal('labels-modal'));

    function renderLabelsInModal() {
        const container = document.getElementById('card-labels-display');
        container.innerHTML = '';
        if (currentCardLabels.length > 0) container.classList.remove('hidden');
        else container.classList.add('hidden');
        
        currentCardLabels.forEach(l => {
            const s = document.createElement('span');
            s.className = `px-2 py-1 rounded text-xs font-bold text-white ${l.color.split(' ')[0]}`; // Hack simple para color
            s.textContent = l.name;
            container.appendChild(s);
        });
    }

    // 2. CHECKLIST
    document.getElementById('card-checklist-btn')?.addEventListener('click', () => {
        document.getElementById('new-checklist-item-input').focus();
        document.getElementById('card-checklist-section').scrollIntoView({ behavior: 'smooth' });
    });

    // 3. FECHAS
    document.getElementById('card-due-date-btn')?.addEventListener('click', () => {
        document.getElementById('card-due-date-input').showPicker ? document.getElementById('card-due-date-input').showPicker() : document.getElementById('card-due-date-input').focus();
    });

    // 4. ADJUNTOS (Ya existía, lo reforzamos)
    document.getElementById('attach-file-btn')?.addEventListener('click', () => {
        const url = prompt("URL del archivo o imagen:");
        if(!url) return;
        const isImg = url.match(/\.(jpeg|jpg|gif|png|webp)$/)!=null || url.includes('images');
        currentAttachments.push({name:isImg?'Imagen':'Enlace', url, type:isImg?'image':'link', addedAt:new Date().toISOString()});
        renderAttachments();
    });

    // 5. PORTADA
    document.getElementById('card-cover-btn')?.addEventListener('click', () => { coverModal.classList.remove('hidden'); coverModal.style.display='flex'; });

    // --- FUNCIONES INTERNAS MODAL ---
    function renderChecklist() {
        const c = document.getElementById('checklist-items'); c.innerHTML='';
        currentChecklist.forEach((i,x)=>{
            const d = document.createElement('div'); d.className='flex items-center gap-2 py-1 group';
            d.innerHTML=`<input type="checkbox" ${i.completed?'checked':''} class="cursor-pointer"><span class="flex-1 text-sm ${i.completed?'line-through text-slate-400':''}">${i.text}</span><button class="del text-slate-400 hover:text-red-500 opacity-0 group-hover:opacity-100"><i data-lucide="trash-2" class="w-3 h-3"></i></button>`;
            d.querySelector('input').addEventListener('change',e=>{i.completed=e.target.checked; renderChecklist();});
            d.querySelector('.del').addEventListener('click',()=>{currentChecklist.splice(x,1); renderChecklist();});
            c.appendChild(d);
        });
        const p = document.getElementById('checklist-progress');
        const done = currentChecklist.filter(i=>i.completed).length, total=currentChecklist.length;
        if(p) p.innerText = total===0?'0%':Math.round((done/total)*100)+'%';
    }

    function renderAttachments() {
        const c = document.getElementById('attachments-list'); c.innerHTML='';
        currentAttachments.forEach((a,x)=>{
            const d = document.createElement('div'); d.className='flex items-center gap-3 p-2 hover:bg-slate-100 rounded mb-1';
            let act = `<button class="text-xs text-slate-500 hover:text-red-600 del underline">Eliminar</button><a href="${a.url}" target="_blank" class="text-xs text-blue-600 underline ml-2">Abrir</a>`;
            if(a.type==='image') act+=`<button class="text-xs text-slate-500 hover:text-slate-800 ml-2 cover-make flex items-center gap-1"><i data-lucide="image" class="w-3 h-3"></i> Portada</button>`;
            d.innerHTML = `<div class="w-16 h-12 bg-slate-200 rounded bg-cover bg-center" style="background-image:url('${a.type==='image'?a.url:''}')"></div><div class="flex-1"><div class="text-sm font-bold truncate">${a.name}</div><div class="flex mt-1">${act}</div></div>`;
            d.querySelector('.del').addEventListener('click',()=>{currentAttachments.splice(x,1); renderAttachments();});
            d.querySelector('.cover-make')?.addEventListener('click',()=>{
                currentCardCover = (currentCardCover.url===a.url && currentCardCover.mode==='banner') ? {mode:'full',url:a.url,color:null} : (currentCardCover.url===a.url && currentCardCover.mode==='full' ? {mode:'banner',url:null,color:null} : {mode:'banner',url:a.url,color:null});
                alert('Portada actualizada');
            });
            c.appendChild(d);
        });
        if(window.lucide) lucide.createIcons();
    }

    document.getElementById('add-checklist-item-btn')?.addEventListener('click', () => {
        const inp = document.getElementById('new-checklist-item-input');
        if(inp.value.trim()){ currentChecklist.push({text:inp.value.trim(), completed:false}); inp.value=''; renderChecklist(); }
    });

    document.querySelectorAll('.cover-color').forEach(b => b.addEventListener('click', () => {
        currentCardCover = {color:b.dataset.color, mode:'color', url:null}; closeModal('card-cover-modal');
    }));
    document.getElementById('remove-cover-btn')?.addEventListener('click', () => { currentCardCover={color:null}; closeModal('card-cover-modal'); });

    // GUARDAR Y SALIR
    document.getElementById('save-card-btn')?.addEventListener('click', async () => {
        const title = document.getElementById('card-title-input').value.trim();
        if(!title) return;
        const payload = {
            title,
            description: document.getElementById('card-description-input').value.trim(),
            dueDate: document.getElementById('card-due-date-input').value,
            checklist: currentChecklist,
            cover: currentCardCover,
            attachments: currentAttachments,
            labels: currentCardLabels, // Guardar etiquetas
            updatedAt: serverTimestamp()
        };
        if(currentCardData.cid) await updateDoc(doc(db,'boards',currentBoardId,'lists',currentCardData.lid,'cards',currentCardData.cid), payload);
        else await addDoc(collection(db,'boards',currentBoardId,'lists',currentCardData.lid,'cards'), {...payload, position:Date.now(), createdAt:serverTimestamp()});
        closeModal('card-modal');
    });

    document.getElementById('delete-card-btn')?.addEventListener('click', async()=>{if(confirm('¿Borrar?')){await deleteDoc(doc(db,'boards',currentBoardId,'lists',currentCardData.lid,'cards',currentCardData.cid)); closeModal('card-modal');}});

    function closeModal(id){const m=document.getElementById(id);if(m){m.classList.add('hidden');m.style.display='none';}}
    document.querySelectorAll('[id^="cancel-"]').forEach(b=>b.addEventListener('click',e=>closeModal(e.target.closest('.fixed').id)));
    document.getElementById('create-board-btn').addEventListener('click',()=>{boardModal.classList.remove('hidden');boardModal.style.display='flex'});
    document.getElementById('add-list-btn').addEventListener('click',()=>{listModal.classList.remove('hidden');listModal.style.display='flex'});
    document.getElementById('save-list-btn').addEventListener('click',async()=>{
        const v=document.getElementById('list-name-input').value.trim();
        if(v){await addDoc(collection(db,'boards',currentBoardId,'lists'),{name:v,position:Date.now(),createdAt:serverTimestamp()}); closeModal('list-modal'); document.getElementById('list-name-input').value='';}
    });
    document.getElementById('save-board-btn').addEventListener('click',async()=>{
        const v=document.getElementById('board-name-input').value.trim();
        if(v){await addDoc(collection(db,'boards'),{title:v,ownerId:currentUser.uid,memberEmails:[currentUser.email],members:{[currentUser.uid]:{email:currentUser.email,role:'owner'}},createdAt:serverTimestamp()}); closeModal('board-modal');}
    });
}
