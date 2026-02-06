package uy.gub.bps.netrunner.domain.model;

import java.util.ArrayList;
import java.util.List;

public class QuadTree {
    private final Rectangle boundary;
    private final int capacity;
    private final List<GameObject> objects;
    private QuadTree nw, ne, sw, se;
    private boolean divided;

    public static class Rectangle {
        public final double x, y, w, h;
        public Rectangle(double x, double y, double w, double h) {
            this.x = x;
            this.y = y;
            this.w = w;
            this.h = h;
        }

        public boolean contains(Position p) {
            return p.x() >= x - w && p.x() <= x + w &&
                   p.y() >= y - h && p.y() <= y + h;
        }

        public boolean intersects(Rectangle other) {
            return !(other.x - other.w > x + w ||
                     other.x + other.w < x - w ||
                     other.y - other.h > y + h ||
                     other.y + other.h < y - h);
        }
    }

    public QuadTree(Rectangle boundary, int capacity) {
        this.boundary = boundary;
        this.capacity = capacity;
        this.objects = new ArrayList<>();
        this.divided = false;
    }

    private void subdivide() {
        double x = boundary.x;
        double y = boundary.y;
        double w = boundary.w / 2;
        double h = boundary.h / 2;

        nw = new QuadTree(new Rectangle(x - w, y - h, w, h), capacity);
        ne = new QuadTree(new Rectangle(x + w, y - h, w, h), capacity);
        sw = new QuadTree(new Rectangle(x - w, y + h, w, h), capacity);
        se = new QuadTree(new Rectangle(x + w, y + h, w, h), capacity);
        divided = true;

        // Redistribuir objetos existentes
        for (GameObject obj : objects) {
            insertIntoChildren(obj);
        }
        objects.clear();
    }

    private boolean insertIntoChildren(GameObject obj) {
        return nw.insert(obj) || ne.insert(obj) || sw.insert(obj) || se.insert(obj);
    }

    public boolean insert(GameObject obj) {
        if (!boundary.contains(obj.getPosition())) {
            return false;
        }

        if (!divided) {
            if (objects.size() < capacity) {
                objects.add(obj);
                return true;
            }
            subdivide();
        }

        return insertIntoChildren(obj);
    }

    public void query(Rectangle range, List<GameObject> found) {
        if (!boundary.intersects(range)) {
            return;
        }

        if (divided) {
            nw.query(range, found);
            ne.query(range, found);
            sw.query(range, found);
            se.query(range, found);
        } else {
            for (GameObject obj : objects) {
                if (range.contains(obj.getPosition())) {
                    found.add(obj);
                }
            }
        }
    }

    public void getAllBoundaries(List<Rectangle> boundaries) {
        boundaries.add(boundary);
        if (divided) {
            nw.getAllBoundaries(boundaries);
            ne.getAllBoundaries(boundaries);
            sw.getAllBoundaries(boundaries);
            se.getAllBoundaries(boundaries);
        }
    }
    
    public void clear() {
        objects.clear();
        if (divided) {
            nw.clear();
            ne.clear();
            sw.clear();
            se.clear();
        }
        nw = ne = sw = se = null;
        divided = false;
    }
}
