#!/bin/bash

# 1. Detectar dónde estamos ahora mismo
DIR_ACTUAL="$(cd "$(dirname "$0")" && pwd)"
RUTA_ICONO="$HOME/Desktop/NexusControl.desktop"

# Si la carpeta Desktop no existe (algunos Linux usan "Escritorio")
if [ ! -d "$HOME/Desktop" ]; then
    RUTA_ICONO="$HOME/Escritorio/NexusControl.desktop"
fi

echo "📍 Detectada ruta del proyecto: $DIR_ACTUAL"
echo "🎨 Creando icono en: $RUTA_ICONO"

# 2. Generar el archivo .desktop
# Usamos 'cat' para escribir el archivo de texto con las rutas exactas
cat > "$RUTA_ICONO" << EOF
[Desktop Entry]
Version=1.0
Type=Application
Name=Nexus Control
Comment=Controlador de Servidores VirtualBox
Exec=bash "$DIR_ACTUAL/iniciar.sh"
Icon=utilities-system-monitor
Path=$DIR_ACTUAL
Terminal=true
Categories=Development;
StartupNotify=true
EOF

# 3. Dar permisos al icono del escritorio
chmod +x "$RUTA_ICONO"

echo "------------------------------------------------"
echo "✅ ¡HECHO! Mira tu Escritorio."
echo "Ahora tienes un icono llamado 'Nexus Control'."
echo "Solo tienes que hacerle DOBLE CLICK."
echo "------------------------------------------------"