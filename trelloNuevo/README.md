# Pamelo 🟩

Pamelo es una **app web para la gestión visual de tareas en equipo**, inspirada en Trello, desarrollada con **HTML, CSS, JavaScript vanilla y Firebase**.  
Está pensada como proyecto de **curso/formación**, para aprender a construir una aplicación real de tablero Kanban con backend en la nube.

---

## Índice

- [Descripción](#descripción)
- [Características](#características)
- [Demo / Capturas](#demo--capturas)
- [Tecnologías utilizadas](#tecnologías-utilizadas)
- [Arquitectura de la app](#arquitectura-de-la-app)
- [Requisitos previos](#requisitos-previos)
- [Instalación y puesta en marcha](#instalación-y-puesta-en-marcha)
- [Estructura del proyecto](#estructura-del-proyecto)
- [Flujo básico de uso](#flujo-básico-de-uso)
- [Posibles mejoras](#posibles-mejoras)
- [Licencia](#licencia)

---

## Descripción

Pamelo permite organizar trabajo en **tableros**, **listas** y **tarjetas**, facilitando la visualización del estado de las tareas de un equipo.  
El objetivo principal es **aprender**:

- Cómo estructurar una app tipo Trello.
- Cómo integrar una app web con **Firebase** (Auth, Firestore, Storage, etc. según lo que uses).
- Buenas prácticas básicas de organización de código frontend.

---

## Características

Dependiendo de lo que hayas implementado, puedes adaptar esta lista:

- Creación y gestión de **tableros**.
- Listas tipo **“Por hacer / En progreso / Hecho”**.
- **Tarjetas de tarea** con:
  - Título y descripción.
  - Etiquetas de color.
  - Fecha de vencimiento.
  - Checklists.
  - Archivar/restaurar tarjetas.
- Arrastrar y soltar (drag & drop) de tarjetas entre listas.
- Autenticación de usuarios con **Firebase Auth** (email/contraseña, Google, etc. si aplica).
- Persistencia de datos en **Firebase Firestore**.
- Interfaz responsive básica.

Ajusta o borra lo que no uses.

---

## Demo / Capturas

> Aquí puedes añadir:
> - URL de demo desplegada (Firebase Hosting, Vercel, etc.).
> - Imágenes o GIFs del tablero en funcionamiento.


---

## Tecnologías utilizadas

- HTML5
- CSS3 / Tailwind CSS (si lo usas)
- JavaScript (vanilla)
- Firebase:
  - Firebase Auth
  - Firestore
  - Firebase Storage (si manejas archivos)
  - Firebase Hosting (si la app está desplegada)

---

## Arquitectura de la app

A alto nivel:

- **Frontend**: SPA ligera en HTML + JS, que maneja:
  - Render de tableros, listas y tarjetas.
  - Eventos de usuario (click, drag & drop, formularios).
- **Backend as a Service (BaaS)**: Firebase:
  - Almacena usuarios, tableros, listas y tarjetas.
  - Gestiona autenticación y reglas de seguridad.
- Comunicación mediante **SDK oficial de Firebase** en el cliente.

---

## Requisitos previos

- Navegador web moderno.
- Cuenta de Google para crear un proyecto en Firebase.
- Node.js y npm (solo si usas herramientas de build o Firebase CLI).

---

## Instalación y puesta en marcha

1. **Clonar el repositorio**


2. **Crear proyecto en Firebase**

- Entra a [https://console.firebase.google.com](https://console.firebase.google.com).
- Crea un nuevo proyecto.
- Añade una app **Web** y copia la configuración de Firebase (apiKey, authDomain, etc.).

3. **Configurar Firebase en la app**

- Localiza tu archivo de configuración (por ejemplo `firebase-config.js` o dentro de `app.js`).
- Pega allí tu objeto de configuración proporcionado por Firebase.

4. **Configurar Firestore y Auth**

- Activa **Firestore Database** en modo de prueba (solo para desarrollo).
- Activa los métodos de **inicio de sesión** que vayas a usar (por ejemplo, Email/Password).

5. **Levantar la app**

- Abre `index.html` directamente en el navegador  
  o
- Usa una extensión tipo “Live Server” en VS Code.

6. (Opcional) **Desplegar con Firebase Hosting**


- `index.html`: Entrada principal de la app.
- `styles/`: Hojas de estilo.
- `js/app.js`: Inicialización global y lógica principal.
- `js/auth.js`: Manejo de autenticación con Firebase.
- `js/board.js`: Lógica de tableros, listas y tarjetas.
- `js/firebase-config.js`: Configuración de Firebase del proyecto.

---

## Flujo básico de uso

1. El usuario se **registra o inicia sesión**.
2. Crea o abre un **tablero**.
3. Añade **listas** (columnas).
4. Crea **tarjetas** dentro de cada lista.
5. Arrastra tarjetas entre listas para cambiar su estado.
6. Opcionalmente:
   - Edita detalles de la tarea.
   - Marca checklist.
   - Archiva/restaura tarjetas.

---

## Posibles mejoras

Ideas para extender el proyecto en un contexto de curso:

- Comentarios dentro de las tarjetas.
- Colaboración en tiempo real usando listeners de Firestore.
- Filtros y búsqueda de tarjetas.
- Notificaciones por email.
- Mejoras de accesibilidad y atajos de teclado.
- Tests unitarios / de integración.

---

## Licencia

Este proyecto se publica bajo la licencia que prefieras (por ejemplo, MIT).  
Actualiza esta sección con el texto de licencia correspondiente.

---

