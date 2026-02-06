package uy.gub.bps.netrunner.domain.model;

import com.fasterxml.jackson.annotation.JsonProperty;

public record VisualEffect(
    @JsonProperty("t") String type,
    @JsonProperty("x") double x,
    @JsonProperty("y") double y,
    @JsonProperty("c") String color
) {}
