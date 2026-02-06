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
public class DataNode implements GameObject {
    @JsonProperty("i")
    private final UUID id = UUID.randomUUID();
    @JsonProperty("p")
    private Position position;
    @JsonProperty("s")
    private final String symbol = "◈";
    @JsonProperty("c")
    private final String color = "#79c0ff"; // Blueish
    @JsonProperty("n")
    private final String name = "DATA_NODE";

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
