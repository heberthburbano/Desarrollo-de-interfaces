# 📊 Contador de Personas Interactivo

Una aplicación web profesional e interactiva para el conteo de personas (hombres y mujeres), diseñada como un proyecto para el módulo de **Desarrollo de Interfaces**, creada por **Hebertt Burbano**.  
El enfoque principal está en la usabilidad, un diseño visual pulido y un conjunto de funcionalidades avanzadas, todo construido desde cero con **HTML**, **CSS** y **JavaScript puro**, sin el uso de frameworks externos.

---

## ✨ Funcionalidades Principales

### ⚙️ Sistema de Conteo Básico
- Contadores separados para hombres y mujeres.  
- Botones +1 y –1 para cada categoría con validación (no permite números negativos).  
- Contador total que suma hombres y mujeres en tiempo real.  
- Botón de **Reset** para reiniciar a cero los valores del contador activo.  
- Botón de **Deshacer** para revertir la última acción de suma o resta.  

---

## 🚀 Funcionalidades Avanzadas

### 🗂️ Sistema Multi-Contador
- **Creación de Múltiples Pestañas:** Permite crear, nombrar y gestionar varios contadores independientes dentro de la misma interfaz.  
- **Edición y Eliminación:** Los nombres de las pestañas se pueden editar con doble clic y se pueden eliminar contadores fácilmente.  
- **Reordenación Drag & Drop:** Arrastra y suelta las pestañas para organizarlas a tu gusto. El orden se guarda automáticamente.  

### 🪟 Vista General (Dashboard)
- Botón **📊 Vista Global:** Alterna a una vista de resumen que muestra tarjetas con la información clave de todos los contadores a la vez:  
  - Nombre del contador.  
  - Recuento total y desglosado por género.  
  - Barra de progreso con el porcentaje de ocupación.  
- **Navegación Intuitiva:** Haz clic en cualquier tarjeta del dashboard para volver a la vista detallada de ese contador.  

### 📈 Estadísticas Detalladas
- **En Tiempo Real:** Gráfico de barras y porcentajes que muestran la proporción de hombres y mujeres.  
- **Panel Avanzado:** Muestra la ocupación del aforo, la diferencia numérica entre géneros y las entradas por minuto (si la simulación está activa).  
- **Historial de Acciones:** Un registro con marca de tiempo de cada suma y resta realizada.  
- **Estadísticas Históricas:** Cada contador guarda su fecha de creación, el total de movimientos y el pico máximo de ocupación alcanzado.  

---

## 🎙️ Control por Voz y Feedback Hablado

- **Reconocimiento de Voz:** Activa el micrófono para dar comandos como:  
  - “Añadir 5 hombres”  
  - “Quitar 2 mujeres”  
  - “Aforo máximo 200”  
  - “Iniciar simulación”  
  - “Activar modo fiesta”  
- **Feedback Hablado (TTS):** La aplicación notifica por voz eventos importantes como “Aforo al 80%” o “Contador reiniciado”.  
- **Control de Silencio:** Un botón dedicado 🔊/🔇 permite activar o desactivar el feedback hablado en cualquier momento.  

---

## 💾 Gestión de Datos

- **Exportación e Importación Global:** Guarda todos tus contadores y configuraciones en un archivo `.json` y restáuralos cuando quieras.  
- **Exportación Individual:** Exporta los datos de un único contador a formato `.json` o `.csv`.  
- **Persistencia Local:** Todos los datos, contadores y configuraciones se guardan en `localStorage`, manteniendo tu sesión intacta al recargar la página.  

---

## 🎨 Personalización y Experiencia de Usuario

### 🎨 Temas Visuales
- **Más de 8 Temas:** Incluye temas como Claro, Oscuro, Retro, Cyberpunk, Naturaleza y Alto Contraste, todos cuidadosamente diseñados para ser consistentes y legibles.  
- **Modo Automático:** La aplicación puede detectar la preferencia de tema de tu sistema operativo.  

### 🕺 Modo Fiesta (Easter Egg)
- **Activación por Voz:** Di “activar modo fiesta” para iniciar la sorpresa.  
- **Efectos Visuales:** Un overlay con luces de colores animadas, confeti y emojis que caen por la pantalla.  
- **Música Techno Intensa:** Una banda sonora energética para acompañar la fiesta.  
- **Botón de Salida:** Un botón “🎉 Detener Fiesta” aparece fijado en la parte inferior para volver a la normalidad cuando quieras.  

---

## 🔧 Panel de Configuración Global

Un menú accesible desde el icono ⚙️ permite configurar:
- El tema global de la aplicación.  
- El aforo por defecto para nuevos contadores.  
- La activación/desactivación del control por voz y el feedback hablado.  

---

## 🛠️ Tecnologías Utilizadas

Este proyecto se ha construido utilizando exclusivamente tecnologías web estándar, sin dependencias externas:

- **HTML5:** Para la estructura semántica del contenido.  
- **CSS3:** Para todo el diseño visual, incluyendo:  
  - Variables CSS (Custom Properties) para un sistema de temas dinámico y fácil de mantener.  
  - Flexbox y Grid Layout para una maquetación moderna y responsive.  
  - Animaciones y transiciones para una experiencia de usuario fluida.  
- **JavaScript (ES6+):** Para toda la lógica de la aplicación, gestión del estado y manipulación del DOM.  

### Web APIs Utilizadas
- **Web Speech API** (Reconocimiento y Síntesis de voz)  
- **Web Audio API**  
- **Canvas API**  
- **localStorage**

---

## 🚀 Cómo Usarlo

No se requiere instalación ni dependencias.  
Simplemente clona este repositorio o descarga los archivos y abre el fichero `contador_personas.html` en tu navegador web preferido  
(se recomienda **Chrome** o **Edge** para una compatibilidad completa con la **Web Speech API**).
```
