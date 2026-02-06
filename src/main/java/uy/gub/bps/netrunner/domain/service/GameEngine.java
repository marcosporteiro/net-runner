package uy.gub.bps.netrunner.domain.service;

import uy.gub.bps.netrunner.domain.model.GameObject;
import uy.gub.bps.netrunner.domain.model.GameState;
import uy.gub.bps.netrunner.domain.model.InputMessage;
import uy.gub.bps.netrunner.domain.model.Player;

import java.util.UUID;

public interface GameEngine {
    Player addPlayer(UUID id, String name);
    void removePlayer(UUID id);
    void processInput(UUID playerId, InputMessage input);
    void update();
    java.util.List<String> getPendingEvents();
    java.util.List<String> getPendingEvents(UUID playerId);
    java.util.List<uy.gub.bps.netrunner.domain.model.VisualEffect> getPendingEffects();
    GameState getCurrentState();
    GameState getCurrentState(UUID playerId);
}
