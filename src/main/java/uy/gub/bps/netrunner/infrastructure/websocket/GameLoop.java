package uy.gub.bps.netrunner.infrastructure.websocket;

import lombok.RequiredArgsConstructor;
import org.springframework.scheduling.annotation.EnableScheduling;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import uy.gub.bps.netrunner.domain.service.GameEngine;

@Component
@EnableScheduling
@RequiredArgsConstructor
public class GameLoop {

    private final GameEngine gameEngine;
    private final GameWebSocketHandler gameWebSocketHandler;

    @Scheduled(fixedRate = 33) // ~30fps para reducir uso de CPU (antes 17ms/60fps)
    public void run() {
        gameEngine.update();
        gameWebSocketHandler.broadcastState();
    }
}
