package uy.gub.bps.netrunner.infrastructure.websocket;

import org.msgpack.jackson.dataformat.MessagePackFactory;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;
import org.springframework.web.socket.BinaryMessage;
import org.springframework.web.socket.CloseStatus;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketSession;
import org.springframework.web.socket.handler.AbstractWebSocketHandler;
import uy.gub.bps.netrunner.domain.model.GameState;
import uy.gub.bps.netrunner.domain.model.InputMessage;
import uy.gub.bps.netrunner.domain.model.Player;
import uy.gub.bps.netrunner.domain.model.VisualEffect;
import uy.gub.bps.netrunner.domain.service.GameEngine;

import java.io.IOException;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

@Slf4j
@Component
public class GameWebSocketHandler extends AbstractWebSocketHandler {

    private final GameEngine gameEngine;
    private final com.fasterxml.jackson.databind.ObjectMapper jsonMapper;
    private final com.fasterxml.jackson.databind.ObjectMapper msgPackMapper;
    private final Map<String, WebSocketSession> sessions = new ConcurrentHashMap<>();
    private final Map<String, UUID> sessionToPlayerId = new ConcurrentHashMap<>();

    public GameWebSocketHandler(GameEngine gameEngine) {
        this.gameEngine = gameEngine;
        this.jsonMapper = new com.fasterxml.jackson.databind.ObjectMapper();
        this.msgPackMapper = new com.fasterxml.jackson.databind.ObjectMapper(new MessagePackFactory());
    }

    @Override
    public void afterConnectionEstablished(WebSocketSession session) throws Exception {
        String sessionId = session.getId();
        UUID playerId = UUID.randomUUID();
        
        sessions.put(sessionId, session);
        sessionToPlayerId.put(sessionId, playerId);
        
        Player player = gameEngine.addPlayer(playerId, "Player-" + sessionId.substring(0, 4));
        
        // Enviar mensaje de bienvenida con el ID del jugador (usamos MessagePack)
        byte[] payload = msgPackMapper.writeValueAsBytes(Map.of(
            "t", "WELCOME",
            "pi", playerId,
            "pn", player.getName()
        ));
        session.sendMessage(new BinaryMessage(payload));
        
        log.info("New connection: {} (Player ID: {})", sessionId, playerId);
    }

    @Override
    protected void handleTextMessage(WebSocketSession session, TextMessage message) throws Exception {
        handleInput(session, message.getPayload().getBytes());
    }

    @Override
    protected void handleBinaryMessage(WebSocketSession session, BinaryMessage message) throws Exception {
        handleInput(session, message.getPayload().array());
    }

    private void handleInput(WebSocketSession session, byte[] payload) throws IOException {
        String sessionId = session.getId();
        UUID playerId = sessionToPlayerId.get(sessionId);
        
        if (playerId != null) {
            InputMessage input;
            if (payload.length > 0 && payload[0] == '{') { // Probablemente JSON
                input = jsonMapper.readValue(payload, InputMessage.class);
            } else {
                input = msgPackMapper.readValue(payload, InputMessage.class);
            }
            gameEngine.processInput(playerId, input);
        }
    }

    @Override
    public void afterConnectionClosed(WebSocketSession session, CloseStatus status) throws Exception {
        String sessionId = session.getId();
        UUID playerId = sessionToPlayerId.remove(sessionId);
        sessions.remove(sessionId);
        
        if (playerId != null) {
            gameEngine.removePlayer(playerId);
        }
        
        log.info("Connection closed: {}", sessionId);
    }

    public void broadcastState() {
        try {
            List<String> globalEvents = gameEngine.getPendingEvents();
            List<VisualEffect> globalEffects = gameEngine.getPendingEffects();
            
            sessions.forEach((sessionId, session) -> {
                if (session.isOpen()) {
                    try {
                        UUID playerId = sessionToPlayerId.get(sessionId);
                        if (playerId == null) return;

                        List<String> playerEvents = new ArrayList<>(globalEvents);
                        playerEvents.addAll(gameEngine.getPendingEvents(playerId));
                        
                        GameState playerState = gameEngine.getCurrentState(playerId);
                        playerState.setEvents(playerEvents);
                        playerState.setEffects(globalEffects);
                        
                        byte[] payload = msgPackMapper.writeValueAsBytes(playerState);
                        session.sendMessage(new BinaryMessage(payload));
                    } catch (Exception e) {
                        log.error("Error sending message to session {}: {}", session.getId(), e.getMessage());
                    }
                }
            });
        } catch (Exception e) {
            log.error("Error broadcasting state: {}", e.getMessage());
        }
    }
}
