const express = require('express');
const cors = require('cors');
const path = require('path');
const db = require('./database');

const app = express();
const PORT = process.env.PORT || 3000;

// Enable CORS so other devices in the local network or internet can access it
app.use(cors());
app.use(express.json());

// Serve static frontend files
app.use(express.static(path.join(__dirname, 'public')));

// Initialize SQLite database
db.initDb();

// ---------------- INGREDIENTS API ----------------
app.get('/api/ingredients', async (req, res) => {
  try {
    const rows = await db.all("SELECT * FROM ingredients ORDER BY category, name");
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/ingredients', async (req, res) => {
  const { name, category, supplier, package_cost, package_size, unit } = req.body;
  if (!name || package_cost === undefined || !package_size || !unit) {
    return res.status(400).json({ error: "Missing required ingredient fields." });
  }
  try {
    const result = await db.run(
      `INSERT INTO ingredients (name, category, supplier, package_cost, package_size, unit) VALUES (?, ?, ?, ?, ?, ?)`,
      [name, category || 'Ingredients', supplier || 'Unknown', package_cost, package_size, unit]
    );
    const newId = result.lastID;
    const newIng = await db.get("SELECT * FROM ingredients WHERE id = ?", [newId]);
    res.status(201).json(newIng);
  } catch (err) {
    if (err.message.includes('UNIQUE')) {
      return res.status(409).json({ error: "An ingredient with this name already exists." });
    }
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/ingredients/:id', async (req, res) => {
  const { id } = req.params;
  const { name, category, supplier, package_cost, package_size, unit } = req.body;
  try {
    await db.run(
      `UPDATE ingredients SET name = ?, category = ?, supplier = ?, package_cost = ?, package_size = ?, unit = ? WHERE id = ?`,
      [name, category, supplier, package_cost, package_size, unit, id]
    );
    const updated = await db.get("SELECT * FROM ingredients WHERE id = ?", [id]);
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/ingredients/:id', async (req, res) => {
  const { id } = req.params;
  try {
    await db.run("DELETE FROM ingredients WHERE id = ?", [id]);
    res.json({ message: "Ingredient deleted successfully.", id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


// ---------------- RECIPES API ----------------
// Retrieve all recipes with nested ingredients
app.get('/api/recipes', async (req, res) => {
  try {
    const recipes = await db.all("SELECT * FROM recipes ORDER BY name");
    
    // Stitch ingredients into each recipe
    for (let recipe of recipes) {
      const query = `
        SELECT ri.amount, ri.unit, i.id as ingredient_id, i.name, i.category, i.supplier, i.package_cost, i.package_size, i.unit as package_unit
        FROM recipe_ingredients ri
        JOIN ingredients i ON ri.ingredient_id = i.id
        WHERE ri.recipe_id = ?
      `;
      recipe.ingredients = await db.all(query, [recipe.id]);
    }
    
    res.json(recipes);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/recipes', async (req, res) => {
  const { name, portions, selling_price, ingredients } = req.body;
  if (!name || !portions || selling_price === undefined || !Array.isArray(ingredients)) {
    return res.status(400).json({ error: "Missing required recipe fields." });
  }
  
  try {
    // 1. Insert recipe
    const result = await db.run(
      `INSERT INTO recipes (name, portions, selling_price) VALUES (?, ?, ?)`,
      [name, portions, selling_price]
    );
    const recipeId = result.lastID;
    
    // 2. Insert recipe ingredients
    const stmt = db.db.prepare(`INSERT INTO recipe_ingredients (recipe_id, ingredient_id, amount, unit) VALUES (?, ?, ?, ?)`);
    for (let ing of ingredients) {
      stmt.run([recipeId, ing.ingredient_id, ing.amount, ing.unit]);
    }
    stmt.finalize();
    
    // Retrieve complete created recipe
    const newRecipe = await db.get("SELECT * FROM recipes WHERE id = ?", [recipeId]);
    newRecipe.ingredients = await db.all(`
      SELECT ri.amount, ri.unit, i.id as ingredient_id, i.name, i.package_cost, i.package_size, i.unit as package_unit
      FROM recipe_ingredients ri
      JOIN ingredients i ON ri.ingredient_id = i.id
      WHERE ri.recipe_id = ?
    `, [recipeId]);
    
    res.status(201).json(newRecipe);
  } catch (err) {
    if (err.message.includes('UNIQUE')) {
      return res.status(409).json({ error: "A recipe with this name already exists." });
    }
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/recipes/:id', async (req, res) => {
  const { id } = req.params;
  const { name, portions, selling_price, ingredients } = req.body;
  
  try {
    // 1. Update recipe info
    await db.run(
      `UPDATE recipes SET name = ?, portions = ?, selling_price = ? WHERE id = ?`,
      [name, portions, selling_price, id]
    );
    
    // 2. Clear out old ingredients
    await db.run("DELETE FROM recipe_ingredients WHERE recipe_id = ?", [id]);
    
    // 3. Re-insert new ingredients list
    const stmt = db.db.prepare(`INSERT INTO recipe_ingredients (recipe_id, ingredient_id, amount, unit) VALUES (?, ?, ?, ?)`);
    for (let ing of ingredients) {
      stmt.run([id, ing.ingredient_id, ing.amount, ing.unit]);
    }
    stmt.finalize();
    
    // Fetch updated recipe
    const updatedRecipe = await db.get("SELECT * FROM recipes WHERE id = ?", [id]);
    updatedRecipe.ingredients = await db.all(`
      SELECT ri.amount, ri.unit, i.id as ingredient_id, i.name, i.package_cost, i.package_size, i.unit as package_unit
      FROM recipe_ingredients ri
      JOIN ingredients i ON ri.ingredient_id = i.id
      WHERE ri.recipe_id = ?
    `, [id]);
    
    res.json(updatedRecipe);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/recipes/:id', async (req, res) => {
  const { id } = req.params;
  try {
    await db.run("DELETE FROM recipes WHERE id = ?", [id]);
    res.json({ message: "Recipe deleted successfully.", id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


// ---------------- WORKERS & TIMESHEET API ----------------
app.get('/api/workers', async (req, res) => {
  try {
    const rows = await db.all("SELECT * FROM workers ORDER BY name");
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/workers', async (req, res) => {
  const { name, hourly_rate } = req.body;
  if (!name || hourly_rate === undefined) {
    return res.status(400).json({ error: "Missing worker fields." });
  }
  try {
    const result = await db.run("INSERT INTO workers (name, hourly_rate) VALUES (?, ?)", [name, hourly_rate]);
    const newWorker = await db.get("SELECT * FROM workers WHERE id = ?", [result.lastID]);
    res.status(201).json(newWorker);
  } catch (err) {
    if (err.message.includes('UNIQUE')) {
      return res.status(409).json({ error: "A worker with this name already exists." });
    }
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/workers/:id', async (req, res) => {
  const { id } = req.params;
  const { name, hourly_rate } = req.body;
  try {
    await db.run("UPDATE workers SET name = ?, hourly_rate = ? WHERE id = ?", [name, hourly_rate, id]);
    const updated = await db.get("SELECT * FROM workers WHERE id = ?", [id]);
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/workers/:id', async (req, res) => {
  const { id } = req.params;
  try {
    await db.run("DELETE FROM workers WHERE id = ?", [id]);
    res.json({ message: "Worker deleted successfully.", id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Timesheet routes
app.get('/api/timesheet', async (req, res) => {
  try {
    const rows = await db.all(`
      SELECT t.*, w.name as worker_name, w.hourly_rate 
      FROM timesheet t
      JOIN workers w ON t.worker_id = w.id
      ORDER BY t.date DESC, w.name
    `);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/timesheet', async (req, res) => {
  const { worker_id, date, hours, notes } = req.body;
  if (!worker_id || !date || hours === undefined) {
    return res.status(400).json({ error: "Missing timesheet fields." });
  }
  try {
    const result = await db.run(
      "INSERT INTO timesheet (worker_id, date, hours, notes) VALUES (?, ?, ?, ?)",
      [worker_id, date, hours, notes || '']
    );
    const newEntry = await db.get(`
      SELECT t.*, w.name as worker_name, w.hourly_rate 
      FROM timesheet t
      JOIN workers w ON t.worker_id = w.id
      WHERE t.id = ?
    `, [result.lastID]);
    res.status(201).json(newEntry);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/timesheet/:id', async (req, res) => {
  const { id } = req.params;
  const { worker_id, date, hours, notes } = req.body;
  try {
    await db.run(
      "UPDATE timesheet SET worker_id = ?, date = ?, hours = ?, notes = ? WHERE id = ?",
      [worker_id, date, hours, notes, id]
    );
    const updated = await db.get(`
      SELECT t.*, w.name as worker_name, w.hourly_rate 
      FROM timesheet t
      JOIN workers w ON t.worker_id = w.id
      WHERE t.id = ?
    `, [id]);
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/timesheet/:id', async (req, res) => {
  const { id } = req.params;
  try {
    await db.run("DELETE FROM timesheet WHERE id = ?", [id]);
    res.json({ message: "Timesheet entry deleted successfully.", id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


// ---------------- EXPENSES API ----------------
app.get('/api/expenses', async (req, res) => {
  try {
    const rows = await db.all("SELECT * FROM expenses ORDER BY date DESC, category");
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/expenses', async (req, res) => {
  const { date, category, amount, notes } = req.body;
  if (!date || !category || amount === undefined) {
    return res.status(400).json({ error: "Missing expense fields." });
  }
  try {
    const result = await db.run(
      "INSERT INTO expenses (date, category, amount, notes) VALUES (?, ?, ?, ?)",
      [date, category, amount, notes || '']
    );
    const newExpense = await db.get("SELECT * FROM expenses WHERE id = ?", [result.lastID]);
    res.status(201).json(newExpense);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/expenses/:id', async (req, res) => {
  const { id } = req.params;
  const { date, category, amount, notes } = req.body;
  try {
    await db.run("UPDATE expenses SET date = ?, category = ?, amount = ?, notes = ? WHERE id = ?", [date, category, amount, notes, id]);
    const updated = await db.get("SELECT * FROM expenses WHERE id = ?", [id]);
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/expenses/:id', async (req, res) => {
  const { id } = req.params;
  try {
    await db.run("DELETE FROM expenses WHERE id = ?", [id]);
    res.json({ message: "Expense deleted successfully.", id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Single fallback route to serve index.html for all page views
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start the server
app.listen(PORT, () => {
  console.log(`===========================================================`);
  console.log(` WILD PASTA EXPENSE & COST MANAGER RUNNING ON PORT ${PORT}`);
  console.log(` Access locally:   http://localhost:${PORT}`);
  console.log(` Multi-device access: Connect devices to the same Wi-Fi network`);
  console.log(` and open: http://<your-computer-ip-address>:${PORT}`);
  console.log(`===========================================================`);
});
