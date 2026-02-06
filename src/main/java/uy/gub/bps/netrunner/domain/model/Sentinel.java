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
public class Sentinel implements GameObject {
    @Builder.Default
    @JsonProperty("i")
    private UUID id = UUID.randomUUID();
    @JsonProperty("p")
    private Position position;
    @Builder.Default
    @JsonProperty("s")
    private String symbol = "§";
    @Builder.Default
    @JsonProperty("c")
    private String color = "#f85149"; // GitHub Red
    @Builder.Default
    @JsonProperty("n")
    private String name = "SENTINEL";
    @Builder.Default
    @JsonProperty("h")
    private double hp = 3;
    @Builder.Default
    private double maxHp = 3;
    @Builder.Default
    @JsonProperty("sh")
    private double shield = 0;
    @Builder.Default
    private double maxShield = 0;
    @Builder.Default
    @JsonProperty("sz")
    private int size = 1;
    @JsonProperty("vx")
    private double vx = 0;
    @Builder.Default
    @JsonProperty("vy")
    private double vy = 0;
    private long lastShotTime;

    @Builder.Default
    private Weapon weapon = Weapon.basic();

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

    @Override
    public int getSize() {
        return size;
    }
}
