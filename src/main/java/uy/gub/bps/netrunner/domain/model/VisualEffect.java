package uy.gub.bps.netrunner.domain.model;

import com.fasterxml.jackson.annotation.JsonProperty;

public record VisualEffect(
    @JsonProperty("t") String type,
    @JsonProperty("x") double x,
    @JsonProperty("y") double y,
    @JsonProperty("c") String color,
    @JsonProperty("sz") int size
) {
    public VisualEffect(String type, double x, double y, String color) {
        this(type, x, y, color, 1);
    }
}
