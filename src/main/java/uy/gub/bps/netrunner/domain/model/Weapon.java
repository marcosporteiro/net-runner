package uy.gub.bps.netrunner.domain.model;

import com.fasterxml.jackson.annotation.JsonProperty;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class Weapon {
    public enum ShotPattern {
        SINGLE,
        SPREAD,
        MISSILE,
        LASER
    }

    @JsonProperty("n")
    private String name;
    private double range;
    private int damage;
    private long fireRate; // Cooldown in ms
    private double spread;
    private ShotPattern pattern;
    private double projectileSpeed;
    private String projectileSymbol;

    public static Weapon basic() {
        return Weapon.builder()
                .name("BASIC_BLASTER")
                .range(12)
                .damage(1)
                .fireRate(400)
                .spread(0.12)
                .pattern(ShotPattern.SINGLE)
                .projectileSpeed(0.3)
                .projectileSymbol("•")
                .build();
    }

    public static Weapon shotgun() {
        return Weapon.builder()
                .name("STREET_SWEEPER")
                .range(8)
                .damage(1) // Each pellet
                .fireRate(800)
                .spread(0.55) // High spread
                .pattern(ShotPattern.SPREAD)
                .projectileSpeed(0.25)
                .projectileSymbol("·")
                .build();
    }

    public static Weapon missile() {
        return Weapon.builder()
                .name("HELLFIRE_MISSILE")
                .range(20)
                .damage(3) // High direct damage
                .fireRate(1200)
                .spread(0.1)
                .pattern(ShotPattern.MISSILE)
                .projectileSpeed(0.18) // Slower but powerful
                .projectileSymbol("▲")
                .build();
    }

    public static Weapon laser() {
        return Weapon.builder()
                .name("PULSE_LASER")
                .range(15)
                .damage(1)
                .fireRate(150) // Fast fire rate
                .spread(0.06) // Very accurate
                .pattern(ShotPattern.LASER)
                .projectileSpeed(0.5) // Very fast
                .projectileSymbol("-")
                .build();
    }
}
