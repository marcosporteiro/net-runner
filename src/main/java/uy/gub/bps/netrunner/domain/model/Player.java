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
public class Player implements GameObject {
    @JsonProperty("i")
    private UUID id;
    @JsonProperty("p")
    private Position position;
    @JsonProperty("s")
    private String symbol;
    @JsonProperty("c")
    private String color;
    @JsonProperty("n")
    private String name;
    private int score;
    @JsonProperty("h")
    private double hp;
    @Builder.Default
    private double maxHp = 5;
    @JsonProperty("sh")
    private double shield;
    @Builder.Default
    private double maxShield = 0;
    @JsonProperty("co")
    private int copper;
    @JsonProperty("si")
    private int silver;
    @JsonProperty("go")
    private int gold;
    @JsonProperty("sa")
    private boolean scannerActive;
    @JsonProperty("l")
    private int level;
    @JsonProperty("e")
    private int exp;
    private String lastDirection; // Para saber hacia dónde disparar
    private long lastShotTime;
    private long respawnTimer;
    
    @Builder.Default
    @JsonProperty("w")
    private Weapon weapon = Weapon.basic();
    
    @Builder.Default
    @JsonProperty("vx")
    private double vx = 0;
    @Builder.Default
    @JsonProperty("vy")
    private double vy = 0;

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

    public int getMinerals() {
        return copper + silver + gold;
    }
}
