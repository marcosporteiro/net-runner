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
    private double damage;
    private long fireRate; // Cooldown in ms
    private double spread;
    private ShotPattern pattern;
    private double projectileSpeed;
    private String projectileSymbol;
    @Builder.Default
    private double vibration = 0.1;

    public static Weapon basic() {
        return Weapon.builder()
                .name("BASIC_BLASTER")
                .range(12)
                .damage(1)
                .fireRate(400)
                .spread(0.12)
                .pattern(ShotPattern.SINGLE)
                .projectileSpeed(0.5)
                .projectileSymbol("•")
                .vibration(0.15)
                .build();
    }

    public static Weapon shotgun() {
        return Weapon.builder()
                .name("STREET_SWEEPER")
                .range(8)
                .damage(0.4) // Each pellet (total 2.0 if all 5 hit)
                .fireRate(800)
                .spread(0.55) // High spread
                .pattern(ShotPattern.SPREAD)
                .projectileSpeed(0.4)
                .projectileSymbol("·")
                .vibration(0.35)
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
                .projectileSpeed(0.25) // Slower but powerful
                .projectileSymbol("▲")
                .vibration(0.5)
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
                .projectileSpeed(0.8) // Very fast
                .projectileSymbol("-")
                .vibration(0.05)
                .build();
    }
}
