# 🚀 Nexus Control Center

**Nexus Control Center** es un panel de control web moderno y ligero diseñado para gestionar máquinas virtuales de **VirtualBox** a través de una interfaz visual intuitiva.

Optimizado para entornos Linux (Ubuntu/Debian), esta herramienta permite monitorizar, controlar y administrar tu infraestructura virtual sin necesidad de tocar la terminal. Es ideal para estudiantes, administradores de sistemas y entornos educativos donde se requiere portabilidad y facilidad de uso.

---

## ✨ Características Principales

* **📊 Monitorización en Tiempo Real:** Visualización gráfica del consumo de CPU (simulado) y uso de RAM.
* **🔌 Detección Inteligente de IP:** Muestra la dirección IP real de la máquina virtual (requiere *Guest Additions*).
* **📸 Sistema de Snapshots:** Crea copias de seguridad instantáneas del estado actual con un solo clic.
* **💻 Modo Portable:** Detecta automáticamente la ubicación del proyecto (ideal para ejecutar desde USB sin instalaciones complejas).
* **🚀 Acceso Rápido:** Incluye un generador automático de iconos de escritorio.

### 🎮 Control de Energía
* 🟢 **Iniciar / Apagar:** Gestión básica de encendido y apagado ACPI.
* ⏸️ **Pausar / Reanudar:** Congela el estado de la máquina en RAM y la recupera instantáneamente.
* 💾 **Hibernar (Guardar Estado):** Guarda la sesión en disco para continuar después, incluso tras reiniciar el PC host.

---

## 🛠️ Requisitos del Sistema

* **Sistema Operativo:** Linux (Probado en Ubuntu 22.04 / 24.04).
* **Virtualización:** Oracle VirtualBox instalado (con *Extension Pack* recomendado).
* **Entorno:** Node.js y NPM (El proyecto incluye scripts para usar una versión portable si existe en la carpeta `/node`).

---

## ⚙️ Guía de Instalación y Uso

### 1. Preparación del Entorno
Si es la primera vez que configuras el equipo y no usas la versión portable en USB, asegúrate de tener las herramientas base instaladas:

```bash
sudo apt update
sudo apt install virtualbox virtualbox-ext-pack nodejs npm
2. Instalación del Proyecto
Clona el repositorio o descarga la carpeta del proyecto.
Abre una terminal en la carpeta app/.
Ejecuta el script maestro. Este script instalará automáticamente las dependencias necesarias (express, cors) la primera vez:

bash
cd app
bash iniciar.sh
Nota: El navegador se abrirá automáticamente en http://localhost:3000.

3. Crear Acceso Directo (Escritorio)
Para ejecutar la aplicación sin abrir la terminal cada vez:

Ejecuta el script crear_icono.sh (doble clic o desde terminal).

Aparecerá un icono en tu escritorio llamado Nexus Control.

⚠️ Importante: Si el icono aparece gris o con una cruz, haz clic derecho sobre él y selecciona "Permitir Lanzar" (Allow Launching).

⚠️ Configuración Crítica: Ver la IP
Para que el panel muestre la IP (192.168.x.x) en lugar de ---, es obligatorio instalar las Guest Additions dentro de cada máquina virtual.

Opción A: En Ubuntu Server (Terminal)
Inicia la VM.

En el menú de la ventana de VirtualBox: Dispositivos > Insertar imagen de CD de las Guest Additions.

Ejecuta en la terminal de la VM:

bash
# 1. Instalar herramientas de compilación
sudo apt update && sudo apt install -y build-essential dkms linux-headers-$(uname -r)

# 2. Montar e instalar
sudo mkdir -p /mnt/cdrom
sudo mount /dev/cdrom /mnt/cdrom
sudo sh /mnt/cdrom/VBoxLinuxAdditions.run

# 3. Reiniciar
sudo reboot
Opción B: En Windows
En el menú de la ventana de VirtualBox: Dispositivos > Insertar imagen de CD...

Dentro de la VM, ve a "Este Equipo", abre la unidad de CD y ejecuta VBoxWindowsAdditions.exe.

Sigue el instalador (Next > Next > Install) y reinicia.

📂 Estructura del Proyecto
text
/proyecto
├── app/
│   ├── index.js          # Backend (API Node.js + Express)
│   ├── index.html        # Frontend (Interfaz Web)
│   ├── iniciar.sh        # Script maestro de arranque e instalación
│   ├── crear_icono.sh    # Generador de acceso directo .desktop
│   └── package.json      # Definición de dependencias
└── node/                 # (Opcional) Binarios de Node.js para modo portable
❓ Solución de Problemas (FAQ)
Problema	Causa Probable	Solución
Botones Pausa/Guardar no funcionan	La VM está apagada.	Enciende la máquina primero. Solo se puede pausar/guardar una máquina en ejecución ("Running").
IP mostrada como "---"	Guest Additions faltantes.	Sigue los pasos de la sección "Configuración Crítica" arriba.
Error "Node not found"	Node.js no instalado.	Instala node (sudo apt install nodejs) o verifica la ruta en iniciar.sh.
El navegador no se abre	Puerto 3000 ocupado.	Cierra otros procesos de Node o abre manualmente http://localhost:3000.
Desarrollado para Proyecto Escolar de Administración de Sistemas.