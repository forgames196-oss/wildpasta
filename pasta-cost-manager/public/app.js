/* ==========================================================================
   WILD PASTA - CORE APPLICATION LOGIC
   ========================================================================== */

// 1. HIGH-PRECISION UNIT CONVERSION MATRIX
const TO_GRAMS = { g: 1, kg: 1000, oz: 28.3495, lb: 453.592 };
const TO_ML = { ml: 1, L: 1000, floz: 29.5735, cup: 236.588, gal: 3785.41 };

/**
 * Converts a quantity from one unit to another, supporting cross-system weight/volume density estimation.
 */
function convertUnit(amount, fromUnit, toUnit) {
  if (fromUnit === toUnit) return amount;
  
  const isWeightFrom = TO_GRAMS.hasOwnProperty(fromUnit);
  const isWeightTo = TO_GRAMS.hasOwnProperty(toUnit);
  const isVolumeFrom = TO_ML.hasOwnProperty(fromUnit);
  const isVolumeTo = TO_ML.hasOwnProperty(toUnit);

  // 1. Same system conversions (Weight -> Weight)
  if (isWeightFrom && isWeightTo) {
    return (amount * TO_GRAMS[fromUnit]) / TO_GRAMS[toUnit];
  }
  
  // 2. Same system conversions (Volume -> Volume)
  if (isVolumeFrom && isVolumeTo) {
    return (amount * TO_ML[fromUnit]) / TO_ML[toUnit];
  }

  // 3. Cross-system conversions (Weight <-> Volume) using water density approximation (1g = 1ml)
  if (isWeightFrom && isVolumeTo) {
    const grams = amount * TO_GRAMS[fromUnit];
    const ml = grams; // 1:1 density approximation
    return ml / TO_ML[toUnit];
  }

  if (isVolumeFrom && isWeightTo) {
    const ml = amount * TO_ML[fromUnit];
    const grams = ml; // 1:1 density approximation
    return grams / TO_GRAMS[toUnit];
  }

  // Count/unit conversions cannot be converted to weight/volume
  return amount; 
}

/**
 * Dynamically translates any weight or volume unit to its corresponding preferred global display system.
 * Useful for real-time toggle conversion throughout the entire app interface.
 */
function getDisplayQuantityAndUnit(amount, unit) {
  const system = state.settings.unitSystem || 'us';
  
  if (TO_GRAMS.hasOwnProperty(unit)) {
    // Weight system! Convert to grams first
    const grams = amount * TO_GRAMS[unit];
    if (system === 'metric') {
      if (grams >= 1000) {
        return { amount: Math.round((grams / 1000) * 100) / 100, unit: 'kg' };
      } else {
        return { amount: Math.round(grams * 10) / 10, unit: 'g' };
      }
    } else {
      const oz = grams / 28.3495;
      if (oz >= 16) {
        return { amount: Math.round((oz / 16) * 100) / 100, unit: 'lb' };
      } else {
        return { amount: Math.round(oz * 10) / 10, unit: 'oz' };
      }
    }
  }
  
  if (TO_ML.hasOwnProperty(unit)) {
    // Volume system! Convert to milliliters first
    const ml = amount * TO_ML[unit];
    if (system === 'metric') {
      if (ml >= 1000) {
        return { amount: Math.round((ml / 1000) * 100) / 100, unit: 'L' };
      } else {
        return { amount: Math.round(ml * 10) / 10, unit: 'ml' };
      }
    } else {
      const floz = ml / 29.5735;
      if (floz >= 128) {
        return { amount: Math.round((floz / 128) * 100) / 100, unit: 'gal' };
      } else {
        return { amount: Math.round(floz * 10) / 10, unit: 'floz' };
      }
    }
  }
  
  // Custom unit (e.g. unit/count) or portion
  return { amount: Math.round(amount * 100) / 100, unit };
}

// 2. GLOBAL STATE
let state = {
  settings: {
    unitSystem: 'us', // 'us' or 'metric'
    syncBinId: '',
    syncApiKey: '',
    syncEnabled: false,
    lastSyncTime: ''
  },
  ingredients: [],
  recipes: [],
  workers: [],
  timesheet: [],
  expenses: [],
  sales: [],
  paybacks: []
};

// Keep track of Chart.js instance to destroy/re-create cleanly
let allocationChartInstance = null;

// Temporary holder for ingredients in the recipe currently being created/edited
let currentRecipeIngredients = []; 

// 3. STORAGE & REACTIVE SYSTEM INIT
document.addEventListener('DOMContentLoaded', () => {
  // Load state from local storage or load sample data if empty
  initAppState();
  
  // Initialize Lucide Icons
  lucide.createIcons();

  // Set initial navigation and state rendering
  switchTab('dashboard');
  
  // Trigger initial UI rendering across all tables & KPIs
  rebuildAppUI();

  // Populate timesheet date input with today's date
  const today = new Date().toISOString().split('T')[0];
  document.getElementById('time-date').value = today;
  document.getElementById('exp-date').value = today;

  // Initialize event listeners
  setupSettingsListeners();
});

function initAppState() {
  const localData = localStorage.getItem('wild_pasta_state');
  if (localData) {
    try {
      state = JSON.parse(localData);
      
      // Ensure all settings and arrays are initialized to prevent undefined errors
      if (!state.settings) {
        state.settings = { unitSystem: 'us', syncBinId: '', syncApiKey: '', syncEnabled: false, lastSyncTime: '' };
      }
      if (!Array.isArray(state.ingredients)) state.ingredients = [];
      if (!Array.isArray(state.recipes)) state.recipes = [];
      if (!Array.isArray(state.workers)) state.workers = [];
      if (!Array.isArray(state.timesheet)) state.timesheet = [];
      if (!Array.isArray(state.expenses)) state.expenses = [];
      if (!Array.isArray(state.sales)) state.sales = [];
      if (!Array.isArray(state.paybacks)) state.paybacks = [];

      // Schema migration check removed - it was incorrectly wiping user data
      // on every refresh because real user data doesn't contain "Base Assembly" recipes.
    } catch (e) {
      console.error("Error parsing localStorage data, resetting to sample...", e);
      state = JSON.parse(JSON.stringify(WILD_PASTA_SAMPLE_DATA));
      saveStateLocal();
    }
  } else {
    // Brand new user: pre-populate with gorgeous Wild Pasta sample data
    state = JSON.parse(JSON.stringify(WILD_PASTA_SAMPLE_DATA));
    saveStateLocal();
  }
}

function saveStateLocal() {
  localStorage.setItem('wild_pasta_state', JSON.stringify(state));
}

// Updates UI state, saves to local storage, and optionally syncs with the cloud
async function updateState(description) {
  saveStateLocal();
  rebuildAppUI();
  
  if (state.settings.syncEnabled) {
    updateSyncBadge('syncing', 'Syncing...');
    debounceSync();
  }
}

let syncTimeout = null;
function debounceSync() {
  if (syncTimeout) clearTimeout(syncTimeout);
  syncTimeout = setTimeout(() => {
    syncDataOnline();
  }, 2500); // Wait 2.5 seconds before background upload
}

// Rebuilds all visual components of the UI based on the current state
function rebuildAppUI() {
  updateFinancialsKPIs();
  renderDashboardAlerts();
  renderDashboardCharts();
  renderIngredientsList();
  renderRecipesList();
  renderSalesList();
  renderWorkersAndTimesheets();
  renderExpensesList();
  updateSyncUIElements();
}

// 4. FINANCIAL KPI CALCULATIONS & ENGINE
function getIngredientUnitCost(ing) {
  return ing.packageCost / ing.packageSize;
}

function calculateRecipeCostMetrics(recipe, visited = new Set()) {
  if (!recipe) {
    return { totalCost: 0, portionCost: 0, foodCostPct: 0, margin: 0, marginPct: 0, cogsBreakdown: [] };
  }

  // Prevent circular dependency infinite loops
  if (visited.has(recipe.id)) {
    return { totalCost: 0, portionCost: 0, foodCostPct: 0, margin: 0, marginPct: 0, cogsBreakdown: [] };
  }

  visited.add(recipe.id);
  let totalCost = 0;
  
  const cogsBreakdown = (recipe.ingredients || []).map(ri => {
    if (ri.subRecipeId) {
      // Recursive Costing of Sub-Recipe
      const subRec = state.recipes.find(r => r.id === ri.subRecipeId);
      if (!subRec) return { name: "Unknown Sub-Recipe", cost: 0, isSubRecipe: true };
      
      const subMetrics = calculateRecipeCostMetrics(subRec, new Set(visited));
      const subPortionCost = subMetrics.portionCost;
      
      let ingredientCost = 0;
      if (ri.unit === 'portion') {
        ingredientCost = ri.amount * subPortionCost;
      } else {
        // unit === 'batch'
        ingredientCost = ri.amount * subMetrics.totalCost;
      }
      
      totalCost += ingredientCost;
      return {
        name: `[Sub-Recipe] ${subRec.name}`,
        cost: ingredientCost,
        isSubRecipe: true,
        subRecipeId: subRec.id
      };
    } else {
      // Standard Ingredient Costing
      const ing = state.ingredients.find(i => i.id === ri.ingredientId);
      if (!ing) return { name: "Unknown Ingredient", cost: 0 };
      
      // Calculate cost based on package sizes and unit conversions
      const purchaseUnitCost = getIngredientUnitCost(ing);
      const recipeAmountInPurchaseUnit = convertUnit(ri.amount, ri.unit, ing.unit);
      const ingredientCost = recipeAmountInPurchaseUnit * purchaseUnitCost;
      
      totalCost += ingredientCost;
      return {
        name: ing.name,
        cost: ingredientCost
      };
    }
  });

  const portions = recipe.portions || 1;
  const sellingPrice = recipe.sellingPrice || 0;
  const portionCost = totalCost / portions;
  const foodCostPct = sellingPrice > 0 ? (portionCost / sellingPrice) * 100 : 0;
  const margin = sellingPrice - portionCost;
  const marginPct = sellingPrice > 0 ? (margin / sellingPrice) * 100 : 0;

  return {
    totalCost,
    portionCost,
    foodCostPct,
    margin,
    marginPct,
    cogsBreakdown
  };
}

function updateFinancialsKPIs() {
  // 1. Calculate active labor costs from timesheet
  let totalLabor = 0;
  let totalHours = 0;
  state.timesheet.forEach(entry => {
    const worker = state.workers.find(w => w.id === entry.workerId);
    const rate = worker ? worker.hourlyRate : 0;
    totalLabor += entry.hours * rate;
    totalHours += entry.hours;
  });

  // 2. Calculate non-friend-financed operating expenses
  let totalOverhead = 0;
  state.expenses.forEach(exp => {
    if (!exp.paidByFriend) {
      totalOverhead += exp.amount;
    }
  });

  // 3. Compute ingredient expenses (Exact cost based on sales if sales are logged, else weekly batch fallback)
  let totalIngredientCost = 0;
  const dishSales = state.sales.filter(s => s.type === 'dishes');
  if (dishSales.length > 0) {
    dishSales.forEach(s => {
      const recipe = state.recipes.find(r => r.id === s.recipeId);
      if (recipe) {
        const metrics = calculateRecipeCostMetrics(recipe);
        totalIngredientCost += s.quantity * metrics.portionCost;
      }
    });
  } else {
    // Fallback to weekly batch production estimate of all active recipes
    state.recipes.forEach(recipe => {
      const metrics = calculateRecipeCostMetrics(recipe);
      totalIngredientCost += metrics.totalCost;
    });
  }

  // Count only retail finished menu items for the catalog KPI
  const menuItems = state.recipes.filter(r => r.sellingPrice > 0);
  const activeMenuItemsCount = menuItems.length;

  let recipeMarginsTotal = 0;
  state.recipes.forEach(recipe => {
    if (recipe.sellingPrice > 0) {
      const metrics = calculateRecipeCostMetrics(recipe);
      recipeMarginsTotal += metrics.marginPct;
    }
  });
  const avgMarginPct = activeMenuItemsCount > 0 ? Math.round(recipeMarginsTotal / activeMenuItemsCount) : 0;

  // 4. Compute Revenue & Tips (Actual sales if logged, else weekly batch fallback)
  let totalRevenue = 0;
  let totalTips = 0;
  if (state.sales.length > 0) {
    state.sales.forEach(s => {
      totalRevenue += s.subtotal;
      totalTips += s.tips;
    });
  } else {
    // Fallback to estimated weekly batch revenue of all active finished menu items
    totalRevenue = state.recipes.reduce((sum, r) => sum + (r.sellingPrice * r.portions), 0);
  }

  const weeklyFoodCostPct = totalRevenue > 0 ? (totalIngredientCost / totalRevenue) * 100 : 0;
  const totalCombinedExpenses = totalIngredientCost + totalLabor + totalOverhead;

  // Render KPIs
  document.getElementById('kpi-total-expenses').textContent = formatCurrency(totalCombinedExpenses);
  document.getElementById('kpi-total-labor').textContent = formatCurrency(totalLabor);
  document.getElementById('kpi-labor-hours').textContent = `${totalHours.toFixed(1)} hours logged`;
  document.getElementById('kpi-recipe-count').textContent = activeMenuItemsCount;
  document.getElementById('kpi-avg-margin').textContent = `${avgMarginPct}% Avg profit margin`;
  document.getElementById('kpi-food-cost-pct').textContent = `${weeklyFoodCostPct.toFixed(1)}%`;
  
  // Set health color indicator for food cost
  const dot = document.getElementById('kpi-food-cost-indicator');
  const statusText = document.getElementById('kpi-food-cost-status');
  
  if (weeklyFoodCostPct === 0) {
    dot.className = "indicator-dot";
    statusText.textContent = "No Recipes Costed";
  } else if (weeklyFoodCostPct <= 30) {
    dot.className = "indicator-dot green";
    statusText.textContent = "Healthy Margin (<30%)";
  } else if (weeklyFoodCostPct <= 35) {
    dot.className = "indicator-dot yellow";
    statusText.textContent = "Caution Zone (30-35%)";
  } else {
    dot.className = "indicator-dot red";
    statusText.textContent = "Dangerously High (>35%)";
  }

  // Update Overhead tab total as well
  document.getElementById('overhead-total-value').textContent = formatCurrency(totalOverhead);
}

// 5. CHART IMPLEMENTATION (CHART.JS DONUT)
function renderDashboardCharts() {
  const ctx = document.getElementById('chart-expense-allocation').getContext('2d');
  
  // Calculate total costs per category (matching dashboard rollup logic)
  let ingredientCost = 0;
  const dishSales = state.sales.filter(s => s.type === 'dishes');
  if (dishSales.length > 0) {
    dishSales.forEach(s => {
      const recipe = state.recipes.find(r => r.id === s.recipeId);
      if (recipe) {
        ingredientCost += s.quantity * calculateRecipeCostMetrics(recipe).portionCost;
      }
    });
  } else {
    state.recipes.forEach(r => {
      ingredientCost += calculateRecipeCostMetrics(r).totalCost;
    });
  }

  let laborCost = 0;
  state.timesheet.forEach(t => {
    const worker = state.workers.find(w => w.id === t.workerId);
    laborCost += t.hours * (worker ? worker.hourlyRate : 0);
  });

  let overheadCost = 0;
  state.expenses.forEach(e => {
    if (!e.paidByFriend) {
      overheadCost += e.amount;
    }
  });

  const total = ingredientCost + laborCost + overheadCost;
  
  if (total === 0) {
    // If no expenses logged, draw a placeholder or clear
    if (allocationChartInstance) allocationChartInstance.destroy();
    return;
  }

  const data = {
    labels: ['Ingredients', 'Labor Payroll', 'Operating Overhead'],
    datasets: [{
      data: [
        Math.round(ingredientCost), 
        Math.round(laborCost), 
        Math.round(overheadCost)
      ],
      backgroundColor: [
        '#dca032', // Semolina Gold
        '#5ba370', // Basil Green
        '#60a5fa'  // Operating Blue
      ],
      borderWidth: 1,
      borderColor: '#1c1a18'
    }]
  };

  if (allocationChartInstance) {
    // Update existing chart to prevent flickering redraws
    allocationChartInstance.data = data;
    allocationChartInstance.update();
  } else {
    // Initialize premium glassmorphic donut chart
    allocationChartInstance = new Chart(ctx, {
      type: 'doughnut',
      data: data,
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            position: 'bottom',
            labels: {
              color: '#f5ebe0',
              font: {
                family: 'Inter',
                size: 11
              },
              padding: 15
            }
          },
          tooltip: {
            callbacks: {
              label: function(context) {
                const val = context.raw;
                const pct = ((val / total) * 100).toFixed(1);
                return ` ${context.label}: $${val.toLocaleString()} (${pct}%)`;
              }
            }
          }
        },
        cutout: '65%'
      }
    });
  }
}

// 6. PROFIT MARGIN WARNER LOGIC
function renderDashboardAlerts() {
  const container = document.getElementById('dashboard-alerts-list');
  container.innerHTML = '';
  
  if (state.recipes.length === 0) {
    container.innerHTML = `
      <div class="alert-item healthy">
        <div class="alert-left">
          <i data-lucide="info"></i>
          <div>
            <div class="alert-title">No Recipes Found</div>
            <div class="alert-desc">Head to the Recipes tab to create your first pasta product!</div>
          </div>
        </div>
      </div>
    `;
    lucide.createIcons();
    return;
  }

  let warningsCount = 0;

  state.recipes.forEach(recipe => {
    const metrics = calculateRecipeCostMetrics(recipe);
    let itemClass = '';
    let textClass = '';
    let statusText = '';
    let icon = '';
    
    if (metrics.foodCostPct > 35) {
      itemClass = 'danger';
      textClass = 'danger';
      statusText = 'Critical Food Cost!';
      icon = 'alert-triangle';
      warningsCount++;
    } else if (metrics.foodCostPct > 30) {
      itemClass = 'warning';
      textClass = 'warning';
      statusText = 'High Food Cost';
      icon = 'alert-circle';
      warningsCount++;
    } else {
      // Good margin items
      itemClass = 'healthy';
      textClass = 'healthy';
      statusText = 'Healthy Margin';
      icon = 'check-circle';
    }

    const alertHtml = `
      <div class="alert-item ${itemClass}">
        <div class="alert-left">
          <i data-lucide="${icon}"></i>
          <div>
            <div class="alert-title">${recipe.name}</div>
            <div class="alert-desc">${statusText} | Cost per portion: ${formatCurrency(metrics.portionCost)}</div>
          </div>
        </div>
        <div class="alert-right ${textClass}">
          ${metrics.foodCostPct.toFixed(1)}% FC
        </div>
      </div>
    `;
    container.insertAdjacentHTML('beforeend', alertHtml);
  });

  // If everything is healthy, put a nice victory notice at the top!
  if (warningsCount === 0) {
    const successHeader = `
      <div class="alert-item healthy" style="border-color: var(--color-basil);">
        <div class="alert-left">
          <i data-lucide="party-popper" style="color: var(--color-basil);"></i>
          <div>
            <div class="alert-title" style="color: var(--color-basil);">Excellent Financial Health!</div>
            <div class="alert-desc">All recipes are currently meeting your farmers market profit goals. Keep it up!</div>
          </div>
        </div>
      </div>
    `;
    container.insertAdjacentHTML('afterbegin', successHeader);
  }

  lucide.createIcons();
}

// 7. INGREDIENTS MANAGER
function renderIngredientsList() {
  const tbody = document.getElementById('ingredients-table-body');
  tbody.innerHTML = '';

  const searchVal = document.getElementById('ingredient-search').value.toLowerCase();
  const categoryFilter = document.getElementById('ingredient-category-filter').value;

  const filtered = state.ingredients.filter(ing => {
    const matchesSearch = ing.name.toLowerCase().includes(searchVal) || (ing.supplier && ing.supplier.toLowerCase().includes(searchVal));
    const matchesCategory = categoryFilter === 'all' || ing.category === categoryFilter;
    return matchesSearch && matchesCategory;
  });

  if (filtered.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; color: var(--text-muted); padding: 30px;">No ingredients found. Click "Add Ingredient" to create one.</td></tr>`;
    return;
  }

  filtered.forEach(ing => {
    const calculatedUnitCostDisplay = formatCalculatedUnitCost(ing);
    
    // Category badges CSS helper
    let categoryBadgeClass = 'category';
    if (ing.category === 'Packaging') categoryBadgeClass = 'category-packaging';
    else if (ing.category === 'Other') categoryBadgeClass = 'category-other';

    const tr = `
      <tr>
        <td style="font-weight: 600;">${ing.name}</td>
        <td><span class="badge ${categoryBadgeClass}">${ing.category || 'Ingredients'}</span></td>
        <td>${ing.supplier || '—'}</td>
        <td style="font-family: var(--font-brand); font-weight: 600;">${formatCurrency(ing.packageCost)}</td>
        <td>${ing.packageSize} ${ing.unit}</td>
        <td style="font-weight: 700; color: var(--color-semolina); font-family: var(--font-brand);">${calculatedUnitCostDisplay}</td>
        <td>
          <div class="table-row-actions">
            <button class="btn-action-edit" onclick="editIngredient(${ing.id})" title="Edit Ingredient">
              <i data-lucide="edit-3"></i>
            </button>
            <button class="btn-action-delete" onclick="deleteIngredient(${ing.id})" title="Delete Ingredient">
              <i data-lucide="trash-2"></i>
            </button>
          </div>
        </td>
      </tr>
    `;
    tbody.insertAdjacentHTML('beforeend', tr);
  });

  lucide.createIcons();
}

function openIngredientModal() {
  document.getElementById('form-ingredient').reset();
  document.getElementById('ingredient-form-id').value = '';
  document.getElementById('modal-ingredient-title').textContent = 'Add Raw Ingredient';
  openModal('modal-ingredient');
}

function editIngredient(id) {
  const ing = state.ingredients.find(i => i.id === id);
  if (!ing) return;

  document.getElementById('ingredient-form-id').value = ing.id;
  document.getElementById('ing-name').value = ing.name;
  document.getElementById('ing-category').value = ing.category || 'Ingredients';
  document.getElementById('ing-supplier').value = ing.supplier || '';
  document.getElementById('ing-package-cost').value = ing.packageCost;
  document.getElementById('ing-package-size').value = ing.packageSize;
  document.getElementById('ing-unit').value = ing.unit;

  document.getElementById('modal-ingredient-title').textContent = 'Edit Ingredient';
  openModal('modal-ingredient');
}

function saveIngredientForm(e) {
  e.preventDefault();
  
  const idVal = document.getElementById('ingredient-form-id').value;
  const name = document.getElementById('ing-name').value.trim();
  const category = document.getElementById('ing-category').value;
  const supplier = document.getElementById('ing-supplier').value.trim() || 'Unknown';
  const packageCost = parseFloat(document.getElementById('ing-package-cost').value);
  const packageSize = parseFloat(document.getElementById('ing-package-size').value);
  const unit = document.getElementById('ing-unit').value;

  if (idVal) {
    // Edit existing ingredient
    const index = state.ingredients.findIndex(i => i.id === parseInt(idVal));
    if (index !== -1) {
      state.ingredients[index] = { id: parseInt(idVal), name, category, supplier, packageCost, packageSize, unit };
      updateState("Updated ingredient: " + name);
    }
  } else {
    // Insert new ingredient
    // Duplicate check
    const duplicate = state.ingredients.find(i => i.name.toLowerCase() === name.toLowerCase());
    if (duplicate) {
      alert("An ingredient with this name already exists! Please edit the existing one.");
      return;
    }
    
    const newId = state.ingredients.length > 0 ? Math.max(...state.ingredients.map(i => i.id)) + 1 : 1;
    state.ingredients.push({ id: newId, name, category, supplier, packageCost, packageSize, unit });
    updateState("Created ingredient: " + name);
  }

  closeModal('modal-ingredient');
}

function deleteIngredient(id) {
  const ing = state.ingredients.find(i => i.id === id);
  if (!ing) return;

  // Check if ingredient is active in recipes
  const linkedRecipes = state.recipes.filter(r => r.ingredients.some(ri => ri.ingredientId === id));
  if (linkedRecipes.length > 0) {
    const names = linkedRecipes.map(r => `"${r.name}"`).join(', ');
    alert(`Cannot delete ingredient! It is currently being used in recipes: ${names}. Remove it from those recipes first.`);
    return;
  }

  if (confirm(`Are you sure you want to delete "${ing.name}"?`)) {
    state.ingredients = state.ingredients.filter(i => i.id !== id);
    updateState("Deleted ingredient: " + ing.name);
  }
}


// 8. RECIPES MANAGER & DYNAMIC TWO-WAY FORM
let currentRecipeSubTab = 'menu'; // 'menu' or 'base'

function handleRecipeAddClick() {
  openRecipeModal(currentRecipeSubTab);
}

function setRecipeSubTab(tab) {
  currentRecipeSubTab = tab;
  
  // Update active state on buttons
  const menuBtn = document.getElementById('subtab-menu-items');
  const baseBtn = document.getElementById('subtab-base-recipes');
  
  if (menuBtn && baseBtn) {
    if (tab === 'menu') {
      menuBtn.classList.add('active');
      baseBtn.classList.remove('active');
    } else {
      baseBtn.classList.add('active');
      menuBtn.classList.remove('active');
    }
  }
  
  // Contextually update "Add New" button text
  const addBtn = document.getElementById('btn-recipe-add');
  if (addBtn) {
    if (tab === 'menu') {
      addBtn.innerHTML = `<i data-lucide="plus"></i> Create Menu Item`;
    } else {
      addBtn.innerHTML = `<i data-lucide="plus"></i> Create Base Recipe`;
    }
    lucide.createIcons();
  }
  
  renderRecipesList();
}

function renderRecipesList() {
  const container = document.getElementById('recipes-cards-list');
  container.innerHTML = '';

  const searchVal = document.getElementById('recipe-search').value.toLowerCase();

  const filtered = state.recipes.filter(r => {
    const matchesSearch = r.name.toLowerCase().includes(searchVal);
    // Finished menu items have sellingPrice > 0, base assemblies have sellingPrice === 0 or undefined
    const isMenu = r.sellingPrice > 0;
    const matchesTab = currentRecipeSubTab === 'menu' ? isMenu : !isMenu;
    return matchesSearch && matchesTab;
  });

  if (filtered.length === 0) {
    const noRecipesMsg = currentRecipeSubTab === 'menu' 
      ? 'No active market menu items found. Click "Create New Recipe" to add a dish for sale!' 
      : 'No base recipe assemblies found. Click "Create New Recipe" to add a sub-recipe (with $0 selling price) like dough or sauce!';
    container.innerHTML = `<div style="grid-column: 1/-1; text-align: center; color: var(--text-muted); padding: 40px;">\${noRecipesMsg}</div>`;
    return;
  }

  filtered.forEach(recipe => {
    const metrics = calculateRecipeCostMetrics(recipe);
    
    // Food cost indicator classification
    let fillClass = 'green';
    if (metrics.foodCostPct > 35) fillClass = 'red';
    else if (metrics.foodCostPct > 30) fillClass = 'yellow';

    const card = `
      <div class="recipe-card glass">
        <div class="recipe-card-header">
          <div class="recipe-card-header-left">
            <h3>${recipe.name}</h3>
            <span>Yields: ${recipe.portions} portions</span>
          </div>
          <div class="recipe-card-actions">
            <button class="btn-action-edit" onclick="editRecipe(${recipe.id})" title="Edit Recipe">
              <i data-lucide="edit-3"></i>
            </button>
            <button class="btn-action-delete" onclick="deleteRecipe(${recipe.id})" title="Delete Recipe">
              <i data-lucide="trash-2"></i>
            </button>
          </div>
        </div>

        <div class="recipe-card-body">
          <div class="recipe-stats-row">
            <div class="recipe-stat-box">
              <span class="label">Retail Price</span>
              <span class="val" style="color: var(--color-egg);">${formatCurrency(recipe.sellingPrice)}</span>
            </div>
            <div class="recipe-stat-box">
              <span class="label">Cost/Portion</span>
              <span class="val">${formatCurrency(metrics.portionCost)}</span>
            </div>
          </div>
          <div class="recipe-stats-row">
            <div class="recipe-stat-box">
              <span class="label">Profit Margin</span>
              <span class="val" style="color: var(--color-basil);">${formatCurrency(metrics.margin)}</span>
            </div>
            <div class="recipe-stat-box">
              <span class="label">Profit %</span>
              <span class="val">${Math.round(metrics.marginPct)}%</span>
            </div>
          </div>

          <div class="recipe-cogs-container">
            <div class="cogs-header">
              <span>Food Cost %</span>
              <span style="font-weight: 700; color: var(--text-main);">${metrics.foodCostPct.toFixed(1)}%</span>
            </div>
            <div class="cogs-meter-wrapper">
              <div class="cogs-meter-fill ${fillClass}" style="width: ${Math.min(metrics.foodCostPct, 100)}%;"></div>
            </div>
          </div>
        </div>

        <button class="recipe-expand-btn" onclick="toggleRecipeExpanded(this, ${recipe.id})">
          <span class="btn-text">View Ingredients Details</span>
          <i data-lucide="chevron-down" class="chevron-icon"></i>
        </button>

        <div class="recipe-expanded-ingredients" id="rec-expanded-${recipe.id}">
          <div style="font-weight: bold; font-size: 0.75rem; color: var(--text-muted); text-transform: uppercase; margin-bottom: 8px;">Recipe Costings:</div>
          ${metrics.cogsBreakdown.map((c, i) => {
            const ri = recipe.ingredients[i];
            const disp = getDisplayQuantityAndUnit(ri.amount, ri.unit);
            return `
              <div class="expanded-ing-row">
                <span>${c.name} <span class="qty">(${disp.amount} ${disp.unit})</span></span>
                <span class="cost">${formatCurrency(c.cost)}</span>
              </div>
            `;
          }).join('')}
          <div class="expanded-ing-row" style="font-weight: 700; border-top: 1px solid var(--border-glass); padding-top: 8px; margin-top: 8px;">
            <span>Total Batch Cost</span>
            <span style="color: var(--color-semolina);">${formatCurrency(metrics.totalCost)}</span>
          </div>
        </div>
      </div>
    `;
    container.insertAdjacentHTML('beforeend', card);
  });

  lucide.createIcons();
}

function toggleRecipeExpanded(btn, recipeId) {
  const container = document.getElementById(`rec-expanded-${recipeId}`);
  const icon = btn.querySelector('.chevron-icon');
  const txt = btn.querySelector('.btn-text');

  if (container.classList.contains('active')) {
    container.classList.remove('active');
    icon.style.transform = 'rotate(0deg)';
    txt.textContent = 'View Ingredients Details';
  } else {
    container.classList.add('active');
    icon.style.transform = 'rotate(180deg)';
    txt.textContent = 'Hide Ingredients Details';
  }
}

// Open modal to construct/edit a recipe
function openRecipeModal(mode = 'menu') {
  document.getElementById('form-recipe').reset();
  document.getElementById('recipe-form-id').value = '';
  
  const modal = document.getElementById('modal-recipe');
  if (mode === 'base') {
    modal.classList.add('mode-base-recipe');
    modal.classList.remove('mode-menu-item');
    document.getElementById('modal-recipe-title').textContent = 'Create Base Recipe';
    document.getElementById('rec-selling-price').value = 0;
    document.getElementById('rec-selling-price').required = false;
  } else {
    modal.classList.add('mode-menu-item');
    modal.classList.remove('mode-base-recipe');
    document.getElementById('modal-recipe-title').textContent = 'Create Menu Item';
    document.getElementById('rec-selling-price').value = '';
    document.getElementById('rec-selling-price').required = true;
  }
  
  // Reset the temporary recipe ingredient list
  currentRecipeIngredients = [];
  
  populateRecipeBuilderSelect();
  renderRecipeBuilderAddedList();
  updateRecipeLiveSummary();
  
  // Hide the quick addition subform
  document.getElementById('recipe-two-way-subform').classList.add('hidden');
  document.getElementById('two-way-toggle-icon').textContent = '+';
  
  openModal('modal-recipe');
}

function editRecipe(id) {
  const recipe = state.recipes.find(r => r.id === id);
  if (!recipe) return;

  document.getElementById('recipe-form-id').value = recipe.id;
  document.getElementById('rec-name').value = recipe.name;
  document.getElementById('rec-portions').value = recipe.portions;
  document.getElementById('rec-selling-price').value = recipe.sellingPrice;

  const modal = document.getElementById('modal-recipe');
  if (recipe.sellingPrice === 0) {
    modal.classList.add('mode-base-recipe');
    modal.classList.remove('mode-menu-item');
    document.getElementById('modal-recipe-title').textContent = 'Edit Base Recipe';
    document.getElementById('rec-selling-price').required = false;
  } else {
    modal.classList.add('mode-menu-item');
    modal.classList.remove('mode-base-recipe');
    document.getElementById('modal-recipe-title').textContent = 'Edit Menu Item';
    document.getElementById('rec-selling-price').required = true;
  }

  // Clone current ingredients to temporary builder list
  currentRecipeIngredients = JSON.parse(JSON.stringify(recipe.ingredients));

  populateRecipeBuilderSelect();
  renderRecipeBuilderAddedList();
  updateRecipeLiveSummary();

  document.getElementById('recipe-two-way-subform').classList.add('hidden');
  document.getElementById('two-way-toggle-icon').textContent = '+';

  openModal('modal-recipe');
}

function populateRecipeBuilderSelect() {
  const select = document.getElementById('rec-add-ing-select');
  select.innerHTML = '<option value="" disabled selected>-- Choose Item --</option>';

  const currentRecipeId = parseInt(document.getElementById('recipe-form-id').value) || null;

  // 1. Raw Ingredients Optgroup
  const sortedIngs = [...state.ingredients].sort((a,b) => a.name.localeCompare(b.name));
  let ingGroup = '<optgroup label="Raw Ingredients (from inventory)">';
  sortedIngs.forEach(ing => {
    ingGroup += `<option value="ing-${ing.id}">${ing.name} (${ing.unit} pack)</option>`;
  });
  ingGroup += '</optgroup>';
  select.insertAdjacentHTML('beforeend', ingGroup);

  // 2. Sub-Recipes Optgroup (exclude the current recipe to avoid circular dependencies)
  const otherRecipes = state.recipes.filter(r => r.id !== currentRecipeId);
  if (otherRecipes.length > 0) {
    const sortedRecs = [...otherRecipes].sort((a,b) => a.name.localeCompare(b.name));
    let recGroup = '<optgroup label="Sub-Recipes (Assemble other recipes)">';
    sortedRecs.forEach(r => {
      recGroup += `<option value="rec-${r.id}">[Recipe] ${r.name} (yields ${r.portions} portions)</option>`;
    });
    recGroup += '</optgroup>';
    select.insertAdjacentHTML('beforeend', recGroup);
  }

  handleRecipeIngredientSelect();
}

function handleRecipeIngredientSelect() {
  const select = document.getElementById('rec-add-ing-select');
  const unitSelect = document.getElementById('rec-add-ing-unit');
  const val = select.value;
  
  if (!val) return;

  unitSelect.innerHTML = '';

  if (val.startsWith('rec-')) {
    // Selected a Sub-Recipe!
    unitSelect.innerHTML = `
      <option value="portion" selected>Portion(s)</option>
      <option value="batch">Full Batch(es)</option>
    `;
  } else if (val.startsWith('ing-')) {
    // Selected a standard ingredient
    const selectedId = parseInt(val.substring(4));
    const ing = state.ingredients.find(i => i.id === selectedId);
    if (!ing) return;
    
    if (TO_GRAMS.hasOwnProperty(ing.unit)) {
      unitSelect.innerHTML = `
        <option value="g" selected>Grams (g)</option>
        <option value="oz">Ounces (oz)</option>
        <option value="kg">Kilograms (kg)</option>
        <option value="lb">Pounds (lb)</option>
      `;
    } else if (TO_ML.hasOwnProperty(ing.unit)) {
      unitSelect.innerHTML = `
        <option value="floz" selected>Fluid Ounces (fl oz)</option>
        <option value="ml">Milliliters (ml)</option>
        <option value="cup">Cups (cup)</option>
        <option value="tbsp">Tablespoons (tbsp)</option>
        <option value="L">Liters (L)</option>
        <option value="gal">Gallons (gal)</option>
      `;
    } else {
      unitSelect.innerHTML = `<option value="unit" selected>Units / Pieces (unit)</option>`;
    }
  }
}

// Add an ingredient from the select dropdown into our active builder list
function addIngredientToRecipeList() {
  const select = document.getElementById('rec-add-ing-select');
  const amountInput = document.getElementById('rec-add-ing-amount');
  const unitSelect = document.getElementById('rec-add-ing-unit');

  const val = select.value;
  const amount = parseFloat(amountInput.value);
  const unit = unitSelect.value;

  if (!val) {
    alert("Please select an item first.");
    return;
  }
  if (!amount || amount <= 0) {
    alert("Please enter a valid amount.");
    return;
  }

  if (val.startsWith('rec-')) {
    const subRecipeId = parseInt(val.substring(4));
    
    // Duplicate check in recipe
    const duplicate = currentRecipeIngredients.find(ri => ri.subRecipeId === subRecipeId);
    if (duplicate) {
      alert("This sub-recipe is already in the list.");
      return;
    }
    
    currentRecipeIngredients.push({ subRecipeId, amount, unit });
  } else if (val.startsWith('ing-')) {
    const ingredientId = parseInt(val.substring(4));
    
    const duplicate = currentRecipeIngredients.find(ri => ri.ingredientId === ingredientId);
    if (duplicate) {
      alert("This ingredient is already in the list.");
      return;
    }
    
    currentRecipeIngredients.push({ ingredientId, amount, unit });
  }

  // Reset builder inputs
  select.value = '';
  amountInput.value = '';
  
  renderRecipeBuilderAddedList();
  updateRecipeLiveSummary();
}

function removeIngredientFromRecipeList(id, isSub) {
  if (isSub) {
    currentRecipeIngredients = currentRecipeIngredients.filter(ri => ri.subRecipeId !== id);
  } else {
    currentRecipeIngredients = currentRecipeIngredients.filter(ri => ri.ingredientId !== id);
  }
  renderRecipeBuilderAddedList();
  updateRecipeLiveSummary();
}

function renderRecipeBuilderAddedList() {
  const container = document.getElementById('recipe-builder-ings-list');
  container.innerHTML = '';

  currentRecipeIngredients.forEach(ri => {
    let displayName = "";
    let ingredientCost = 0;
    let removeClickArgs = "";

    if (ri.subRecipeId) {
      // Handle sub-recipe cost and display
      const subRec = state.recipes.find(r => r.id === ri.subRecipeId);
      if (!subRec) return;
      
      const subMetrics = calculateRecipeCostMetrics(subRec);
      if (ri.unit === 'portion') {
        ingredientCost = ri.amount * subMetrics.portionCost;
      } else {
        ingredientCost = ri.amount * subMetrics.totalCost;
      }
      
      displayName = `[Recipe] ${subRec.name}`;
      removeClickArgs = `${ri.subRecipeId}, true`;
    } else {
      // Handle raw ingredient cost and display
      const ing = state.ingredients.find(i => i.id === ri.ingredientId);
      if (!ing) return;
      
      const purchaseUnitCost = getIngredientUnitCost(ing);
      const convertedAmount = convertUnit(ri.amount, ri.unit, ing.unit);
      ingredientCost = convertedAmount * purchaseUnitCost;
      
      displayName = ing.name;
      removeClickArgs = `${ri.ingredientId}, false`;
    }

    const disp = getDisplayQuantityAndUnit(ri.amount, ri.unit);
    const row = `
      <div class="builder-ing-row">
        <span class="builder-ing-name">${displayName}</span>
        <div class="builder-ing-math">
          <span>${disp.amount} ${disp.unit}</span>
          <span class="cost">${formatCurrency(ingredientCost)}</span>
          <button type="button" class="builder-ing-delete" onclick="removeIngredientFromRecipeList(${removeClickArgs})">
            <i data-lucide="trash-2" style="width: 14px; height: 14px;"></i>
          </button>
        </div>
      </div>
    `;
    container.insertAdjacentHTML('beforeend', row);
  });

  lucide.createIcons();
}

function updateRecipeLiveSummary() {
  const portionsInput = document.getElementById('rec-portions');
  const priceInput = document.getElementById('rec-selling-price');

  const portions = parseInt(portionsInput.value) || 1;
  const sellingPrice = parseFloat(priceInput.value) || 0;

  // Create a mock recipe object to run costing metrics
  const mockRecipe = {
    portions,
    sellingPrice,
    ingredients: currentRecipeIngredients
  };

  const metrics = calculateRecipeCostMetrics(mockRecipe);

  document.getElementById('rec-summary-total-cost').textContent = formatCurrency(metrics.totalCost);
  document.getElementById('rec-summary-portion-cost').textContent = formatCurrency(metrics.portionCost);
  document.getElementById('rec-summary-food-cost-pct').textContent = `${metrics.foodCostPct.toFixed(1)}%`;
  document.getElementById('rec-summary-margin').textContent = formatCurrency(metrics.margin);
}

// Bind live summary updates on portion yield and selling price input change
document.getElementById('rec-portions').addEventListener('input', updateRecipeLiveSummary);
document.getElementById('rec-selling-price').addEventListener('input', updateRecipeLiveSummary);

// TWO-WAY INGREDIENT UI EXPANSION
function toggleTwoWaySubform() {
  const subform = document.getElementById('recipe-two-way-subform');
  const icon = document.getElementById('two-way-toggle-icon');

  if (subform.classList.contains('hidden')) {
    subform.classList.remove('hidden');
    icon.textContent = '−';
    
    // Automatically match recommended recipe quantities to US Standard
    document.getElementById('tw-recipe-unit').value = 'g';
  } else {
    subform.classList.add('hidden');
    icon.textContent = '+';
  }
}

// Two-way save logic: creates the ingredient, adds to master, and inserts to recipe active list
function saveTwoWayNewIngredient() {
  const name = document.getElementById('tw-name').value.trim();
  const supplier = document.getElementById('tw-supplier').value.trim() || 'Unknown';
  const category = document.getElementById('tw-category').value;
  const packageCost = parseFloat(document.getElementById('tw-package-cost').value);
  const packageSize = parseFloat(document.getElementById('tw-package-size').value);
  const unit = document.getElementById('tw-unit').value;
  
  const recipeAmount = parseFloat(document.getElementById('tw-recipe-amount').value);
  const recipeUnit = document.getElementById('tw-recipe-unit').value;

  if (!name) {
    alert("Please enter a new ingredient name.");
    return;
  }
  if (isNaN(packageCost) || packageCost <= 0) {
    alert("Please enter a valid package cost.");
    return;
  }
  if (isNaN(packageSize) || packageSize <= 0) {
    alert("Please enter a valid package size.");
    return;
  }
  if (isNaN(recipeAmount) || recipeAmount <= 0) {
    alert("Please enter a valid recipe amount.");
    return;
  }

  // Check for duplicate in master list
  const duplicate = state.ingredients.find(i => i.name.toLowerCase() === name.toLowerCase());
  if (duplicate) {
    alert("An ingredient with this name already exists in your inventory. Select it from the dropdown above!");
    return;
  }

  // 1. Create and push ingredient to master list
  const newId = state.ingredients.length > 0 ? Math.max(...state.ingredients.map(i => i.id)) + 1 : 1;
  const newIng = { id: newId, name, category, supplier, packageCost, packageSize, unit };
  state.ingredients.push(newIng);
  
  // 2. Attach immediately to recipe builder temporary list
  currentRecipeIngredients.push({
    ingredientId: newId,
    amount: recipeAmount,
    unit: recipeUnit
  });

  // 3. Clear subform fields
  document.getElementById('tw-name').value = '';
  document.getElementById('tw-supplier').value = '';
  document.getElementById('tw-package-cost').value = '';
  document.getElementById('tw-package-size').value = '';
  document.getElementById('tw-recipe-amount').value = '';

  // 4. Update parent select boxes & builder lists
  populateRecipeBuilderSelect();
  renderRecipeBuilderAddedList();
  updateRecipeLiveSummary();

  // Hide subform
  toggleTwoWaySubform();
  
  // Reactive state save for master ingredient list addition
  updateState("Two-way created master ingredient: " + name);
}

// Final save recipe form
function saveRecipeForm(e) {
  e.preventDefault();

  const idVal = document.getElementById('recipe-form-id').value;
  const name = document.getElementById('rec-name').value.trim();
  const portions = parseInt(document.getElementById('rec-portions').value);
  const sellingPrice = parseFloat(document.getElementById('rec-selling-price').value);

  if (currentRecipeIngredients.length === 0) {
    alert("Please add at least one ingredient to this recipe before saving.");
    return;
  }

  if (idVal) {
    // Edit existing recipe
    const index = state.recipes.findIndex(r => r.id === parseInt(idVal));
    if (index !== -1) {
      state.recipes[index] = {
        id: parseInt(idVal),
        name,
        portions,
        sellingPrice,
        ingredients: currentRecipeIngredients
      };
      updateState("Updated recipe: " + name);
    }
  } else {
    // Insert new recipe
    // Duplicate check
    const duplicate = state.recipes.find(r => r.name.toLowerCase() === name.toLowerCase());
    if (duplicate) {
      alert("A recipe with this name already exists! Please edit the existing one.");
      return;
    }

    const newId = state.recipes.length > 0 ? Math.max(...state.recipes.map(r => r.id)) + 1 : 1;
    state.recipes.push({
      id: newId,
      name,
      portions,
      sellingPrice,
      ingredients: currentRecipeIngredients
    });
    updateState("Created recipe: " + name);
  }

  closeModal('modal-recipe');
}

function deleteRecipe(id) {
  const recipe = state.recipes.find(r => r.id === id);
  if (!recipe) return;

  if (confirm(`Are you sure you want to delete the recipe "${recipe.name}"?`)) {
    state.recipes = state.recipes.filter(r => r.id !== id);
    updateState("Deleted recipe: " + recipe.name);
  }
}


// 9. WORKERS & TIMESHEET ENGINE
function renderWorkersAndTimesheets() {
  // RENDER WORKERS DIRECTORY
  const workersContainer = document.getElementById('workers-list-container');
  workersContainer.innerHTML = '';

  state.workers.forEach(w => {
    const roleDisplay = w.role ? w.role : "Staff";
    const rateDisplay = w.hourlyRate === 0 ? "Owner Tracking / Unpaid" : `${formatCurrency(w.hourlyRate)} / hour`;
    
    const card = `
      <div class="worker-card">
        <div class="worker-info">
          <h4>${w.name}</h4>
          <p style="color: var(--color-semolina); font-size: 0.75rem; font-weight: 600; margin-bottom: 2px;">${roleDisplay}</p>
          <p>${rateDisplay}</p>
        </div>
        <div class="worker-actions">
          <button class="btn-action-edit" onclick="editWorker(${w.id})" title="Edit Worker">
            <i data-lucide="edit-3"></i>
          </button>
          <button class="btn-action-delete" onclick="deleteWorker(${w.id})" title="Delete Worker">
            <i data-lucide="trash-2"></i>
          </button>
        </div>
      </div>
    `;
    workersContainer.insertAdjacentHTML('beforeend', card);
  });

  // Populate Timesheet form workers dropdown
  const workerSelect = document.getElementById('time-worker-id');
  workerSelect.innerHTML = '<option value="" disabled selected>-- Select Employee --</option>';
  state.workers.forEach(w => {
    const roleDisplay = w.role ? ` (${w.role})` : "";
    workerSelect.insertAdjacentHTML('beforeend', `<option value="${w.id}">${w.name}${roleDisplay}</option>`);
  });

  // RENDER TIMESHEETS TABLE
  const tbody = document.getElementById('timesheets-table-body');
  tbody.innerHTML = '';

  if (state.timesheet.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; color: var(--text-muted); padding: 30px;">No shifts logged yet. Click "Log Shift Hours" to begin.</td></tr>`;
    lucide.createIcons();
    return;
  }

  state.timesheet.forEach(entry => {
    const worker = state.workers.find(w => w.id === entry.workerId);
    const name = worker ? worker.name : "Unknown Worker";
    const roleDisplay = worker && worker.role ? `<br><span style="font-size: 0.7rem; color: var(--text-muted); font-weight: normal;">${worker.role}</span>` : "";
    const hourlyRate = worker ? worker.hourlyRate : 0;
    const totalCost = entry.hours * hourlyRate;

    const tr = `
      <tr>
        <td style="font-weight: 600;">${formatDateString(entry.date)}</td>
        <td style="font-weight: 600;">${name}${roleDisplay}</td>
        <td>${entry.hours.toFixed(1)} hrs</td>
        <td>${hourlyRate === 0 ? "—" : formatCurrency(hourlyRate) + "/hr"}</td>
        <td style="font-weight: 700; color: var(--color-basil); font-family: var(--font-brand);">${hourlyRate === 0 ? "$0.00" : formatCurrency(totalCost)}</td>
        <td style="font-size: 0.8rem; color: var(--text-muted);">${entry.notes || '—'}</td>
        <td>
          <div class="table-row-actions">
            <button class="btn-action-edit" onclick="editTimesheet(${entry.id})" title="Edit Shift">
              <i data-lucide="edit-3"></i>
            </button>
            <button class="btn-action-delete" onclick="deleteTimesheet(${entry.id})" title="Delete Shift">
              <i data-lucide="trash-2"></i>
            </button>
          </div>
        </td>
      </tr>
    `;
    tbody.insertAdjacentHTML('beforeend', tr);
  });

  lucide.createIcons();
}

// Workers CRUD
function openWorkerModal() {
  document.getElementById('form-worker').reset();
  document.getElementById('worker-form-id').value = '';
  document.getElementById('worker-role').value = '';
  document.getElementById('modal-worker-title').textContent = 'Add Employee';
  openModal('modal-worker');
}

function editWorker(id) {
  const w = state.workers.find(worker => worker.id === id);
  if (!w) return;
  document.getElementById('worker-form-id').value = w.id;
  document.getElementById('worker-name').value = w.name;
  document.getElementById('worker-role').value = w.role || '';
  document.getElementById('worker-wage').value = w.hourlyRate;
  document.getElementById('modal-worker-title').textContent = 'Edit Employee';
  openModal('modal-worker');
}

function saveWorkerForm(e) {
  e.preventDefault();
  const idVal = document.getElementById('worker-form-id').value;
  const name = document.getElementById('worker-name').value.trim();
  const role = document.getElementById('worker-role').value.trim() || 'Staff';
  const hourlyRate = parseFloat(document.getElementById('worker-wage').value);

  if (idVal) {
    const idx = state.workers.findIndex(w => w.id === parseInt(idVal));
    if (idx !== -1) {
      state.workers[idx] = { id: parseInt(idVal), name, role, hourlyRate };
      updateState("Updated employee: " + name);
    }
  } else {
    const duplicate = state.workers.find(w => w.name.toLowerCase() === name.toLowerCase());
    if (duplicate) {
      alert("An employee with this name already exists.");
      return;
    }
    const newId = state.workers.length > 0 ? Math.max(...state.workers.map(w => w.id)) + 1 : 1;
    state.workers.push({ id: newId, name, role, hourlyRate });
    updateState("Added employee: " + name);
  }
  closeModal('modal-worker');
}

function deleteWorker(id) {
  const w = state.workers.find(worker => worker.id === id);
  if (!w) return;

  const linkedShifts = state.timesheet.filter(t => t.workerId === id);
  if (linkedShifts.length > 0) {
    alert(`Cannot delete worker! They have ${linkedShifts.length} logged shifts in the timesheet. Delete those shifts first.`);
    return;
  }

  if (confirm(`Are you sure you want to remove worker "${w.name}"?`)) {
    state.workers = state.workers.filter(worker => worker.id !== id);
    updateState("Removed worker: " + w.name);
  }
}

// Timesheet Shift CRUD
function openLogShiftModal() {
  if (state.workers.length === 0) {
    alert("Please add at least one employee in the Worker Directory panel first!");
    return;
  }
  document.getElementById('form-timesheet').reset();
  document.getElementById('timesheet-form-id').value = '';
  document.getElementById('modal-timesheet-title').textContent = 'Log Worker Shift';
  const today = new Date().toISOString().split('T')[0];
  document.getElementById('time-date').value = today;
  openModal('modal-timesheet');
}

function editTimesheet(id) {
  const t = state.timesheet.find(entry => entry.id === id);
  if (!t) return;

  document.getElementById('timesheet-form-id').value = t.id;
  document.getElementById('time-worker-id').value = t.workerId;
  document.getElementById('time-date').value = t.date;
  document.getElementById('time-hours').value = t.hours;
  document.getElementById('time-notes').value = t.notes || '';

  document.getElementById('modal-timesheet-title').textContent = 'Edit Shift Record';
  openModal('modal-timesheet');
}

function saveTimesheetForm(e) {
  e.preventDefault();
  const idVal = document.getElementById('timesheet-form-id').value;
  const workerId = parseInt(document.getElementById('time-worker-id').value);
  const date = document.getElementById('time-date').value;
  const hours = parseFloat(document.getElementById('time-hours').value);
  const notes = document.getElementById('time-notes').value.trim();

  if (idVal) {
    const idx = state.timesheet.findIndex(t => t.id === parseInt(idVal));
    if (idx !== -1) {
      state.timesheet[idx] = { id: parseInt(idVal), workerId, date, hours, notes };
      updateState("Updated shift hours");
    }
  } else {
    const newId = state.timesheet.length > 0 ? Math.max(...state.timesheet.map(t => t.id)) + 1 : 1;
    state.timesheet.push({ id: newId, workerId, date, hours, notes });
    updateState("Logged shift hours");
  }
  closeModal('modal-timesheet');
}

function deleteTimesheet(id) {
  if (confirm("Are you sure you want to delete this timesheet record?")) {
    state.timesheet = state.timesheet.filter(t => t.id !== id);
    updateState("Deleted timesheet record");
  }
}


// 10. SALES & INCOME MANAGER MODULE
function renderSalesList() {
  const tbody = document.getElementById('sales-table-body');
  if (!tbody) return;
  tbody.innerHTML = '';

  const searchVal = document.getElementById('sales-search').value.toLowerCase();
  
  const filtered = state.sales.filter(s => {
    const matchesSearch = s.notes && s.notes.toLowerCase().includes(searchVal);
    return matchesSearch || !searchVal;
  });

  // Update KPI totals in the Sales tab
  let totalRevenue = 0;
  let totalTips = 0;
  let salesCount = 0;

  filtered.forEach(s => {
    totalRevenue += s.subtotal;
    totalTips += s.tips;
    salesCount++;
  });

  const kpiRev = document.getElementById('kpi-sales-revenue');
  const kpiTips = document.getElementById('kpi-sales-tips');
  const kpiComb = document.getElementById('kpi-sales-combined');
  const kpiCount = document.getElementById('kpi-sales-count');

  if (kpiRev) kpiRev.textContent = formatCurrency(totalRevenue);
  if (kpiTips) kpiTips.textContent = formatCurrency(totalTips);
  if (kpiComb) kpiComb.textContent = formatCurrency(totalRevenue + totalTips);
  if (kpiCount) kpiCount.textContent = `${salesCount} entries logged`;

  if (filtered.length === 0) {
    tbody.innerHTML = `<tr><td colspan="8" style="text-align: center; color: var(--text-muted); padding: 30px;">No sales logged. Click "Log Sales / Income" to record revenue!</td></tr>`;
    return;
  }

  filtered.forEach(s => {
    let typeBadge = '';
    let details = '';
    
    if (s.type === 'dishes') {
      typeBadge = `<span class="badge" style="background: var(--color-basil-dark); color: var(--color-basil);">Dish Sale</span>`;
      const recipe = state.recipes.find(r => r.id === s.recipeId);
      details = recipe ? recipe.name : 'Unknown Recipe';
    } else {
      typeBadge = `<span class="badge" style="background: var(--bg-tertiary); color: var(--color-blue);">Lump Sum</span>`;
      details = s.notes || 'Register/Pop-Up Total';
    }

    const qtyDisplay = s.type === 'dishes' ? s.quantity : '—';

    const tr = `
      <tr>
        <td>${s.date}</td>
        <td>${typeBadge}</td>
        <td style="font-weight: 600;">${details}</td>
        <td>${qtyDisplay}</td>
        <td style="font-family: var(--font-brand); font-weight: 600;">${formatCurrency(s.subtotal)}</td>
        <td style="color: var(--color-tomato); font-weight: 600;">${s.tips > 0 ? formatCurrency(s.tips) : '—'}</td>
        <td style="font-weight: 700; color: var(--color-semolina); font-family: var(--font-brand);">${formatCurrency(s.total)}</td>
        <td>
          <div class="table-row-actions">
            <button class="btn-action-edit" onclick="editSales(${s.id})" title="Edit Entry">
              <i data-lucide="edit-3"></i>
            </button>
            <button class="btn-action-delete" onclick="deleteSales(${s.id})" title="Delete Entry">
              <i data-lucide="trash-2"></i>
            </button>
          </div>
        </td>
      </tr>
    `;
    tbody.insertAdjacentHTML('beforeend', tr);
  });

  lucide.createIcons();
}

function handleSalesTypeSelect() {
  try {
    const typeEl = document.getElementById('sales-type');
    if (!typeEl) return;
    const type = typeEl.value;

    const dishGroup = document.getElementById('group-sales-dish');
    const lumpGroup = document.getElementById('group-sales-lump');
    
    const recipeIdEl = document.getElementById('sales-recipe-id');
    const quantityEl = document.getElementById('sales-quantity');
    const subtotalEl = document.getElementById('sales-subtotal');

    if (type === 'dishes') {
      if (dishGroup) dishGroup.classList.remove('hidden');
      if (lumpGroup) lumpGroup.classList.add('hidden');
      if (recipeIdEl) recipeIdEl.required = true;
      if (quantityEl) quantityEl.required = true;
      if (subtotalEl) subtotalEl.required = false;
    } else {
      if (dishGroup) dishGroup.classList.add('hidden');
      if (lumpGroup) lumpGroup.classList.remove('hidden');
      if (recipeIdEl) recipeIdEl.required = false;
      if (quantityEl) quantityEl.required = false;
      if (subtotalEl) subtotalEl.required = true;
    }
    updateSalesLiveSummary();
  } catch (err) {
    console.error("Error in handleSalesTypeSelect:", err);
  }
}

function openSalesModal() {
  try {
    const form = document.getElementById('form-sales');
    if (form) form.reset();

    const idInput = document.getElementById('sales-form-id');
    if (idInput) idInput.value = '';

    const typeInput = document.getElementById('sales-type');
    if (typeInput) typeInput.value = 'dishes';
    
    // Populate recipes select list with Menu Items only
    const select = document.getElementById('sales-recipe-id');
    if (select) {
      select.innerHTML = '<option value="" disabled selected>-- Choose Menu Item --</option>';
      
      const menuItems = (state.recipes || []).filter(r => r && r.sellingPrice > 0);
      menuItems.sort((a,b) => {
        const nameA = a && a.name ? String(a.name) : '';
        const nameB = b && b.name ? String(b.name) : '';
        return nameA.localeCompare(nameB);
      });
      
      menuItems.forEach(r => {
        if (r && r.name) {
          select.insertAdjacentHTML('beforeend', `<option value="${r.id}">${r.name} (${formatCurrency(r.sellingPrice)}/ea)</option>`);
        }
      });
    }

    const today = new Date().toISOString().split('T')[0];
    const dateInput = document.getElementById('sales-date');
    if (dateInput) dateInput.value = today;

    handleSalesTypeSelect();
    openModal('modal-sales');
  } catch (err) {
    console.error("Error in openSalesModal:", err);
    alert("Error opening sales modal: " + err.message);
  }
}

function updateSalesLiveSummary() {
  try {
    const typeEl = document.getElementById('sales-type');
    if (!typeEl) return;
    const type = typeEl.value;

    const tipsEl = document.getElementById('sales-tips');
    const tips = tipsEl ? (parseFloat(tipsEl.value) || 0) : 0;
    let subtotal = 0;

    if (type === 'dishes') {
      const recipeIdEl = document.getElementById('sales-recipe-id');
      const quantityEl = document.getElementById('sales-quantity');
      
      const recipeId = recipeIdEl ? parseInt(recipeIdEl.value) : NaN;
      const quantity = quantityEl ? (parseInt(quantityEl.value) || 0) : 0;
      
      const recipe = (state.recipes || []).find(r => r && r.id === recipeId);
      if (recipe) {
        subtotal = quantity * (recipe.sellingPrice || 0);
      }
    } else {
      const subtotalEl = document.getElementById('sales-subtotal');
      subtotal = subtotalEl ? (parseFloat(subtotalEl.value) || 0) : 0;
    }

    const total = subtotal + tips;

    const subtotalSummary = document.getElementById('sales-summary-subtotal');
    const tipsSummary = document.getElementById('sales-summary-tips');
    const totalSummary = document.getElementById('sales-summary-total');

    if (subtotalSummary) subtotalSummary.textContent = formatCurrency(subtotal);
    if (tipsSummary) tipsSummary.textContent = formatCurrency(tips);
    if (totalSummary) totalSummary.textContent = formatCurrency(total);
  } catch (err) {
    console.error("Error in updateSalesLiveSummary:", err);
  }
}

function saveSalesForm(e) {
  e.preventDefault();

  const idVal = document.getElementById('sales-form-id').value;
  const date = document.getElementById('sales-date').value;
  const type = document.getElementById('sales-type').value;
  const tips = parseFloat(document.getElementById('sales-tips').value) || 0;
  const notes = document.getElementById('sales-notes').value.trim();

  let recipeId = null;
  let quantity = 0;
  let pricePerUnit = 0;
  let subtotal = 0;

  if (type === 'dishes') {
    recipeId = parseInt(document.getElementById('sales-recipe-id').value);
    quantity = parseInt(document.getElementById('sales-quantity').value);
    const recipe = state.recipes.find(r => r.id === recipeId);
    if (!recipe) {
      alert("Please select a valid menu item.");
      return;
    }
    pricePerUnit = recipe.sellingPrice;
    subtotal = quantity * pricePerUnit;
  } else {
    subtotal = parseFloat(document.getElementById('sales-subtotal').value);
  }

  const total = subtotal + tips;

  const record = {
    id: idVal ? parseInt(idVal) : (state.sales.length > 0 ? Math.max(...state.sales.map(s => s.id)) + 1 : 1),
    date,
    type,
    recipeId,
    quantity,
    pricePerUnit,
    subtotal,
    tips,
    total,
    notes: notes || (type === 'dishes' ? `Sold ${quantity}x ${state.recipes.find(r => r.id === recipeId).name}` : 'Lump Sum Entry')
  };

  if (idVal) {
    const idx = state.sales.findIndex(s => s.id === parseInt(idVal));
    if (idx !== -1) {
      state.sales[idx] = record;
      updateState("Updated sales record");
    }
  } else {
    state.sales.push(record);
    updateState("Logged sales/income");
  }

  closeModal('modal-sales');
}

function editSales(id) {
  const sale = state.sales.find(s => s.id === id);
  if (!sale) return;

  openSalesModal(); // Initial population

  document.getElementById('sales-form-id').value = sale.id;
  document.getElementById('sales-date').value = sale.date;
  document.getElementById('sales-type').value = sale.type;
  document.getElementById('sales-tips').value = sale.tips;
  document.getElementById('sales-notes').value = sale.notes || '';

  handleSalesTypeSelect();

  if (sale.type === 'dishes') {
    document.getElementById('sales-recipe-id').value = sale.recipeId;
    document.getElementById('sales-quantity').value = sale.quantity;
  } else {
    document.getElementById('sales-subtotal').value = sale.subtotal;
  }

  updateSalesLiveSummary();
  document.getElementById('modal-sales-title').textContent = 'Edit Sales / Income';
}

function deleteSales(id) {
  if (confirm("Are you sure you want to delete this sales record?")) {
    state.sales = state.sales.filter(s => s.id !== id);
    updateState("Deleted sales record");
  }
}


// 11. OPERATING EXPENSES ENGINE
function handleExpenseFriendToggle() {
  const isChecked = document.getElementById('exp-paid-friend').checked;
  const group = document.getElementById('group-expense-friend-name');
  const input = document.getElementById('exp-friend-name');
  
  if (isChecked) {
    group.classList.remove('hidden');
    input.required = true;
  } else {
    group.classList.add('hidden');
    input.required = false;
    input.value = '';
  }
}

function renderExpensesList() {
  const tbody = document.getElementById('expenses-table-body');
  tbody.innerHTML = '';

  const friendFinancedExpenses = state.expenses.filter(e => e.paidByFriend);
  const standardExpenses = state.expenses.filter(e => !e.paidByFriend);

  if (state.expenses.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5" style="text-align: center; color: var(--text-muted); padding: 30px;">No operating expenses logged yet. Click "Log Operating Expense" to log one.</td></tr>`;
    updateDebtTrackerUI();
    renderPaybacksList();
    return;
  }

  state.expenses.forEach(exp => {
    let friendBadge = '';
    if (exp.paidByFriend) {
      friendBadge = `<span class="badge" style="background: rgba(91, 163, 112, 0.15); color: var(--color-basil); margin-left: 8px; font-size: 0.65rem;"><i data-lucide="handshake" style="width: 10px; height: 10px; display: inline; vertical-align: middle; margin-right: 3px;"></i>Paid by ${exp.friendName}</span>`;
    }

    const tr = `
      <tr>
        <td style="font-weight: 600;">${formatDateString(exp.date)}</td>
        <td>
          <span class="badge category-packaging">${exp.category}</span>
          ${friendBadge}
        </td>
        <td style="font-family: var(--font-brand); font-weight: 700; color: ${exp.paidByFriend ? 'var(--color-cream)' : 'var(--color-tomato)'};">
          ${formatCurrency(exp.amount)}
        </td>
        <td style="font-size: 0.8rem; color: var(--text-muted);">${exp.notes || '—'}</td>
        <td>
          <div class="table-row-actions">
            <button class="btn-action-edit" onclick="editExpense(${exp.id})" title="Edit Expense">
              <i data-lucide="edit-3"></i>
            </button>
            <button class="btn-action-delete" onclick="deleteExpense(${exp.id})" title="Delete Expense">
              <i data-lucide="trash-2"></i>
            </button>
          </div>
        </td>
      </tr>
    `;
    tbody.insertAdjacentHTML('beforeend', tr);
  });

  updateDebtTrackerUI();
  renderPaybacksList();
  lucide.createIcons();
}

function openExpenseModal() {
  document.getElementById('form-expense').reset();
  document.getElementById('expense-form-id').value = '';
  document.getElementById('exp-paid-friend').checked = false;
  handleExpenseFriendToggle();
  document.getElementById('modal-expense-title').textContent = 'Log Operating Expense';
  const today = new Date().toISOString().split('T')[0];
  document.getElementById('exp-date').value = today;
  openModal('modal-expense');
}

function editExpense(id) {
  const exp = state.expenses.find(e => e.id === id);
  if (!exp) return;

  document.getElementById('expense-form-id').value = exp.id;
  document.getElementById('exp-date').value = exp.date;
  document.getElementById('exp-category').value = exp.category;
  document.getElementById('exp-amount').value = exp.amount;
  document.getElementById('exp-notes').value = exp.notes || '';

  const isPaidFriend = !!exp.paidByFriend;
  document.getElementById('exp-paid-friend').checked = isPaidFriend;
  handleExpenseFriendToggle();
  if (isPaidFriend) {
    document.getElementById('exp-friend-name').value = exp.friendName || '';
  }

  document.getElementById('modal-expense-title').textContent = 'Edit Operating Expense';
  openModal('modal-expense');
}

function saveExpenseForm(e) {
  e.preventDefault();
  const idVal = document.getElementById('expense-form-id').value;
  const date = document.getElementById('exp-date').value;
  const category = document.getElementById('exp-category').value;
  const amount = parseFloat(document.getElementById('exp-amount').value);
  const notes = document.getElementById('exp-notes').value.trim();

  const paidByFriend = document.getElementById('exp-paid-friend').checked;
  const friendName = paidByFriend ? document.getElementById('exp-friend-name').value.trim() : '';

  if (paidByFriend && !friendName) {
    alert("Please enter the lender/friend's name.");
    return;
  }

  const record = {
    id: idVal ? parseInt(idVal) : (state.expenses.length > 0 ? Math.max(...state.expenses.map(e => e.id)) + 1 : 1),
    date,
    category,
    amount,
    notes,
    paidByFriend,
    friendName
  };

  if (idVal) {
    const idx = state.expenses.findIndex(e => e.id === parseInt(idVal));
    if (idx !== -1) {
      state.expenses[idx] = record;
      updateState("Updated expense record");
    }
  } else {
    state.expenses.push(record);
    updateState("Logged operating expense");
  }
  closeModal('modal-expense');
}

function deleteExpense(id) {
  if (confirm("Are you sure you want to delete this expense record?")) {
    state.expenses = state.expenses.filter(e => e.id !== id);
    updateState("Deleted expense record");
  }
}

// 12. FRIEND FINANCING DEBT REPAYMENTS LEDGER
function updateDebtTrackerUI() {
  const statBorrowed = document.getElementById('debt-total-borrowed');
  if (!statBorrowed) return;

  // 1. Calculate Borrowed and Paid Tally
  let totalBorrowed = 0;
  state.expenses.forEach(e => {
    if (e.paidByFriend) totalBorrowed += e.amount;
  });

  let totalRepaid = 0;
  state.paybacks.forEach(p => {
    totalRepaid += p.amount;
  });

  const remainingBalance = Math.max(0, totalBorrowed - totalRepaid);

  // 2. Calculate Available Cash Profits
  // Revenue
  let totalRevenue = 0;
  let totalTips = 0;
  if (state.sales.length > 0) {
    state.sales.forEach(s => {
      totalRevenue += s.subtotal;
      totalTips += s.tips;
    });
  } else {
    totalRevenue = state.recipes.reduce((sum, r) => sum + (r.sellingPrice * r.portions), 0);
  }
  const combinedIncome = totalRevenue + totalTips;

  // Ingredients Cost
  let totalIngredientCost = 0;
  const dishSales = state.sales.filter(s => s.type === 'dishes');
  if (dishSales.length > 0) {
    dishSales.forEach(s => {
      const recipe = state.recipes.find(r => r.id === s.recipeId);
      if (recipe) {
        totalIngredientCost += s.quantity * calculateRecipeCostMetrics(recipe).portionCost;
      }
    });
  } else {
    state.recipes.forEach(recipe => {
      totalIngredientCost += calculateRecipeCostMetrics(recipe).totalCost;
    });
  }

  // Labor payroll
  let totalLabor = 0;
  state.timesheet.forEach(entry => {
    const worker = state.workers.find(w => w.id === entry.workerId);
    totalLabor += entry.hours * (worker ? worker.hourlyRate : 0);
  });

  // Standard non-friend Overhead
  let standardOverhead = 0;
  state.expenses.forEach(exp => {
    if (!exp.paidByFriend) standardOverhead += exp.amount;
  });

  // Available Profit = Revenue + Tips - Ingredients - Labor - Non-Friend Overhead - Cash Paid Out
  const cumulativeProfit = combinedIncome - totalIngredientCost - totalLabor - standardOverhead;
  const availableProfit = cumulativeProfit - totalRepaid;

  // 3. Render Tallies
  statBorrowed.textContent = formatCurrency(totalBorrowed);
  document.getElementById('debt-total-repaid').textContent = formatCurrency(totalRepaid);
  document.getElementById('debt-remaining-balance').textContent = formatCurrency(remainingBalance);
  document.getElementById('loan-profits-value').textContent = formatCurrency(availableProfit);

  // 4. Status Badge configuration
  const badge = document.getElementById('loan-status-badge');
  if (badge) {
    if (totalBorrowed === 0) {
      badge.textContent = "No active loans";
      badge.style.background = "rgba(255, 255, 255, 0.05)";
      badge.style.color = "var(--text-muted)";
    } else if (remainingBalance <= 0) {
      badge.textContent = "Fully Paid Off! \uD83C\uDF89";
      badge.style.background = "rgba(91, 163, 112, 0.15)";
      badge.style.color = "var(--color-basil)";
    } else {
      badge.textContent = "Outstanding Debts";
      badge.style.background = "rgba(239, 68, 68, 0.15)";
      badge.style.color = "var(--color-tomato)";
    }
  }
}

function renderPaybacksList() {
  const tbody = document.getElementById('paybacks-table-body');
  if (!tbody) return;
  tbody.innerHTML = '';

  const tallyCount = document.getElementById('paybacks-summary-tally');
  if (tallyCount) {
    tallyCount.textContent = `${state.paybacks.length} installments made`;
  }

  if (state.paybacks.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5" style="text-align: center; color: var(--text-muted); padding: 30px;">No paybacks logged yet. Use the button above to record a payback from profits!</td></tr>`;
    return;
  }

  // Sort paybacks by date descending
  const sorted = [...state.paybacks].sort((a,b) => b.date.localeCompare(a.date));

  sorted.forEach(p => {
    const tr = `
      <tr>
        <td style="font-weight: 600;">${formatDateString(p.date)}</td>
        <td style="font-weight: 600; color: var(--color-semolina);"><i data-lucide="user" style="width: 12px; height: 12px; display: inline-block; vertical-align: middle; margin-right: 4px;"></i>${p.friendName}</td>
        <td style="font-family: var(--font-brand); font-weight: 700; color: var(--color-basil);">${formatCurrency(p.amount)}</td>
        <td style="font-size: 0.8rem; color: var(--text-muted);">${p.notes || '\u2014'}</td>
        <td>
          <div class="table-row-actions">
            <button class="btn-action-delete" onclick="deletePayback(${p.id})" title="Delete Payback">
              <i data-lucide="trash-2"></i>
            </button>
          </div>
        </td>
      </tr>
    `;
    tbody.insertAdjacentHTML('beforeend', tr);
  });

  lucide.createIcons();
}

function openPaybackModal() {
  try {
    const form = document.getElementById('form-payback');
    if (form) form.reset();

    const idInput = document.getElementById('payback-form-id');
    if (idInput) idInput.value = '';

    const today = new Date().toISOString().split('T')[0];
    const dateInput = document.getElementById('payback-date');
    if (dateInput) dateInput.value = today;

    // Build unique friends dropdown from active paid-by-friend expenses
    const select = document.getElementById('payback-friend-name');
    if (select) {
      select.innerHTML = '<option value="" disabled selected>-- Choose Lender --</option>';

      const uniqueFriends = new Set();
      (state.expenses || []).forEach(e => {
        if (e && e.paidByFriend && e.friendName && typeof e.friendName === 'string') {
          uniqueFriends.add(e.friendName.trim());
        }
      });

      if (uniqueFriends.size === 0) {
        select.insertAdjacentHTML('beforeend', '<option value="" disabled>No outstanding friend loans found</option>');
      } else {
        uniqueFriends.forEach(name => {
          select.insertAdjacentHTML('beforeend', `<option value="${name}">${name}</option>`);
        });
      }
    }

    openModal('modal-payback');
  } catch (err) {
    console.error("Error in openPaybackModal:", err);
    alert("Error opening payback modal: " + err.message);
  }
}

function savePaybackForm(e) {
  e.preventDefault();
  const friendName = document.getElementById('payback-friend-name').value;
  const date = document.getElementById('payback-date').value;
  const amount = parseFloat(document.getElementById('payback-amount').value);
  const notes = document.getElementById('payback-notes').value.trim();

  if (!friendName) {
    alert("Please select a lender first.");
    return;
  }
  if (isNaN(amount) || amount <= 0) {
    alert("Please enter a valid amount.");
    return;
  }

  const newId = state.paybacks.length > 0 ? Math.max(...state.paybacks.map(p => p.id)) + 1 : 1;
  const record = {
    id: newId,
    friendName,
    date,
    amount,
    notes: notes || `Installment payment paid to ${friendName}`
  };

  state.paybacks.push(record);
  updateState("Logged payback installment to " + friendName);

  closeModal('modal-payback');
}

function deletePayback(id) {
  if (confirm("Are you sure you want to delete this payback installment record?")) {
    state.paybacks = state.paybacks.filter(p => p.id !== id);
    updateState("Deleted payback installment record");
  }
}


// 11. PRIVATE CLOUD SYNC ENGINE (JSONBIN.IO INTERFACE)
function setupSettingsListeners() {
  document.getElementById('sync-api-key').value = state.settings.syncApiKey || '';
  document.getElementById('sync-bin-id').value  = state.settings.syncBinId  || '';
  validateSyncSettings();
}

function validateSyncSettings() {
  const apiKey = document.getElementById('sync-api-key').value.trim();
  const binId  = document.getElementById('sync-bin-id').value.trim();
  const btnToggle   = document.getElementById('btn-toggle-sync');
  const btnSyncNow  = document.getElementById('btn-sync-now');
  const btnCreate   = document.getElementById('btn-create-bin');

  btnCreate.disabled = (apiKey.length === 0);

  if (apiKey.length > 0 && binId.length > 0) {
    btnToggle.disabled = false;
    if (state.settings.syncEnabled) {
      btnSyncNow.disabled = false;
      btnToggle.textContent = 'Disable Sync';
      btnToggle.className = 'btn-danger-outline';
    } else {
      btnSyncNow.disabled = true;
      btnToggle.textContent = 'Enable Sync';
      btnToggle.className = 'btn-primary';
    }
  } else {
    btnToggle.disabled = true;
    btnSyncNow.disabled = true;
    btnToggle.textContent = 'Enable Sync';
    btnToggle.className = 'btn-primary';
  }
}

// Fetch helper with AbortController timeout (works reliably on mobile)
async function fetchWithTimeout(url, options, ms = 12000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try {
    const res = await fetch(url, { ...options, signal: ctrl.signal });
    clearTimeout(timer);
    return res;
  } catch (err) {
    clearTimeout(timer);
    if (err.name === 'AbortError') throw new Error('Connection timed out (12s). Check your internet.');
    throw err;
  }
}

// Extract only the data we want to sync — NOT credentials or settings
function getSyncPayload() {
  return {
    ingredients: state.ingredients || [],
    recipes:     state.recipes     || [],
    workers:     state.workers     || [],
    timesheet:   state.timesheet   || [],
    expenses:    state.expenses    || [],
    sales:       state.sales       || [],
    paybacks:    state.paybacks    || [],
    syncVersion: Date.now()
  };
}

// Create a new JSONBin and upload current data
async function createNewCloudBin() {
  const apiKey  = document.getElementById('sync-api-key').value.trim();
  const statusEl = document.getElementById('sync-status-details');
  if (!apiKey) { alert('Please enter your JSONBin.io API Key first.'); return; }

  const btnCreate = document.getElementById('btn-create-bin');
  btnCreate.disabled = true;
  btnCreate.textContent = 'Creating...';
  statusEl.textContent = 'Creating private cloud bin on JSONBin...';

  try {
    const res = await fetchWithTimeout('https://api.jsonbin.io/v3/b', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Master-Key': apiKey,
        'X-Bin-Private': 'true',
        'X-Bin-Name': 'WildPastaData'
      },
      body: JSON.stringify(getSyncPayload())
    });

    let data;
    try { data = await res.json(); } catch(e) { throw new Error(`JSONBin returned non-JSON (HTTP ${res.status})`); }

    if (!res.ok) {
      throw new Error(data.message || `HTTP ${res.status}`);
    }

    const binId = data.metadata && data.metadata.id;
    if (!binId) throw new Error('No bin ID returned — unexpected response from JSONBin.');

    document.getElementById('sync-bin-id').value = binId;
    state.settings.syncApiKey  = apiKey;
    state.settings.syncBinId   = binId;
    state.settings.syncEnabled = true;
    state.settings.lastSyncTime = new Date().toLocaleTimeString();
    saveStateLocal();
    validateSyncSettings();
    updateSyncBadge('synced', 'Synced ✓');

    statusEl.innerHTML = `
      <span style="color:var(--color-green);font-weight:bold;">✓ Bin created &amp; data uploaded!</span><br>
      Your Sync Code (Bin ID):<br>
      <code style="background:rgba(0,0,0,0.35);padding:4px 8px;border-radius:4px;font-size:0.8rem;word-break:break-all;display:block;margin-top:4px;">${binId}</code>
      <small style="opacity:0.7;">Copy this code into Settings on your other devices to share data.</small>
    `;
  } catch (err) {
    console.error('[Sync] createNewCloudBin:', err);
    statusEl.innerHTML = `<span style="color:var(--color-tomato);font-weight:bold;">✗ ${err.message}</span>`;
    updateSyncBadge('error', 'Error');
  } finally {
    btnCreate.disabled = false;
    btnCreate.textContent = 'Create New Bin';
  }
}

async function toggleSyncState() {
  const statusEl = document.getElementById('sync-status-details');
  if (state.settings.syncEnabled) {
    // Disable — keep credentials, just stop syncing
    state.settings.syncEnabled = false;
    saveStateLocal();
    updateSyncBadge('local', 'Local Mode');
    statusEl.textContent = 'Cloud Sync paused. Your data continues to save locally.';
    validateSyncSettings();
  } else {
    const apiKey = document.getElementById('sync-api-key').value.trim();
    const binId  = document.getElementById('sync-bin-id').value.trim();
    if (!apiKey || !binId) {
      alert('Please enter both your API Key and Sync Code before enabling sync.');
      return;
    }
    state.settings.syncApiKey  = apiKey;
    state.settings.syncBinId   = binId;
    state.settings.syncEnabled = true;
    saveStateLocal();
    validateSyncSettings();
    await syncDataOnline();
  }
}

// Main sync: PULL from cloud → merge arrays → PUSH merged data back
async function syncDataOnline() {
  const apiKey = state.settings.syncApiKey || document.getElementById('sync-api-key').value.trim();
  const binId  = state.settings.syncBinId  || document.getElementById('sync-bin-id').value.trim();
  const statusEl = document.getElementById('sync-status-details');

  if (!apiKey || !binId) {
    console.warn('[Sync] No credentials — skipping.');
    return;
  }

  // Guard: prevent double-calls
  if (syncDataOnline._running) {
    console.warn('[Sync] Already running — skipping duplicate call.');
    return;
  }
  syncDataOnline._running = true;

  state.settings.syncEnabled = true;
  updateSyncBadge('syncing', 'Syncing...');
  if (statusEl) statusEl.textContent = '⏳ Pulling from cloud...';

  try {
    // ── 1. PULL ──────────────────────────────────────────────────────────
    const pullRes = await fetchWithTimeout(
      `https://api.jsonbin.io/v3/b/${binId}/latest`,
      { method: 'GET', headers: { 'X-Master-Key': apiKey } }
    );

    let pullData;
    try { pullData = await pullRes.json(); } catch(e) { throw new Error(`Bad response from JSONBin pull (HTTP ${pullRes.status})`); }

    if (!pullRes.ok) {
      if (pullRes.status === 401 || pullRes.status === 403)
        throw new Error(`API Key rejected (${pullRes.status}). Re-check your JSONBin API Key.`);
      if (pullRes.status === 404)
        throw new Error(`Sync Code not found (404). Make sure you pasted the correct Bin ID.`);
      throw new Error(pullData.message || `Pull failed: HTTP ${pullRes.status}`);
    }

    // ── 2. MERGE ─────────────────────────────────────────────────────────
    if (statusEl) statusEl.textContent = '⏳ Merging data...';
    const cloud = pullData.record; // JSONBin v3: { record: <your data>, metadata: {} }
    if (cloud && typeof cloud === 'object') {
      mergeLocalWithCloudState(cloud);
    }

    // ── 3. PUSH ──────────────────────────────────────────────────────────
    if (statusEl) statusEl.textContent = '⏳ Uploading to cloud...';
    const pushRes = await fetchWithTimeout(
      `https://api.jsonbin.io/v3/b/${binId}`,
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'X-Master-Key': apiKey },
        body: JSON.stringify(getSyncPayload())
      }
    );

    let pushData;
    try { pushData = await pushRes.json(); } catch(e) { throw new Error(`Bad response from JSONBin push (HTTP ${pushRes.status})`); }

    if (!pushRes.ok) {
      throw new Error(pushData.message || `Push failed: HTTP ${pushRes.status}`);
    }

    // ── SUCCESS ───────────────────────────────────────────────────────────
    state.settings.lastSyncTime = new Date().toLocaleTimeString();
    state.settings.syncApiKey = apiKey;
    state.settings.syncBinId  = binId;
    saveStateLocal();

    // Refresh the UI lists without triggering another sync
    updateFinancialsKPIs();
    renderIngredientsList();
    renderRecipesList();
    renderWorkersList();
    renderTimesheetsList();
    renderExpensesList();
    renderSalesList();
    renderPaybacksList();

    updateSyncBadge('synced', 'Synced ✓');
    if (statusEl) statusEl.innerHTML = `
      <span style="color:var(--color-green);font-weight:bold;">✓ Synced successfully!</span>
      Last sync: ${state.settings.lastSyncTime}<br>
      <small>Sync Code: <code style="background:rgba(0,0,0,0.3);padding:1px 5px;border-radius:3px;">${binId}</code></small>
    `;

  } catch (err) {
    console.error('[Sync] syncDataOnline failed:', err);
    updateSyncBadge('error', 'Sync Error');
    if (statusEl) statusEl.innerHTML = `
      <span style="color:var(--color-tomato);font-weight:bold;">✗ Sync failed</span><br>
      ${err.message}<br>
      <small>Double-check your API Key and Sync Code in Settings.</small>
    `;
  } finally {
    syncDataOnline._running = false;
  }
}

// Master state merger: combines local state lists with cloud lists based on item uniqueness
function mergeLocalWithCloudState(cloud) {
  // If cloud state is empty or invalid, skip merging
  if (!cloud || !Array.isArray(cloud.ingredients)) return;

  // Helper merge array function based on Unique ID or Name
  function mergeArrayById(localArr, cloudArr) {
    const combined = [...localArr];
    cloudArr.forEach(cItem => {
      const exists = combined.findIndex(lItem => lItem.id === cItem.id || (lItem.name && lItem.name.toLowerCase() === cItem.name.toLowerCase()));
      if (exists === -1) {
        combined.push(cItem);
      } else {
        // If it exists in both, keep local or merge changes (overwrite with latest if local is same)
        combined[exists] = Object.assign({}, cItem, combined[exists]);
      }
    });
    return combined;
  }

  state.ingredients = mergeArrayById(state.ingredients, cloud.ingredients);
  state.recipes = mergeArrayById(state.recipes, cloud.recipes);
  state.workers = mergeArrayById(state.workers, cloud.workers);
  
  // For timesheets and expenses (no unique names), merge by exact date/description/hours
  function mergeTimesheets(lTime, cTime) {
    const combined = [...lTime];
    cTime.forEach(c => {
      const exists = combined.some(l => l.workerId === c.workerId && l.date === c.date && l.hours === c.hours && l.notes === c.notes);
      if (!exists) {
        c.id = combined.length > 0 ? Math.max(...combined.map(t => t.id)) + 1 : 1;
        combined.push(c);
      }
    });
    return combined;
  }
  
  function mergeExpenses(lExp, cExp) {
    const combined = [...lExp];
    cExp.forEach(c => {
      const exists = combined.some(l => l.date === c.date && l.category === c.category && l.amount === c.amount && l.notes === c.notes);
      if (!exists) {
        c.id = combined.length > 0 ? Math.max(...combined.map(e => e.id)) + 1 : 1;
        combined.push(c);
      }
    });
    return combined;
  }

  state.timesheet = mergeTimesheets(state.timesheet, cloud.timesheet);
  state.expenses = mergeExpenses(state.expenses, cloud.expenses);

  // Merge Sales records cleanly
  function mergeSales(lSales, cSales) {
    const combined = [...lSales];
    cSales.forEach(c => {
      const exists = combined.findIndex(l => l.id === c.id);
      if (exists === -1) {
        combined.push(c);
      } else {
        combined[exists] = Object.assign({}, c, combined[exists]);
      }
    });
    return combined;
  }

  // Merge Payback records cleanly
  function mergePaybacks(lPaybacks, cPaybacks) {
    const combined = [...lPaybacks];
    cPaybacks.forEach(c => {
      const exists = combined.findIndex(l => l.id === c.id);
      if (exists === -1) {
        combined.push(c);
      } else {
        combined[exists] = Object.assign({}, c, combined[exists]);
      }
    });
    return combined;
  }

  state.sales = mergeSales(state.sales || [], cloud.sales || []);
  state.paybacks = mergePaybacks(state.paybacks || [], cloud.paybacks || []);
}

function updateSyncUIElements() {
  document.getElementById('sync-api-key').value = state.settings.syncApiKey || '';
  document.getElementById('sync-bin-id').value = state.settings.syncBinId || '';
  validateSyncSettings();
}

function updateSyncBadge(status, text) {
  const badge = document.getElementById('sync-badge');
  const icon = badge.querySelector('i');
  const txt = badge.querySelector('.sync-text');

  badge.className = `sync-badge ${status}`;
  txt.textContent = text;

  if (status === 'local') {
    icon.setAttribute('data-lucide', 'cloud-off');
  } else if (status === 'synced') {
    icon.setAttribute('data-lucide', 'cloud-check');
  } else if (status === 'syncing') {
    icon.setAttribute('data-lucide', 'refresh-cw');
    badge.querySelector('.sync-icon').classList.add('icon-spin-hover');
  } else if (status === 'error') {
    icon.setAttribute('data-lucide', 'cloud-lightning');
  }
  
  lucide.createIcons();
}

function toggleSyncInstructions() {
  const content = document.getElementById('sync-instructions-content');
  const chevron = document.getElementById('instructions-chevron');

  if (content.classList.contains('hidden')) {
    content.classList.remove('hidden');
    chevron.style.transform = 'rotate(180deg)';
  } else {
    content.classList.add('hidden');
    chevron.style.transform = 'rotate(0deg)';
  }
}


// 12. FILE BACKUP & EXPORTS
function exportDataToFile() {
  const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(state, null, 2));
  const dlAnchorElem = document.createElement('a');
  dlAnchorElem.setAttribute("href", dataStr);
  
  const date = new Date().toISOString().split('T')[0];
  dlAnchorElem.setAttribute("download", `wild_pasta_backup_${date}.json`);
  dlAnchorElem.click();
}

function importDataFromFile(event) {
  const input = event.target;
  const reader = new FileReader();
  
  reader.onload = function() {
    try {
      const importedState = JSON.parse(reader.result);
      if (importedState.ingredients && importedState.recipes) {
        state = importedState;
        updateState("Imported database from backup file");
        alert("Database successfully restored from backup file!");
      } else {
        alert("Invalid file format. Ensure it is a valid Wild Pasta backup JSON.");
      }
    } catch (e) {
      alert("Failed to parse JSON file.");
    }
  };
  
  if (input.files && input.files[0]) {
    reader.readAsText(input.files[0]);
  }
}

function resetToSampleDatabase() {
  if (confirm("WARNING: This will overwrite your current active database with standard sample pasta data. Continue?")) {
    state = JSON.parse(JSON.stringify(WILD_PASTA_SAMPLE_DATA));
    updateState("Reset database to standard sample data");
    alert("Database overwritten with sample data!");
  }
}

function nukeDatabase() {
  if (confirm("EXTREME WARNING: This will completely wipe all of your recipes, ingredients, labor records, and operating costs. This cannot be undone. Are you absolutely sure?")) {
    state = {
      settings: { unitSystem: 'us', syncBinId: '', syncApiKey: '', syncEnabled: false, lastSyncTime: '' },
      ingredients: [],
      recipes: [],
      workers: [],
      timesheet: [],
      expenses: [],
      sales: [],
      paybacks: []
    };
    updateState("Wiped database");
    alert("Database fully wiped.");
  }
}


// 13. DUAL-UNIT TOGGLE LOGIC
function setGlobalUnitSystem(system) {
  state.settings.unitSystem = system;
  saveStateLocal();
  
  // Update toggle button states
  const btnUs = document.getElementById('btn-unit-us');
  const btnMetric = document.getElementById('btn-unit-metric');

  if (system === 'us') {
    btnUs.classList.add('active');
    btnMetric.classList.remove('active');
  } else {
    btnMetric.classList.add('active');
    btnUs.classList.remove('active');
  }

  // Re-render UI to display in new units
  rebuildAppUI();
}

function formatCalculatedUnitCost(ing) {
  const cost = getIngredientUnitCost(ing); // Cost per raw purchase unit (e.g. per lb)
  const system = state.settings.unitSystem;

  if (ing.unit === 'unit') {
    return `${formatCurrency(cost)} / unit`;
  }

  if (system === 'us') {
    // Show in US Standard: Weight = $/lb, Volume = $/fl oz
    if (TO_GRAMS.hasOwnProperty(ing.unit)) {
      const costPerLb = cost * convertUnit(1, 'lb', ing.unit);
      return `${formatCurrency(costPerLb)} / lb`;
    } else {
      const costPerFlOz = cost * convertUnit(1, 'floz', ing.unit);
      return `${formatCurrency(costPerFlOz)} / fl oz`;
    }
  } else {
    // Show in Metric: Weight = $/kg, Volume = $/L
    if (TO_GRAMS.hasOwnProperty(ing.unit)) {
      const costPerKg = cost * convertUnit(1, 'kg', ing.unit);
      return `${formatCurrency(costPerKg)} / kg`;
    } else {
      const costPerL = cost * convertUnit(1, 'L', ing.unit);
      return `${formatCurrency(costPerL)} / L`;
    }
  }
}


// 14. MISCELLANEOUS UI HELPERS (TAB SWITCHING, MODALS, DRAWER MENU)
function toggleDrawer() {
  const drawer = document.getElementById('app-drawer');
  const overlay = document.getElementById('app-drawer-overlay');
  
  if (drawer.classList.contains('active')) {
    drawer.classList.remove('active');
    overlay.classList.remove('active');
  } else {
    drawer.classList.add('active');
    overlay.classList.add('active');
  }
}

function handleDrawerNav(tabId) {
  switchTab(tabId);
  toggleDrawer(); // Auto-close drawer on link click
}

function switchTab(tabId) {
  // Toggle active class on tab content panels
  const tabs = document.querySelectorAll('.tab-content');
  tabs.forEach(tab => tab.classList.remove('active'));
  document.getElementById(`tab-${tabId}`).classList.add('active');

  // Toggle active class on drawer navigation items
  const drawerItems = document.querySelectorAll('.drawer-item');
  drawerItems.forEach(item => item.classList.remove('active'));
  const activeDrawItem = document.getElementById(`draw-${tabId}`);
  if (activeDrawItem) activeDrawItem.classList.add('active');

  // Specific tab entry triggers
  if (tabId === 'dashboard') {
    setTimeout(renderDashboardCharts, 100);
  }
}

function openModal(modalId) {
  document.getElementById(modalId).classList.add('active');
}

function closeModal(modalId) {
  document.getElementById(modalId).classList.remove('active');
}

// Global utility formatting
function formatCurrency(val) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(val);
}

function formatDateString(dateStr) {
  const parts = dateStr.split('-');
  if (parts.length !== 3) return dateStr;
  // Format as short month day (e.g. May 23)
  const d = new Date(parts[0], parts[1]-1, parts[2]);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}
