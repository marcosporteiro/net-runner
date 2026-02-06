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

    @Scheduled(fixedRate = 17) // 1000/60fps = 17ms per tick
    public void run() {
        gameEngine.update();
        gameWebSocketHandler.broadcastState();
    }
}
