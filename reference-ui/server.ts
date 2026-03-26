import express from "express";
import { createServer as createViteServer } from "vite";
import Database from "better-sqlite3";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const db = new Database("business.db");

// Initialize Database
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE,
    password TEXT
  );
`);

// Insert default admin if not exists (Password: admin123)
const adminExists = db.prepare("SELECT * FROM users WHERE username = 'admin'").get();
if (!adminExists) {
  db.prepare("INSERT INTO users (username, password) VALUES ('admin', 'admin123')").run();
}

db.exec(`
  CREATE TABLE IF NOT EXISTS vendors (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    contact TEXT,
    category TEXT
  );

  CREATE TABLE IF NOT EXISTS products (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    category TEXT,
    subcategory TEXT,
    description TEXT,
    variant TEXT,
    base_price REAL,
    mrp REAL,
    is_bundle INTEGER DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS inventory (
    product_id INTEGER PRIMARY KEY,
    quantity INTEGER DEFAULT 0,
    unit_cost REAL DEFAULT 0,
    FOREIGN KEY(product_id) REFERENCES products(id)
  );

  CREATE TABLE IF NOT EXISTS purchases (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    purchase_number TEXT UNIQUE,
    date TEXT,
    vendor_id INTEGER,
    product_id INTEGER,
    category TEXT,
    subcategory TEXT,
    details TEXT,
    cost REAL,
    net_price REAL,
    payment_method TEXT DEFAULT 'Online',
    FOREIGN KEY(vendor_id) REFERENCES vendors(id),
    FOREIGN KEY(product_id) REFERENCES products(id)
  );

  CREATE TABLE IF NOT EXISTS sales (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_number TEXT UNIQUE,
    date TEXT,
    product_id INTEGER,
    quantity INTEGER,
    actual_price REAL,
    selling_price REAL,
    discount REAL,
    customer_name TEXT,
    channel TEXT,
    payment_method TEXT DEFAULT 'Online',
    event_name TEXT,
    serial_number TEXT,
    customer_contact TEXT,
    customer_address TEXT,
    category TEXT,
    FOREIGN KEY(product_id) REFERENCES products(id)
  );

  CREATE TABLE IF NOT EXISTS event_sales (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    event_name TEXT,
    date TEXT,
    product_id INTEGER,
    quantity INTEGER,
    selling_price REAL,
    payment_method TEXT,
    customer_name TEXT,
    customer_contact TEXT,
    customer_address TEXT,
    pushed_to_main INTEGER DEFAULT 0,
    FOREIGN KEY(product_id) REFERENCES products(id)
  );

  CREATE TABLE IF NOT EXISTS bundle_components (
    bundle_id INTEGER,
    component_id INTEGER,
    quantity INTEGER,
    PRIMARY KEY(bundle_id, component_id),
    FOREIGN KEY(bundle_id) REFERENCES products(id),
    FOREIGN KEY(component_id) REFERENCES products(id)
  );

  CREATE TABLE IF NOT EXISTS events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

// Migration: Add unit_cost to inventory if missing
try {
  db.prepare("ALTER TABLE inventory ADD COLUMN unit_cost REAL DEFAULT 0").run();
} catch (e) {
  // Column already exists
}

// Migration: Add customer contact and address to sales if missing
try {
  db.prepare("ALTER TABLE sales ADD COLUMN customer_contact TEXT").run();
} catch (e) {}
try {
  db.prepare("ALTER TABLE sales ADD COLUMN customer_address TEXT").run();
} catch (e) {}
try {
  db.prepare("ALTER TABLE sales ADD COLUMN category TEXT").run();
} catch (e) {}

// Seed sample products if empty
const productCount = db.prepare("SELECT COUNT(*) as count FROM products").get() as any;
if (productCount.count === 0) {
  const insertProduct = db.prepare("INSERT INTO products (name, category, variant, mrp) VALUES (?, ?, ?, ?)");
  const insertInventory = db.prepare("INSERT INTO inventory (product_id, quantity) VALUES (?, ?)");
  
  const p1 = insertProduct.run("Sample Product A", "Electronics", "Black", 1500);
  insertInventory.run(p1.lastInsertRowid, 10);
  
  const p2 = insertProduct.run("Sample Product B", "Apparel", "Large", 800);
  insertInventory.run(p2.lastInsertRowid, 20);
}

async function startServer() {
  const app = express();
  app.use(express.json());

  // --- Auth Middleware (Simple for this use case) ---
  const authenticate = (req: express.Request, res: express.Response, next: express.NextFunction) => {
    const authHeader = req.headers.authorization;
    if (authHeader === 'Bearer admin-token-123') {
      next();
    } else {
      res.status(401).json({ error: 'Unauthorized' });
    }
  };

  // --- API Routes ---

  app.post("/api/login", (req, res) => {
    const { username, password } = req.body;
    const user = db.prepare("SELECT * FROM users WHERE username = ? AND password = ?").get(username, password) as any;
    if (user) {
      res.json({ token: 'admin-token-123' });
    } else {
      res.status(401).json({ error: 'Invalid credentials' });
    }
  });

  // Apply authentication to all other API routes
  app.use("/api", (req, res, next) => {
    if (req.path === '/login') return next();
    authenticate(req, res, next);
  });

  // Vendors
  app.get("/api/vendors", (req, res) => {
    const vendors = db.prepare("SELECT * FROM vendors").all();
    res.json(vendors);
  });

  app.post("/api/vendors", (req, res) => {
    const { name, contact, category } = req.body;
    const info = db.prepare("INSERT INTO vendors (name, contact, category) VALUES (?, ?, ?)").run(name, contact, category);
    res.json({ id: info.lastInsertRowid });
  });

  // Events
  app.get("/api/events", (req, res) => {
    const events = db.prepare("SELECT * FROM events ORDER BY created_at DESC").all();
    res.json(events);
  });

  app.post("/api/events", (req, res) => {
    const { name } = req.body;
    try {
      const info = db.prepare("INSERT INTO events (name) VALUES (?)").run(name);
      res.json({ id: info.lastInsertRowid });
    } catch (error: any) {
      if (error.code === 'SQLITE_CONSTRAINT') {
        res.status(400).json({ error: "Event name already exists" });
      } else {
        res.status(500).json({ error: "Failed to create event" });
      }
    }
  });

  // Products
  app.get("/api/products", (req, res) => {
    const products = db.prepare("SELECT * FROM products").all();
    res.json(products);
  });

  app.post("/api/products", (req, res) => {
    try {
      const { 
        name, 
        category = '', 
        subcategory = '', 
        description = '', 
        variant = '', 
        base_price = 0, 
        mrp = 0, 
        is_bundle = false, 
        components = [], 
        initial_quantity = 0 
      } = req.body;

      if (!name) {
        return res.status(400).json({ error: "Product name is required" });
      }
      
      const transaction = db.transaction(() => {
        const info = db.prepare("INSERT INTO products (name, category, subcategory, description, variant, base_price, mrp, is_bundle) VALUES (?, ?, ?, ?, ?, ?, ?, ?)").run(
          name, 
          category, 
          subcategory, 
          description, 
          variant, 
          base_price, 
          mrp, 
          is_bundle ? 1 : 0
        );
        const productId = info.lastInsertRowid;
        
        db.prepare("INSERT INTO inventory (product_id, quantity) VALUES (?, ?)").run(productId, initial_quantity);

        if (is_bundle && components.length > 0) {
          const insertComp = db.prepare("INSERT INTO bundle_components (bundle_id, component_id, quantity) VALUES (?, ?, ?)");
          for (const comp of components) {
            insertComp.run(productId, comp.id, comp.quantity);
          }
        }
        return productId;
      });
      const id = transaction();
      res.json({ id });
    } catch (error: any) {
      console.error("Error saving product:", error);
      res.status(500).json({ error: error.message || "Internal server error" });
    }
  });

  // Purchases
  app.get("/api/purchases", (req, res) => {
    const purchases = db.prepare(`
      SELECT p.*, v.name as vendor_name, pr.name as product_name 
      FROM purchases p 
      JOIN vendors v ON p.vendor_id = v.id
      JOIN products pr ON p.product_id = pr.id
    `).all();
    res.json(purchases);
  });

  app.post("/api/purchases", (req, res) => {
    const { purchase_number, date, vendor_id, product_id, category, subcategory, details, cost, net_price, quantity, payment_method } = req.body;
    const transaction = db.transaction(() => {
      db.prepare("INSERT INTO purchases (purchase_number, date, vendor_id, product_id, category, subcategory, details, cost, net_price, payment_method) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").run(purchase_number, date, vendor_id, product_id, category, subcategory, details, cost, net_price, payment_method || 'Online');
      
      // Update inventory
      db.prepare("UPDATE inventory SET quantity = quantity + ? WHERE product_id = ?").run(quantity || 1, product_id);
    });
    transaction();
    res.json({ success: true });
  });

  // Sales
  app.get("/api/sales", (req, res) => {
    const sales = db.prepare(`
      SELECT s.*, pr.name as product_name 
      FROM sales s 
      JOIN products pr ON s.product_id = pr.id
    `).all();
    res.json(sales);
  });

  app.post("/api/sales", (req, res) => {
    const { order_number, date, product_id, quantity, actual_price, selling_price, discount, customer_name, channel, payment_method, event_name, serial_number, customer_contact, customer_address, skip_inventory = false } = req.body;
    
    const transaction = db.transaction(() => {
      // Fetch product category
      const product = db.prepare("SELECT category, is_bundle FROM products WHERE id = ?").get(product_id) as any;
      const category = product?.category || '';

      db.prepare("INSERT INTO sales (order_number, date, product_id, quantity, actual_price, selling_price, discount, customer_name, channel, payment_method, event_name, serial_number, customer_contact, customer_address, category) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").run(order_number, date, product_id, quantity, actual_price, selling_price, discount, customer_name, channel, payment_method || 'Online', event_name, serial_number, customer_contact, customer_address, category);
      
      if (!skip_inventory) {
        if (product.is_bundle) {
          const components = db.prepare("SELECT component_id, quantity FROM bundle_components WHERE bundle_id = ?").all() as any[];
          for (const comp of components) {
            db.prepare("UPDATE inventory SET quantity = quantity - ? WHERE product_id = ?").run(comp.quantity * quantity, comp.component_id);
          }
        } else {
          db.prepare("UPDATE inventory SET quantity = quantity - ? WHERE product_id = ?").run(quantity, product_id);
        }
      }
    });
    
    transaction();
    res.json({ success: true });
  });

  app.put("/api/sales/:id", (req, res) => {
    const { id } = req.params;
    const { customer_name, selling_price, customer_contact, customer_address, discount } = req.body;
    
    try {
      db.prepare(`
        UPDATE sales 
        SET customer_name = ?, 
            selling_price = ?, 
            customer_contact = ?, 
            customer_address = ?,
            discount = ?
        WHERE id = ?
      `).run(customer_name, selling_price, customer_contact, customer_address, discount, id);
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Event Sales
  app.get("/api/event-sales", (req, res) => {
    const { event_name, pushed } = req.query;
    let query = `
      SELECT es.*, pr.name as product_name 
      FROM event_sales es 
      JOIN products pr ON es.product_id = pr.id
      WHERE 1=1
    `;
    const params: any[] = [];
    if (event_name) {
      query += " AND es.event_name = ?";
      params.push(event_name);
    }
    if (pushed !== undefined) {
      query += " AND es.pushed_to_main = ?";
      params.push(pushed === 'true' ? 1 : 0);
    }
    const sales = db.prepare(query).all(...params);
    res.json(sales);
  });

  app.post("/api/event-sales", (req, res) => {
    const { event_name, date, product_id, quantity, selling_price, payment_method, customer_name, customer_contact, customer_address } = req.body;
    
    const transaction = db.transaction(() => {
      db.prepare("INSERT INTO event_sales (event_name, date, product_id, quantity, selling_price, payment_method, customer_name, customer_contact, customer_address) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)").run(event_name, date, product_id, quantity, selling_price, payment_method || 'Online', customer_name, customer_contact, customer_address);
      
      // Update inventory (physical item is gone)
      const product = db.prepare("SELECT is_bundle FROM products WHERE id = ?").get(product_id) as any;
      if (product.is_bundle) {
        const components = db.prepare("SELECT component_id, quantity FROM bundle_components WHERE bundle_id = ?").all() as any[];
        for (const comp of components) {
          db.prepare("UPDATE inventory SET quantity = quantity - ? WHERE product_id = ?").run(comp.quantity * quantity, comp.component_id);
        }
      } else {
        db.prepare("UPDATE inventory SET quantity = quantity - ? WHERE product_id = ?").run(quantity, product_id);
      }
    });
    
    transaction();
    res.json({ success: true });
  });

  app.post("/api/events/:eventName/push-to-main", (req, res) => {
    const { eventName } = req.params;
    const date = new Date().toISOString().split('T')[0];

    try {
      const transaction = db.transaction(() => {
        // Get unpushed sales for this event
        const unpushedSales = db.prepare("SELECT * FROM event_sales WHERE event_name = ? AND pushed_to_main = 0").all(eventName) as any[];
        
        if (unpushedSales.length === 0) {
          throw new Error("No unpushed sales found for this event");
        }

        const cashTotal = unpushedSales.filter(s => s.payment_method === 'Cash').reduce((acc, s) => acc + (s.selling_price * s.quantity), 0);
        const onlineTotal = unpushedSales.filter(s => s.payment_method === 'Online').reduce((acc, s) => acc + (s.selling_price * s.quantity), 0);

        // We need a dummy product or just use the first product_id from the event sales for the consolidated row?
        // Actually, the user wants "one row in sales record for cash payment and another row in main sales record for online payments".
        // This consolidated row doesn't map to a single product easily. 
        // Let's use a "Consolidated Event Product" or just use the first product's ID but with a special name?
        // The sales table requires product_id.
        
        // Let's find or create a dummy product for consolidated event sales if it doesn't exist
        let consolidatedProduct = db.prepare("SELECT id FROM products WHERE name = 'Consolidated Event Sales'").get() as any;
        if (!consolidatedProduct) {
          const info = db.prepare("INSERT INTO products (name, category, subcategory, description, variant, base_price, mrp, is_bundle) VALUES (?, ?, ?, ?, ?, ?, ?, ?)").run(
            'Consolidated Event Sales', 'Events', 'Consolidated', 'Consolidated sales from events', '', 0, 0, 0
          );
          consolidatedProduct = { id: info.lastInsertRowid };
          db.prepare("INSERT INTO inventory (product_id, quantity) VALUES (?, ?)").run(consolidatedProduct.id, 0);
        }

        if (cashTotal > 0) {
          db.prepare(`
            INSERT INTO sales (order_number, date, product_id, quantity, actual_price, selling_price, discount, customer_name, channel, payment_method, event_name, serial_number, category)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `).run(
            `${eventName}-1`, date, consolidatedProduct.id, 1, 0, cashTotal, 0, 'Event Customers', 'B2C', 'Cash', eventName, '1', 'Events'
          );
        }

        if (onlineTotal > 0) {
          db.prepare(`
            INSERT INTO sales (order_number, date, product_id, quantity, actual_price, selling_price, discount, customer_name, channel, payment_method, event_name, serial_number, category)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `).run(
            `${eventName}-2`, date, consolidatedProduct.id, 1, 0, onlineTotal, 0, 'Event Customers', 'B2C', 'Online', eventName, '2', 'Events'
          );
        }

        // Mark as pushed
        db.prepare("UPDATE event_sales SET pushed_to_main = 1 WHERE event_name = ? AND pushed_to_main = 0").run(eventName);
      });

      transaction();
      res.json({ success: true });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // Event Dashboard Stats
  app.get("/api/events/:eventName/dashboard", (req, res) => {
    const { eventName } = req.params;
    const totalSales = db.prepare("SELECT SUM(selling_price * quantity) as total FROM event_sales WHERE event_name = ?").get(eventName) as any;
    
    const cashFlow = db.prepare(`
      SELECT payment_method, SUM(selling_price * quantity) as total
      FROM event_sales
      WHERE event_name = ?
      GROUP BY payment_method
    `).all(eventName);

    const categoryDistribution = db.prepare(`
      SELECT p.category, SUM(es.selling_price * es.quantity) as value
      FROM event_sales es
      JOIN products p ON es.product_id = p.id
      WHERE es.event_name = ?
      GROUP BY p.category
    `).all(eventName);

    const bestSellingProduct = db.prepare(`
      SELECT p.name, SUM(es.quantity) as sales_count
      FROM event_sales es
      JOIN products p ON es.product_id = p.id
      WHERE es.event_name = ?
      GROUP BY p.id
      ORDER BY sales_count DESC
      LIMIT 1
    `).get(eventName) as any;

    const topProducts = db.prepare(`
      SELECT p.name, SUM(es.quantity) as sales_count
      FROM event_sales es
      JOIN products p ON es.product_id = p.id
      WHERE es.event_name = ?
      GROUP BY p.id
      ORDER BY sales_count DESC
      LIMIT 5
    `).all(eventName);

    res.json({
      totalSales: totalSales.total || 0,
      cashFlow,
      categoryDistribution,
      bestSellingProduct,
      topProducts
    });
  });

  // Inventory
  app.get("/api/inventory", (req, res) => {
    const inventory = db.prepare(`
      SELECT i.quantity, i.unit_cost, p.name, p.category, p.subcategory, p.id as product_id
      FROM inventory i
      JOIN products p ON i.product_id = p.id
    `).all();
    res.json(inventory);
  });

  app.post("/api/inventory/adjust", (req, res) => {
    const { product_id, quantity, cost } = req.body;
    
    // Update quantity and weighted average cost
    const current = db.prepare("SELECT quantity, unit_cost FROM inventory WHERE product_id = ?").get(product_id) as any;
    const currentQty = current?.quantity || 0;
    const currentCost = current?.unit_cost || 0;
    const newQty = currentQty + quantity;
    
    let newUnitCost = currentCost;
    if (newQty > 0 && quantity > 0) {
      newUnitCost = ((currentQty * currentCost) + (quantity * cost)) / newQty;
    } else if (newQty > 0 && quantity < 0) {
      // If reducing stock, we keep the same unit cost (FIFO/Average assumption)
      newUnitCost = currentCost;
    } else if (newQty <= 0) {
      newUnitCost = 0;
    }

    db.prepare("UPDATE inventory SET quantity = ?, unit_cost = ? WHERE product_id = ?").run(newQty, newUnitCost, product_id);
    res.json({ success: true });
  });

  // Dashboard Stats
  app.get("/api/dashboard", (req, res) => {
    const totalRevenue = db.prepare("SELECT SUM(selling_price * quantity) as total FROM sales").get() as any;
    const totalCost = db.prepare("SELECT SUM(net_price) as total FROM purchases").get() as any;
    const totalUniqueSales = db.prepare("SELECT COUNT(DISTINCT order_number) as total FROM sales").get() as any;
    const inventoryValue = db.prepare("SELECT SUM(quantity * unit_cost) as total FROM inventory").get() as any;
    
    const salesByCategory = db.prepare(`
      SELECT p.category, SUM(s.selling_price * s.quantity) as value
      FROM sales s
      JOIN products p ON s.product_id = p.id
      GROUP BY p.category
    `).all();

    const purchasesByCategory = db.prepare(`
      SELECT category, SUM(net_price) as value
      FROM purchases
      GROUP BY category
    `).all();

    const topProducts = db.prepare(`
      SELECT p.name, SUM(s.quantity) as sales_count
      FROM sales s
      JOIN products p ON s.product_id = p.id
      GROUP BY p.id
      ORDER BY sales_count DESC
      LIMIT 5
    `).all();

    const cashFlow = db.prepare(`
      SELECT payment_method, SUM(selling_price * quantity) as total
      FROM sales
      GROUP BY payment_method
    `).all();

    const monthlyData = db.prepare(`
      WITH RECURSIVE months(m) AS (
        SELECT 1 UNION ALL SELECT m + 1 FROM months WHERE m < 12
      ),
      monthly_sales AS (
        SELECT 
          strftime('%m', date) as month_num,
          SUM(selling_price * quantity) as revenue
        FROM sales
        WHERE strftime('%Y', date) = strftime('%Y', 'now')
        GROUP BY month_num
      ),
      monthly_purchases AS (
        SELECT 
          strftime('%m', date) as month_num,
          SUM(net_price) as cost
        FROM purchases
        WHERE strftime('%Y', date) = strftime('%Y', 'now')
        GROUP BY month_num
      )
      SELECT 
        m.m as month,
        COALESCE(s.revenue, 0) as revenue,
        COALESCE(p.cost, 0) as cost,
        (COALESCE(s.revenue, 0) - COALESCE(p.cost, 0)) as profit
      FROM months m
      LEFT JOIN monthly_sales s ON printf('%02d', m.m) = s.month_num
      LEFT JOIN monthly_purchases p ON printf('%02d', m.m) = p.month_num
      ORDER BY m.m
    `).all();

    res.json({
      revenue: totalRevenue.total || 0,
      cost: totalCost.total || 0,
      totalUniqueSales: totalUniqueSales.total || 0,
      inventoryValue: inventoryValue.total || 0,
      salesByCategory,
      purchasesByCategory,
      topProducts,
      cashFlow,
      monthlyData
    });
  });

  // --- Export Routes ---
  app.get("/api/export/:type", authenticate, (req, res) => {
    const { type } = req.params;
    let data: any[] = [];
    let filename = `${type}_export.csv`;

    if (type === 'sales') {
      data = db.prepare("SELECT * FROM sales").all();
    } else if (type === 'purchases') {
      data = db.prepare("SELECT * FROM purchases").all();
    } else if (type === 'inventory') {
      data = db.prepare("SELECT * FROM inventory").all();
    } else if (type === 'vendors') {
      data = db.prepare("SELECT * FROM vendors").all();
    } else if (type === 'database') {
      return res.download(path.join(__dirname, "business.db"), "business_backup.db");
    }

    if (data.length === 0 && type !== 'database') {
      return res.status(404).send("No data to export");
    }

    const headers = Object.keys(data[0]);
    const csv = [
      headers.join(','),
      ...data.map(row => headers.map(fieldName => JSON.stringify(row[fieldName])).join(','))
    ].join('\r\n');

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename=${filename}`);
    res.status(200).send(csv);
  });

  // --- Vite Middleware ---
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(__dirname, "dist")));
    app.get("*", (req, res) => {
      res.sendFile(path.join(__dirname, "dist", "index.html"));
    });
  }

  const PORT = 3000;
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
