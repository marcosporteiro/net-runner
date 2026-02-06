package uy.gub.bps.netrunner.domain.model;

import com.fasterxml.jackson.annotation.JsonProperty;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.UUID;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class Projectile implements GameObject {
    @JsonProperty("i")
    private final UUID id = UUID.randomUUID();
    @JsonProperty("p")
    private Position position;
    private double vx;
    private double vy;
    @Builder.Default
    private double distanceTraveled = 0;
    @Builder.Default
    private double maxRange = 20;
    @Builder.Default
    private int damage = 1;
    private boolean explosive;
    private UUID ownerId;
    @JsonProperty("c")
    private String color;
    @Builder.Default
    @JsonProperty("s")
    private String symbol = "•";
    @JsonProperty("n")
    private final String name = "PROJECTILE";

    @Override
    public UUID getId() {
        return id;
    }

    @Override
    public Position getPosition() {
        return position;
    }

    @Override
    public void setPosition(Position position) {
        this.position = position;
    }

    @Override
    public String getSymbol() {
        return symbol;
    }

    @Override
    public String getColor() {
        return color;
    }

    @Override
    public String getName() {
        return name;
    }
}
