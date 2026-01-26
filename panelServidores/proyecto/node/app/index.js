const express = require('express');
const { exec } = require('child_process');
const cors = require('cors'); 
const path = require('path');
const app = express();

app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

const PORT = 3000;
const VBOX_PATH = '/usr/bin/VBoxManage';

const ejecutar = (comando) => {
    return new Promise((resolve) => {
        exec(comando, (error, stdout, stderr) => {
            if (error) console.warn(`⚠️ Aviso VBox: ${stderr}`);
            resolve(stdout ? stdout.trim() : '');
        });
    });
};

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));

app.get('/api/servers', async (req, res) => {
    try {
        const listaRaw = await ejecutar(`${VBOX_PATH} list vms`);
        const runningRaw = await ejecutar(`${VBOX_PATH} list runningvms`);

        if (!listaRaw) return res.json([]);
        const lineas = listaRaw.split('\n').filter(line => line.trim() !== '');

        const servidores = await Promise.all(lineas.map(async (line) => {
            const match = line.match(/"(.*?)"/);
            const nombre = match ? match[1] : 'Desconocido';
            let estaEncendida = runningRaw.includes(`"${nombre}"`);

            let ramTotalReal = 1024;
            let estadoReal = estaEncendida ? 'running' : 'stopped';

            try {
                const info = await ejecutar(`${VBOX_PATH} showvminfo "${nombre}" --machinereadable`);
                
                // 1. RAM
                const ramMatch = info.match(/memory=(\d+)/); 
                if (ramMatch) ramTotalReal = parseInt(ramMatch[1]);

                // 2. DETECTAR SI ESTÁ PAUSADA
                const stateMatch = info.match(/VMState="(\w+)"/);
                if (stateMatch && stateMatch[1] === 'paused') {
                    estadoReal = 'paused';
                }
            } catch (e) {}

            // 3. IP (CORREGIDO PARA TU FORMATO)
            let ipAddress = "---";
            if (estaEncendida) {
                try {
                    const props = await ejecutar(`${VBOX_PATH} guestproperty enumerate "${nombre}"`);
                    
                    // CORRECCIÓN AQUÍ:
                    // Tu VirtualBox devuelve: .../IP = '192.168.X.X'
                    // Usamos una Regex que busca el signo '=' y las comillas simples "'"
                    const ipMatch = props.match(/Net\/\d+\/V4\/IP\s*=\s*'([\d\.]+)'/);
                    
                    if (ipMatch && ipMatch[1]) {
                        ipAddress = ipMatch[1];
                    }
                } catch (e) {}
            }

            return {
                id: nombre,
                nombre: nombre,
                estado: estadoReal,
                cpu: estadoReal === 'running' ? Math.floor(Math.random() * 50) + 10 : 0, 
                ramTotal: ramTotalReal,
                ramUso: estadoReal === 'running' ? Math.floor(ramTotalReal * (0.3 + Math.random() * 0.3)) : 0,
                ip: ipAddress 
            };
        }));

        res.json(servidores);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Error VBox' });
    }
});

// --- ACCIONES ---

app.post('/api/start/:id', async (req, res) => {
    console.log(`🚀 START: ${req.params.id}`);
    await ejecutar(`${VBOX_PATH} startvm "${req.params.id}" --type gui`);
    res.json({ status: 'ok' });
});

app.post('/api/stop/:id', async (req, res) => {
    console.log(`🛑 STOP: ${req.params.id}`);
    await ejecutar(`${VBOX_PATH} controlvm "${req.params.id}" poweroff`);
    res.json({ status: 'ok' });
});

app.post('/api/pause/:id', async (req, res) => {
    console.log(`⏸️ PAUSE: ${req.params.id}`);
    await ejecutar(`${VBOX_PATH} controlvm "${req.params.id}" pause`);
    res.json({ status: 'ok' });
});

app.post('/api/resume/:id', async (req, res) => {
    console.log(`▶️ RESUME: ${req.params.id}`);
    await ejecutar(`${VBOX_PATH} controlvm "${req.params.id}" resume`);
    res.json({ status: 'ok' });
});

app.post('/api/save/:id', async (req, res) => {
    console.log(`💾 SAVE: ${req.params.id}`);
    await ejecutar(`${VBOX_PATH} controlvm "${req.params.id}" savestate`);
    res.json({ status: 'ok' });
});

// --- SNAPSHOTS (YA INTEGRADO) ---
app.post('/api/snapshot/take/:id', async (req, res) => {
    console.log(`📸 FOTO: ${req.params.id}`);
    await ejecutar(`${VBOX_PATH} snapshot "${req.params.id}" take "Backup_Web" --live`);
    res.json({ status: 'ok' });
});

app.listen(PORT, () => {
    console.log(`🤖 Servidor listo: http://localhost:${PORT}`);
    exec(`xdg-open http://localhost:${PORT}`, (error) => {});
});