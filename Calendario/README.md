# Kairós - Audio Calendar

**Master Your Spoken Record**

Una aplicación de calendario multiplataforma diseñada para gestionar grabaciones de audio con análisis de IA integrado. Organiza tus reuniones, notas de voz y eventos con transcripciones automáticas, resúmenes inteligentes y un sistema de etiquetas flexible.

---

## 🎯 Características Principales

### 📅 Calendario Interactivo
- **Vista mensual completa** con navegación fluida entre meses
- **Indicadores visuales** para días con audio (🎵) y notas (📝)
- **Puntos de color** que representan etiquetas asignadas a cada día
- **Barra de estado** en la parte inferior de cada día (uploaded/feedback/approved)
- **Eventos del calendario** integrados en cada celda del día

### 🎵 Gestión de Audios
- **Reproducción directa** con un clic en cualquier día con audio
- **Soporte de formatos**: MP3, WAV, M4A
- **Reproductor fijo inferior** con controles completos:
  - Play/Pause, Anterior/Siguiente
  - Barra de progreso interactiva
  - Control de volumen
  - Descarga de audio
  - Información de pista y etiquetas

### 🤖 Análisis con IA (Simulado)
- **Transcripción completa** palabra por palabra con timestamps
- **Resumen automático** del contenido del audio
- **Puntos de acción** extraídos automáticamente
- **Decisiones clave** identificadas en la conversación
- **Navegación por transcripción**: Clic en cualquier palabra para saltar a ese momento del audio
- **Resaltado sincronizado**: Palabras resaltadas mientras se reproduce el audio

### 🏷️ Sistema de Etiquetas
- **Etiquetas globales** predefinidas: Proyecto: Kairós, Cliente: Demo, Proyecto: Podcast, Interno, Urgente
- **Creación de etiquetas personalizadas** desde el modal de gestión
- **Asignación múltiple** de etiquetas por día
- **Filtrado por etiquetas**: Visualiza solo los días con etiquetas específicas
- **Indicadores visuales** con puntos de colores en el calendario

### 📝 Notas por Día
- **Editor de notas** simple y limpio para cada día
- **Indicador visual** (📝) en el calendario cuando hay nota
- **Persistencia** de notas independiente de los audios
- **Acceso rápido** desde el menú contextual

### 🔍 Vista de Línea de Tiempo
- **Cronología inversa** de todos los días con contenido
- **Filtrado por etiquetas** aplicable a la línea de tiempo
- **Información consolidada**: Audio, nota y etiquetas en cada entrada
- **Botón de reproducción** directa desde la línea de tiempo

### 🎨 Interfaz Moderna
- **Glassmorphism**: Efectos de vidrio esmerilado en toda la interfaz
- **Gradientes azul/cyan**: Paleta de colores moderna sin morados
- **Animaciones suaves**: Transiciones y microinteracciones en todos los elementos
- **Sombras profundas**: Sistema de tres niveles para dar profundidad

### 🌙 Temas Visuales
- **Modo Oscuro** (predeterminado): Fondo azul oscuro con degradados
- **Modo Claro**: Fondo blanco con elementos adaptados
- **Alto Contraste**: Para accesibilidad mejorada
- **Persistencia**: El tema seleccionado se guarda en localStorage

### 📱 Diseño Responsive
- **Móvil (320-767px)**:
  - Sidebar como overlay deslizable
  - Reproductor vertical optimizado
  - Emojis reducidos (0.625rem)
  - Fuente base 14px
  - Touch-friendly con áreas táctiles grandes

- **Tablet (768-1023px)**:
  - Calendario expandido con más detalles
  - Reproductor horizontal con información de pista
  - Controles de volumen visibles
  - Fuente base 15px

- **Desktop (1024px+)**:
  - Sidebar fijo permanente
  - Aprovechamiento máximo del espacio
  - Días de calendario grandes (120px+)
  - Fuente base 16px
  - Desktop 1440px+ con spacing ampliado

### 🖱️ Menú Contextual (Clic Derecho)
- **Ver Resumen IA**: Abre el modal con la pestaña de resumen
- **Ver Transcripción**: Abre el modal con la transcripción completa
- **Añadir/Editar Nota**: Acceso rápido al editor de notas
- **Gestionar Etiquetas**: Modal para asignar/quitar etiquetas
- **Descargar Audio**: Descarga directa del archivo de audio

### ⌨️ Accesibilidad y Navegación
- **Navegación por teclado** completa en el calendario:
  - Flechas: Navegar entre días
  - Enter/Espacio: Abrir día seleccionado
  - F10/ContextMenu: Abrir menú contextual
  - Escape: Cerrar modales/menús
- **Lectores de pantalla**: ARIA labels completos en todos los elementos
- **Focus visible**: Indicadores claros de enfoque con outline personalizado
- **Trap focus**: Los modales atrapan el foco para navegación accesible
- **Anuncios en vivo**: Región ARIA live para notificaciones

### 🔔 Sistema de Notificaciones
- **Toast notifications** elegantes con glassmorphism
- **Animación de entrada/salida** desde la derecha
- **Auto-dismiss** después de 3 segundos
- **Posicionamiento responsive**: Adaptado a móvil/tablet/desktop

### 💾 Estados de Audio
- **Uploaded** (azul): Audio recién subido
- **Feedback** (amarillo): En revisión o con comentarios
- **Approved** (verde): Audio aprobado

---

## 🚀 Instalación

