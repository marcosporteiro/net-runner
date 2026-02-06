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
        query(range.x, range.y, range.w, range.h, obj -> {
            if (range.contains(obj.getPosition())) {
                found.add(obj);
            }
        });
    }

    public void query(double x, double y, double w, double h, java.util.function.Consumer<GameObject> action) {
        if (!intersects(x, y, w, h)) {
            return;
        }

        if (divided) {
            nw.query(x, y, w, h, action);
            ne.query(x, y, w, h, action);
            sw.query(x, y, w, h, action);
            se.query(x, y, w, h, action);
        } else {
            for (GameObject obj : objects) {
                Position p = obj.getPosition();
                if (p.x() >= x - w && p.x() <= x + w &&
                    p.y() >= y - h && p.y() <= y + h) {
                    action.accept(obj);
                }
            }
        }
    }

    public GameObject findFirst(double x, double y, double w, double h, java.util.function.Predicate<GameObject> filter) {
        if (!intersects(x, y, w, h)) {
            return null;
        }

        if (divided) {
            GameObject found = nw.findFirst(x, y, w, h, filter);
            if (found != null) return found;
            found = ne.findFirst(x, y, w, h, filter);
            if (found != null) return found;
            found = sw.findFirst(x, y, w, h, filter);
            if (found != null) return found;
            return se.findFirst(x, y, w, h, filter);
        } else {
            for (GameObject obj : objects) {
                Position p = obj.getPosition();
                if (p.x() >= x - w && p.x() <= x + w &&
                    p.y() >= y - h && p.y() <= y + h) {
                    if (filter.test(obj)) {
                        return obj;
                    }
                }
            }
        }
        return null;
    }

    private boolean intersects(double x, double y, double w, double h) {
        return !(x - w > boundary.x + boundary.w ||
                 x + w < boundary.x - boundary.w ||
                 y - h > boundary.y + boundary.h ||
                 y + h < boundary.y - boundary.h);
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
