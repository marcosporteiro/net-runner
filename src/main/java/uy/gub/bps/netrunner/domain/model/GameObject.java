package uy.gub.bps.netrunner.domain.model;

import java.util.UUID;

public interface GameObject {
    UUID getId();
    Position getPosition();
    void setPosition(Position position);
    String getSymbol();
    String getColor();
    String getName();
    default int getSize() { return 1; }
}
