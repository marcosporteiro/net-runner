const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const statusSpan = document.getElementById('connection-status');
const playerNameSpan = document.getElementById('player-name');
const playerColorIndicator = document.getElementById('player-color-indicator');
const playerHpSpan = document.getElementById('player-hp');
const playerShieldSpan = document.getElementById('player-shield');
const playerLevelSpan = document.getElementById('player-level');
const playerXpSpan = document.getElementById('player-xp');
const playerCopperSpan = document.getElementById('player-copper');
const playerSilverSpan = document.getElementById('player-silver');
const playerGoldSpan = document.getElementById('player-gold');
const playerWeaponSpan = document.getElementById('player-weapon');
const playerSpeedSpan = document.getElementById('player-speed');
const playerAccelSpan = document.getElementById('player-accel');
const latencySpan = document.getElementById('latency');
const fpsSpan = document.getElementById('fps');
const logsDiv = document.getElementById('logs');
const playerListDiv = document.getElementById('player-list');
const chatInput = document.getElementById('chat-input');
const tutorialPanel = document.getElementById('tutorial-panel');
const themeSelector = document.getElementById('theme-selector');
const minimapCanvas = document.getElementById('minimapCanvas');
const minimapCtx = minimapCanvas ? minimapCanvas.getContext('2d') : null;

let frameCount = 0;
let lastFpsUpdate = Date.now();
let lastMoveTime = Date.now();
let inactivityTime = 0;

const CELL_SIZE = 24;
const WORLD_WIDTH = 500;
const WORLD_HEIGHT = 500;

let socket = null;
let gameState = { objects: [] };
let myPlayerId = null;
let myPlayer = null;
let lastMessageTime = 0;
const keysDown = {};
let particles = [];
let scannerEffects = [];
let scannedEntities = []; // Almacena info de escaneo: { id, label, distance, startTime }
let isScannerActive = false;
let lastScannerToggleTime = 0;
const SCANNER_COOLDOWN = 1000; // 1 segundo de cooldown
const AU_IN_CELLS = 10;

// Sistema de Cámara y Zoom
let cameraZoom = 1.0;
let targetZoom = 1.0;
let mouseX = window.innerWidth / 2;
let mouseY = window.innerHeight / 2;
const MAX_ZOOM = 3.0;
const MIN_ZOOM = 0.4;
const MOUSE_PAN_FACTOR = 0.04;

// Sistema de Estrellas Decorativas
const stars = [];
for (let i = 0; i < 8000; i++) {
    const isWhite = Math.random() < 0.9;
    stars.push({
        x: Math.random() * WORLD_WIDTH,
        y: Math.random() * WORLD_HEIGHT,
        size: Math.random() * 2 + 1.5,
        color: isWhite ? '#ffffff' : ['#58a6ff', '#ffd700', '#bc8cff'][Math.floor(Math.random() * 3)],
        symbol: ['*', '.', '·', '✧'][Math.floor(Math.random() * 4)],
        glow: Math.random() * 30 + 20,
        phase: Math.random() * Math.PI * 2,
        speed: Math.random() * 0.15 + 0.05
    });
}

const lightCanvas = document.createElement('canvas');
const lightCtx = lightCanvas.getContext('2d');
const starLightCanvas = document.createElement('canvas');
const starLightCtx = starLightCanvas.getContext('2d');
const LIGHT_SCALE = 0.5;

const bgCanvas = document.createElement('canvas');
const bgCtx = bgCanvas.getContext('2d');
const spriteCache = {};

class Particle {
    constructor(x, y, color, type, evx = 0, evy = 0, lifeFactor = 1.0) {
        this.x = x * CELL_SIZE + CELL_SIZE / 2;
        this.y = y * CELL_SIZE + CELL_SIZE / 2;
        this.color = color;
        this.size = Math.random() * 3 + 2;
        this.life = 1.0;
        
        // Explosiones duran más y son más rápidas
        const isBig = type === 'EXPLOSION' || type === 'DEBRIS';
        const isThruster = type === 'THRUSTER';
        const isTrail = type === 'PROJECTILE_TRAIL';
        
        if (isThruster || isTrail) {
            this.decay = (isThruster ? (Math.random() * 0.12 + 0.06) : (Math.random() * 0.08 + 0.04)) / lifeFactor;
            // Movimiento opuesto a la entidad
            const scatter = isThruster ? 2 : 0.5;
            this.vx = -evx * (isThruster ? 30 : 10) + (Math.random() - 0.5) * scatter;
            this.vy = -evy * (isThruster ? 30 : 10) + (Math.random() - 0.5) * scatter;
            this.symbol = isThruster ? (Math.random() < 0.5 ? '1' : '0') : (Math.random() < 0.5 ? '·' : '•');
            this.size = isThruster ? (Math.random() * 2 + 1) : (Math.random() * 1.5 + 0.5);
        } else {
            this.decay = (isBig ? (Math.random() * 0.03 + 0.01) : (Math.random() * 0.05 + 0.02)) / lifeFactor;
            const angle = Math.random() * Math.PI * 2;
            const speed = isBig ? (Math.random() * 8 + 2) : (Math.random() * 4 + 1);
            this.vx = Math.cos(angle) * speed;
            this.vy = Math.sin(angle) * speed;
            this.symbol = type === 'DEBRIS' ? '#' : (type === 'COLLECT' ? '✧' : (type === 'HIT' ? '×' : '•'));
        }
    }

    update() {
        this.x += this.vx;
        this.y += this.vy;
        this.life -= this.decay;
        this.vx *= 0.95;
        this.vy *= 0.95;
    }

    draw(ctx, offsetX, offsetY) {
        ctx.globalAlpha = this.life;
        ctx.fillStyle = this.color;
        ctx.font = `${(this.size + 4) * cameraZoom}px monospace`;
        ctx.fillText(this.symbol, this.x * cameraZoom + offsetX, this.y * cameraZoom + offsetY);
        ctx.globalAlpha = 1.0;
    }
}

function spawnParticles(x, y, color, type, count = 10, evx = 0, evy = 0, lifeFactor = 1.0) {
    for (let i = 0; i < count; i++) {
        particles.push(new Particle(x, y, color, type, evx, evy, lifeFactor));
    }
}

class ScannerEffect {
    constructor(x, y) {
        this.x = x * CELL_SIZE + CELL_SIZE / 2;
        this.y = y * CELL_SIZE + CELL_SIZE / 2;
        this.radius = 0;
        this.maxRadius = 30 * CELL_SIZE; // Rango del escáner reducido a la mitad (30 celdas)
        this.life = 1.0;
        this.speed = 40; // Aumentado para cubrir el rango mayor rápidamente
        this.particleDelay = 0;
    }
    update() {
        this.radius += this.speed;
        this.life -= 0.025;
        this.speed *= 0.97; // Desaceleración suave
        
        // Generar partículas de escaneo (0s y 1s) a lo largo del círculo
        if (this.life > 0.2) {
            this.particleDelay++;
            if (this.particleDelay % 1 === 0) {
                const particleCount = Math.floor(this.radius / 25) + 6;
                for (let i = 0; i < particleCount; i++) {
                    const angle = Math.random() * Math.PI * 2;
                    const px = (this.x + Math.cos(angle) * this.radius) / CELL_SIZE;
                    const py = (this.y + Math.sin(angle) * this.radius) / CELL_SIZE;
                    // Partículas de datos que se mueven un poco con el anillo
                    const evx = Math.cos(angle) * 0.15;
                    const evy = Math.sin(angle) * 0.15;
                    spawnParticles(px - 0.5, py - 0.5, COLORS.accent, 'THRUSTER', 1, -evx, -evy);
                }
            }
        }
    }
    draw(ctx, offsetX, offsetY) {
        ctx.save();
        
        // Anillo principal
        ctx.beginPath();
        ctx.arc(this.x * cameraZoom + offsetX, this.y * cameraZoom + offsetY, this.radius * cameraZoom, 0, Math.PI * 2);
        ctx.strokeStyle = COLORS.accent;
        ctx.globalAlpha = this.life * 0.8;
        ctx.lineWidth = 3 * cameraZoom;
        ctx.stroke();
        
        // Segundo anillo más fino para efecto de "escaneo de barrido"
        if (this.radius > 50) {
            ctx.beginPath();
            ctx.arc(this.x * cameraZoom + offsetX, this.y * cameraZoom + offsetY, (this.radius - 20) * cameraZoom, 0, Math.PI * 2);
            ctx.lineWidth = 1 * cameraZoom;
            ctx.globalAlpha = this.life * 0.4;
            ctx.stroke();
        }
        
        ctx.restore();
    }
}

let scannerStartTime = 0;
let scannerFadeFactor = 0; // 0 a 1 para manejar transiciones suaves
let lastScannerDeactivateTime = 0;
const SCANNER_FADE_DURATION = 500;
    
    function performScan() {
        if (!myPlayer) return;
        
        const now = Date.now();
        if (now - lastScannerToggleTime < SCANNER_COOLDOWN) return;
        lastScannerToggleTime = now;
        
        isScannerActive = !isScannerActive;
        
        if (isScannerActive) {
            scannerStartTime = now;
            scannerEffects.push(new ScannerEffect(myPlayer.position.x, myPlayer.position.y));
            sendInput('SCANNER_STATE', 'true');
            updateScannedEntities();
        } else {
            sendInput('SCANNER_STATE', 'false');
            lastScannerDeactivateTime = now;
            // No limpiamos scannedEntities inmediatamente para permitir el fade-out
        }
    }

function updateScannedEntities() {
    if (!myPlayer) return;
    // Si el scanner no está activo y ya terminó el fade-out, limpiamos
    if (!isScannerActive && Date.now() - lastScannerDeactivateTime > SCANNER_FADE_DURATION) {
        scannedEntities = [];
        return;
    }

    const now = Date.now();
    const currentScannedMap = new Map(scannedEntities.map(s => [s.id, s]));
    
    scannedEntities = gameState.objects
        .filter(obj => obj.id !== myPlayerId && obj.hp !== 0)
        .map(obj => {
            const dx = obj.position.x - myPlayer.position.x;
            const dy = obj.position.y - myPlayer.position.y;
            const distCells = Math.sqrt(dx * dx + dy * dy);
            
            let label = obj.name === 'METEORITE' ? 'Meteorite' : 
                        obj.name.includes('ORE') ? `Mineral (${obj.name.replace('_ORE', '')})` :
                        obj.name === 'NULL' ? 'Unknown Entity' :
                        obj.hp !== undefined ? `Vessel: ${obj.name}` : obj.name;

            const isEnemy = (obj.hp !== undefined && obj.id !== myPlayerId) || obj.name === 'SENTINEL' || obj.name === 'NULL';
            const existing = currentScannedMap.get(obj.id);

            return {
                id: obj.id,
                label: label,
                distance: (distCells / AU_IN_CELLS).toFixed(2),
                distRaw: distCells,
                isEnemy: isEnemy,
                startTime: existing ? existing.startTime : now
            };
        })
        .filter(res => res.distRaw < 30); // Rango del escáner reducido a la mitad
}

// Paleta de Temas
const THEMES = {
    GITHUB_DARK: {
        name: 'GITHUB_DARK',
        bg: '#0d1117',
        fg: '#c9d1d9',
        panelBg: 'rgba(13, 17, 23, 0.95)',
        border: '#30363d',
        accent: '#58a6ff',
        success: '#3fb950',
        danger: '#f85149',
        warning: '#d29922',
        muted: '#8b949e',
        grid: '#161b22'
    },
    NET_RUNNER: {
        name: 'NET_RUNNER',
        bg: '#010409',
        fg: '#c9d1d9',
        panelBg: 'rgba(1, 4, 9, 0.95)',
        border: '#30363d',
        accent: '#58a6ff',
        success: '#3fb950',
        danger: '#f85149',
        warning: '#d29922',
        muted: '#8b949e',
        grid: '#0d1117'
    }
};

let currentThemeId = localStorage.getItem('netrunner-theme') || 'NET_RUNNER';
let COLORS = THEMES[currentThemeId];

function applyTheme(themeId) {
    const theme = THEMES[themeId];
    if (!theme) return;
    
    currentThemeId = themeId;
    COLORS = theme;
    localStorage.setItem('netrunner-theme', themeId);
    
    // Actualizar variables CSS
    const root = document.documentElement;
    root.style.setProperty('--bg', theme.bg);
    root.style.setProperty('--fg', theme.fg);
    root.style.setProperty('--panel-bg', theme.panelBg);
    root.style.setProperty('--border', theme.border);
    root.style.setProperty('--accent', theme.accent);
    root.style.setProperty('--success', theme.success);
    root.style.setProperty('--danger', theme.danger);
    root.style.setProperty('--warning', theme.warning);
    root.style.setProperty('--muted', theme.muted);
    root.style.setProperty('--grid', theme.grid);
    
    if (themeSelector) themeSelector.textContent = theme.name;
    
    // Regenerar cachés
    initBackgroundCache();
    for (let key in spriteCache) delete spriteCache[key];
}

function initBackgroundCache() {
    // El caché de fondo ahora es dinámico para soportar mundos grandes
    // bgCanvas ya no se redimensiona al tamaño del mundo
    bgCanvas.width = 1;
    bgCanvas.height = 1;
    
    // Pre-renderizar luz de las estrellas (ahora se hará bajo demanda o de forma más eficiente)
    // starLightCanvas tampoco debe ser gigante. Lo limitamos al tamaño de pantalla.
    starLightCanvas.width = window.innerWidth * LIGHT_SCALE;
    starLightCanvas.height = window.innerHeight * LIGHT_SCALE;
}

function getSprite(symbol, color, glowRadius) {
    const key = `${symbol}_${color}_${glowRadius}`;
    if (spriteCache[key]) return spriteCache[key];
    
    const sCanvas = document.createElement('canvas');
    const size = CELL_SIZE * 2;
    sCanvas.width = size;
    sCanvas.height = size;
    const sCtx = sCanvas.getContext('2d');
    
    sCtx.shadowBlur = glowRadius;
    sCtx.shadowColor = color;
    sCtx.fillStyle = color;
    sCtx.font = `bold ${CELL_SIZE - 6}px monospace`;
    sCtx.textAlign = 'center';
    sCtx.textBaseline = 'middle';
    sCtx.fillText(symbol, size / 2, size / 2);
    
    spriteCache[key] = sCanvas;
    return sCanvas;
}

// Inicializar tema
applyTheme(currentThemeId);

function log(message) {
    const entry = document.createElement('div');
    entry.className = 'log-entry';
    
    // Parse color codes: [#HEX]Text
    const parts = message.split(/(\[#[0-9a-fA-F]{6}\])/);
    let currentSpan = null;
    
    entry.appendChild(document.createTextNode('> '));
    
    parts.forEach(part => {
        if (part.startsWith('[#') && part.endsWith(']')) {
            const color = part.substring(1, part.length - 1);
            currentSpan = document.createElement('span');
            currentSpan.style.color = color;
        } else if (part) {
            if (currentSpan) {
                currentSpan.textContent = part;
                entry.appendChild(currentSpan);
                currentSpan = null;
            } else {
                entry.appendChild(document.createTextNode(part));
            }
        }
    });

    logsDiv.appendChild(entry);
    logsDiv.scrollTop = logsDiv.scrollHeight;
    if (logsDiv.children.length > 50) {
        logsDiv.removeChild(logsDiv.firstChild);
    }
}

function resize() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    lightCanvas.width = canvas.width * LIGHT_SCALE;
    lightCanvas.height = canvas.height * LIGHT_SCALE;
    // También actualizar starLightCanvas
    starLightCanvas.width = canvas.width * LIGHT_SCALE;
    starLightCanvas.height = canvas.height * LIGHT_SCALE;
}

window.addEventListener('resize', resize);
resize();

// Listeners de Cámara
window.addEventListener('wheel', (e) => {
    // Solo zoom si no se está usando el chat
    if (document.activeElement === chatInput) return;
    
    if (e.deltaY < 0) {
        targetZoom = Math.min(MAX_ZOOM, targetZoom * 1.15);
    } else {
        targetZoom = Math.max(MIN_ZOOM, targetZoom / 1.15);
    }
}, { passive: true });

window.addEventListener('mousemove', (e) => {
    mouseX = e.clientX;
    mouseY = e.clientY;
});

window.addEventListener('mousedown', (e) => {
    // Solo disparar si no se está interactuando con elementos del HUD
    if (e.target.closest('.hud-panel')) return;
    
    if (myPlayer && !isScannerActive) {
        // Calcular coordenadas del mundo desde coordenadas de pantalla
        const panX = (mouseX - canvas.width / 2) * MOUSE_PAN_FACTOR;
        const panY = (mouseY - canvas.height / 2) * MOUSE_PAN_FACTOR;
        
        const worldX = (e.clientX - canvas.width / 2 + panX) / (CELL_SIZE * cameraZoom) + myPlayer.position.x + 0.5;
        const worldY = (e.clientY - canvas.height / 2 + panY) / (CELL_SIZE * cameraZoom) + myPlayer.position.y + 0.5;
        
        sendInput('SHOOT', `${worldX.toFixed(2)},${worldY.toFixed(2)}`);
    }
});

function normalize(data) {
    if (!data || typeof data !== 'object') return data;
    
    const mapping = {
        'o': 'objects', 'ev': 'events', 'ef': 'effects',
        'i': 'id', 'p': 'position', 's': 'symbol', 'c': 'color', 'n': 'name',
        'h': 'hp', 'sh': 'shield', 'co': 'copper', 'si': 'silver', 'go': 'gold',
        'l': 'level', 'e': 'exp', 'w': 'weapon', 't': 'type',
        'pi': 'playerId', 'pn': 'playerName', 'd': 'payload'
    };

    for (const key in mapping) {
        if (data[key] !== undefined) {
            data[mapping[key]] = data[key];
        }
    }

    if (data.objects) data.objects = data.objects.map(normalize);
    if (data.effects) data.effects = data.effects.map(normalize);
    if (data.weapon) data.weapon = normalize(data.weapon);
    
    return data;
}

function connect() {
    let wsUrl = window.CONFIG && window.CONFIG.WS_URL;
    
    // Si no hay configuración o sigue teniendo el placeholder, intentar autodetección
    if (!wsUrl || wsUrl === 'WS_URL_PLACEHOLDER') {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        let host = window.location.host;

        if (!host || host.includes('localhost') || host.includes('127.0.0.1')) {
            if (!host.includes(':8080')) {
                const hostname = window.location.hostname || 'localhost';
                host = `${hostname}:8080`;
            }
        }
        wsUrl = `${protocol}//${host}/game`;
    }

    log(`Initializing uplink to ${wsUrl}...`);
    socket = new WebSocket(wsUrl);
    socket.binaryType = 'arraybuffer';

    socket.onopen = () => {
        statusSpan.textContent = 'CONNECTED';
        statusSpan.className = 'status-tag connected';
        log('Uplink established.');
    };

    socket.onmessage = (event) => {
        let data;
        if (event.data instanceof ArrayBuffer) {
            data = MessagePack.decode(new Uint8Array(event.data));
        } else {
            data = JSON.parse(event.data);
        }
        
        // Normalizar keys reducidas
        data = normalize(data);
        
        if (data.type === 'WELCOME') {
            myPlayerId = data.playerId;
            playerNameSpan.textContent = data.playerName;
            log(`Welcome, agent [#58a6ff]${data.playerName}`);
            return;
        }

        // Medir latencia básica
        const now = Date.now();
        if (lastMessageTime) {
            latencySpan.textContent = `${now - lastMessageTime}ms`;
        }
        lastMessageTime = now;

        gameState = data;
        
        // Procesar eventos
        if (gameState.events && gameState.events.length > 0) {
            gameState.events.forEach(e => log(e));
        }

        // Procesar efectos visuales
        if (gameState.effects && gameState.effects.length > 0) {
            gameState.effects.forEach(e => {
                let count = 12;
                let lifeFactor = 1.0;
                if (e.type === 'EXPLOSION') {
                    count = 60;
                    lifeFactor = 4.0; // Aumentado de 2.5
                } else if (e.type === 'DEBRIS') {
                    count = 40;
                    lifeFactor = 3.0; // Aumentado de 1.5
                } else if (e.type === 'HIT') {
                    count = 8;
                    lifeFactor = 2.0; // Añadido
                }
                spawnParticles(e.x, e.y, e.color, e.type, count, 0, 0, lifeFactor);
            });
        }

        // Buscar mi jugador para la cámara
        if (myPlayerId) {
            myPlayer = gameState.objects.find(obj => obj.id === myPlayerId);
            if (myPlayer) {
                playerNameSpan.textContent = myPlayer.name;
                playerColorIndicator.style.color = myPlayer.color;
                
                const hpBars = '|'.repeat(Math.max(0, myPlayer.hp));
                playerHpSpan.textContent = hpBars || 'REBOOTING...';
                // El HP en la UI siempre es rojo según el requerimiento
                playerHpSpan.className = 'danger';

                const shieldBars = '('.repeat(Math.max(0, myPlayer.shield));
                playerShieldSpan.textContent = shieldBars || 'EMPTY';

                if (playerLevelSpan) playerLevelSpan.textContent = myPlayer.level || 1;
                if (playerXpSpan) {
                    const expNeeded = (myPlayer.level || 1) * 500;
                    const xpPercent = Math.floor(((myPlayer.exp || 0) / expNeeded) * 100);
                    // Usar una barra de progreso visual con caracteres
                    const barSize = 10;
                    const filledSize = Math.floor((xpPercent / 100) * barSize);
                    const bar = '■'.repeat(filledSize) + '□'.repeat(barSize - filledSize);
                    playerXpSpan.textContent = `${bar} ${xpPercent}%`;
                }

                playerCopperSpan.textContent = myPlayer.copper;
                playerSilverSpan.textContent = myPlayer.silver;
                playerGoldSpan.textContent = myPlayer.gold;
                
                if (myPlayer.weapon) {
                    playerWeaponSpan.textContent = myPlayer.weapon.name;
                }

                // Actualizar Velocidad y Aceleración
                const speed = Math.sqrt(myPlayer.vx * myPlayer.vx + myPlayer.vy * myPlayer.vy);
                playerSpeedSpan.textContent = (speed * 100).toFixed(2); // Multiplicamos por 100 para que sea un número más legible
                
                // La aceleración base es 0.012, pero se reduce a la mitad con el scanner
                const currentAccel = myPlayer.scannerActive ? 0.006 : 0.012;
                playerAccelSpan.textContent = (currentAccel * 100).toFixed(2);

                // Actualizar STATUS UI según el estado del agente
                if (myPlayer.hp === 0) {
                    statusSpan.textContent = 'REBOOTING';
                    statusSpan.className = 'status-tag disconnected';
                } else {
                    statusSpan.textContent = 'OPERATIONAL';
                    statusSpan.className = 'status-tag connected';
                }
            }
        }
        
        updatePlayerList();
    };

    socket.onclose = () => {
        statusSpan.textContent = 'DISCONNECTED';
        statusSpan.className = 'status-tag disconnected';
        log('Uplink lost. Retrying...');
        setTimeout(connect, 3000);
    };

    socket.onerror = (error) => {
        console.error('WebSocket error:', error);
    };
}

function sendInput(type, payload) {
    if (socket && socket.readyState === WebSocket.OPEN) {
        const msg = { t: type, d: payload };
        socket.send(MessagePack.encode(msg));
    }
}

let lastPlayerListJson = '';
function updatePlayerList() {
    const players = gameState.objects.filter(obj => obj.hp !== undefined);
    
    if (myPlayer) {
        players.forEach(p => {
            p._distance = Math.sqrt(
                Math.pow(p.position.x - myPlayer.position.x, 2) + 
                Math.pow(p.position.y - myPlayer.position.y, 2)
            );
        });
        // Filtrar y ordenar: Mi jugador siempre primero, luego por distancia
        players.sort((a, b) => {
            if (a.id === myPlayerId) return -1;
            if (b.id === myPlayerId) return 1;
            return a._distance - b._distance;
        });
        // Limitar a los 8 más cercanos (incluyéndome)
        if (players.length > 8) players.length = 8;
    } else {
        players.sort((a, b) => b.score - a.score);
        if (players.length > 8) players.length = 8;
    }
    
    // Solo actualizar el DOM si la lista cambió
    const currentJson = JSON.stringify(players.map(p => ({
        id: p.id, 
        score: p.score, 
        name: p.name, 
        color: p.color, 
        dist: p._distance ? p._distance.toFixed(1) : 0
    })));
    
    if (currentJson === lastPlayerListJson) return;
    lastPlayerListJson = currentJson;

    playerListDiv.innerHTML = '';
    players.forEach(p => {
        const entry = document.createElement('div');
        entry.className = 'player-entry';
        if (p.id === myPlayerId) entry.classList.add('accent');
        
        const distLabel = p._distance !== undefined ? `<span class="muted" style="font-size: 10px; margin-left: 8px;">${(p._distance / AU_IN_CELLS).toFixed(2)} AU</span>` : '';
        
        entry.innerHTML = `
            <div style="display: flex; align-items: center;">
                <span style="color: ${p.color}">${p.name}</span>
                ${distLabel}
            </div>
            <span class="accent">${p.score || 0}</span>
        `;
        playerListDiv.appendChild(entry);
    });
}

playerNameSpan.addEventListener('click', () => {
    const newName = prompt('Enter new agent name:', myPlayer ? myPlayer.name : '');
    if (newName && newName.trim()) {
        sendInput('CHANGE_NAME', newName.trim());
    }
});

playerColorIndicator.addEventListener('click', () => {
    sendInput('CHANGE_COLOR', '');
});

themeSelector.addEventListener('click', () => {
    const ids = Object.keys(THEMES);
    const currentIndex = ids.indexOf(currentThemeId);
    const nextIndex = (currentIndex + 1) % ids.length;
    applyTheme(ids[nextIndex]);
});

chatInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
        const msg = chatInput.value.trim();
        if (msg) {
            sendInput('CHAT', msg);
        }
        chatInput.value = '';
        chatInput.blur();
    }
    // Evitar que las teclas de movimiento afecten al juego mientras se escribe
    e.stopPropagation();
});

window.addEventListener('keydown', (e) => {
    // Si el chat está enfocado, no procesar movimientos
    if (document.activeElement === chatInput) return;

    const key = e.key.toLowerCase();
    if (keysDown[key]) return; // Evitar repetición por SO
    keysDown[key] = true;

    // Notificar al tutorial que hubo movimiento
    if (['w', 's', 'a', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(key)) {
        tutorialPanel.classList.add('transparent');
        inactivityTime = 0;
    }

    switch (key) {
        case 'w':
        case 'arrowup':
            sendInput('MOVE_START', 'UP');
            break;
        case 's':
        case 'arrowdown':
            sendInput('MOVE_START', 'DOWN');
            break;
        case 'a':
        case 'arrowleft':
            sendInput('MOVE_START', 'LEFT');
            break;
        case 'd':
        case 'arrowright':
            sendInput('MOVE_START', 'RIGHT');
            break;
        case ' ':
            e.preventDefault();
            if (!isScannerActive) sendInput('SHOOT', '');
            break;
        case 'f11':
            e.preventDefault();
            toggleFullscreen();
            break;
        case 't':
        case 'enter':
            e.preventDefault();
            chatInput.focus();
            break;
            case 'c':
            performScan();
            // Si el scanner se acaba de activar, disparar un pulso extra de partículas
            if (isScannerActive && myPlayer) {
                for (let i = 0; i < 20; i++) {
                    const angle = Math.random() * Math.PI * 2;
                    spawnParticles(myPlayer.position.x, myPlayer.position.y, COLORS.accent, 'THRUSTER', 1, Math.cos(angle) * 0.1, Math.sin(angle) * 0.1);
                }
            }
            break;
    }
});

window.addEventListener('keyup', (e) => {
    const key = e.key.toLowerCase();
    keysDown[key] = false;

    switch (key) {
        case 'w':
        case 'arrowup':
            sendInput('MOVE_STOP', 'UP');
            break;
        case 's':
        case 'arrowdown':
            sendInput('MOVE_STOP', 'DOWN');
            break;
        case 'a':
        case 'arrowleft':
            sendInput('MOVE_STOP', 'LEFT');
            break;
        case 'd':
        case 'arrowright':
            sendInput('MOVE_STOP', 'RIGHT');
            break;
    }
});

// Loop de inactividad para el tutorial
setInterval(() => {
    if (document.activeElement === chatInput) return;
    
    let moving = keysDown['w'] || keysDown['s'] || keysDown['a'] || keysDown['d'] || 
                 keysDown['arrowup'] || keysDown['arrowdown'] || keysDown['arrowleft'] || keysDown['arrowright'];

    if (!moving) {
        inactivityTime += 100;
        if (inactivityTime >= 3000) {
            tutorialPanel.classList.remove('transparent');
        }
    }
}, 100);

function toggleFullscreen() {
    if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen();
    } else {
        if (document.exitFullscreen) {
            document.exitFullscreen();
        }
    }
}

function render() {
    if (minimapCanvas) {
        minimapCanvas.width = minimapCanvas.clientWidth;
        minimapCanvas.height = minimapCanvas.clientHeight;
    }
    // 1. Fondo base
    ctx.fillStyle = COLORS.bg;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Centrar cámara en el jugador con Zoom y Mouse Pan
    let offsetX = 0;
    let offsetY = 0;

    // Suavizado de zoom
    cameraZoom += (targetZoom - cameraZoom) * 0.1;

    if (myPlayer) {
        const pWorldX = myPlayer.position.x * CELL_SIZE + CELL_SIZE / 2;
        const pWorldY = myPlayer.position.y * CELL_SIZE + CELL_SIZE / 2;
        
        const panX = (mouseX - canvas.width / 2) * MOUSE_PAN_FACTOR;
        const panY = (mouseY - canvas.height / 2) * MOUSE_PAN_FACTOR;

        // Efecto de flotación sutil (Floating/Bobbing effect)
        const time = Date.now() * 0.001;
        const bobX = Math.sin(time * 0.7) * 4;
        const bobY = Math.cos(time * 0.8) * 4;

        offsetX = canvas.width / 2 - pWorldX * cameraZoom - panX + bobX;
        offsetY = canvas.height / 2 - pWorldY * cameraZoom - panY + bobY;
    }

    // 2. Dibujar Cuadrícula Dinámica (Optimizado para mundos grandes)
    const scaledCellSize = CELL_SIZE * cameraZoom;

    // 2.0 Pintar celdas de meteoritos y ores
    ctx.globalAlpha = 0.15;
    gameState.objects.forEach(obj => {
        if (obj.name === 'METEORITE' || obj.name.includes('ORE')) {
            const x = obj.position.x * scaledCellSize + offsetX;
            const y = obj.position.y * scaledCellSize + offsetY;

            // Culling visual para el fondo de celda
            if (x < -scaledCellSize || x > canvas.width || y < -scaledCellSize || y > canvas.height) return;

            ctx.fillStyle = obj.color;
            ctx.fillRect(x, y, scaledCellSize, scaledCellSize);
        }
    });
    ctx.globalAlpha = 1.0;

    ctx.strokeStyle = COLORS.grid;
    ctx.lineWidth = 1;
    ctx.beginPath();
    
    const startX = Math.max(0, Math.floor(-offsetX / scaledCellSize));
    const endX = Math.min(WORLD_WIDTH, Math.ceil((canvas.width - offsetX) / scaledCellSize));
    const startY = Math.max(0, Math.floor(-offsetY / scaledCellSize));
    const endY = Math.min(WORLD_HEIGHT, Math.ceil((canvas.height - offsetY) / scaledCellSize));

    for (let x = startX; x <= endX; x++) {
        const px = x * scaledCellSize + offsetX;
        ctx.moveTo(px, Math.max(0, startY * scaledCellSize + offsetY));
        ctx.lineTo(px, Math.min(canvas.height, endY * scaledCellSize + offsetY));
    }
    for (let y = startY; y <= endY; y++) {
        const py = y * scaledCellSize + offsetY;
        ctx.moveTo(Math.max(0, startX * scaledCellSize + offsetX), py);
        ctx.lineTo(Math.min(canvas.width, endX * scaledCellSize + offsetX), py);
    }
    ctx.stroke();

    // Borde del mundo
    ctx.strokeStyle = COLORS.accent;
    ctx.lineWidth = 2;
    ctx.setLineDash([10 * cameraZoom, 5 * cameraZoom]);
    ctx.strokeRect(offsetX, offsetY, WORLD_WIDTH * scaledCellSize, WORLD_HEIGHT * scaledCellSize);
    ctx.setLineDash([]);

    // 2.1 Estrellas con parpadeo (Twinkle effect)
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    stars.forEach(s => {
        const x = s.x * CELL_SIZE * cameraZoom + offsetX;
        const y = s.y * CELL_SIZE * cameraZoom + offsetY;
        
        // Culling visual para estrellas (ajustado para zoom)
        const margin = 20 * cameraZoom;
        if (x < -margin || x > canvas.width + margin || y < -margin || y > canvas.height + margin) return;
        
        s.phase += s.speed;
        const twinkle = Math.sin(s.phase) * 0.2 + 0.8;
        
        ctx.globalAlpha = twinkle;
        ctx.fillStyle = s.color;
        ctx.font = `${(s.size + 3) * cameraZoom}px "Cascadia Code", "Courier New", Courier, monospace`;
        ctx.fillText(s.symbol, x, y);
    });
    ctx.globalAlpha = 1.0;

    // Configurar fuente para metadatos
    const statsFont = '11px "Cascadia Code", "Courier New", Courier, monospace';
    const defaultFont = `bold ${CELL_SIZE - 6}px "Cascadia Code", "Courier New", Courier, monospace`;

    // 3. Dibujar objetos (Players, Meteoritos, etc)
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    
    const now = Date.now();
    // Actualizar datos de escaneo en tiempo real si el scanner está activo o en fade-out
    const isFadingOut = !isScannerActive && (now - lastScannerDeactivateTime < SCANNER_FADE_DURATION);
    if (isScannerActive || isFadingOut) {
        updateScannedEntities();
    } else {
        scannedEntities = [];
    }

    gameState.objects.forEach(obj => {
        // Omitir jugadores que están reiniciando
        if (obj.hp === 0) return;

        const x = obj.position.x * CELL_SIZE * cameraZoom + offsetX + (CELL_SIZE * cameraZoom) / 2;
        const y = obj.position.y * CELL_SIZE * cameraZoom + offsetY + (CELL_SIZE * cameraZoom) / 2;

        // Culling visual
        const cullMargin = CELL_SIZE * cameraZoom;
        if (x < -cullMargin || x > canvas.width + cullMargin || y < -cullMargin || y > canvas.height + cullMargin) {
            return;
        }

        // Detectar si está siendo escaneado
        const scanData = scannedEntities.find(s => s.id === obj.id);
        const isScanned = !!scanData;
        const scanElapsed = isScanned ? now - scanData.startTime : 0;

        // Renderizado optimizado vía Sprite Cache
        let glow = 5;
        if (obj.id === myPlayerId) glow = 12;
        else if (obj.name === 'NULL') glow = 25;
        else if (obj.name === 'METEORITE') glow = 0; 
        else if (obj.name.includes('ORE')) glow = 2; 
        else if (obj.name === 'PROJECTILE' || obj.name === 'DATA_NODE') glow = 8;

        // Delinear si está siendo escaneado (gradual)
        const sprite = getSprite(obj.symbol, obj.color, glow);
        let sSize = CELL_SIZE * 2 * cameraZoom;
        if (obj.name === 'NULL') sSize *= 1.6;
        ctx.drawImage(sprite, x - sSize / 2, y - sSize / 2, sSize, sSize);

        // Thruster particles (1s and 0s)
        if (obj.hp !== undefined && obj.vx !== undefined && obj.vy !== undefined) {
            const speedSq = obj.vx * obj.vx + obj.vy * obj.vy;
            if (speedSq > 0.0001 && frameCount % 2 === 0) {
                spawnParticles(obj.position.x, obj.position.y, obj.color, 'THRUSTER', 1, obj.vx, obj.vy, 4.0);
            }
        }

        // Projectile trail particles
        if (obj.name === 'PROJECTILE' && obj.vx !== undefined && obj.vy !== undefined) {
            if (frameCount % 1 === 0) {
                spawnParticles(obj.position.x, obj.position.y, obj.color, 'PROJECTILE_TRAIL', 1, obj.vx * 0.1, obj.vy * 0.1, 3.0);
            }
        }

        // Elementos dinámicos (Nombre y barras)
        if (obj.hp !== undefined) {
            ctx.font = `${11 * Math.max(0.8, cameraZoom)}px "Cascadia Code", "Courier New", Courier, monospace`;
            ctx.fillStyle = obj.color;
            const label = obj.id === myPlayerId ? `YOU (${obj.score})` : `${obj.name} (${obj.score})`;
            ctx.fillText(label, x, y - (CELL_SIZE * cameraZoom) / 2 - 8 * cameraZoom);
            
            const barWidth = 24 * cameraZoom;
            const barHeight = 2 * Math.max(0.5, cameraZoom);
            const gap = 2 * cameraZoom;
            let currentY = y + (CELL_SIZE * cameraZoom) / 2 + 4 * cameraZoom;

            // Barra de Escudo
            ctx.fillStyle = COLORS.grid;
            ctx.fillRect(x - barWidth/2, currentY, barWidth, barHeight);
            if (obj.shield > 0) {
                ctx.fillStyle = '#bc8cff';
                const maxShield = obj.maxShield || 3;
                ctx.fillRect(x - barWidth/2, currentY, (obj.shield / maxShield) * barWidth, barHeight);
            }
            
            currentY += barHeight + gap;

            // Barra de HP
            ctx.fillStyle = COLORS.grid;
            ctx.fillRect(x - barWidth/2, currentY, barWidth, barHeight);
            ctx.fillStyle = obj.id === myPlayerId ? COLORS.success : COLORS.danger;
            const maxHp = obj.maxHp || 5;
            ctx.fillRect(x - barWidth/2, currentY, (obj.hp / maxHp) * barWidth, barHeight);
        }
    });

    // 4. Actualizar y dibujar partículas
    particles = particles.filter(p => p.life > 0);
    particles.forEach(p => p.update());

    // 4.1 Actualizar y dibujar efectos de escáner
    scannerEffects = scannerEffects.filter(s => s.life > 0);
    scannerEffects.forEach(s => {
        s.update();
        s.draw(ctx, offsetX, offsetY);
    });

    // 5. Sistema de Iluminación optimizado (Niebla de Guerra)
    if (myPlayer && myPlayer.hp > 0) {
        lightCtx.save();
        lightCtx.scale(LIGHT_SCALE, LIGHT_SCALE);
        
        lightCtx.clearRect(0, 0, canvas.width, canvas.height);
        lightCtx.fillStyle = COLORS.bg;
        lightCtx.fillRect(0, 0, canvas.width, canvas.height);

        lightCtx.globalCompositeOperation = 'destination-out';

        // 1. Luz de las Estrellas (Dinámica para soportar mapas grandes)
        stars.forEach(s => {
            const x = s.x * CELL_SIZE * cameraZoom + offsetX;
            const y = s.y * CELL_SIZE * cameraZoom + offsetY;
            const sRad = s.glow * 2.5 * cameraZoom;
            
            // Culling para luces de estrellas
            if (x < -sRad || x > canvas.width + sRad || y < -sRad || y > canvas.height + sRad) return;

            const sGrad = lightCtx.createRadialGradient(x, y, 0, x, y, sRad);
            sGrad.addColorStop(0, 'rgba(0,0,0,0.6)'); 
            sGrad.addColorStop(1, 'rgba(0,0,0,0)');
            lightCtx.fillStyle = sGrad;
            lightCtx.beginPath();
            lightCtx.arc(x, y, sRad, 0, Math.PI * 2);
            lightCtx.fill();
        });

        // 2. Luz de Visión del Jugador (Revela el entorno con claridad)
        const pX = myPlayer.position.x * CELL_SIZE * cameraZoom + offsetX + (CELL_SIZE * cameraZoom) / 2;
        const pY = myPlayer.position.y * CELL_SIZE * cameraZoom + offsetY + (CELL_SIZE * cameraZoom) / 2;
        const viewRad = 150 * cameraZoom; // Visión cercana escalada

        const viewGrad = lightCtx.createRadialGradient(pX, pY, 10 * cameraZoom, pX, pY, viewRad);
        viewGrad.addColorStop(0, 'rgba(0,0,0,1.0)'); // Revelación total en el centro
        viewGrad.addColorStop(0.5, 'rgba(0,0,0,0.5)');
        viewGrad.addColorStop(1, 'rgba(0,0,0,0)');

        lightCtx.fillStyle = viewGrad;
        lightCtx.beginPath();
        lightCtx.arc(pX, pY, viewRad, 0, Math.PI * 2);
        lightCtx.fill();

        // 3. Luces Emisivas de Entidades (Revelan según su brillo propio)
        gameState.objects.forEach(obj => {
            const ox = obj.position.x * CELL_SIZE * cameraZoom + offsetX + (CELL_SIZE * cameraZoom) / 2;
            const oy = obj.position.y * CELL_SIZE * cameraZoom + offsetY + (CELL_SIZE * cameraZoom) / 2;
            
            const lightCull = 150 * cameraZoom;
            if (ox < -lightCull || ox > canvas.width + lightCull || oy < -lightCull || oy > canvas.height + lightCull) return;

            let radius = 0;
            let intensity = 0;

            if (obj.name === 'NULL') {
                radius = 250;
                intensity = 0.9;
            } else if (obj.name === 'PROJECTILE') { 
                radius = 70; 
                intensity = 0.8; 
            } else if (obj.hp !== undefined) { 
                radius = 120; 
                intensity = 0.7; 
            } else if (obj.name === 'ORE_METEORITE' || obj.name.endsWith('_ORE')) { 
                radius = 60; 
                intensity = 0.4; 
            } else if (obj.name === 'DATA_NODE') {
                radius = 100;
                intensity = 0.75;
            } else if (obj.name === 'METEORITE') { 
                radius = 20; 
                intensity = 0.05; 
            }

            if (radius > 0) {
                const scaledRadius = radius * cameraZoom;
                const grad = lightCtx.createRadialGradient(ox, oy, 0, ox, oy, scaledRadius);
                grad.addColorStop(0, `rgba(0,0,0,${intensity})`);
                grad.addColorStop(1, 'rgba(0,0,0,0)');
                lightCtx.fillStyle = grad;
                lightCtx.beginPath();
                lightCtx.arc(ox, oy, scaledRadius, 0, Math.PI * 2);
                lightCtx.fill();
            }
        });

        lightCtx.restore();
        
        // Dibujar máscara de luz escalada
        ctx.globalCompositeOperation = 'source-over';
        ctx.drawImage(lightCanvas, 0, 0, canvas.width, canvas.height);

        // 5.1 Overlay de Escaneo (Persistente sobre la oscuridad y con efecto de parpadeo al encender)
        const timeSinceDeactivate = now - lastScannerDeactivateTime;
        const isFadingOut = !isScannerActive && timeSinceDeactivate < SCANNER_FADE_DURATION;
        
        if (isScannerActive || isFadingOut) {
            const scanActiveTime = now - scannerStartTime;
            const bootDuration = 1500;
            const isBooting = isScannerActive && scanActiveTime < bootDuration;
            let scannerAlpha = 1.0;
            
            if (isBooting) {
                // Suavizado de parpadeo: una mezcla de seno y ruido suave
                const progress = scanActiveTime / bootDuration;
                const flicker = Math.sin(scanActiveTime * 0.05) * 0.2 + 0.8;
                const noise = (Math.random() * 0.15);
                scannerAlpha = (flicker - noise) * progress;
            } else if (isFadingOut) {
                scannerAlpha = 1.0 - (timeSinceDeactivate / SCANNER_FADE_DURATION);
            } else if (isScannerActive) {
                // Parpadeo sutil un poco más pronunciado cuando está activo
                const idleFlicker = Math.sin(now * 0.015) * 0.12 + 0.88;
                const subtleNoise = (Math.random() * 0.06);
                scannerAlpha = idleFlicker - subtleNoise;
            }

            scannedEntities.forEach(scanData => {
                const obj = gameState.objects.find(o => o.id === scanData.id);
                if (!obj || obj.hp === 0) return;

                const x = obj.position.x * CELL_SIZE * cameraZoom + offsetX + (CELL_SIZE * cameraZoom) / 2;
                const y = obj.position.y * CELL_SIZE * cameraZoom + offsetY + (CELL_SIZE * cameraZoom) / 2;
                const scanElapsed = now - scanData.startTime;

                ctx.save();
                // Delineado circular
                ctx.beginPath();
                const outlineSize = CELL_SIZE * cameraZoom * 1.2;
                ctx.arc(x, y, outlineSize / 2, 0, Math.PI * 2);
                ctx.strokeStyle = scanData.isEnemy ? COLORS.danger : COLORS.accent;
                ctx.lineWidth = 2;
                const alpha = Math.min(0.8, scanElapsed / 500) * scannerAlpha;
                ctx.globalAlpha = alpha;
                ctx.stroke();

                // Texto de información
                const textAlpha = Math.min(1.0, scanElapsed / 800) * scannerAlpha;
                ctx.globalAlpha = textAlpha;
                ctx.font = `bold ${10 * Math.max(0.8, cameraZoom)}px "Cascadia Code", "Courier New", Courier, monospace`;
                ctx.fillStyle = scanData.isEnemy ? COLORS.danger : COLORS.accent;
                ctx.textAlign = 'center';
                const scanLabel = `${scanData.label} [${scanData.distance} AU]`;
                ctx.fillText(scanLabel, x, y - (CELL_SIZE * cameraZoom) - 15 * cameraZoom);
                ctx.restore();
            });
        }
    }

    // 6. Dibujar partículas (brillantes, sobre la niebla)
    particles.forEach(p => p.draw(ctx, offsetX, offsetY));

    // 7. Overlay de Muerte
    if (myPlayer && myPlayer.hp === 0) {
        ctx.fillStyle = 'rgba(0, 0, 0, 0.85)';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.textAlign = 'center';
        ctx.fillStyle = COLORS.danger;
        ctx.font = 'bold 30px "Cascadia Code", "Courier New", Courier, monospace';
        ctx.fillText('CRITICAL_FAILURE: CONNECTION_LOST', canvas.width / 2, canvas.height / 2 - 30);
        ctx.fillStyle = COLORS.accent;
        ctx.font = '14px "Cascadia Code", "Courier New", Courier, monospace';
        ctx.fillText('> ATTEMPTING_SECURE_REBOOT...', canvas.width / 2, canvas.height / 2 + 20);
        if (Date.now() % 1000 < 500) {
            ctx.fillStyle = COLORS.fg;
            ctx.fillText('_', canvas.width / 2 + 110, canvas.height / 2 + 20);
        }
    }

    // 8. Dibujar Mini-mapa
    renderMinimap();
}

function renderMinimap() {
    if (!minimapCtx || !myPlayer) return;

    const w = minimapCanvas.width;
    const h = minimapCanvas.height;
    
    // Fondo del minimapa
    minimapCtx.clearRect(0, 0, w, h);
    
    // Escala (Mapear 500x500 a 180x160 aprox)
    const scaleX = w / WORLD_WIDTH;
    const scaleY = h / WORLD_HEIGHT;

    // Dibujar límites
    minimapCtx.strokeStyle = COLORS.border;
    minimapCtx.lineWidth = 1;
    minimapCtx.strokeRect(0, 0, w, h);

    // Dibujar objetos estáticos (opcional, puede ser pesado)
    // Para el radar solo dibujaremos puntos de interés
    
    gameState.objects.forEach(obj => {
        const mx = obj.position.x * scaleX;
        const my = obj.position.y * scaleY;

        if (obj.name === 'NULL') {
            // Jefe
            minimapCtx.fillStyle = '#ff4500';
            minimapCtx.beginPath();
            minimapCtx.arc(mx, my, 4, 0, Math.PI * 2);
            minimapCtx.fill();
        } else if (obj.hp !== undefined && obj.id !== myPlayerId) {
            // Otros jugadores
            minimapCtx.fillStyle = obj.color;
            minimapCtx.fillRect(mx - 1.5, my - 1.5, 3, 3);
        } else if (obj.name === 'DATA_NODE') {
             // Nodos de datos (puntos pequeños)
             minimapCtx.fillStyle = COLORS.accent;
             minimapCtx.globalAlpha = 0.3;
             minimapCtx.fillRect(mx - 0.5, my - 0.5, 1, 1);
             minimapCtx.globalAlpha = 1.0;
        }
    });

    // Dibujar mi jugador (parpadeante)
    const myX = myPlayer.position.x * scaleX;
    const myY = myPlayer.position.y * scaleY;
    
    minimapCtx.fillStyle = COLORS.accent;
    if (Date.now() % 1000 < 500) {
        minimapCtx.beginPath();
        minimapCtx.arc(myX, myY, 3, 0, Math.PI * 2);
        minimapCtx.fill();
    }
    
    // Línea de visión (opcional)
    minimapCtx.strokeStyle = 'rgba(88, 166, 255, 0.2)';
    minimapCtx.beginPath();
    minimapCtx.moveTo(myX, 0);
    minimapCtx.lineTo(myX, h);
    minimapCtx.moveTo(0, myY);
    minimapCtx.lineTo(w, myY);
    minimapCtx.stroke();
}

connect();
// Loop de renderizado suave
function animLoop() {
    frameCount++;
    const now = Date.now();
    if (now - lastFpsUpdate >= 1000) {
        fpsSpan.textContent = frameCount;
        frameCount = 0;
        lastFpsUpdate = now;
    }

    render();
    requestAnimationFrame(animLoop);
}
animLoop();
