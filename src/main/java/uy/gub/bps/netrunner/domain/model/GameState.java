package uy.gub.bps.netrunner.domain.model;

import com.fasterxml.jackson.annotation.JsonProperty;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.Collection;
import java.util.List;

@Data
@NoArgsConstructor
@AllArgsConstructor
public class GameState {
    @JsonProperty("o")
    private Collection<GameObject> objects;
    @JsonProperty("ev")
    private List<String> events;
    @JsonProperty("ef")
    private List<VisualEffect> effects;
    @JsonProperty("dbg")
    private java.util.Map<String, Object> debugData;
}
