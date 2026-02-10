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
const playerPosSpan = document.getElementById('player-pos');
const debugPanel = document.getElementById('debug-panel');
const debugContent = document.getElementById('debug-content');
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
const WORLD_WIDTH = 200;
const WORLD_HEIGHT = 200;

let socket = null;
let gameState = { objects: [] };
let myPlayerId = null;
let myPlayer = null;
let lastMessageTime = 0;
let serverTimeOffset = 0;
const keysDown = {};
let particles = [];
let beams = [];
let damageFlash = 0;
let teleportFlash = 0;
let explosionFlash = 0;
let screenShake = 0;
const SHAKE_DECAY = 0.03;
let scannerEffects = [];
let scannedEntities = []; // Almacena info de escaneo: { id, label, distance, startTime }
let isScannerActive = false;
let isMinimapExpanded = false;
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

// Detección de Mobile
function checkMobile() {
    return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) || window.innerWidth < 900;
}
let isMobile = checkMobile();
let mobileControlsInitialized = false;

// Variables Joystick
let joystickActive = false;
let joystickTouchId = null;
let joystickStartPos = { x: 0, y: 0 };
let joystickCurrentPos = { x: 0, y: 0 };
const JOYSTICK_RADIUS = 60;

// Sistema de Estrellas Decorativas
const stars = [];
for (let i = 0; i < 1500; i++) {
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
    constructor(x, y, color, type, evx = 0, evy = 0, lifeFactor = 1.0, pattern = 'radial', tx = null, ty = null) {
        this.x = x * CELL_SIZE;
        this.y = y * CELL_SIZE;
        this.color = color;
        this.type = type;
        this.size = Math.random() * 3 + 2;
        this.life = 1.0;

        // Soporte para partículas con objetivo (succión)
        if (tx !== null && ty !== null) {
            this.targetX = tx * CELL_SIZE;
            this.targetY = ty * CELL_SIZE;
            this.isSeeking = true;
        }

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
            this.decay = (isBig ? (Math.random() * 0.015 + 0.005) : (Math.random() * 0.05 + 0.02)) / lifeFactor;

            const angle = Math.random() * Math.PI * 2;
            let speed = isBig ? (Math.random() * 4 + 1) : (Math.random() * 2 + 0.5);

            if (isBig) {
                if (pattern === 'ring') {
                    speed = 6 + Math.random() * 2;
                } else if (pattern === 'burst') {
                    speed = Math.random() * 12 + 4;
                }
            }

            this.vx = Math.cos(angle) * speed;
            this.vy = Math.sin(angle) * speed;

            if (type === 'EXPLOSION') {
                const symbols = ['•', 'o', 'O', '°', '*'];
                this.symbol = symbols[Math.floor(Math.random() * symbols.length)];
            } else {
                this.symbol = type === 'DEBRIS' ? '#' : (type === 'COLLECT' ? '✧' : (type === 'MINING' ? '$' : (type === 'HIT' ? '×' : (type === 'PROJECTILE_DEATH' ? '·' : (type === 'TELEPORT' ? '@' : '•')))));
            }
        }
    }

    update() {
        if (this.isSeeking) {
            const dx = this.targetX - this.x;
            const dy = this.targetY - this.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist > 5) {
                // Movimiento suave hacia el objetivo
                this.vx += (dx / dist) * 0.8;
                this.vy += (dy / dist) * 0.8;
                this.vx *= 0.85;
                this.vy *= 0.85;
                this.life = Math.max(0.2, this.life); // No morir antes de llegar
            } else {
                this.life = 0;
            }
        }

        this.x += this.vx;
        this.y += this.vy;
        this.life -= this.decay;

        // Fricción dinámica: las explosiones frenan de forma más pesada
        const friction = this.type === 'EXPLOSION' ? 0.92 : 0.95;
        this.vx *= friction;
        this.vy *= friction;
    }

    draw(ctx, offsetX, offsetY) {
        if (this.life <= 0) return;

        ctx.save();
        ctx.globalAlpha = Math.min(1.0, this.life);

        let drawColor = this.color;

        ctx.fillStyle = drawColor;
        ctx.font = `${(this.size + 4) * cameraZoom}px monospace`;
        ctx.fillText(this.symbol, this.x * cameraZoom + offsetX, this.y * cameraZoom + offsetY);
        ctx.restore();
    }
}

function spawnParticles(x, y, color, type, count = 10, evx = 0, evy = 0, lifeFactor = 1.0, pattern = 'radial', tx = null, ty = null) {
    for (let i = 0; i < count; i++) {
        particles.push(new Particle(x, y, color, type, evx, evy, lifeFactor, pattern, tx, ty));
    }
}

class Beam {
    constructor(x1, y1, x2, y2, color) {
        this.x1 = x1 * CELL_SIZE;
        this.y1 = y1 * CELL_SIZE;
        this.x2 = x2 * CELL_SIZE;
        this.y2 = y2 * CELL_SIZE;
        this.color = color;
        this.life = 1.0;
        this.decay = 0.08;
    }

    update() {
        this.life -= this.decay;
    }

    draw(ctx, offsetX, offsetY) {
        if (this.life <= 0) return;
        ctx.save();
        ctx.strokeStyle = this.color;
        ctx.lineWidth = 2 * cameraZoom * this.life;
        ctx.globalAlpha = this.life * 0.6;
        
        ctx.beginPath();
        ctx.moveTo(this.x1 * cameraZoom + offsetX, this.y1 * cameraZoom + offsetY);
        ctx.lineTo(this.x2 * cameraZoom + offsetX, this.y2 * cameraZoom + offsetY);
        ctx.stroke();
        
        // Brillo adicional
        ctx.globalAlpha = this.life * 0.2;
        ctx.lineWidth = 6 * cameraZoom * this.life;
        ctx.stroke();
        
        ctx.restore();
    }
}

class MiningLaser {
    constructor(x1, y1, x2, y2, color) {
        this.x1 = x1;
        this.y1 = y1;
        this.x2 = x2;
        this.y2 = y2;
        this.color = color;
        this.life = 1.0;
        this.decay = 0.05;
        this.seed = Math.random() * 100;
    }

    update() {
        this.life -= this.decay;
    }

    draw(ctx, offsetX, offsetY) {
        if (this.life <= 0) return;
        const x1 = this.x1 * CELL_SIZE * cameraZoom + offsetX;
        const y1 = this.y1 * CELL_SIZE * cameraZoom + offsetY;
        const x2 = this.x2 * CELL_SIZE * cameraZoom + offsetX;
        const y2 = this.y2 * CELL_SIZE * cameraZoom + offsetY;

        ctx.save();
        
        const dist = Math.sqrt(Math.pow(x2 - x1, 2) + Math.pow(y2 - y1, 2));
        const angle = Math.atan2(y2 - y1, x2 - x1);
        const now = Date.now();
        
        // Efecto de impulsos (caracteres que fluyen)
        ctx.shadowBlur = 12 * cameraZoom * this.life;
        ctx.shadowColor = this.color;
        ctx.fillStyle = this.color;
        
        const step = 14 * cameraZoom;
        const count = Math.floor(dist / step);
        
        ctx.font = `bold ${12 * cameraZoom}px monospace`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        // Dibujar pulsos de caracteres
        for (let i = 0; i <= count; i++) {
            const t = i / count;
            // Animación de flujo (impulsos) - usamos una onda senoidal para agrupar caracteres
            const pulse = Math.sin(t * Math.PI * 5 - now * 0.02);
            const alpha = Math.max(0, pulse) * this.life;
            
            if (alpha < 0.1) continue;

            const px = x1 + (x2 - x1) * t;
            const py = y1 + (y2 - y1) * t;
            
            // Vibración sutil
            const noise = Math.sin(now * 0.03 + i + this.seed) * 1.5 * cameraZoom;
            const nx = px + Math.cos(angle + Math.PI/2) * noise;
            const ny = py + Math.sin(angle + Math.PI/2) * noise;
            
            // Selección de carácter: mayor frecuencia de '$'
            const chars = ["$", "0", "$", "1"];
            const char = chars[(i + Math.floor(now/200)) % chars.length];
            
            ctx.globalAlpha = alpha * 0.9;
            ctx.fillText(char, nx, ny);
            
            // Destello blanco en el núcleo de los impulsos
            if (pulse > 0.8) {
                ctx.save();
                ctx.fillStyle = "#FFFFFF";
                ctx.globalAlpha = alpha * 1.0;
                ctx.shadowBlur = 5 * cameraZoom;
                ctx.shadowColor = "#FFFFFF";
                ctx.fillText(char, nx, ny);
                ctx.restore();
            }
        }

        ctx.restore();
    }
}

    function getMatrixEffect(text, intensity = 0.15) {
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789$#@&%*<>[]{}";
    // Estabilizamos el efecto por tiempo (cambia cada 250ms)
    const t = Math.floor(Date.now() / 250);

    return text.split('').map((c, i) => {
        // Pseudo-aleatorio estable para esta ventana de tiempo y posición
        const seed = t + (i * 10);
        const pseudoRand = Math.abs(Math.sin(seed) * 10000) % 1;

        if (pseudoRand < intensity) {
            const charIdx = Math.floor(Math.abs(Math.sin(seed * 2) * 10000) % chars.length);
            return chars[charIdx];
        }
        return c;
    }).join('');
}

function getFireWallEffect(text) {
    const t = Math.floor(Date.now() / 200);
    const fireChars = ["!", "█", "▓", "▒", "░", "*", "^", "v"];

    return text.split('').map((c, i) => {
        const seed = t + (i * 13);
        const pseudoRand = Math.abs(Math.sin(seed) * 10000) % 1;

        // Efecto de "llama": algunas letras se vuelven bloques o símbolos de fuego
        if (pseudoRand < 0.2) {
            return fireChars[Math.floor(pseudoRand * fireChars.length * 5) % fireChars.length];
        }

        // Algunas letras cambian a mayúsculas/minúsculas de forma agresiva (glitch)
        if (pseudoRand > 0.9) {
            return c === c.toUpperCase() ? c.toLowerCase() : c.toUpperCase();
        }

        return c;
    }).join('');
}

class ScannerEffect {
    constructor(x, y) {
        this.x = x * CELL_SIZE;
        this.y = y * CELL_SIZE;
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
                    spawnParticles(px, py, COLORS.accent, 'THRUSTER', 1, -evx, -evy);
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
        ctx.globalAlpha = this.life * 0.5;
        ctx.lineWidth = 2 * cameraZoom;
        ctx.stroke();

        // Segundo anillo más fino para efecto de "escaneo de barrido"
        if (this.radius > 50) {
            ctx.beginPath();
            ctx.arc(this.x * cameraZoom + offsetX, this.y * cameraZoom + offsetY, (this.radius - 20) * cameraZoom, 0, Math.PI * 2);
            ctx.lineWidth = 1 * cameraZoom;
            ctx.globalAlpha = this.life * 0.25;
            ctx.stroke();
        }

        ctx.restore();
    }
}

let scannerStartTime = 0;
let scannerFadeFactor = 0; // 0 a 1 para manejar transiciones suaves
let lastScannerDeactivateTime = 0;
const SCANNER_FADE_DURATION = 500;

    function drawWormhole(obj, ctx, offsetX, offsetY, now) {
        const x = obj.position.x * CELL_SIZE * cameraZoom + offsetX;
        const y = obj.position.y * CELL_SIZE * cameraZoom + offsetY;
        const size = (obj.size || 5) * CELL_SIZE * cameraZoom;

        ctx.save();

        // Efecto de aparición/desaparición suave (Fade-in / Fade-out)
        let opacity = 1.0;
        const FADE_DURATION = 2000;
        const synchronizedNow = now + serverTimeOffset;

        if (obj.st) {
            if (obj.st > 0) {
                // Fade-in
                const age = synchronizedNow - obj.st;
                if (age < FADE_DURATION) {
                    opacity = Math.max(0, age / FADE_DURATION);
                }
            } else {
                // Fade-out (st es negativo)
                const collapseStartTime = -obj.st;
                const collapseElapsed = synchronizedNow - collapseStartTime;
                opacity = Math.max(0, 1.0 - (collapseElapsed / FADE_DURATION));
            }
        }
        ctx.globalAlpha = opacity;

        // 0. Brillo de fondo potente (Bloom) - Oscilación más suave
        // Usamos una función de pulso más natural (seno suavizado)
        const pulse = Math.sin(now * 0.002); 
        const smoothPulse = (pulse + 1) / 2; // Rango [0, 1]
        
        const bloomSize = size * (1.1 + 0.3 * smoothPulse);
        const glowGrad = ctx.createRadialGradient(x, y, 0, x, y, bloomSize);
        glowGrad.addColorStop(0, obj.color);
        glowGrad.addColorStop(0.3, obj.color + "66");
        glowGrad.addColorStop(0.6, obj.color + "22");
        glowGrad.addColorStop(1, "transparent");
        
        ctx.save();
        ctx.globalCompositeOperation = 'screen';
        ctx.globalAlpha = (0.1 + 0.4 * smoothPulse) * opacity;
        ctx.fillStyle = glowGrad;
        ctx.beginPath();
        ctx.arc(x, y, bloomSize, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();

        // 0.1 Rastro hacia el destino (Partículas direccionales)
        if (obj.linkedId) {
            const linked = gameState.objects.find(o => o.id === obj.linkedId);
            if (linked) {
                const tx = linked.position.x * CELL_SIZE * cameraZoom + offsetX;
                const ty = linked.position.y * CELL_SIZE * cameraZoom + offsetY;
                const angleToTarget = Math.atan2(ty - y, tx - x);
                const distToTarget = Math.sqrt(Math.pow(tx - x, 2) + Math.pow(ty - y, 2));

                // Dibujar pequeñas partículas de datos que fluyen hacia el otro extremo
                const flowCount = 12;
                for (let i = 0; i < flowCount; i++) {
                    const flowT = (now * 0.0008 + i / flowCount) % 1.0;
                    // Dibujar un rastro que se extiende más para indicar dirección
                    const maxFlowDist = 160 * cameraZoom;
                    const flowDist = maxFlowDist * flowT;

                    ctx.fillStyle = obj.color;
                    ctx.font = `${3.5 * cameraZoom}px monospace`;

                    // Dibujar 3 símbolos seguidos para dar sensación de "partícula larga" (streak)
                    for (let j = 0; j < 3; j++) {
                        const subDist = flowDist - (j * 5 * cameraZoom);
                        if (subDist < 0) continue;

                        const fx = x + Math.cos(angleToTarget) * subDist;
                        const fy = y + Math.sin(angleToTarget) * subDist;

                        // Desvanecer la cola de la partícula
                        ctx.globalAlpha = (1.0 - flowT) * 0.6 * (1.0 - j * 0.3);
                        ctx.fillText('@', fx, fy);
                    }
                }
            }
        }

        // Dibujar el símbolo central con mucho brillo
        // Usamos un valor de brillo fijo para aprovechar el cache y no saturar la memoria
        const fixedGlow = 100;
        const sprite = getSprite(obj.symbol, obj.color, fixedGlow, obj.size || 5);
        const padding = 25 * cameraZoom;
        
        // El tamaño del sprite ahora pulsa sutilmente en sincronía con el bloom
        const pulseScale = 1.0 + 0.1 * smoothPulse;
        const sSize = ((obj.size || 5) * CELL_SIZE * cameraZoom + padding * 2) * pulseScale;
        
        ctx.save();
        // Aplicar una variación de opacidad para el efecto de pulso
        ctx.globalAlpha = (0.25 + 0.75 * smoothPulse) * opacity;
        ctx.drawImage(sprite, x - sSize / 2, y - sSize / 2, sSize, sSize);
        ctx.restore();

        // Efecto espiral de partículas verdes
        const numParticles = 30;
        const rotationTime = now * 0.0008; // Tiempo para la rotación (más lento que el pulso)
        ctx.fillStyle = obj.color;

        for (let i = 0; i < numParticles; i++) {
            const ratio = i / numParticles;
            const angle = rotationTime + (ratio * Math.PI * 2);
            // El radio oscila para crear un efecto de "succión" o espiral dinámico
            const spiralRadius = (size / 1.4) * (0.8 + 0.15 * Math.sin(rotationTime * 1.2 + ratio * Math.PI * 4));

            const px = x + Math.cos(angle) * spiralRadius;
            const py = y + Math.sin(angle) * spiralRadius;

            // Opacidad sincronizada con el pulso general
            const individualOffset = Math.sin(i * 13.5) * 0.1; 
            const pOpacity = (0.15 + 0.75 * smoothPulse + individualOffset) * opacity;
            ctx.globalAlpha = Math.max(0, Math.min(1, pOpacity));

            const pSize = (2.0 + 1.0 * smoothPulse) * cameraZoom;

            ctx.font = `${pSize * 3}px monospace`;
            ctx.fillText('@', px, py);

            // Brillo para algunas partículas exteriores (sincronizado con el pulso)
            if (i % 2 === 0) {
                ctx.shadowBlur = (10 + 10 * smoothPulse) * cameraZoom;
                ctx.shadowColor = obj.color;
                ctx.fillText('@', px, py);
                ctx.shadowBlur = 0;
            }
        }

        // Partículas interiores rotando en sentido contrario
        const innerParticles = 20;
        for (let i = 0; i < innerParticles; i++) {
            const ratio = i / innerParticles;
            const angle = -rotationTime * 1.1 + (ratio * Math.PI * 2);
            const spiralRadius = (size / 3) * (1 + 0.2 * Math.cos(rotationTime * 0.7 + ratio * Math.PI));

            const px = x + Math.cos(angle) * spiralRadius;
            const py = y + Math.sin(angle) * spiralRadius;

            // Opacidad también sincronizada pero con fase invertida o distinta para dar profundidad
            const pOpacity = (0.3 + 0.3 * (1.0 - smoothPulse)) * opacity;
            ctx.globalAlpha = pOpacity;
            ctx.font = `${3.5 * cameraZoom}px monospace`;
            ctx.fillText('@', px, py);
        }

        ctx.restore();
    }

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

            const capitalize = (s) => s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
            let label = obj.name === 'METEORITE' ? 'Meteorite' :
                        obj.name === 'LARGE_METEORITE' ? 'Heavy Meteorite' :
                        obj.name.includes('METEORITE') ? `Meteorite (${capitalize(obj.name.split('_')[0])})` :
                        obj.name.includes('ORE') ? `Mineral (${capitalize(obj.name.split('_')[0])})` :
                        obj.name === 'NULL' ? 'Unknown Entity' :
                        obj.name === 'PROJECTILE' ? 'Incoming Threat' :
                        obj.hp !== undefined ? `Vessel: ${obj.name}` : obj.name;

            const isEnemy = (obj.hp !== undefined && obj.id !== myPlayerId) || obj.name === 'SENTINEL' || obj.name === 'NULL' || obj.name === 'PROJECTILE';
            const isWormhole = obj.name === 'WORMHOLE';
            const isStation = obj.name && obj.name.startsWith('STATION');
            const existing = currentScannedMap.get(obj.id);

            return {
                id: obj.id,
                label: label,
                distance: (distCells / AU_IN_CELLS).toFixed(2),
                distRaw: distCells,
                isEnemy: isEnemy,
                isWormhole: isWormhole,
                isStation: isStation,
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

function getSprite(symbol, color, glowRadius, entitySize = 1) {
    const key = `${symbol}_${color}_${glowRadius}_${entitySize}`;
    if (spriteCache[key]) return spriteCache[key];

    const sCanvas = document.createElement('canvas');
    // Aumentamos el tamaño del canvas proporcionalmente al tamaño de la entidad
    const padding = 15;
    const baseSize = CELL_SIZE * entitySize;
    const totalSize = baseSize + padding * 2;
    sCanvas.width = totalSize;
    sCanvas.height = totalSize;
    const sCtx = sCanvas.getContext('2d');

    sCtx.shadowBlur = glowRadius;
    sCtx.shadowColor = color;
    sCtx.fillStyle = color;
    // Fuente proporcional al tamaño real de la entidad
    const fontSize = baseSize * 0.85;
    sCtx.font = `bold ${fontSize}px monospace`;
    sCtx.textAlign = 'center';
    sCtx.textBaseline = 'middle';
    sCtx.fillText(symbol, totalSize / 2, totalSize / 2);

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

function updateResponsiveUI() {
    const mobileNow = checkMobile();
    const guide = document.getElementById('guide-content');

    if (guide) {
        if (mobileNow) {
            guide.innerHTML = `<span class="accent">JOYSTICK</span> to move | <span class="accent">FIRE</span> to shoot | <span class="accent">SCAN</span> to scan`;
        } else {
            guide.innerHTML = `<span class="accent">WASD</span> to navigate | <span class="accent">SPACE/CLICK</span> to shoot | <span class="accent">C</span> to scan | <span class="accent">F11</span> full extraction`;
        }
    }

    if (mobileNow && !mobileControlsInitialized) {
        initMobileControls();
        mobileControlsInitialized = true;
    }

    isMobile = mobileNow;
}

function resize() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    lightCanvas.width = canvas.width * LIGHT_SCALE;
    lightCanvas.height = canvas.height * LIGHT_SCALE;
    // También actualizar starLightCanvas
    starLightCanvas.width = canvas.width * LIGHT_SCALE;
    starLightCanvas.height = canvas.height * LIGHT_SCALE;

    updateResponsiveUI();
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
        'h': 'hp', 'mh': 'maxHp', 'sh': 'shield', 'ms': 'maxShield',
        'co': 'copper', 'si': 'silver', 'go': 'gold',
        'l': 'level', 'li': 'linkedId', 'e': 'exp', 'w': 'weapon', 't': 'type', 'sz': 'size',
        'am': 'autoMinerActive', 'tx': 'targetX', 'ty': 'targetY',
        'pi': 'playerId', 'pn': 'playerName', 'd': 'payload', 'dbg': 'debugData', 'v': 'vibration'
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

        // Medir latencia básica y sincronizar reloj
        const now = Date.now();
        if (data.timestamp) {
            // offset = serverTime - clientTime
            // Un valor positivo significa que el servidor va adelantado
            serverTimeOffset = data.timestamp - now;
        }

        if (lastMessageTime) {
            latencySpan.textContent = `${now - lastMessageTime}ms`;
        }
        lastMessageTime = now;

        gameState = data;
        
        // Procesar vibración
        if (gameState.vibration) {
            screenShake = Math.min(1.0, screenShake + gameState.vibration);
            if (gameState.vibration > 0.3 && navigator.vibrate) {
                navigator.vibrate(Math.floor(gameState.vibration * 200));
            }
        }
        
        // Buscar mi jugador inmediatamente para tener datos actualizados para efectos
        if (myPlayerId) {
            const prevHp = myPlayer ? myPlayer.hp : null;
            const prevShield = myPlayer ? myPlayer.shield : null;
            const foundPlayer = gameState.objects.find(obj => obj.id === myPlayerId);
            if (foundPlayer) {
                if (prevHp !== null && (foundPlayer.hp < prevHp || foundPlayer.shield < prevShield)) {
                    damageFlash = 1.0;
                }
                myPlayer = foundPlayer;
            }
        }
        
        // Procesar eventos
        if (gameState.events && gameState.events.length > 0) {
            gameState.events.forEach(e => log(e));
        }

        // Procesar efectos visuales
        if (gameState.effects && gameState.effects.length > 0) {
            gameState.effects.forEach(e => {
                let count = 12;
                let lifeFactor = 1.0;
                let pattern = 'radial';
                const size = e.size || 1;

                if (e.type === 'EXPLOSION') {
                    count = 30 * size + 10;
                    lifeFactor = 3.0 + size * 1.5;
                    // Elegir patrón aleatorio para explosiones
                    const patterns = ['radial', 'ring', 'burst'];
                    pattern = patterns[Math.floor(Math.random() * patterns.length)];

                    // Efecto de destello si es cerca del jugador
                    if (myPlayer) {
                        const dx = e.x - myPlayer.position.x;
                        const dy = e.y - myPlayer.position.y;
                        const dist = Math.sqrt(dx*dx + dy*dy);
                        if (dist < 20) {
                            explosionFlash = Math.max(explosionFlash, (1.0 - dist/20) * 0.2);
                        }
                    }
                } else if (e.type === 'DEBRIS') {
                    count = 8 * size + 4;
                    lifeFactor = 2.0 + size;
                } else if (e.type === 'HIT') {
                    count = 8;
                    lifeFactor = 4.0;
                } else if (e.type === 'PROJECTILE_DEATH') {
                    count = 6;
                    lifeFactor = 2.0;
                } else if (e.type === 'TELEPORT') {
                    count = 40;
                    lifeFactor = 5.0;
                    pattern = 'ring';

                    // Efecto de destello verde si es el jugador el que llega o sale
                    if (myPlayer) {
                        const dx = e.x - myPlayer.position.x;
                        const dy = e.y - myPlayer.position.y;
                        const dist = Math.sqrt(dx*dx + dy*dy);
                        if (dist < 10) {
                            teleportFlash = 1.0;
                        }
                    }
                } else if (e.type === 'MINING_LASER') {
                    beams.push(new MiningLaser(e.x, e.y, e.targetX, e.targetY, e.color || '#ff00ff'));
                    // Partículas de "succión" desde el meteorito hacia el jugador
                    spawnParticles(e.targetX, e.targetY, e.color || '#ff00ff', 'MINING', 3, 0, 0, 2.0, 'radial', e.x, e.y);
                    // Chispas digitales en el punto de impacto
                    spawnParticles(e.targetX, e.targetY, e.color || '#ff00ff', 'MINING', 2, 0, 0, 1.0);
                    return;
                }
                spawnParticles(e.x, e.y, e.color, e.type, count, 0, 0, lifeFactor, pattern, e.targetX, e.targetY);
            });
        }

        // Actualizar panel de debug HTML
        if (debugPanel) {
            if (gameState.debugData) {
                debugPanel.style.display = 'block';
                const dbg = gameState.debugData;
                debugContent.innerHTML = `
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 4px;">
                        <div>SERVER_TICK: <span class="accent">${dbg.tick}</span></div>
                        <div>VISIBLE_OBJS: <span class="accent">${dbg.objs}</span></div>
                        <div>TOTAL_PLAYERS: <span class="accent">${dbg.players}</span></div>
                        <div>TOTAL_SENTINELS: <span class="accent">${dbg.sent}</span></div>
                        <div>TOTAL_PROJECTILES: <span class="accent">${dbg.proj}</span></div>
                        <div>WORLD_OBJECTS: <span class="accent">${dbg.world_objs}</span></div>
                        <div>QT_STATIC_NODES: <span class="accent">${dbg.sq ? dbg.sq.length : 0}</span></div>
                        <div>QT_DYNAMIC_NODES: <span class="accent">${dbg.dq ? dbg.dq.length : 0}</span></div>
                    </div>
                `;
            } else {
                debugPanel.style.display = 'none';
            }
        }

        // Actualizar datos del jugador en la UI
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
                
                // Actualizar balances en el menú de la tienda si está visible
                const shopCu = document.getElementById('shop-cu');
                const shopAg = document.getElementById('shop-ag');
                const shopAu = document.getElementById('shop-au');
                if (shopCu) shopCu.textContent = myPlayer.copper;
                if (shopAg) shopAg.textContent = myPlayer.silver;
                if (shopAu) shopAu.textContent = myPlayer.gold;
                
                if (myPlayer.weapon) {
                    playerWeaponSpan.textContent = myPlayer.weapon.name;
                }
                
                if (playerPosSpan) {
                    playerPosSpan.textContent = `${myPlayer.position.x.toFixed(1)}, ${myPlayer.position.y.toFixed(1)}`;
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
    const entities = gameState.objects.filter(obj => 
        ((obj.hp !== undefined && obj.hp > 0) || obj.name === 'WORMHOLE' || (obj.name && obj.name.startsWith('STATION'))) && 
        obj.id !== myPlayerId
    );
    
    if (myPlayer) {
        entities.forEach(p => {
            p._distance = Math.sqrt(
                Math.pow(p.position.x - myPlayer.position.x, 2) + 
                Math.pow(p.position.y - myPlayer.position.y, 2)
            );
        });
        // Ordenar por distancia
        entities.sort((a, b) => a._distance - b._distance);
        // Limitar a los 20 más cercanos
        if (entities.length > 20) entities.length = 20;
    } else {
        entities.sort((a, b) => (b.score || 0) - (a.score || 0));
        if (entities.length > 20) entities.length = 20;
    }
    
    // Solo actualizar el DOM si la lista cambió
    const currentJson = JSON.stringify(entities.map(p => ({
        id: p.id, 
        name: p.name, 
        color: p.color, 
        dist: p._distance ? p._distance.toFixed(1) : 0
    })));
    
    if (currentJson === lastPlayerListJson) return;
    lastPlayerListJson = currentJson;

    playerListDiv.innerHTML = '';
    entities.forEach(p => {
        const entry = document.createElement('div');
        entry.className = 'player-entry';
        if (p.id === myPlayerId) entry.classList.add('accent');
        
        const distLabel = p._distance !== undefined ? `<span class="muted" style="font-size: 10px; margin-left: 8px;">${(p._distance / AU_IN_CELLS).toFixed(2)} AU</span>` : '';
        
        let displayName = p.name;
        if (p.name === 'FIRE_WALL') {
            displayName = getFireWallEffect(p.name);
        } else if (p.name === 'NULL') {
            displayName = getMatrixEffect(p.name, 0.2);
        } else if (p.name === 'WORMHOLE') {
            displayName = `> ${p.name}`;
        } else if (p.name && p.name.startsWith('STATION')) {
            displayName = `[STATION] ${p.name.split('_')[1] || ''}`;
        }

        entry.innerHTML = `
            <span style="color: ${p.color}">${displayName}</span>
            ${distLabel}
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
        case 'escape':
            if (isMinimapExpanded) {
                isMinimapExpanded = false;
                document.getElementById('minimap-panel').classList.remove('expanded');
            }
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

    // Aplicar Screen Shake
    if (screenShake > 0) {
        const shakeMag = screenShake * 16 * cameraZoom;
        offsetX += (Math.random() * 2 - 1) * shakeMag;
        offsetY += (Math.random() * 2 - 1) * shakeMag;
    }

    // 2. Dibujar Cuadrícula Dinámica (Optimizado para mundos grandes)
    const scaledCellSize = CELL_SIZE * cameraZoom;

    // 2.0 Pintar celdas de meteoritos y ores
    ctx.globalAlpha = 0.15;
    gameState.objects.forEach(obj => {
        if (obj.name === 'METEORITE' || obj.name === 'LARGE_METEORITE' || obj.name.includes('ORE')) {
            const size = obj.size || 1;
            const x = (obj.position.x - size / 2) * scaledCellSize + offsetX;
            const y = (obj.position.y - size / 2) * scaledCellSize + offsetY;
            const drawSize = size * scaledCellSize;

            // Culling visual para el fondo de celda
            if (x < -drawSize || x > canvas.width || y < -drawSize || y > canvas.height) return;

            ctx.fillStyle = obj.color;
            ctx.fillRect(x, y, drawSize, drawSize);
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

    // 2.2 Dibujar regiones QuadTree (Debug)
    if (gameState.debugData) {
        ctx.lineWidth = 1;
        
        // Regiones estáticas (verde tenue)
        if (gameState.debugData.sq) {
            ctx.strokeStyle = 'rgba(63, 185, 80, 0.4)';
            gameState.debugData.sq.forEach(r => {
                const rx = (r.x - r.w) * scaledCellSize + offsetX;
                const ry = (r.y - r.h) * scaledCellSize + offsetY;
                const rw = (r.w * 2) * scaledCellSize;
                const rh = (r.h * 2) * scaledCellSize;
                ctx.strokeRect(rx, ry, rw, rh);
            });
        }
        
        // Regiones dinámicas (azul tenue)
        if (gameState.debugData.dq) {
            ctx.strokeStyle = 'rgba(88, 166, 255, 0.4)';
            gameState.debugData.dq.forEach(r => {
                const rx = (r.x - r.w) * scaledCellSize + offsetX;
                const ry = (r.y - r.h) * scaledCellSize + offsetY;
                const rw = (r.w * 2) * scaledCellSize;
                const rh = (r.h * 2) * scaledCellSize;
                ctx.strokeRect(rx, ry, rw, rh);
            });
        }
    }

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

        const x = obj.position.x * CELL_SIZE * cameraZoom + offsetX;
        const y = obj.position.y * CELL_SIZE * cameraZoom + offsetY;

        // Culling visual
        const cullMargin = (obj.size || 1) * CELL_SIZE * cameraZoom;
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
        else if (obj.name === 'FIRE_WALL') glow = 40;
        else if (obj.name === 'METEORITE' || obj.name === 'LARGE_METEORITE') glow = 0; 
        else if (obj.name.includes('ORE')) glow = 2; 
        else if (obj.name === 'PROJECTILE' || obj.name === 'DATA_NODE') glow = 8;

        const size = obj.size || 1;
        if (obj.name === 'WORMHOLE') {
            drawWormhole(obj, ctx, offsetX, offsetY, now);
        } else if (obj.name && obj.name.startsWith('STATION')) {
            drawSpaceStation(obj, ctx, offsetX, offsetY, now);
        } else {
            const sprite = getSprite(obj.symbol, obj.color, glow, size);
            const padding = 15 * cameraZoom;
            const sSize = size * CELL_SIZE * cameraZoom + padding * 2;
            ctx.drawImage(sprite, x - sSize / 2, y - sSize / 2, sSize, sSize);
        }

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
            
            let labelName = obj.name;
            let isBoss = false;
            if (obj.name === 'FIRE_WALL') {
                labelName = getFireWallEffect(obj.name);
                isBoss = true;
            } else if (obj.name === 'NULL') {
                labelName = getMatrixEffect(obj.name, 0.15);
                isBoss = true;
            }
            
            const labelText = obj.id === myPlayerId ? `YOU (${obj.score})` : `${labelName} (${obj.score})`;
            const objHeight = (obj.size || 1) * CELL_SIZE * cameraZoom;
            const labelY = y - objHeight / 2 - 8 * cameraZoom;
            
            ctx.textAlign = 'center';
            ctx.fillStyle = obj.color;
            ctx.fillText(labelText, x, labelY);
            
            const barWidth = Math.max(24, (obj.size || 1) * 12) * cameraZoom;
            const barHeight = 2 * Math.max(0.5, cameraZoom);
            const gap = 2 * cameraZoom;
            let currentY = y + objHeight / 2 + 4 * cameraZoom;

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

    // Lógica de Tienda Automática
    if (myPlayer) {
        const nearStation = gameState.objects.find(obj => 
            obj.name && obj.name.startsWith('STATION') && 
            getDistance(myPlayer.position, obj.position) < 5
        );
        
        const shopPanel = document.getElementById('shop-panel');
        if (nearStation) {
            if (lastStationInRange !== nearStation.id) {
                shopManualClosed = false;
                lastStationInRange = nearStation.id;
            }

            if (!shopManualClosed) {
                if (shopPanel.style.display === 'none' || !shopPanel.style.display) {
                    shopPanel.style.display = 'flex';
                }
            }
        } else {
            if (shopPanel.style.display === 'flex') {
                shopPanel.style.display = 'none';
            }
            lastStationInRange = null;
            shopManualClosed = false;
        }
    }

    // 4. Actualizar y dibujar partículas
    particles = particles.filter(p => p.life > 0);
    particles.forEach(p => p.update());

    // 4.0 Actualizar y dibujar rayos (Beams)
    beams = beams.filter(b => b.life > 0);
    beams.forEach(b => {
        b.update();
        b.draw(ctx, offsetX, offsetY);
    });

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
            } else if (obj.name === 'WORMHOLE') {
                radius = 450;
                intensity = 0.95;
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
                scannerAlpha = (flicker - noise) * progress * 0.8;
            } else if (isFadingOut) {
                scannerAlpha = (1.0 - (timeSinceDeactivate / SCANNER_FADE_DURATION)) * 0.8;
            } else if (isScannerActive) {
                // Parpadeo sutil un poco más pronunciado cuando está activo
                const idleFlicker = Math.sin(now * 0.015) * 0.12 + 0.78;
                const subtleNoise = (Math.random() * 0.06);
                scannerAlpha = idleFlicker - subtleNoise;
            }

            const labelBoxes = [];
            scannedEntities.forEach(scanData => {
                const obj = gameState.objects.find(o => o.id === scanData.id);
                if (!obj || obj.hp === 0) return;

                const x = obj.position.x * CELL_SIZE * cameraZoom + offsetX;
                const y = obj.position.y * CELL_SIZE * cameraZoom + offsetY;
                const scanElapsed = now - scanData.startTime;

                ctx.save();
                // Delineado circular proporcional al tamaño
                ctx.beginPath();
                const outlineSize = ((obj.size || 1) + 0.5) * CELL_SIZE * cameraZoom;
                ctx.arc(x, y, outlineSize / 2, 0, Math.PI * 2);
                let scanColor = scanData.isEnemy ? COLORS.danger : COLORS.accent;
                if (scanData.isWormhole) scanColor = COLORS.success;
                if (scanData.isStation) scanColor = '#00ffff';
                ctx.strokeStyle = scanColor;
                ctx.lineWidth = 2;
                const alpha = Math.min(0.5, scanElapsed / 500) * scannerAlpha;
                ctx.globalAlpha = alpha;
                ctx.stroke();

                // Encuadre rectangular (esquinas)
                const frameSize = (obj.size || 1) * CELL_SIZE * cameraZoom;
                const cornerLen = Math.min(frameSize * 0.3, 10 * cameraZoom);
                const half = frameSize / 2;
                
                ctx.beginPath();
                // Top-left
                ctx.moveTo(x - half, y - half + cornerLen);
                ctx.lineTo(x - half, y - half);
                ctx.lineTo(x - half + cornerLen, y - half);
                // Top-right
                ctx.moveTo(x + half - cornerLen, y - half);
                ctx.lineTo(x + half, y - half);
                ctx.lineTo(x + half, y - half + cornerLen);
                // Bottom-left
                ctx.moveTo(x - half, y + half - cornerLen);
                ctx.lineTo(x - half, y + half);
                ctx.lineTo(x - half + cornerLen, y + half);
                // Bottom-right
                ctx.moveTo(x + half - cornerLen, y + half);
                ctx.lineTo(x + half, y + half);
                ctx.lineTo(x + half, y + half - cornerLen);
                
                ctx.stroke();

                // Texto de información
                const textAlpha = Math.min(0.7, scanElapsed / 800) * scannerAlpha;
                ctx.globalAlpha = textAlpha;
                ctx.font = `bold ${10 * Math.max(0.8, cameraZoom)}px "Cascadia Code", "Courier New", Courier, monospace`;
                
                let textColor = scanData.isEnemy ? COLORS.danger : COLORS.accent;
                if (scanData.isWormhole) textColor = COLORS.success;
                if (scanData.isStation) textColor = '#00ffff'; // Celeste para estaciones
                ctx.fillStyle = textColor;
                
                ctx.textAlign = 'center';
                const scanLabel = `${scanData.label} [${scanData.distance} AU]`;
                
                const baseOffset = ((obj.size || 1) / 2 * CELL_SIZE * cameraZoom) + 15 * cameraZoom;
                let currentY = y - baseOffset;
                const labelWidth = ctx.measureText(scanLabel).width;
                const labelHeight = 12 * cameraZoom;

                // Prevención de solapamiento
                let overlapped = true;
                let attempts = 0;
                while (overlapped && attempts < 10) {
                    overlapped = false;
                    for (const box of labelBoxes) {
                        if (Math.abs(x - box.x) < (labelWidth + box.w) * 0.55 && 
                            Math.abs(currentY - box.y) < labelHeight) {
                            currentY -= labelHeight + 2;
                            overlapped = true;
                            break;
                        }
                    }
                    attempts++;
                }
                labelBoxes.push({ x: x, y: currentY, w: labelWidth, h: labelHeight });

                ctx.fillText(scanLabel, x, currentY);
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

    // 7.5 Efectos de Daño y Explosión (Flashes)
    if (damageFlash > 0) {
        const flicker = Math.random() > 0.5 ? 1.0 : 0.8;
        ctx.fillStyle = `rgba(255, 0, 0, ${damageFlash * 0.12 * flicker})`;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        damageFlash -= 0.02;
    }
    if (teleportFlash > 0) {
        const flicker = Math.random() > 0.5 ? 1.0 : 0.8;
        ctx.fillStyle = `rgba(0, 255, 0, ${teleportFlash * 0.35 * flicker})`;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        teleportFlash -= 0.008; // Más lento que el daño (era 0.012)
    }
    if (explosionFlash > 0) {
        const flicker = Math.random() > 0.3 ? 1.0 : 0.7;
        ctx.fillStyle = `rgba(255, 255, 255, ${explosionFlash * 0.15 * flicker})`;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        explosionFlash -= 0.015;
    }

    // 7.6 Efecto Glitch por daño crítico o teletransporte
    if (damageFlash > 0.6 || teleportFlash > 0.6) {
        ctx.save();
        const flashVal = Math.max(damageFlash, teleportFlash);
        const glitchAmount = Math.floor(flashVal * 8);
        for (let i = 0; i < glitchAmount; i++) {
            const h = Math.random() * 30 + 5;
            const y = Math.random() * canvas.height;
            const xOff = (Math.random() - 0.5) * 50 * flashVal;
            ctx.globalAlpha = 0.5;
            ctx.drawImage(canvas, 0, y, canvas.width, h, xOff, y, canvas.width, h);
        }
        ctx.restore();
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

        if (obj.name === 'NULL' || obj.name === 'FIRE_WALL') {
            // Jefe
            minimapCtx.fillStyle = obj.name === 'FIRE_WALL' ? '#ff3300' : '#ff4500';
            minimapCtx.beginPath();
            const radius = obj.name === 'FIRE_WALL' ? 6 : 4;
            minimapCtx.arc(mx, my, radius, 0, Math.PI * 2);
            minimapCtx.fill();

            if (isMinimapExpanded) {
                minimapCtx.fillStyle = COLORS.fg;
                minimapCtx.font = 'bold 10px monospace';
                minimapCtx.textAlign = 'center';
                minimapCtx.fillText(obj.name, mx, my - radius - 4);
            }
        } else if (obj.hp !== undefined && obj.id !== myPlayerId) {
            // Otros jugadores
            minimapCtx.fillStyle = obj.color;
            minimapCtx.fillRect(mx - 1.5, my - 1.5, 3, 3);

            if (isMinimapExpanded) {
                minimapCtx.fillStyle = obj.color;
                minimapCtx.font = '9px monospace';
                minimapCtx.textAlign = 'center';
                minimapCtx.fillText(obj.name, mx, my - 6);
            }
        } else if (obj.name === 'DATA_NODE') {
             // Nodos de datos (puntos pequeños)
             minimapCtx.fillStyle = COLORS.accent;
             minimapCtx.globalAlpha = 0.3;
             minimapCtx.fillRect(mx - 0.5, my - 0.5, 1, 1);
             minimapCtx.globalAlpha = 1.0;
        } else if (isMinimapExpanded && (obj.name.includes('METEORITE') || obj.name.includes('ORE'))) {
            // Meteoritos y recursos (solo en vista expandida)
            minimapCtx.fillStyle = obj.color;
            minimapCtx.globalAlpha = 0.3;
            const mSize = obj.name === 'LARGE_METEORITE' ? 2 : 1.5;
            minimapCtx.fillRect(mx - mSize/2, my - mSize/2, mSize, mSize);
            minimapCtx.globalAlpha = 1.0;
        } else if (obj.name === 'WORMHOLE') {
            // Agujero de gusano
            minimapCtx.fillStyle = '#00ff00';
            minimapCtx.shadowBlur = 5;
            minimapCtx.shadowColor = '#00ff00';
            minimapCtx.beginPath();
            minimapCtx.arc(mx, my, 3, 0, Math.PI * 2);
            minimapCtx.fill();
            minimapCtx.shadowBlur = 0;
            
            // Anillo exterior
            minimapCtx.strokeStyle = '#00ff00';
            minimapCtx.lineWidth = 1;
            minimapCtx.globalAlpha = 0.5;
            minimapCtx.beginPath();
            minimapCtx.arc(mx, my, 5, 0, Math.PI * 2);
            minimapCtx.stroke();
            minimapCtx.globalAlpha = 1.0;

            if (isMinimapExpanded) {
                minimapCtx.fillStyle = '#00ff00';
                minimapCtx.font = '9px monospace';
                minimapCtx.textAlign = 'center';
                minimapCtx.fillText('WORMHOLE', mx, my - 8);
            }
        } else if (obj.name && obj.name.startsWith('STATION')) {
            // Estación Espacial
            minimapCtx.fillStyle = '#00ffff';
            minimapCtx.shadowBlur = 5;
            minimapCtx.shadowColor = '#00ffff';
            minimapCtx.beginPath();
            minimapCtx.arc(mx, my, 3, 0, Math.PI * 2);
            minimapCtx.fill();
            minimapCtx.shadowBlur = 0;
            
            // No dibujamos nombre en el minimapa según requerimiento (solo scanner)
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

minimapCanvas.addEventListener('click', () => {
    isMinimapExpanded = !isMinimapExpanded;
    const panel = document.getElementById('minimap-panel');
    if (isMinimapExpanded) {
        panel.classList.add('expanded');
    } else {
        panel.classList.remove('expanded');
    }
});

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

    if (joystickActive) {
        updateJoystickMovement();
    }

    if (screenShake > 0) {
        screenShake = Math.max(0, screenShake - SHAKE_DECAY);
    }

    render();
    requestAnimationFrame(animLoop);
}

// Lógica de Joystick y Touch se maneja en updateResponsiveUI

function initMobileControls() {
    // Zoom por defecto para mobile
    targetZoom = 0.55;
    cameraZoom = 0.55;

    const stick = document.getElementById('joystick-stick');
    const base = document.getElementById('joystick-base');
    const zone = document.getElementById('joystick-zone');
    const btnShoot = document.getElementById('btn-shoot');
    const btnScan = document.getElementById('btn-scan');

    zone.addEventListener('touchstart', (e) => {
        if (joystickActive) return;
        const touch = e.changedTouches[0];
        joystickTouchId = touch.identifier;
        joystickActive = true;
        
        const rect = zone.getBoundingClientRect();
        const bx = touch.clientX - rect.left;
        const by = touch.clientY - rect.top;
        
        base.style.left = `${bx}px`;
        base.style.top = `${by}px`;
        base.style.opacity = '1';

        joystickStartPos = {
            x: touch.clientX,
            y: touch.clientY
        };
        joystickCurrentPos = { x: 0, y: 0 };
        stick.style.transform = `translate(-50%, -50%)`;
        e.preventDefault();
    }, { passive: false });

    window.addEventListener('touchmove', (e) => {
        if (!joystickActive) return;
        
        let touch = null;
        for (let i = 0; i < e.changedTouches.length; i++) {
            if (e.changedTouches[i].identifier === joystickTouchId) {
                touch = e.changedTouches[i];
                break;
            }
        }
        if (!touch) return;
        
        let dx = touch.clientX - joystickStartPos.x;
        let dy = touch.clientY - joystickStartPos.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        
        if (dist > JOYSTICK_RADIUS) {
            dx = (dx / dist) * JOYSTICK_RADIUS;
            dy = (dy / dist) * JOYSTICK_RADIUS;
        }
        
        joystickCurrentPos = { x: dx, y: dy };
        stick.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
        
        if (e.cancelable) e.preventDefault();
    }, { passive: false });

    window.addEventListener('touchend', (e) => {
        if (!joystickActive) return;
        
        let touch = null;
        for (let i = 0; i < e.changedTouches.length; i++) {
            if (e.changedTouches[i].identifier === joystickTouchId) {
                touch = e.changedTouches[i];
                break;
            }
        }
        if (!touch) return;

        joystickActive = false;
        joystickTouchId = null;
        joystickCurrentPos = { x: 0, y: 0 };
        stick.style.transform = `translate(-50%, -50%)`;
        
        // Reset base position
        base.style.left = '50%';
        base.style.top = '50%';
        base.style.opacity = '0.5';
        
        // Detener movimiento
        sendInput('MOVE_STOP', 'UP');
        sendInput('MOVE_STOP', 'DOWN');
        sendInput('MOVE_STOP', 'LEFT');
        sendInput('MOVE_STOP', 'RIGHT');
        keysDown['w'] = keysDown['s'] = keysDown['a'] = keysDown['d'] = false;
    });

    window.addEventListener('touchcancel', (e) => {
        if (!joystickActive) return;
        
        let touch = null;
        for (let i = 0; i < e.changedTouches.length; i++) {
            if (e.changedTouches[i].identifier === joystickTouchId) {
                touch = e.changedTouches[i];
                break;
            }
        }
        if (!touch) return;

        joystickActive = false;
        joystickTouchId = null;
        joystickCurrentPos = { x: 0, y: 0 };
        stick.style.transform = `translate(-50%, -50%)`;
        
        base.style.left = '50%';
        base.style.top = '50%';
        base.style.opacity = '0.5';
        
        // Detener movimiento
        sendInput('MOVE_STOP', 'UP');
        sendInput('MOVE_STOP', 'DOWN');
        sendInput('MOVE_STOP', 'LEFT');
        sendInput('MOVE_STOP', 'RIGHT');
        keysDown['w'] = keysDown['s'] = keysDown['a'] = keysDown['d'] = false;
    });

    btnShoot.addEventListener('touchstart', (e) => {
        if (myPlayer && !isScannerActive) {
            sendInput('SHOOT', '');
        }
        btnShoot.style.background = 'var(--accent)';
        btnShoot.style.color = 'var(--bg)';
        e.preventDefault();
    }, { passive: false });

    btnShoot.addEventListener('touchend', (e) => {
        btnShoot.style.background = '';
        btnShoot.style.color = '';
        e.preventDefault();
    }, { passive: false });

    btnScan.addEventListener('touchstart', (e) => {
        performScan();
        btnScan.style.background = 'var(--accent)';
        btnScan.style.color = 'var(--bg)';
        e.preventDefault();
    }, { passive: false });

    btnScan.addEventListener('touchend', (e) => {
        btnScan.style.background = '';
        btnScan.style.color = '';
        e.preventDefault();
    }, { passive: false });
}

function updateJoystickMovement() {
    const threshold = 15;
    const dx = joystickCurrentPos.x;
    const dy = joystickCurrentPos.y;

    // UP/DOWN
    if (dy < -threshold && !keysDown['w']) {
        keysDown['w'] = true;
        keysDown['s'] = false;
        sendInput('MOVE_START', 'UP');
        sendInput('MOVE_STOP', 'DOWN');
    } else if (dy > threshold && !keysDown['s']) {
        keysDown['s'] = true;
        keysDown['w'] = false;
        sendInput('MOVE_START', 'DOWN');
        sendInput('MOVE_STOP', 'UP');
    } else if (Math.abs(dy) <= threshold && (keysDown['w'] || keysDown['s'])) {
        if (keysDown['w']) sendInput('MOVE_STOP', 'UP');
        if (keysDown['s']) sendInput('MOVE_STOP', 'DOWN');
        keysDown['w'] = keysDown['s'] = false;
    }

    // LEFT/RIGHT
    if (dx < -threshold && !keysDown['a']) {
        keysDown['a'] = true;
        keysDown['d'] = false;
        sendInput('MOVE_START', 'LEFT');
        sendInput('MOVE_STOP', 'RIGHT');
    } else if (dx > threshold && !keysDown['d']) {
        keysDown['d'] = true;
        keysDown['a'] = false;
        sendInput('MOVE_START', 'RIGHT');
        sendInput('MOVE_STOP', 'LEFT');
    } else if (Math.abs(dx) <= threshold && (keysDown['a'] || keysDown['d'])) {
        if (keysDown['a']) sendInput('MOVE_STOP', 'LEFT');
        if (keysDown['d']) sendInput('MOVE_STOP', 'RIGHT');
        keysDown['a'] = keysDown['d'] = false;
    }
}

animLoop();

// --- Trading System ---
let shopManualClosed = false;
let lastStationInRange = null;

function drawSpaceStation(obj, ctx, offsetX, offsetY, now) {
    const x = obj.position.x * CELL_SIZE * cameraZoom + offsetX;
    const y = obj.position.y * CELL_SIZE * cameraZoom + offsetY;
    const size = (obj.size || 4) * CELL_SIZE * cameraZoom;
    
    ctx.save();
    
    // Estructura exterior giratoria
    ctx.strokeStyle = obj.color || '#00FFFF';
    ctx.lineWidth = 2 * cameraZoom;
    const rotation = now * 0.0002;
    
    // Dibujar hexágono exterior
    ctx.beginPath();
    for (let i = 0; i <= 6; i++) {
        const angle = (i * 2 * Math.PI) / 6 + rotation;
        const lx = x + Math.cos(angle) * (size * 0.7);
        const ly = y + Math.sin(angle) * (size * 0.7);
        if (i === 0) ctx.moveTo(lx, ly);
        else ctx.lineTo(lx, ly);
    }
    ctx.stroke();

    // Brazos estáticos
    ctx.setLineDash([5 * cameraZoom, 5 * cameraZoom]);
    for (let i = 0; i < 4; i++) {
        const angle = (i * Math.PI / 2) + Math.PI / 4;
        ctx.beginPath();
        ctx.moveTo(x + Math.cos(angle) * size * 0.2, y + Math.sin(angle) * size * 0.2);
        ctx.lineTo(x + Math.cos(angle) * size, y + Math.sin(angle) * size);
        ctx.stroke();
    }
    ctx.setLineDash([]);

    // Núcleo pulsante
    const pulse = Math.sin(now * 0.003) * 0.3 + 0.7;
    const gradient = ctx.createRadialGradient(x, y, 0, x, y, size * 0.4);
    gradient.addColorStop(0, obj.color || '#00FFFF');
    gradient.addColorStop(1, 'transparent');
    
    ctx.fillStyle = gradient;
    ctx.globalAlpha = 0.4 * pulse;
    ctx.beginPath();
    ctx.arc(x, y, size * 0.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1.0;

    // Símbolo central
    ctx.font = `bold ${size * 0.5}px "Fira Code", monospace`;
    ctx.fillStyle = obj.color || '#00FFFF';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(obj.symbol || '⧈', x, y);

    ctx.restore();
}

function toggleShop() {
    const shopPanel = document.getElementById('shop-panel');
    if (shopPanel.style.display === 'none' || !shopPanel.style.display) {
        if (!myPlayer) return;
        
        const nearStation = gameState.objects.find(obj => 
            obj.name.startsWith('STATION') && 
            getDistance(myPlayer.position, obj.position) < 10
        );
        
        if (nearStation) {
            shopPanel.style.display = 'flex';
        } else {
            log("[#f85149]SYSTEM_ERROR: No trading station in range.");
        }
    } else {
        shopPanel.style.display = 'none';
    }
}

function buyItem(item) {
    sendInput('BUY', item);
}

function closeShop() {
    document.getElementById('shop-panel').style.display = 'none';
    shopManualClosed = true;
}

function filterShop(category, btn) {
    const items = document.querySelectorAll('.shop-item-v5');
    const buttons = document.querySelectorAll('.tab-btn');
    
    buttons.forEach(b => b.classList.remove('active'));
    if (btn) btn.classList.add('active');

    items.forEach(item => {
        if (category === 'all' || item.dataset.category === category) {
            item.style.display = 'flex';
        } else {
            item.style.display = 'none';
        }
    });
}

function getDistance(p1, p2) {
    return Math.sqrt(Math.pow(p1.x - p2.x, 2) + Math.pow(p1.y - p2.y, 2));
}
