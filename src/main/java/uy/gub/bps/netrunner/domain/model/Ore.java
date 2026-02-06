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
public class Ore implements GameObject {
    public enum OreType {
        COPPER("#b87333", 50, "COPPER"),
        SILVER("#c0c0c0", 150, "SILVER"),
        GOLD("#ffd700", 500, "GOLD");

        public final String color;
        public final int value;
        public final String name;

        OreType(String color, int value, String name) {
            this.color = color;
            this.value = value;
            this.name = name;
        }
    }

    @JsonProperty("i")
    private final UUID id = UUID.randomUUID();
    @JsonProperty("p")
    private Position position;
    @JsonProperty("s")
    private final String symbol = "◈";
    private OreType type;

    @Override
    @JsonProperty("i")
    public UUID getId() {
        return id;
    }

    @Override
    @JsonProperty("p")
    public Position getPosition() {
        return position;
    }

    @Override
    public void setPosition(Position position) {
        this.position = position;
    }

    @Override
    @JsonProperty("s")
    public String getSymbol() {
        return symbol;
    }

    @Override
    @JsonProperty("c")
    public String getColor() {
        return type != null ? type.color : "#d29922";
    }

    @Override
    @JsonProperty("n")
    public String getName() {
        return type != null ? type.name + "_ORE" : "DATA_ORE";
    }
}
