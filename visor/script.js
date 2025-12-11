document.addEventListener('DOMContentLoaded', () => {
    // REFERENCIAS DOM
    const fileInput = document.getElementById('fileInput');
    const fileList = document.getElementById('fileList');
    const fileCount = document.getElementById('fileCount');
    const tabsBar = document.getElementById('tabsBar');
    const docTitle = document.getElementById('docTitle');
    const docType = document.getElementById('docType');
    const docContent = document.getElementById('docContent');
    const downloadBtn = document.getElementById('downloadBtn');

    // ESTADO GLOBAL
    let uploadedFiles = []; // Almacena objetos {name, type, content, isBinary}
    let openTabs = [];      // Índices de archivos abiertos [0, 2, 5]
    let activeFileIndex = -1;

    // --- 1. PERSISTENCIA DE DATOS (LOCALSTORAGE) ---
    function loadFromStorage() {
        const stored = localStorage.getItem('trelloDocViewer_files');
        if (stored) {
            uploadedFiles = JSON.parse(stored);
            renderSidebar();
            fileCount.textContent = uploadedFiles.length;
        }
    }

    function saveToStorage() {
        // Solo guardamos texto para no saturar LocalStorage (Límite ~5MB)
        const toSave = uploadedFiles.filter(f => !f.isBinary);
        try {
            localStorage.setItem('trelloDocViewer_files', JSON.stringify(toSave));
        } catch (e) {
            console.warn("Quota exceeded: No se pudo guardar todo.");
        }
    }

    // Inicializar
    loadFromStorage();

    // --- 2. MANEJO DE ARCHIVOS Y ELIMINACIÓN ---
    fileInput.addEventListener('change', async (e) => {
        const files = Array.from(e.target.files);
        for (const file of files) {
            // Leemos el contenido solo si es texto
            const content = await readFileContent(file);
            
            // Detectar binarios
            const isBinary = file.type.startsWith('image/') || file.type === 'application/pdf' || file.type.startsWith('video/') || file.type.startsWith('audio/');
            
            uploadedFiles.push({
                name: file.name,
                type: file.type || 'application/octet-stream',
                content: content, // Será null si es binario
                isBinary: isBinary,
                fileRef: file, // <--- NUEVO: Guardamos la referencia en memoria RAM para verlo ahora
                _modifiedContent: null 
            });
        }
        updateUI();
        saveToStorage();
        fileInput.value = '';
    });

    const folderInput = document.getElementById('folderInput');

    // Listener para subir CARPETAS (Proyectos Web)
    folderInput.addEventListener('change', async (e) => {
        const files = Array.from(e.target.files);
        if (files.length === 0) return;

        // 1. Buscamos el index.html (Punto de entrada)
        const indexFile = files.find(f => f.name.toLowerCase() === 'index.html');
        
        if (!indexFile) {
            alert('Para subir un proyecto web, la carpeta debe contener un archivo "index.html".');
            return;
        }

        // 2. Creamos un objeto "Virtual" que representa todo el proyecto
        // Guardamos TODOS los archivos en una propiedad especial 'projectFiles'
        const projectObj = {
            name: indexFile.webkitRelativePath.split('/')[0] || 'Proyecto Web', // Nombre de la carpeta
            type: 'project/web', // Tipo personalizado nuestro
            content: null, 
            isBinary: false,
            projectFiles: files, // Guardamos todos los recursos aquí
            fileRef: indexFile // Referencia principal
        };

        uploadedFiles.push(projectObj);
        updateUI();
        // No guardamos proyectos complejos en localStorage (demasiado pesado)
        folderInput.value = '';
    });

    function readFileContent(file) {
        return new Promise((resolve) => {
            const reader = new FileReader();
            // Si es imagen/pdf, guardamos URL temporal (no persistente en refresh simple) 
            // Ojo: Para persistencia real de binarios se necesita IndexedDB, aquí simplificamos.
            if (file.type.startsWith('text') || file.name.match(/\.(json|md|js|html|css|csv|xml|sql|txt)$/)) {
                reader.onload = e => resolve(e.target.result);
                reader.readAsText(file);
            } else {
                // Binarios: No los guardamos en texto para localStorage simple
                resolve(null); 
            }
        });
    }

    function deleteFile(index) {
        if (!confirm('¿Eliminar archivo?')) return;
        
        // Cerrar pestaña si está abierta
        const tabIndex = openTabs.indexOf(index);
        if (tabIndex > -1) closeTab(index);

        // Ajustar índices de pestañas abiertas mayores al eliminado
        openTabs = openTabs.map(i => i > index ? i - 1 : i);
        
        uploadedFiles.splice(index, 1);
        updateUI();
        saveToStorage();
        
        if (uploadedFiles.length === 0) {
            docContent.innerHTML = '';
            docTitle.textContent = 'Sin documentos';
        }
    }

    // --- 3. DRAG & DROP (SIDEBAR)  ---
    function enableDragAndDrop() {
        let draggedItem = null;
        let draggedIndex = null;

        const items = document.querySelectorAll('.file-item');
        items.forEach(item => {
            item.setAttribute('draggable', true);

            item.addEventListener('dragstart', function() {
                draggedItem = this;
                draggedIndex = parseInt(this.dataset.index);
                this.classList.add('dragging'); // Aplica rotación CSS
            });

            item.addEventListener('dragend', function() {
                this.classList.remove('dragging');
                draggedItem = null;
            });

            item.addEventListener('dragover', function(e) {
                e.preventDefault(); // Necesario para permitir drop
            });

            item.addEventListener('drop', function() {
                const targetIndex = parseInt(this.dataset.index);
                if (draggedIndex !== null && draggedIndex !== targetIndex) {
                    // Reordenar array
                    const itemToMove = uploadedFiles.splice(draggedIndex, 1)[0];
                    uploadedFiles.splice(targetIndex, 0, itemToMove);
                    
                    // Resetear pestañas (complejo recalcular, cerramos por simplicidad o recargamos)
                    openTabs = []; 
                    activeFileIndex = targetIndex;
                    
                    updateUI();
                    saveToStorage();
                    // Abrir el que movimos
                    openTab(targetIndex);
                }
            });
        });
    }

    // --- 4. RENDERIZADO UI (LISTA y PESTAÑAS) ---
    function updateUI() {
        renderSidebar();
        renderTabs();
        fileCount.textContent = uploadedFiles.length;
    }

function renderSidebar() {
        fileList.innerHTML = '';
        
        // Estado vacío
        if (uploadedFiles.length === 0) {
            fileList.innerHTML = '<div class="empty-state">No hay archivos</div>';
            return;
        }

        uploadedFiles.forEach((file, index) => {
            // 1. PRIMERO creamos el elemento DOM
            const item = document.createElement('div');
            item.className = `file-item ${index === activeFileIndex ? 'active' : ''}`;
            item.dataset.index = index;

            // 2. Calculamos la extensión y el estilo (Una sola vez)
            let ext = file.name.split('.').pop().slice(0, 4).toUpperCase();
            let iconStyle = '';
            
            // Lógica específica para Proyectos Web
            if (file.type === 'project/web') {
                ext = 'WEB'; 
                iconStyle = 'background-color: #6554C0; color: white;'; 
            }

            // 3. Asignamos el HTML usando las variables calculadas
            item.innerHTML = `
                <div class="file-icon" style="${iconStyle}">${ext}</div>
                <div class="file-name">${file.name}</div>
                <div class="delete-btn" title="Eliminar">🗑</div>
            `;

            // 4. Eventos
            // Click para abrir (ignorando el botón de borrar)
            item.addEventListener('click', (e) => {
                if(!e.target.classList.contains('delete-btn')) openTab(index);
            });

            // Click para eliminar
            item.querySelector('.delete-btn').addEventListener('click', (e) => {
                e.stopPropagation(); // Evitar que se abra el archivo al borrarlo
                deleteFile(index);
            });

            // 5. Añadir a la lista
            fileList.appendChild(item);
        });

        // Reactivar Drag & Drop después de renderizar
        enableDragAndDrop();
    }

    // --- 5. LÓGICA DE PESTAÑAS ---
    function renderTabs() {
        tabsBar.innerHTML = '';
        openTabs.forEach(fileIndex => {
            const file = uploadedFiles[fileIndex];
            if (!file) return;

            const tab = document.createElement('div');
            tab.className = `tab-item ${fileIndex === activeFileIndex ? 'active' : ''}`;
            tab.innerHTML = `
                <span>${file.name}</span>
                <span class="close-tab">×</span>
            `;

            tab.addEventListener('click', (e) => {
                if(!e.target.classList.contains('close-tab')) loadFileIntoViewer(fileIndex);
            });

            tab.querySelector('.close-tab').addEventListener('click', (e) => {
                e.stopPropagation();
                closeTab(fileIndex);
            });

            tabsBar.appendChild(tab);
        });
    }

    function openTab(index) {
        if (!openTabs.includes(index)) {
            openTabs.push(index);
        }
        loadFileIntoViewer(index);
        renderTabs();
    }

    function closeTab(index) {
        openTabs = openTabs.filter(i => i !== index);
        if (activeFileIndex === index) {
            // Si cerramos la activa, abrir la última o nada
            if (openTabs.length > 0) loadFileIntoViewer(openTabs[openTabs.length - 1]);
            else {
                activeFileIndex = -1;
                docContent.innerHTML = '';
                docTitle.textContent = '';
                renderSidebar(); // Quitar highlight
            }
        }
        renderTabs();
    }

// Variable para rastrear el archivo interno seleccionado
    let activeProjectFile = null;

    function loadFileIntoViewer(index) {
        activeFileIndex = index;
        const file = uploadedFiles[index];
        updateUI();

        docTitle.textContent = file.name;
        
        // --- CASO 1: PROYECTO WEB (Lógica Interactiva) ---
        if (file.type === 'project/web') {
            docType.textContent = 'WEBSITE';
            docType.style.display = 'inline-block';
            docType.style.backgroundColor = '#6554C0';
            docType.style.color = 'white';
            
            // 1. Renderizar Estructura del Visor (Lista izquierda + Iframe derecha)
            docContent.innerHTML = `
                <div class="project-viewer-layout">
                    <div class="project-sidebar">
                        <div class="project-sidebar-title">EXPLORADOR</div>
                        <div class="project-file-list" id="projectFileList"></div>
                    </div>
                    <div class="project-preview-area" id="projectPreviewArea">
                        </div>
                </div>
            `;

            // 2. Renderizar la lista de archivos interactiva
            renderProjectSidebar(file);

            // 3. Abrir index.html por defecto en modo "Vista Previa"
            const indexFile = file.projectFiles.find(f => f.name.toLowerCase() === 'index.html');
            if (indexFile) {
                loadProjectFile(indexFile, file.projectFiles, 'preview');
            }
            return; 
        }
        // ------------------------------------------------

        // --- CASO 2: ARCHIVOS NORMALES (Tu lógica existente) ---
        // (Mantén aquí el resto de tu código para archivos sueltos .md, .txt, imágenes, etc.)
        // ... Copia y pega la parte "estándar" de la respuesta anterior aquí ...
        
        // Para que no se rompa si copias y pegas, incluyo la lógica básica de reset:
        const ext = file.name.split('.').pop().toLowerCase();
        docType.textContent = ext.toUpperCase();
        docType.style.display = 'inline-block';
        docType.style.backgroundColor = ''; 
        docType.style.color = '';
        
        // Ocultar toggle por defecto (se activa dentro de la lógica de MD)
        document.getElementById('mdToggle').style.display = 'none';

        // Lógica estándar de renderizado (Resumida para brevedad, usa la tuya completa)
        docContent.innerHTML = '';
        if (file.content !== undefined) {
             const contentToShow = file._modifiedContent || file.content;
             if (['txt', 'md', 'json', 'js', 'css', 'html', 'xml', 'sql'].includes(ext)) {
                 // Recuperamos lógica MD si es necesario
                 if(ext === 'md') handleMarkdownToggle(file); 
                 else renderEditorWithGutter(contentToShow, index);
            } else {
                 docContent.innerHTML = `<pre>${contentToShow}</pre>`;
            }
        }
    }

    // --- NUEVA FUNCIÓN: RENDERIZAR SIDEBAR DEL PROYECTO ---
    function renderProjectSidebar(projectFolder) {
        const container = document.getElementById('projectFileList');
        container.innerHTML = '';

        // Ordenar: index.html primero
        const sortedFiles = projectFolder.projectFiles.sort((a, b) => {
            if (a.name === 'index.html') return -1;
            if (b.name === 'index.html') return 1;
            return a.webkitRelativePath.localeCompare(b.webkitRelativePath);
        });

        sortedFiles.forEach(f => {
            const row = document.createElement('div');
            const isIndex = f.name === 'index.html';
            // Usamos ruta relativa para ID único visual
            const isSelected = activeProjectFile === f; 
            
            row.className = `project-file-item ${isSelected ? 'active' : ''}`;
            if (isIndex) row.classList.add('is-main');

            const displayPath = f.webkitRelativePath.split('/').slice(1).join('/');
            
            row.innerHTML = `
                <span class="p-icon">${getFileIcon(f.name)}</span>
                <span title="${f.webkitRelativePath}">${displayPath || f.name}</span>
            `;

            // EVENTO CLICK EN ARCHIVO INTERNO
            row.addEventListener('click', () => {
                // Actualizar selección visual
                document.querySelectorAll('.project-file-item').forEach(el => el.classList.remove('active'));
                row.classList.add('active');
                
                // Cargar archivo
                // Si es HTML, por defecto vista previa, si es otro, código
                const defaultMode = f.name.endsWith('.html') ? 'preview' : 'code';
                loadProjectFile(f, projectFolder.projectFiles, defaultMode);
            });

            container.appendChild(row);
        });
    }

    // --- NUEVA FUNCIÓN: CARGAR ARCHIVO INTERNO EN EL ÁREA DERECHA ---
    async function loadProjectFile(file, allProjectFiles, mode = 'code') {
        activeProjectFile = file;
        const previewArea = document.getElementById('projectPreviewArea');
        const toggleContainer = document.getElementById('mdToggle'); // Reusamos el toggle de Markdown
        
        previewArea.innerHTML = ''; // Limpiar

        // 1. CONFIGURAR EL TOGGLE (Solo para HTML)
        const ext = file.name.split('.').pop().toLowerCase();
        
        // Clonamos para limpiar eventos viejos
        const newToggle = toggleContainer.cloneNode(true);
        toggleContainer.parentNode.replaceChild(newToggle, toggleContainer);
        const cleanToggle = document.getElementById('mdToggle');

        if (ext === 'html') {
            cleanToggle.style.display = 'inline-flex';
            
            // Actualizar estado visual de los botones
            const btnCode = cleanToggle.querySelector('[data-view="raw"]');
            const btnPreview = cleanToggle.querySelector('[data-view="preview"]');
            
            btnCode.classList.remove('active');
            btnPreview.classList.remove('active');
            
            if(mode === 'preview') btnPreview.classList.add('active');
            else btnCode.classList.add('active');

            // Listeners del Toggle
            btnCode.addEventListener('click', () => loadProjectFile(file, allProjectFiles, 'code'));
            btnPreview.addEventListener('click', () => loadProjectFile(file, allProjectFiles, 'preview'));
        } else {
            cleanToggle.style.display = 'none';
        }

        // 2. RENDERIZAR CONTENIDO SEGÚN MODO
        if (mode === 'preview' && ext === 'html') {
            // MODO: VISTA PREVIA (Compilar proyecto)
            previewArea.innerHTML = '<div style="padding:20px; color:#5E6C84">Compilando vista previa...</div>';
            try {
                const blobUrl = await buildWebProjectBlob(allProjectFiles); // Tu función existente
                previewArea.innerHTML = `<iframe src="${blobUrl}" style="width:100%; height:100%; border:none; background:white;"></iframe>`;
            } catch (e) {
                previewArea.innerHTML = `<div style="padding:20px; color:red">Error: ${e.message}</div>`;
            }
        } 
        else {
            // MODO: CÓDIGO (Para HTML en modo raw, CSS, JS)
            // Necesitamos leer el texto del archivo File object
            const reader = new FileReader();
            reader.onload = (e) => {
                const content = e.target.result;
                
                // Usamos tu función existente de Gutter, pero apuntando al div interno
                // Truco: renderEditorWithGutter espera inyectar en docContent. 
                // Vamos a adaptar esa lógica o crear el HTML manualmente aquí.
                
                // Renderizado manual del editor con gutter dentro del previewArea
                renderInternalEditor(content, previewArea);
            };
            reader.readAsText(file);
        }
    }

    // Helper para iconos
    function getFileIcon(name) {
        if (name.endsWith('.html')) return '🌐';
        if (name.endsWith('.css')) return '🎨';
        if (name.endsWith('.js')) return '📜';
        return '📄';
    }

    // Versión simplificada de renderEditor para el visor interno
    function renderInternalEditor(content, container) {
        const wrapper = document.createElement('div');
        wrapper.className = 'editor-wrapper';
        wrapper.style.height = '100%'; // Asegurar altura completa
        wrapper.style.border = 'none'; // Quitar bordes dobles

        const gutter = document.createElement('div');
        gutter.className = 'gutter';
        
        const textarea = document.createElement('textarea');
        textarea.className = 'code-editor';
        textarea.value = content;
        textarea.spellcheck = false;

        const updateLines = () => {
            const lines = textarea.value.split('\n').length;
            gutter.innerHTML = Array(lines).fill(0).map((_, i) => i + 1).join('<br>');
        };
        updateLines();

        textarea.addEventListener('scroll', () => gutter.scrollTop = textarea.scrollTop);
        textarea.addEventListener('input', updateLines);

        wrapper.appendChild(gutter);
        wrapper.appendChild(textarea);
        container.appendChild(wrapper);
    }

    function renderEditorWithGutter(content, index) {
        // Estructura del Gutter
        const wrapper = document.createElement('div');
        wrapper.className = 'editor-wrapper';

        const gutter = document.createElement('div');
        gutter.className = 'gutter';
        
        const textarea = document.createElement('textarea');
        textarea.className = 'code-editor';
        textarea.value = content;
        textarea.spellcheck = false;

        // Generar números de línea
        const updateLines = () => {
            const lines = textarea.value.split('\n').length;
            gutter.innerHTML = Array(lines).fill(0).map((_, i) => i + 1).join('<br>');
        };
        updateLines();

        // Sincronizar Scroll
        textarea.addEventListener('scroll', () => {
            gutter.scrollTop = textarea.scrollTop;
        });

        // Evento Input (Guardar cambios + Actualizar líneas)
        textarea.addEventListener('input', () => {
            updateLines();
            uploadedFiles[index]._modifiedContent = textarea.value;
            // Opcional: Guardar en localStorage cada vez que escribes (puede ser lento)
            // saveToStorage(); 
        });

        // Guardar al perder foco para optimizar rendimiento
        textarea.addEventListener('blur', saveToStorage);

        wrapper.appendChild(gutter);
        wrapper.appendChild(textarea);
        docContent.appendChild(wrapper);
    }

    // Configuración Botón Descarga (Global)
    const newDownloadBtn = downloadBtn.cloneNode(true);
    downloadBtn.parentNode.replaceChild(newDownloadBtn, downloadBtn);
    
    newDownloadBtn.addEventListener('click', () => {
        if(activeFileIndex === -1) return;
        const file = uploadedFiles[activeFileIndex];
        const content = file._modifiedContent || file.content;
        
        const blob = new Blob([content], { type: file.type });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = file.name;
        a.click();
        URL.revokeObjectURL(url);
    });

    // FUNCIÓN PARA MANEJAR EL TOGGLE DE MARKDOWN (Raw/Preview)
function handleMarkdownToggle(file) {
    const toggle = document.getElementById('mdToggle');
    const content = file._modifiedContent || file.content;
    
    // Mostrar el toggle
    toggle.style.display = 'inline-flex';
    
    // Clonar para limpiar eventos anteriores
    const newToggle = toggle.cloneNode(true);
    toggle.parentNode.replaceChild(newToggle, toggle);
    const cleanToggle = document.getElementById('mdToggle');
    
    const btnRaw = cleanToggle.querySelector('[data-view="raw"]');
    const btnPreview = cleanToggle.querySelector('[data-view="preview"]');
    
    // Función para renderizar en modo código
    const renderRaw = () => {
        btnRaw.classList.add('active');
        btnPreview.classList.remove('active');
        docContent.innerHTML = '';
        
        // Crear contenedor para editor con números de línea
        const wrapper = document.createElement('div');
        wrapper.className = 'editor-wrapper';
        
        const gutter = document.createElement('div');
        gutter.className = 'gutter';
        const lines = content.split('\n');
        gutter.innerHTML = lines.map((_, i) => i + 1).join('<br>');
        
        const editor = document.createElement('textarea');
        editor.className = 'code-editor';
        editor.value = content;
        editor.addEventListener('input', () => {
            file._modifiedContent = editor.value;
            const newLines = editor.value.split('\n');
            gutter.innerHTML = newLines.map((_, i) => i + 1).join('<br>');
        });
        
        wrapper.appendChild(gutter);
        wrapper.appendChild(editor);
        docContent.appendChild(wrapper);
    };
    
    // Función para renderizar en modo preview
    const renderPreview = () => {
        btnRaw.classList.remove('active');
        btnPreview.classList.add('active');
        
        const htmlRendered = parseSimpleMarkdown(content);
        docContent.innerHTML = `<div style="padding: 24px; max-width: 800px; margin: 0 auto;">${htmlRendered}</div>`;
    };
    
    // Eventos de los botones
    btnRaw.addEventListener('click', renderRaw);
    btnPreview.addEventListener('click', renderPreview);
    
    // Renderizar vista inicial (Raw por defecto)
    renderRaw();
}

    // Parser Markdown simple para la vista previa
    function parseSimpleMarkdown(md) {
        if (!md) return ''; 
        let html = md
            .replace(/^# (.*$)/gim, '<h1 style="font-size:24px; margin: 16px 0; border-bottom: 1px solid #dfe1e6; padding-bottom: .3em;">$1</h1>')
            .replace(/^## (.*$)/gim, '<h2 style="font-size:20px; margin: 14px 0; border-bottom: 1px solid #dfe1e6; padding-bottom: .3em;">$1</h2>')
            .replace(/^### (.*$)/gim, '<h3 style="font-size:16px; margin: 12px 0;">$1</h3>')
            .replace(/\*\*(.*)\*\*/gim, '<b>$1</b>')
            .replace(/\*(.*)\*/gim, '<i>$1</i>')
            .replace(/`([^`]+)`/gim, '<code style="background:rgba(9,30,66,0.08); padding:2px 4px; border-radius:3px; font-family: monospace;">$1</code>')
            .replace(/\n/gim, '<br>');
        return html;
    }

    // Función avanzada para ensamblar proyectos web (LINKER V2)
async function buildWebProjectBlob(files) {
    // 1. Encontrar index.html
    const indexFile = files.find(f => f.name.toLowerCase() === 'index.html');
    if (!indexFile) throw new Error("No se encontró index.html");

    // 2. NUEVA ESTRATEGIA: Convertir recursos a Data URLs o Inline
    const resourceMap = new Map();

    // Función auxiliar para leer archivos como texto o base64
    const readFileAsDataURL = (file) => {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => resolve(e.target.result);
            reader.onerror = reject;
            reader.readAsDataURL(file); // Convierte a data:image/png;base64,...
        });
    };

    const readFileAsText = (file) => {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => resolve(e.target.result);
            reader.onerror = reject;
            reader.readAsText(file);
        });
    };

    // 3. Procesar TODOS los archivos y guardar su contenido
    for (const file of files) {
        let relativePath = file.name;
        
        if (file.webkitRelativePath) {
            const parts = file.webkitRelativePath.split('/');
            if (parts.length > 1) {
                relativePath = parts.slice(1).join('/');
            }
        }

        // Determinar si usamos Data URL o texto inline
        let resourceContent;
        const ext = file.name.split('.').pop().toLowerCase();

        if (ext === 'css' || ext === 'js') {
            // CSS y JS: Guardar como TEXTO para inyectar inline
            resourceContent = await readFileAsText(file);
        } else if (['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'ico'].includes(ext)) {
            // Imágenes: Convertir a Data URL
            resourceContent = await readFileAsDataURL(file);
        } else {
            // Otros: intentar como texto
            try {
                resourceContent = await readFileAsText(file);
            } catch {
                resourceContent = await readFileAsDataURL(file);
            }
        }

        // Guardar múltiples variantes de la ruta
        const variants = [
            file.name,
            relativePath,
            './' + relativePath,
            '/' + relativePath,
            relativePath.toLowerCase(),
            file.name.toLowerCase()
        ];

        variants.forEach(v => {
            if (v && !resourceMap.has(v)) {
                resourceMap.set(v, { content: resourceContent, ext: ext });
            }
        });

        console.log(`📦 [CARGADO] ${relativePath} (${ext})`);
    }

    // 4. Leer el HTML y procesar
    return new Promise((resolve, reject) => {
        const reader = new FileReader();

        reader.onload = (e) => {
            let htmlContent = e.target.result;

            // Función para resolver recursos
            const resolveResource = (originalPath) => {
                if (!originalPath) return originalPath;
                
                if (originalPath.startsWith('http://') || 
                    originalPath.startsWith('https://') || 
                    originalPath.startsWith('data:') ||
                    originalPath.startsWith('//')) {
                    return originalPath; // URLs externas, no tocar
                }

                let cleanPath = originalPath
                    .replace(/^\.\.\//, '')
                    .replace(/^\.\//, '')
                    .replace(/^\//, '')
                    .replace(/\\/g, '/');

                // Buscar en el mapa
                if (resourceMap.has(cleanPath)) {
                    return resourceMap.get(cleanPath);
                }
                if (resourceMap.has(originalPath)) {
                    return resourceMap.get(originalPath);
                }

                const fileName = cleanPath.split('/').pop();
                if (resourceMap.has(fileName)) {
                    return resourceMap.get(fileName);
                }

                const lowerPath = cleanPath.toLowerCase();
                for (let [key, value] of resourceMap.entries()) {
                    if (key.toLowerCase() === lowerPath) {
                        return value;
                    }
                }

                console.warn(`❌ [NO RESUELTO] "${originalPath}"`);
                return null;
            };

            // ESTRATEGIA 1: Convertir <link> CSS a <style> inline
            htmlContent = htmlContent.replace(
                /<link\s+([^>]*?)href=["']([^"']+)["']([^>]*?)>/gi,
                (match, before, href, after) => {
                    // Solo procesar stylesheets
                    if (!match.includes('stylesheet')) return match;

                    const resource = resolveResource(href);
                    if (resource && resource.ext === 'css') {
                        console.log(`✅ [CSS INLINE] "${href}"`);
                        return `<style>/* ${href} */\n${resource.content}\n</style>`;
                    }
                    
                    console.warn(`⚠️ [CSS EXTERNO] "${href}" - manteniendo link`);
                    return match;
                }
            );

            // ESTRATEGIA 2: Convertir <script src> a <script> inline
            htmlContent = htmlContent.replace(
                /<script\s+([^>]*?)src=["']([^"']+)["']([^>]*?)><\/script>/gi,
                (match, before, src, after) => {
                    const resource = resolveResource(src);
                    if (resource && resource.ext === 'js') {
                        console.log(`✅ [JS INLINE] "${src}"`);
                        return `<script ${before}${after}>/* ${src} */\n${resource.content}\n</script>`;
                    }
                    
                    console.warn(`⚠️ [JS EXTERNO] "${src}" - manteniendo script`);
                    return match;
                }
            );

            // ESTRATEGIA 3: Convertir <img> a data URLs
            htmlContent = htmlContent.replace(
                /<img\s+([^>]*?)src=["']([^"']+)["']([^>]*?)>/gi,
                (match, before, src, after) => {
                    const resource = resolveResource(src);
                    if (resource && resource.content.startsWith('data:')) {
                        console.log(`✅ [IMG DATA] "${src}"`);
                        return `<img ${before}src="${resource.content}"${after}>`;
                    }
                    
                    console.warn(`⚠️ [IMG EXTERNA] "${src}"`);
                    return match;
                }
            );

            // 5. Crear Blob Final del HTML completamente autónomo
            const finalBlob = new Blob([htmlContent], { type: 'text/html' });
            const finalUrl = URL.createObjectURL(finalBlob);
            
            console.log('🎉 [COMPILADO] HTML autónomo con recursos inline');
            resolve(finalUrl);
        };

        reader.onerror = () => reject(reader.error);
        reader.readAsText(indexFile);
    });
}
});