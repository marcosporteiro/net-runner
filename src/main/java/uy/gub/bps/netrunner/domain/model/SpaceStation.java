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
public class SpaceStation implements GameObject {
    @JsonProperty("i")
    @Builder.Default
    private UUID id = UUID.randomUUID();
    
    @JsonProperty("p")
    private Position position;
    
    @JsonProperty("s")
    @Builder.Default
    private String symbol = "⧈";
    
    @JsonProperty("c")
    @Builder.Default
    private String color = "#00FFFF";
    
    @JsonProperty("n")
    @Builder.Default
    private String name = "OUTPOST";

    @JsonProperty("sz")
    @Builder.Default
    private int size = 4;

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
