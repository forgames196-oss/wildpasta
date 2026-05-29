const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, 'wild_pasta.db');
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('Error opening database:', err.message);
  } else {
    console.log('Connected to the Wild Pasta SQLite database.');
  }
});

// Initialize database tables
function initDb() {
  db.serialize(() => {
    // 1. Ingredients Table
    db.run(`CREATE TABLE IF NOT EXISTS ingredients (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE,
      category TEXT,
      supplier TEXT,
      package_cost REAL,
      package_size REAL,
      unit TEXT
    )`);

    // 2. Recipes Table
    db.run(`CREATE TABLE IF NOT EXISTS recipes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE,
      portions INTEGER,
      selling_price REAL
    )`);

    // 3. Recipe Ingredients Junction Table
    db.run(`CREATE TABLE IF NOT EXISTS recipe_ingredients (
      recipe_id INTEGER,
      ingredient_id INTEGER,
      amount REAL,
      unit TEXT,
      PRIMARY KEY (recipe_id, ingredient_id),
      FOREIGN KEY (recipe_id) REFERENCES recipes(id) ON DELETE CASCADE,
      FOREIGN KEY (ingredient_id) REFERENCES ingredients(id) ON DELETE CASCADE
    )`);

    // 4. Workers Table
    db.run(`CREATE TABLE IF NOT EXISTS workers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE,
      hourly_rate REAL
    )`);

    // 5. Timesheet Table
    db.run(`CREATE TABLE IF NOT EXISTS timesheet (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      worker_id INTEGER,
      date TEXT,
      hours REAL,
      notes TEXT,
      FOREIGN KEY (worker_id) REFERENCES workers(id) ON DELETE CASCADE
    )`);

    // 6. Expenses Table
    db.run(`CREATE TABLE IF NOT EXISTS expenses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date TEXT,
      category TEXT,
      amount REAL,
      notes TEXT
    )`);

    // Populate Sample Data if tables are empty
    db.get("SELECT COUNT(*) as count FROM ingredients", (err, row) => {
      if (row && row.count === 0) {
        insertSampleData();
      }
    });
  });
}

function insertSampleData() {
  console.log('Inserting sample data...');

  const ingredients = [
    ["Semolina Flour", "Ingredients", "US Foods", 32.50, 50, "lb"],
    ["Farm Fresh Eggs", "Ingredients", "Local Poultry", 15.00, 30, "unit"],
    ["Fresh Basil", "Ingredients", "Valley Greens", 12.00, 16, "oz"],
    ["Extra Virgin Olive Oil", "Ingredients", "ItalFood", 48.00, 1, "gal"],
    ["Parmigiano-Reggiano", "Ingredients", "ItalFood", 85.00, 5, "lb"],
    ["Pine Nuts", "Ingredients", "Whole Foods", 24.00, 16, "oz"],
    ["Garlic Bulbs", "Ingredients", "Valley Greens", 8.00, 3, "lb"],
    ["Craft Paper Pasta Boxes", "Packaging", "EcoPack", 45.00, 100, "unit"],
    ["Plastic Sauce Tubs", "Packaging", "EcoPack", 18.00, 100, "unit"]
  ];

  const stmtIng = db.prepare(`INSERT OR IGNORE INTO ingredients (name, category, supplier, package_cost, package_size, unit) VALUES (?, ?, ?, ?, ?, ?)`);
  ingredients.forEach(ing => stmtIng.run(ing));
  stmtIng.finalize();

  const workers = [
    ["Luigi", 18.00],
    ["Sofia", 16.50]
  ];

  const stmtWork = db.prepare(`INSERT OR IGNORE INTO workers (name, hourly_rate) VALUES (?, ?)`);
  workers.forEach(w => stmtWork.run(w));
  stmtWork.finalize();

  const timesheets = [
    [2, "2026-05-23", 6.5, "Saturday Market Prep & Customer Service"],
    [1, "2026-05-23", 8.0, "Saturday Market Booth Operations & Packout"]
  ];

  const stmtTime = db.prepare(`INSERT OR IGNORE INTO timesheet (worker_id, date, hours, notes) VALUES (?, ?, ?, ?)`);
  timesheets.forEach(t => stmtTime.run(t));
  stmtTime.finalize();

  const expenses = [
    ["2026-05-23", "Booth Fee", 75.00, "Saturday Downtown Farmers Market Fee"],
    ["2026-05-20", "Kitchen Rent", 120.00, "Commercial Prep Kitchen Rental (4 hours)"],
    ["2026-05-22", "Gas & Transport", 25.00, "Van gas to transport stand and inventory"]
  ];

  const stmtExp = db.prepare(`INSERT OR IGNORE INTO expenses (date, category, amount, notes) VALUES (?, ?, ?, ?)`);
  expenses.forEach(e => stmtExp.run(e));
  stmtExp.finalize();

  // Create Recipes
  db.run(`INSERT OR IGNORE INTO recipes (name, portions, selling_price) VALUES ('Fresh Egg Tagliatelle', 4, 12.00)`, function(err) {
    if (err) return console.error(err.message);
    const recipeId1 = this.lastID || 1;

    // Link ingredients for Fresh Egg Tagliatelle (500g Flour, 4 eggs, 4 paper boxes)
    // Unit mapping in db: Semolina flour (g), Farm fresh eggs (unit), Pasta boxes (unit)
    const rec1Ings = [
      [recipeId1, 1, 500, "g"],     // 500g Semolina Flour
      [recipeId1, 2, 4, "unit"],    // 4 Farm Fresh Eggs
      [recipeId1, 8, 4, "unit"]     // 4 Pasta Boxes
    ];

    const stmtRec1 = db.prepare(`INSERT OR IGNORE INTO recipe_ingredients (recipe_id, ingredient_id, amount, unit) VALUES (?, ?, ?, ?)`);
    rec1Ings.forEach(ri => stmtRec1.run(ri));
    stmtRec1.finalize();
  });

  db.run(`INSERT OR IGNORE INTO recipes (name, portions, selling_price) VALUES ('Wild Artisan Pesto Sauce', 8, 8.00)`, function(err) {
    if (err) return console.error(err.message);
    const recipeId2 = this.lastID || 2;

    // Link ingredients for Wild Artisan Pesto Sauce (8oz Basil, 1.5 cups oil -> 12 fl oz, 4oz parmigiano, 2oz pine nuts, 1oz garlic, 8 plastic tubs)
    const rec2Ings = [
      [recipeId2, 3, 8, "oz"],      // 8oz Basil
      [recipeId2, 4, 12, "floz"],   // 12 fl oz EVOO
      [recipeId2, 5, 4, "oz"],      // 4oz Parmigiano
      [recipeId2, 6, 2, "oz"],      // 2oz Pine Nuts
      [recipeId2, 7, 1, "oz"],      // 1oz Garlic
      [recipeId2, 9, 8, "unit"]     // 8 Plastic Sauce Tubs
    ];

    const stmtRec2 = db.prepare(`INSERT OR IGNORE INTO recipe_ingredients (recipe_id, ingredient_id, amount, unit) VALUES (?, ?, ?, ?)`);
    rec2Ings.forEach(ri => stmtRec2.run(ri));
    stmtRec2.finalize();
  });

  console.log('Sample data loaded successfully!');
}

module.exports = {
  db,
  initDb,
  run: (sql, params = []) => new Promise((resolve, reject) => {
    db.run(sql, params, function(err) {
      if (err) reject(err);
      else resolve(this);
    });
  }),
  all: (sql, params = []) => new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  }),
  get: (sql, params = []) => new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  })
};
