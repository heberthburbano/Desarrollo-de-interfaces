#!/bin/bash

# 1. Obtener la ruta ABSOLUTA de donde está este script
# Esto convierte "." en "/home/usuario/Escritorio/proyecto/app"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

# 2. Calcular la ruta ABSOLUTA de la carpeta Node
# Buscamos la carpeta 'node' al lado de 'app'
NODE_HOME="$SCRIPT_DIR/../node"
NODE_BIN="$NODE_HOME/bin"

echo "📍 Ruta del proyecto: $SCRIPT_DIR"
echo "📍 Ruta de Node detectada: $NODE_BIN"

# 3. Comprobar si existe realmente antes de seguir
if [ ! -f "$NODE_BIN/node" ]; then
    echo "❌ ERROR: No encuentro el archivo 'node' en:"
    echo "$NODE_BIN"
    echo "Asegúrate de que la carpeta descomprimida se llama 'node' y está junto a 'app'."
    exit 1
fi

# 4. Reparar permisos (Usando rutas absolutas)
echo "🔧 Asegurando permisos..."
chmod +x "$NODE_BIN/node"
chmod +x "$NODE_BIN/npm"
chmod +x "$NODE_BIN/npx"

# 5. Exportar al PATH (El paso mágico)
export PATH="$NODE_BIN:$PATH"

# 6. Verificación final
echo "🔍 Comprobando versión..."
VERSION=$(node -v)
if [ $? -eq 0 ]; then
    echo "✅ Node funcionando: $VERSION"
else
    echo "❌ Node sigue sin responder. Intenta ejecutar: $NODE_BIN/node index.js"
    exit 1
fi

# 7. Instalar dependencias si faltan
if [ ! -d "$SCRIPT_DIR/node_modules" ]; then
    echo "📦 Instalando librerías..."
    cd "$SCRIPT_DIR"
    npm install express cors
fi

# 8. Arrancar
echo "---------------------------------------------------"
echo "🚀 NEXUS CONTROL CENTER INICIADO"
echo "👉 Abre: http://localhost:3000"
echo "---------------------------------------------------"

cd "$SCRIPT_DIR"
node index.js