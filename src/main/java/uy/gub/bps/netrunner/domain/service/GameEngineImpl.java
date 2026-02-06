package uy.gub.bps.netrunner.domain.service;

import org.springframework.stereotype.Service;
import uy.gub.bps.netrunner.domain.model.*;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Random;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

@Service
public class GameEngineImpl implements GameEngine {

    private final Map<UUID, Player> players = new ConcurrentHashMap<>();
    private final Map<UUID, GameObject> worldObjects = new ConcurrentHashMap<>();
    private final Map<UUID, Projectile> projectiles = new ConcurrentHashMap<>();
    private final Map<UUID, Sentinel> sentinels = new ConcurrentHashMap<>();
    private final Map<UUID, java.util.Set<String>> activeInputs = new ConcurrentHashMap<>();
    private final java.util.Queue<String> pendingEvents = new java.util.concurrent.ConcurrentLinkedQueue<>();
    private final Map<UUID, java.util.Queue<String>> privateEvents = new ConcurrentHashMap<>();
    private final java.util.Queue<VisualEffect> pendingEffects = new java.util.concurrent.ConcurrentLinkedQueue<>();
    private final Random random = new Random();

    private static final int WIDTH = 500;
    private static final int HEIGHT = 500;
    private static final int GRID_SIZE = 25;
    private final List<GameObject>[][] spatialGrid = new List[GRID_SIZE][GRID_SIZE];
    private final List<GameObject>[][] staticGrid = new List[GRID_SIZE][GRID_SIZE];
    private static final double ACCEL = 0.012;
    private static final double FRICTION = 1.0;
    private static final double MAX_SPEED = 0.08;
    private static final long RESPAWN_DELAY = 3000;
    private static final int SENTINELS_PER_PLAYER = 3;
    private static final long BOSS_SPAWN_INTERVAL = 300000; // 5 minutes
    private long lastBossSpawnTime = 0;
    private boolean staticObjectsChanged = false;

    // GitHub Dark Palette Symbols & Colors
    private static final String[] SYMBOLS = {"[P]", "{X}", "(O)", "<V>", "/A\\", "0x1"};
    private static final String[] COLORS = {
        "#58a6ff", // blue
        "#3fb950", // green
        "#d29922", // yellow
        "#f85149", // red
        "#bc8cff", // purple
        "#ffffff"  // white
    };

    public GameEngineImpl() {
        for (int i = 0; i < GRID_SIZE; i++) {
            for (int j = 0; j < GRID_SIZE; j++) {
                spatialGrid[i][j] = new ArrayList<>();
                staticGrid[i][j] = new ArrayList<>();
            }
        }
        initWorld();
        updateStaticGrid();
        staticObjectsChanged = false;
    }

    private void initWorld() {
        // Añadir Clusters de Meteoritos
        for (int i = 0; i < 400; i++) {
            spawnMeteoriteCluster(random.nextInt(WIDTH), random.nextInt(HEIGHT));
        }

        // Añadir Clusters Grandes con Recursos
        for (int i = 0; i < 150; i++) {
            spawnLargeResourceCluster(random.nextInt(WIDTH), random.nextInt(HEIGHT));
        }
        
        // Añadir DataNodes iniciales
        for (int i = 0; i < 1000; i++) {
            spawnDataNode();
        }

        // Los centinelas se gestionarán dinámicamente en el update()
    }

    private void spawnSentinel() {
        Sentinel sentinel = Sentinel.builder()
                .position(getRandomEmptyPosition())
                .build();
        sentinels.put(sentinel.getId(), sentinel);
    }

    private void spawnSentinelBoss() {
        Sentinel boss = Sentinel.builder()
                .position(getRandomEmptyPosition())
                .name("NULL")
                .symbol("Ω")
                .color("#ff4500") // OrangeRed
                .hp(50)
                .maxHp(50)
                .shield(10)
                .maxShield(10)
                .weapon(Weapon.laser()) // Boss uses LASER
                .build();
        sentinels.put(boss.getId(), boss);
        pendingEvents.add("[#ff4500]CRITICAL_ALERT: NULL detected in sector!");
    }

    private void spawnLargeResourceCluster(int centerX, int centerY) {
        int radius = 2 + random.nextInt(2); // Más compacto: 2 a 3
        // Crear anillo de asteroides
        for (int x = -radius; x <= radius; x++) {
            for (int y = -radius; y <= radius; y++) {
                double dist = Math.sqrt(x * x + y * y);
                int px = centerX + x;
                int py = centerY + y;

                if (px < 0 || px >= WIDTH || py < 0 || py >= HEIGHT) continue;

                if (dist > radius - 0.8 && dist < radius + 0.5) {
                    // Perímetro: Asteroides normales - Más denso
                    Position pos = new Position(px, py);
                    if (!isOccupied(pos)) {
                        Meteorite met = Meteorite.builder()
                                .position(pos)
                                .symbol("#")
                                .color("#484f58")
                                .name("METEORITE")
                                .hasResources(false)
                                .health(1)
                                .build();
                        worldObjects.put(met.getId(), met);
                    }
                } else if (dist < radius - 0.8) {
                    // Interior: Asteroides con recursos - Menos cantidad y tipos variados
                    if (random.nextInt(10) < 3) { // 30% densidad interior (antes 40%)
                        Position pos = new Position(px, py);
                        if (!isOccupied(pos)) {
                            Ore.OreType type = selectOreType();
                            Meteorite met = Meteorite.builder()
                                    .position(pos)
                                    .symbol("#")
                                    .color(type.color)
                                    .name("ORE_METEORITE")
                                    .hasResources(true)
                                    .resourceType(type)
                                    .health(3)
                                    .build();
                            worldObjects.put(met.getId(), met);
                        }
                    }
                }
            }
        }
    }

    private Ore.OreType selectOreType() {
        int roll = random.nextInt(100);
        if (roll < 60) return Ore.OreType.COPPER; // 60%
        if (roll < 90) return Ore.OreType.SILVER; // 30%
        return Ore.OreType.GOLD; // 10%
    }

    private void spawnMeteoriteCluster(int centerX, int centerY) {
        int size = 5 + random.nextInt(10);
        for (int i = 0; i < size; i++) {
            double ox = random.nextGaussian() * 2.5;
            double oy = random.nextGaussian() * 2.5;
            int px = (int) Math.round(centerX + ox);
            int py = (int) Math.round(centerY + oy);
            
            if (px >= 0 && px < WIDTH && py >= 0 && py < HEIGHT) {
                Position pos = new Position(px, py);
                if (!isOccupied(pos)) {
                    Ore.OreType type = selectOreType();
                    boolean hasResources = random.nextInt(10) < 2; // 20% chance (antes 30%)
                    Meteorite met = Meteorite.builder()
                            .position(pos)
                            .symbol("#")
                            .color(hasResources ? type.color : "#484f58")
                            .name(hasResources ? "ORE_METEORITE" : "METEORITE")
                            .hasResources(hasResources)
                            .resourceType(hasResources ? type : null)
                            .health(hasResources ? 3 : 1)
                            .build();
                    worldObjects.put(met.getId(), met);
                }
            }
        }
    }

    private void spawnDataNode() {
        DataNode node = new DataNode();
        node.setPosition(getRandomEmptyPosition());
        worldObjects.put(node.getId(), node);
        staticObjectsChanged = true;
    }

    @Override
    public Player addPlayer(UUID id, String name) {
        privateEvents.put(id, new java.util.concurrent.ConcurrentLinkedQueue<>());
        String uniqueName = getUniqueName(name);
        Player player = Player.builder()
                .id(id)
                .name(uniqueName)
                .position(getRandomEmptyPosition())
                .symbol(SYMBOLS[random.nextInt(SYMBOLS.length)])
                .color(COLORS[random.nextInt(COLORS.length)])
                .score(0)
                .hp(5)
                .maxHp(5)
                .shield(0)
                .maxShield(0)
                .copper(0)
                .silver(0)
                .gold(0)
                .lastDirection("UP")
                .build();
        players.put(id, player);
        pendingEvents.add("[#58a6ff]Agent " + uniqueName + " uplink established.");
        return player;
    }

    private String getUniqueName(String baseName) {
        String candidate = baseName;
        int count = 1;
        while (isNameTaken(candidate)) {
            candidate = baseName + " (" + count + ")";
            count++;
        }
        return candidate;
    }

    private boolean isNameTaken(String name) {
        return players.values().stream().anyMatch(p -> p.getName().equalsIgnoreCase(name));
    }

    private Position getRandomEmptyPosition() {
        Position pos;
        int attempts = 0;
        do {
            pos = new Position(random.nextInt(WIDTH), random.nextInt(HEIGHT));
            attempts++;
        } while (isOccupied(pos) && attempts < 100);
        return pos;
    }

    private boolean isOccupied(Position pos) {
        return getNearbyObjects(pos.x(), pos.y(), 1.0).stream()
                .anyMatch(o -> Math.abs(o.getPosition().x() - pos.x()) < 0.5 && Math.abs(o.getPosition().y() - pos.y()) < 0.5);
    }

    @Override
    public void removePlayer(UUID id) {
        Player player = players.remove(id);
        activeInputs.remove(id);
        privateEvents.remove(id);
        if (player != null) {
            pendingEvents.add("[#f85149]Agent " + player.getName() + " connection lost.");
        }
    }

    @Override
    public void processInput(UUID playerId, InputMessage input) {
        Player player = players.get(playerId);
        if (player == null || player.getRespawnTimer() > 0) return;

        switch (input.getType().toUpperCase()) {
            case "MOVE_START" -> activeInputs.computeIfAbsent(playerId, k -> java.util.concurrent.ConcurrentHashMap.newKeySet()).add(input.getPayload().toUpperCase());
            case "MOVE_STOP" -> {
                java.util.Set<String> inputs = activeInputs.get(playerId);
                if (inputs != null) inputs.remove(input.getPayload().toUpperCase());
            }
            case "SHOOT" -> {
                if (input.getPayload() != null && input.getPayload().contains(",")) {
                    try {
                        String[] parts = input.getPayload().split(",");
                        double tx = Double.parseDouble(parts[0]);
                        double ty = Double.parseDouble(parts[1]);
                        handleShootTowards(player, tx, ty);
                    } catch (Exception e) {
                        handleShoot(player);
                    }
                } else {
                    handleShoot(player);
                }
            }
            case "CHANGE_NAME" -> handleChangeName(player, input.getPayload());
            case "CHANGE_COLOR" -> handleChangeColor(player);
            case "SCANNER_STATE" -> player.setScannerActive(Boolean.parseBoolean(input.getPayload()));
            case "CHAT" -> handleChat(player, input.getPayload());
        }
    }

    private void handleChangeColor(Player player) {
        int currentIndex = -1;
        for (int i = 0; i < COLORS.length; i++) {
            if (COLORS[i].equalsIgnoreCase(player.getColor())) {
                currentIndex = i;
                break;
            }
        }
        int nextIndex = (currentIndex + 1) % COLORS.length;
        String newColor = COLORS[nextIndex];
        player.setColor(newColor);
        pendingEvents.add("[" + newColor + "]Agent " + player.getName() + " updated signature color.");
    }

    private void handleChat(Player player, String message) {
        if (message == null || message.trim().isEmpty()) return;
        String sanitized = message.trim();
        
        if (sanitized.startsWith("!")) {
            handleCommand(player, sanitized);
            return;
        }

        if (sanitized.length() > 100) sanitized = sanitized.substring(0, 100);
        pendingEvents.add("[" + player.getColor() + "]" + player.getName() + ": [#c9d1d9]" + sanitized);
    }

    private void handleCommand(Player sender, String message) {
        String[] parts = message.split("\\s+");
        if (parts.length == 0) return;
        String cmd = parts[0].toLowerCase();

        switch (cmd) {
            case "!help" -> {
                addPrivateEvent(sender.getId(), "[#d29922]>>> COMMAND SYSTEM <<<");
                addPrivateEvent(sender.getId(), "[#d29922]!help -> Show this help message.");
                addPrivateEvent(sender.getId(), "[#d29922]!whisp <name> <msg> -> Send a private message.");
                addPrivateEvent(sender.getId(), "[#d29922]!weapons -> List available weapon types.");
                addPrivateEvent(sender.getId(), "[#d29922]!ore -> List available ore types.");
                addPrivateEvent(sender.getId(), "[#d29922]!give [target] <weapon|ore|shield> <value> -> Grant equipment or resources.");
                addPrivateEvent(sender.getId(), "[#d29922]   Ex: !give shield 10 | !give John ore gold 500");
            }
            case "!whisp" -> {
                if (parts.length < 3) {
                    addPrivateEvent(sender.getId(), "[#f85149]ERROR: Correct usage: !whisp <playerName> <message>");
                    return;
                }
                Player target = findPlayerByName(parts[1]);
                if (target == null) {
                    addPrivateEvent(sender.getId(), "[#f85149]ERROR: Agent '" + parts[1] + "' not found.");
                    return;
                }
                StringBuilder sb = new StringBuilder();
                for (int i = 2; i < parts.length; i++) {
                    sb.append(parts[i]).append(" ");
                }
                String whisper = sb.toString().trim();
                addPrivateEvent(target.getId(), "[#bc8cff][WHISPER] " + sender.getName() + ": " + whisper);
                addPrivateEvent(sender.getId(), "[#bc8cff][TO " + target.getName() + "]: " + whisper);
            }
            case "!weapons", "!weapon" -> {
                addPrivateEvent(sender.getId(), "[#d29922]>>> AVAILABLE WEAPONS <<<");
                addPrivateEvent(sender.getId(), "[#d29922]- basic: BASIC_BLASTER");
                addPrivateEvent(sender.getId(), "[#d29922]- shotgun: STREET_SWEEPER");
                addPrivateEvent(sender.getId(), "[#d29922]- laser: PULSE_LASER");
                addPrivateEvent(sender.getId(), "[#d29922]- missile: HELLFIRE_MISSILE");
            }
            case "!ore" -> {
                addPrivateEvent(sender.getId(), "[#d29922]>>> AVAILABLE ORE TYPES <<<");
                addPrivateEvent(sender.getId(), "[#d29922]- copper");
                addPrivateEvent(sender.getId(), "[#d29922]- silver");
                addPrivateEvent(sender.getId(), "[#d29922]- gold");
            }
            case "!give" -> {
                if (parts.length < 3) {
                    addPrivateEvent(sender.getId(), "[#f85149]ERROR: Correct usage: !give [target] <type> <value>");
                    return;
                }

                int offset = 0;
                Player target = sender;
                String firstArg = parts[1].toLowerCase();

                if (!firstArg.equals("weapon") && !firstArg.equals("ore") && !firstArg.equals("shield") && !firstArg.equals("arma")) {
                    target = findPlayerByName(parts[1]);
                    if (target != null) {
                        offset = 1;
                    } else {
                        addPrivateEvent(sender.getId(), "[#f85149]ERROR: Agent '" + parts[1] + "' not found.");
                        return;
                    }
                }

                if (parts.length < 3 + offset) {
                    addPrivateEvent(sender.getId(), "[#f85149]ERROR: Missing arguments.");
                    return;
                }

                String type = parts[1 + offset].toLowerCase();
                String value = parts[2 + offset].toLowerCase();

                switch (type) {
                    case "weapon", "arma" -> {
                        Weapon w;
                        switch (value) {
                            case "basic" -> w = Weapon.basic();
                            case "shotgun" -> w = Weapon.shotgun();
                            case "laser" -> w = Weapon.laser();
                            case "missile" -> w = Weapon.missile();
                            default -> {
                                addPrivateEvent(sender.getId(), "[#f85149]ERROR: Unknown weapon.");
                                return;
                            }
                        }
                        target.setWeapon(w);
                        addPrivateEvent(sender.getId(), "[#3fb950]SUCCESS: " + target.getName() + "'s weapon updated to " + w.getName());
                    }
                    case "shield" -> {
                        try {
                            int amount = Integer.parseInt(value);
                            target.setShield(amount);
                            addPrivateEvent(sender.getId(), "[#3fb950]SUCCESS: " + target.getName() + "'s shields adjusted to " + amount);
                        } catch (NumberFormatException e) {
                            addPrivateEvent(sender.getId(), "[#f85149]ERROR: Invalid shield amount.");
                        }
                    }
                    case "ore" -> {
                        if (parts.length < 4 + offset) {
                            addPrivateEvent(sender.getId(), "[#f85149]ERROR: Use !give [target] ore <type> <amount>");
                            return;
                        }
                        String oreType = parts[2 + offset].toLowerCase();
                        int amount;
                        try {
                            amount = Integer.parseInt(parts[3 + offset]);
                        } catch (NumberFormatException e) {
                            addPrivateEvent(sender.getId(), "[#f85149]ERROR: Invalid ore amount.");
                            return;
                        }
                        switch (oreType) {
                            case "copper" -> target.setCopper(target.getCopper() + amount);
                            case "silver" -> target.setSilver(target.getSilver() + amount);
                            case "gold" -> target.setGold(target.getGold() + amount);
                            default -> {
                                addPrivateEvent(sender.getId(), "[#f85149]ERROR: Unknown ore type.");
                                return;
                            }
                        }
                        addPrivateEvent(sender.getId(), "[#3fb950]SUCCESS: Resources added to " + target.getName());
                    }
                    default -> addPrivateEvent(sender.getId(), "[#f85149]ERROR: Unknown gift type.");
                }
            }
            default -> addPrivateEvent(sender.getId(), "[#f85149]ERROR: Command '" + cmd + "' not recognized. Use !help.");
        }
    }

    private Player findPlayerByName(String name) {
        return players.values().stream()
                .filter(p -> p.getName().equalsIgnoreCase(name))
                .findFirst()
                .orElse(null);
    }

    private void applyAcceleration(Player player, String direction) {
        double currentMaxSpeed = player.isScannerActive() ? MAX_SPEED / 2.0 : MAX_SPEED;
        double accel = player.isScannerActive() ? ACCEL / 2.0 : ACCEL;
        switch (direction) {
            case "UP" -> player.setVy(player.getVy() - accel);
            case "DOWN" -> player.setVy(player.getVy() + accel);
            case "LEFT" -> player.setVx(player.getVx() - accel);
            case "RIGHT" -> player.setVx(player.getVx() + accel);
        }

        // Normalizar velocidad si excede el máximo
        double vx = player.getVx();
        double vy = player.getVy();
        double speed = Math.sqrt(vx * vx + vy * vy);
        if (speed > currentMaxSpeed) {
            player.setVx((vx / speed) * currentMaxSpeed);
            player.setVy((vy / speed) * currentMaxSpeed);
        }
    }

    private void handleShoot(Player player) {
        if (player.isScannerActive()) return;
        Weapon w = player.getWeapon();
        double targetX = player.getPosition().x();
        double targetY = player.getPosition().y();
        
        switch (player.getLastDirection()) {
            case "UP" -> targetY -= 1;
            case "DOWN" -> targetY += 1;
            case "LEFT" -> targetX -= 1;
            case "RIGHT" -> targetX += 1;
        }
        
        long now = System.currentTimeMillis();
        if (now - player.getLastShotTime() < w.getFireRate()) return;
        player.setLastShotTime(now);

        fireWeapon(player.getId(), player.getPosition(), player.getColor(), w, targetX, targetY);
    }

    private void handleShootTowards(Player player, double targetX, double targetY) {
        if (player.isScannerActive()) return;
        Weapon w = player.getWeapon();
        long now = System.currentTimeMillis();
        if (now - player.getLastShotTime() < w.getFireRate()) return;
        player.setLastShotTime(now);

        fireWeapon(player.getId(), player.getPosition(), player.getColor(), w, targetX, targetY);
    }

    private void fireWeapon(UUID ownerId, Position pos, String color, Weapon weapon, double targetX, double targetY) {
        double dx = targetX - pos.x();
        double dy = targetY - pos.y();
        double dist = Math.sqrt(dx * dx + dy * dy);
        
        double vx, vy;
        if (dist < 0.001) {
            vx = weapon.getProjectileSpeed();
            vy = 0;
        } else {
            vx = (dx / dist) * weapon.getProjectileSpeed();
            vy = (dy / dist) * weapon.getProjectileSpeed();
        }

        switch (weapon.getPattern()) {
            case SINGLE, MISSILE, LASER -> 
                createProjectile(ownerId, pos, vx, vy, color, weapon.getSpread(), weapon.getRange(), weapon.getDamage(), weapon.getPattern() == Weapon.ShotPattern.MISSILE, 0, weapon.getProjectileSymbol());
            case SPREAD -> {
                for (int i = -2; i <= 2; i++) {
                    createProjectile(ownerId, pos, vx, vy, color, weapon.getSpread(), weapon.getRange(), weapon.getDamage(), false, i * 0.15, weapon.getProjectileSymbol());
                }
            }
        }
    }

    private void createProjectile(UUID ownerId, Position pos, double vx, double vy, String color, double spread, double range, int damage, boolean explosive, double angleOffset, String symbol) {
        double angle = Math.atan2(vy, vx) + angleOffset;
        angle += (random.nextDouble() - 0.5) * spread;
        
        double speed = Math.sqrt(vx * vx + vy * vy);
        double finalVx = Math.cos(angle) * speed;
        double finalVy = Math.sin(angle) * speed;

        Projectile projectile = Projectile.builder()
                .position(pos)
                .vx(finalVx)
                .vy(finalVy)
                .maxRange(range)
                .damage(damage)
                .explosive(explosive)
                .ownerId(ownerId)
                .color(color)
                .symbol(symbol)
                .build();
        projectiles.put(projectile.getId(), projectile);
    }

    private void handleChangeName(Player player, String newName) {
        if (newName == null || newName.trim().isEmpty()) return;
        String oldName = player.getName();
        player.setName("PENDING_NAME_CHANGE_" + UUID.randomUUID()); // Liberar su nombre actual
        String uniqueName = getUniqueName(newName.trim());
        player.setName(uniqueName);
        pendingEvents.add("[#58a6ff]Agent " + oldName + " re-identified as " + uniqueName);
    }

    private void damagePlayer(Player hitPlayer, UUID shooterId, int damage) {
        pendingEffects.add(new VisualEffect("HIT", hitPlayer.getPosition().x(), hitPlayer.getPosition().y(), hitPlayer.getColor()));
        int remainingDamage = damage;
        if (hitPlayer.getShield() > 0) {
            int shieldDamage = Math.min(hitPlayer.getShield(), remainingDamage);
            hitPlayer.setShield(hitPlayer.getShield() - shieldDamage);
            remainingDamage -= shieldDamage;
        }

        if (remainingDamage > 0) {
            hitPlayer.setHp(hitPlayer.getHp() - remainingDamage);
        }

        if (hitPlayer.getHp() <= 0) {
            pendingEffects.add(new VisualEffect("EXPLOSION", hitPlayer.getPosition().x(), hitPlayer.getPosition().y(), hitPlayer.getColor()));
            respawnPlayer(hitPlayer);
            Player shooter = players.get(shooterId);
            if (shooter != null) {
                shooter.setScore(shooter.getScore() + 500);
                addExperience(shooter, 100);
                pendingEvents.add("[" + shooter.getColor() + "]Agent " + shooter.getName() + " [#f85149]terminated [" + hitPlayer.getColor() + "]Agent " + hitPlayer.getName());
            } else {
                pendingEvents.add("[#f85149]Agent " + hitPlayer.getName() + " was decommissioned.");
            }
        }
    }

    private void damageSentinel(Sentinel sent, UUID shooterId, int damage) {
        pendingEffects.add(new VisualEffect("HIT", sent.getPosition().x(), sent.getPosition().y(), sent.getColor()));
        
        int remainingDamage = damage;
        if (sent.getShield() > 0) {
            int shieldDamage = Math.min(sent.getShield(), remainingDamage);
            sent.setShield(sent.getShield() - shieldDamage);
            remainingDamage -= shieldDamage;
        }

        if (remainingDamage > 0) {
            sent.setHp(sent.getHp() - remainingDamage);
        }

        if (sent.getHp() <= 0) {
            sentinels.remove(sent.getId());
            pendingEffects.add(new VisualEffect("EXPLOSION", sent.getPosition().x(), sent.getPosition().y(), sent.getColor()));
            
            boolean isBoss = "NULL".equals(sent.getName());
            if (isBoss) {
                pendingEvents.add("[#ff4500]NULL neutralized!");
                // Drop many ores
                for (int i = 0; i < 5; i++) spawnOreBatch(sent.getPosition(), Ore.OreType.GOLD, 1);
                for (int i = 0; i < 10; i++) spawnOreBatch(sent.getPosition(), Ore.OreType.SILVER, 1);
            } else {
                pendingEvents.add("[#f85149]Sentinel decommissioned.");
            }

            Player shooter = players.get(shooterId);
            if (shooter != null) {
                int scoreGain = isBoss ? 5000 : 300;
                int expGain = isBoss ? 1000 : 150;
                shooter.setScore(shooter.getScore() + scoreGain);
                addExperience(shooter, expGain);
            }
        }
    }

    private void addExperience(Player player, int amount) {
        player.setExp(player.getExp() + amount);
        int expNeeded = player.getLevel() * 500;
        if (player.getExp() >= expNeeded) {
            player.setExp(player.getExp() - expNeeded);
            player.setLevel(player.getLevel() + 1);
            player.setHp(5); // Heal on level up
            player.setShield(0);
            
            // Progresión de escudos: +1 de capacidad cada nivel hasta un máximo de 3
            if (player.getMaxShield() < 3) {
                player.setMaxShield(player.getMaxShield() + 1);
                pendingEvents.add("[" + player.getColor() + "]Agent " + player.getName() + " [#58a6ff]shield capacity upgraded!");
            }

            // Progresión de armas
            if (player.getLevel() == 2) {
                player.setWeapon(Weapon.shotgun());
                pendingEvents.add("[" + player.getColor() + "]Agent " + player.getName() + " [#58a6ff]unlocked STREET_SWEEPER (Shotgun)!");
            } else if (player.getLevel() == 4) {
                player.setWeapon(Weapon.laser());
                pendingEvents.add("[" + player.getColor() + "]Agent " + player.getName() + " [#58a6ff]unlocked PULSE_LASER!");
            } else if (player.getLevel() == 6) {
                player.setWeapon(Weapon.missile());
                pendingEvents.add("[" + player.getColor() + "]Agent " + player.getName() + " [#58a6ff]unlocked HELLFIRE_MISSILES!");
            }

            pendingEvents.add("[" + player.getColor() + "]Agent " + player.getName() + " [#58a6ff]leveled up to Lvl " + player.getLevel() + "!");
        }
    }

    private void handleExplosion(Position pos, UUID shooterId, int damage) {
        pendingEffects.add(new VisualEffect("EXPLOSION", pos.x(), pos.y(), "#ff4500"));
        double explosionRadius = 2.5;
        
        List<GameObject> nearby = getNearbyObjects(pos.x(), pos.y(), explosionRadius);
        for (GameObject obj : nearby) {
            double dist = Math.sqrt(Math.pow(obj.getPosition().x() - pos.x(), 2) + Math.pow(obj.getPosition().y() - pos.y(), 2));
            if (dist < explosionRadius) {
                if (obj instanceof Player p) {
                    if (p.getRespawnTimer() == 0) damagePlayer(p, shooterId, damage);
                } else if (obj instanceof Sentinel s) {
                    damageSentinel(s, shooterId, damage);
                } else if (obj instanceof Meteorite met) {
                    met.setHealth(met.getHealth() - damage);
                    if (met.getHealth() <= 0) {
                        destroyMeteorite(met);
                    }
                }
            }
        }
    }

    private void destroyMeteorite(Meteorite met) {
        if (worldObjects.remove(met.getId()) != null) {
            staticObjectsChanged = true;
        }
        pendingEffects.add(new VisualEffect("DEBRIS", met.getPosition().x(), met.getPosition().y(), met.getColor()));
        if (met.isHasResources()) {
            Ore ore = Ore.builder()
                    .position(met.getPosition())
                    .type(met.getResourceType())
                    .build();
            worldObjects.put(ore.getId(), ore);
            staticObjectsChanged = true;
        }
    }

    private void checkProjectileMeteoriteCollision(Position pos, List<UUID> toRemoveList, int damage) {
        int ix = (int) Math.round(pos.x());
        int iy = (int) Math.round(pos.y());
        
        getNearbyObjects(pos.x(), pos.y(), 1.0).stream()
                .filter(o -> (o instanceof Meteorite && (int)Math.round(o.getPosition().x()) == ix && (int)Math.round(o.getPosition().y()) == iy) ||
                            (o instanceof Sentinel && Math.abs(o.getPosition().x() - pos.x()) < 0.7 && Math.abs(o.getPosition().y() - pos.y()) < 0.7))
                .findFirst()
                .ifPresent(obj -> {
                    if (obj instanceof Meteorite met) {
                        met.setHealth(met.getHealth() - damage);
                        if (met.getHealth() <= 0) {
                            destroyMeteorite(met);
                        } else {
                            pendingEffects.add(new VisualEffect("HIT", met.getPosition().x(), met.getPosition().y(), met.getColor()));
                        }
                    } else if (obj instanceof Sentinel sent) {
                        damageSentinel(sent, null, damage);
                    }
                });
    }

    private synchronized void updateStaticGrid() {
        for (int i = 0; i < GRID_SIZE; i++) {
            for (int j = 0; j < GRID_SIZE; j++) {
                staticGrid[i][j].clear();
            }
        }
        worldObjects.values().forEach(obj -> addToGrid(obj, staticGrid));
    }

    private synchronized void updateSpatialGrid() {
        for (int i = 0; i < GRID_SIZE; i++) {
            for (int j = 0; j < GRID_SIZE; j++) {
                spatialGrid[i][j].clear();
            }
        }
        // Solo entidades dinámicas
        sentinels.values().forEach(s -> addToGrid(s, spatialGrid));
        projectiles.values().forEach(p -> addToGrid(p, spatialGrid));
        players.values().stream()
                .filter(p -> p.getRespawnTimer() == 0)
                .forEach(p -> addToGrid(p, spatialGrid));
    }

    private synchronized void addToGrid(GameObject obj, List<GameObject>[][] grid) {
        int gx = Math.min(GRID_SIZE - 1, Math.max(0, (int) (obj.getPosition().x() / (WIDTH / GRID_SIZE))));
        int gy = Math.min(GRID_SIZE - 1, Math.max(0, (int) (obj.getPosition().y() / (HEIGHT / GRID_SIZE))));
        grid[gx][gy].add(obj);
    }

    private synchronized List<GameObject> getNearbyObjects(double x, double y, double radius) {
        List<GameObject> nearby = new ArrayList<>();
        int gx = Math.min(GRID_SIZE - 1, Math.max(0, (int) (x / (WIDTH / GRID_SIZE))));
        int gy = Math.min(GRID_SIZE - 1, Math.max(0, (int) (y / (HEIGHT / GRID_SIZE))));
        int cellRadius = (int) Math.ceil(radius / (WIDTH / GRID_SIZE)) + 1;

        for (int i = gx - cellRadius; i <= gx + cellRadius; i++) {
            for (int j = gy - cellRadius; j <= gy + cellRadius; j++) {
                if (i >= 0 && i < GRID_SIZE && j >= 0 && j < GRID_SIZE) {
                    nearby.addAll(spatialGrid[i][j]);
                    nearby.addAll(staticGrid[i][j]);
                }
            }
        }
        return nearby;
    }

    @Override
    public void update() {
        long now = System.currentTimeMillis();
        updateSpatialGrid();
        if (staticObjectsChanged) {
            updateStaticGrid();
            staticObjectsChanged = false;
        }
        manageSentinels();

        // Spawn Boss every 5 minutes if there are players
        if (!players.isEmpty() && now - lastBossSpawnTime > BOSS_SPAWN_INTERVAL) {
            lastBossSpawnTime = now;
            spawnSentinelBoss();
        }

        // Procesar respawns
        players.values().forEach(p -> {
            if (p.getRespawnTimer() > 0) {
                if (now >= p.getRespawnTimer()) {
                    p.setRespawnTimer(0);
                    p.setPosition(getRandomEmptyPosition());
                    p.setHp(5);
                    p.setShield(0);
                    p.setVx(0);
                    p.setVy(0);
                }
            }
        });

        // Aplicar entradas activas a los jugadores vivos
        activeInputs.forEach((playerId, inputs) -> {
            Player p = players.get(playerId);
            if (p != null && p.getRespawnTimer() == 0) {
                inputs.forEach(dir -> applyAcceleration(p, dir));
            }
        });

        // IA de Sentinelas
        sentinels.values().forEach(sent -> {
            // Movimiento aleatorio suave
            if (random.nextInt(60) == 0) {
                sent.setVx((random.nextDouble() - 0.5) * 0.05);
                sent.setVy((random.nextDouble() - 0.5) * 0.05);
            }
            
            Position nextSentPos = sent.getPosition().move(sent.getVx(), sent.getVy());
            if (isValidPosition(nextSentPos) && !isOccupiedBySolid(nextSentPos)) {
                sent.setPosition(nextSentPos);
            } else {
                sent.setVx(-sent.getVx());
                sent.setVy(-sent.getVy());
            }

            // Disparar si hay jugadores cerca
            boolean isBoss = "NULL".equals(sent.getName());
            double detectionRange = isBoss ? 25 : 8;

            getNearbyObjects(sent.getPosition().x(), sent.getPosition().y(), detectionRange).stream()
                    .filter(o -> o instanceof Player p && p.getRespawnTimer() == 0)
                    .map(o -> (Player) o)
                    .filter(p -> Math.sqrt(Math.pow(p.getPosition().x() - sent.getPosition().x(), 2) + 
                                           Math.pow(p.getPosition().y() - sent.getPosition().y(), 2)) < detectionRange)
                    .findFirst()
                    .ifPresent(target -> {
                        Weapon w = sent.getWeapon();
                        if (now - sent.getLastShotTime() > w.getFireRate()) {
                            sent.setLastShotTime(now);
                            fireWeapon(sent.getId(), sent.getPosition(), sent.getColor(), w, target.getPosition().x(), target.getPosition().y());
                        }
                    });
        });

        // Recarga de escudos lenta
        if (random.nextInt(300) < 1) { // ~cada 5 segundos a 60fps
            players.values().stream()
                    .filter(p -> p.getRespawnTimer() == 0)
                    .forEach(p -> {
                        if (p.getShield() < p.getMaxShield()) p.setShield(p.getShield() + 1);
                    });
        }
        // Actualizar Proyectiles
        List<UUID> toRemove = new ArrayList<>();
        projectiles.values().forEach(proj -> {
            Position nextPos = proj.getPosition().move(proj.getVx(), proj.getVy());
            double speed = Math.sqrt(proj.getVx() * proj.getVx() + proj.getVy() * proj.getVy());
            proj.setDistanceTraveled(proj.getDistanceTraveled() + speed);

            if (!isValidPosition(nextPos) || isOccupiedBySolid(nextPos) || proj.getDistanceTraveled() >= proj.getMaxRange()) {
                toRemove.add(proj.getId());
                if (proj.isExplosive()) {
                    handleExplosion(proj.getPosition(), proj.getOwnerId(), proj.getDamage());
                }
                if (proj.getDistanceTraveled() < proj.getMaxRange()) {
                    // Solo dañar meteorito si no expiró por rango
                    checkProjectileMeteoriteCollision(nextPos, toRemove, proj.getDamage());
                }
            } else {
                proj.setPosition(nextPos);
                // Check collision with players and Sentinels using spatial grid
                getNearbyObjects(nextPos.x(), nextPos.y(), 1.0).stream()
                        .filter(o -> (o instanceof Player || o instanceof Sentinel) && !o.getId().equals(proj.getOwnerId()))
                        .filter(o -> {
                            if (o instanceof Player p) return p.getRespawnTimer() == 0 && Math.abs(p.getPosition().x() - nextPos.x()) < 0.7 && Math.abs(p.getPosition().y() - nextPos.y()) < 0.7;
                            if (o instanceof Sentinel s) return Math.abs(s.getPosition().x() - nextPos.x()) < 0.7 && Math.abs(s.getPosition().y() - nextPos.y()) < 0.7;
                            return false;
                        })
                        .findFirst()
                        .ifPresent(hitObj -> {
                            if (hitObj instanceof Player p) damagePlayer(p, proj.getOwnerId(), proj.getDamage());
                            else if (hitObj instanceof Sentinel s) damageSentinel(s, proj.getOwnerId(), proj.getDamage());
                            
                            if (proj.isExplosive()) {
                                handleExplosion(proj.getPosition(), proj.getOwnerId(), proj.getDamage());
                            }
                            toRemove.add(proj.getId());
                        });
            }
        });
        toRemove.forEach(id -> {
            projectiles.remove(id);
        });

        // Actualizar Jugadores (Movimiento e Inercia)
        players.values().stream()
                .filter(p -> p.getRespawnTimer() == 0)
                .forEach(p -> {
                    double nextX = p.getPosition().x() + p.getVx();
                    double nextY = p.getPosition().y() + p.getVy();
                    double speed = Math.sqrt(p.getVx() * p.getVx() + p.getVy() * p.getVy());
                    boolean collision = false;
                    
                    // Colisiones con bordes
                    if (nextX < 0) { nextX = 0; p.setVx(0); collision = true; }
                    if (nextX >= WIDTH) { nextX = WIDTH - 1; p.setVx(0); collision = true; }
                    if (nextY < 0) { nextY = 0; p.setVy(0); collision = true; }
                    if (nextY >= HEIGHT) { nextY = HEIGHT - 1; p.setVy(0); collision = true; }
                    
                    // Probar movimiento en X
                    Position posWithX = new Position(nextX, p.getPosition().y());
                    if (!isOccupiedBySolid(posWithX)) {
                        p.setPosition(posWithX);
                    } else {
                        p.setVx(0);
                        collision = true;
                    }
                    
                    // Probar movimiento en Y
                    Position posWithY = new Position(p.getPosition().x(), nextY);
                    if (!isOccupiedBySolid(posWithY)) {
                        p.setPosition(posWithY);
                    } else {
                        p.setVy(0);
                        collision = true;
                    }

                    if (collision && speed > 0.08) {
                        applyEnvironmentalDamage(p);
                    }
                    
                    // Aplicar Fricción
                    p.setVx(p.getVx() * FRICTION);
                    p.setVy(p.getVy() * FRICTION);

                    // Re-aplicar límite de velocidad si el scanner está activo
                    if (p.isScannerActive()) {
                        double currentMaxSpeed = MAX_SPEED / 2.0;
                        double currentSpeed = Math.sqrt(p.getVx() * p.getVx() + p.getVy() * p.getVy());
                        if (currentSpeed > currentMaxSpeed) {
                            p.setVx((p.getVx() / currentSpeed) * currentMaxSpeed);
                            p.setVy((p.getVy() / currentSpeed) * currentMaxSpeed);
                        }
                    }
                    
                    if (Math.abs(p.getVx()) < 0.01) p.setVx(0);
                    if (Math.abs(p.getVy()) < 0.01) p.setVy(0);
                    
                    checkCollisions(p, p.getPosition());
                });
    }

    private void applyEnvironmentalDamage(Player p) {
        pendingEffects.add(new VisualEffect("HIT", p.getPosition().x(), p.getPosition().y(), p.getColor()));
        if (p.getShield() > 0) {
            p.setShield(p.getShield() - 1);
        } else {
            p.setHp(p.getHp() - 1);
        }

        if (p.getHp() <= 0) {
            pendingEffects.add(new VisualEffect("EXPLOSION", p.getPosition().x(), p.getPosition().y(), p.getColor()));
            respawnPlayer(p);
            pendingEvents.add("[#f85149]Agent " + p.getName() + " structural failure due to impact.");
        }
    }

    private void respawnPlayer(Player player) {
        dropOres(player);
        player.setHp(0);
        player.setShield(0);
        player.setMaxShield(0);
        player.setLevel(1);
        player.setExp(0);
        player.setWeapon(Weapon.basic());
        player.setVx(0);
        player.setVy(0);
        player.setRespawnTimer(System.currentTimeMillis() + RESPAWN_DELAY);
        player.setScore(Math.max(0, player.getScore() - 200));
        
        // Limpiar inputs para evitar movimiento automático al aparecer
        activeInputs.remove(player.getId());
    }

    private void dropOres(Player player) {
        Position pos = player.getPosition();
        
        spawnOreBatch(pos, Ore.OreType.COPPER, player.getCopper());
        spawnOreBatch(pos, Ore.OreType.SILVER, player.getSilver());
        spawnOreBatch(pos, Ore.OreType.GOLD, player.getGold());
        
        player.setCopper(0);
        player.setSilver(0);
        player.setGold(0);
    }

    private void spawnOreBatch(Position pos, Ore.OreType type, int count) {
        for (int i = 0; i < count; i++) {
            // Dispersión aleatoria alrededor del punto de muerte
            double ox = (random.nextDouble() - 0.5) * 1.5;
            double oy = (random.nextDouble() - 0.5) * 1.5;
            Position dropPos = new Position(pos.x() + ox, pos.y() + oy);
            
            // Límites del mapa
            if (isValidPosition(dropPos)) {
                Ore ore = Ore.builder()
                        .position(dropPos)
                        .type(type)
                        .build();
                worldObjects.put(ore.getId(), ore);
                staticObjectsChanged = true;
            }
        }
    }

    private void checkCollisions(Player player, Position pos) {
        List<GameObject> nearby = getNearbyObjects(pos.x(), pos.y(), 1.5);
        for (GameObject obj : nearby) {
            if (obj instanceof DataNode && Math.abs(obj.getPosition().x() - pos.x()) < 0.8 && Math.abs(obj.getPosition().y() - pos.y()) < 0.8) {
                if (worldObjects.remove(obj.getId()) != null) {
                    staticObjectsChanged = true;
                    player.setScore(player.getScore() + 100);
                    addExperience(player, 25);
                    pendingEffects.add(new VisualEffect("COLLECT", obj.getPosition().x(), obj.getPosition().y(), obj.getColor()));
                    spawnDataNode();
                }
            } else if (obj instanceof Ore ore && Math.abs(obj.getPosition().x() - pos.x()) < 0.8 && Math.abs(obj.getPosition().y() - pos.y()) < 0.8) {
                if (worldObjects.remove(obj.getId()) != null) {
                    staticObjectsChanged = true;
                    if (ore.getType() == Ore.OreType.COPPER) player.setCopper(player.getCopper() + 1);
                    else if (ore.getType() == Ore.OreType.SILVER) player.setSilver(player.getSilver() + 1);
                    else if (ore.getType() == Ore.OreType.GOLD) player.setGold(player.getGold() + 1);
                    
                    addExperience(player, ore.getType().value / 2);
                    
                    if (player.getHp() < 5) {
                        int healAmount = switch (ore.getType()) {
                            case COPPER -> 1;
                            case SILVER -> 2;
                            case GOLD -> 3;
                        };
                        int oldHp = player.getHp();
                        player.setHp(Math.min(5, player.getHp() + healAmount));
                        if (player.getHp() > oldHp) {
                            pendingEvents.add("[" + player.getColor() + "]" + player.getName() + " [#3fb950]integrity restored (+" + (player.getHp() - oldHp) + " HP)");
                        }
                    }

                    player.setScore(player.getScore() + ore.getType().value);
                    pendingEffects.add(new VisualEffect("COLLECT", obj.getPosition().x(), obj.getPosition().y(), obj.getColor()));
                }
            }
        }
    }

    private void manageSentinels() {
        List<Sentinel> currentSentinels = sentinels.values().stream()
                .filter(s -> !"NULL".equals(s.getName())) // Don't manage boss here
                .toList();
        
        int targetCount = players.size() * SENTINELS_PER_PLAYER;
        int currentCount = currentSentinels.size();

        if (currentCount < targetCount) {
            for (int i = 0; i < targetCount - currentCount; i++) {
                spawnSentinel();
            }
        } else if (currentCount > targetCount) {
            for (int i = 0; i < currentCount - targetCount; i++) {
                Sentinel toRemove = currentSentinels.get(i);
                sentinels.remove(toRemove.getId());
                pendingEffects.add(new VisualEffect("EXPLOSION", toRemove.getPosition().x(), toRemove.getPosition().y(), toRemove.getColor()));
            }
        }
    }

    private boolean isOccupiedBySolid(Position pos) {
        int ix = (int) Math.round(pos.x());
        int iy = (int) Math.round(pos.y());
        return getNearbyObjects(pos.x(), pos.y(), 1.0).stream()
                .filter(o -> o instanceof Meteorite)
                .anyMatch(o -> (int)Math.round(o.getPosition().x()) == ix && (int)Math.round(o.getPosition().y()) == iy);
    }

    private boolean isValidPosition(Position pos) {
        return pos.x() >= 0 && pos.x() < WIDTH && pos.y() >= 0 && pos.y() < HEIGHT;
    }

    @Override
    public java.util.List<String> getPendingEvents() {
        java.util.List<String> events = new ArrayList<>();
        while (!pendingEvents.isEmpty()) {
            events.add(pendingEvents.poll());
        }
        return events;
    }

    @Override
    public java.util.List<String> getPendingEvents(UUID playerId) {
        java.util.List<String> events = new ArrayList<>();
        java.util.Queue<String> queue = privateEvents.get(playerId);
        if (queue != null) {
            while (!queue.isEmpty()) {
                events.add(queue.poll());
            }
        }
        return events;
    }

    @Override
    public java.util.List<VisualEffect> getPendingEffects() {
        java.util.List<VisualEffect> effects = new ArrayList<>();
        while (!pendingEffects.isEmpty()) {
            effects.add(pendingEffects.poll());
        }
        return effects;
    }

    private void addPrivateEvent(UUID playerId, String event) {
        java.util.Queue<String> queue = privateEvents.get(playerId);
        if (queue != null) {
            queue.add(event);
        }
    }

    @Override
    public GameState getCurrentState() {
        List<GameObject> allObjects = new ArrayList<>();
        allObjects.addAll(worldObjects.values());
        allObjects.addAll(players.values());
        allObjects.addAll(sentinels.values());
        allObjects.addAll(projectiles.values());
        return new GameState(allObjects, new ArrayList<>(), new ArrayList<>());
    }

    @Override
    public GameState getCurrentState(UUID playerId) {
        Player player = players.get(playerId);
        if (player == null) return getCurrentState();

        // Rango de visión aproximado para filtrar lo que se envía al cliente (aumentado para el escáner)
        double viewRange = 40.0;
        List<GameObject> visibleObjects = getNearbyObjects(player.getPosition().x(), player.getPosition().y(), viewRange);
        
        // Asegurarse de incluir a todos los jugadores para el panel de ACTIVE_NODES
        // y al jugador propio aunque por algún motivo no esté en la grilla (ej. recién aparecido)
        List<GameObject> result = new ArrayList<>(visibleObjects);
        if (!result.contains(player)) result.add(player);
        
        players.values().forEach(p -> {
            if (!result.contains(p)) result.add(p);
        });
        
        // Incluir TODOS los centinelas (IA) para que aparezcan en el mapa/ACTIVE_NODES
        sentinels.values().forEach(s -> {
            if (!result.contains(s)) result.add(s);
        });

        return new GameState(result, new ArrayList<>(), new ArrayList<>());
    }
}
