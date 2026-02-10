package uy.gub.bps.netrunner.domain.model;

import com.fasterxml.jackson.annotation.JsonProperty;

public record VisualEffect(
    @JsonProperty("t") String type,
    @JsonProperty("x") double x,
    @JsonProperty("y") double y,
    @JsonProperty("tx") Double tx,
    @JsonProperty("ty") Double ty,
    @JsonProperty("c") String color,
    @JsonProperty("sz") Integer size
) {
    public VisualEffect(String type, double x, double y, String color) {
        this(type, x, y, null, null, color, 1);
    }
    public VisualEffect(String type, double x, double y, String color, int size) {
        this(type, x, y, null, null, color, size);
    }
    public VisualEffect(String type, double x, double y, double tx, double ty, String color) {
        this(type, x, y, tx, ty, color, 1);
    }
}
