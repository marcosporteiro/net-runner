package uy.gub.bps.netrunner.domain.model;

public record Position(double x, double y) {
    public Position move(double dx, double dy) {
        return new Position(x + dx, y + dy);
    }
}
