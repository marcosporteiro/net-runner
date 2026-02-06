package uy.gub.bps.netrunner.domain.model;

import com.fasterxml.jackson.annotation.JsonProperty;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@NoArgsConstructor
@AllArgsConstructor
public class InputMessage {
    @JsonProperty("t")
    private String type; // ej: "MOVE"
    @JsonProperty("d")
    private String payload; // ej: "UP", "DOWN", "LEFT", "RIGHT"
}
