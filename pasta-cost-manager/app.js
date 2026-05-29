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
let currentRecipeInstructions = [];

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

  // Initialize Flatpickr on all date inputs for a premium UI
  if (typeof flatpickr !== 'undefined') {
    flatpickr("input[type=date]", {
      dateFormat: "Y-m-d",
      disableMobile: true // Overrides ugly mobile native pickers with flatpickr's clean UI
    });
  }

  // If sync was already enabled on a previous session, restore badge state and re-sync
  if (state.settings.syncEnabled && state.settings.syncApiKey && state.settings.syncBinId) {
    updateSyncBadge('syncing', 'Syncing...');
    document.getElementById('sync-status-details').innerHTML = `
      <span style="color: var(--color-semolina);">Cloud sync enabled — connecting...</span><br>
      Pulling latest data from your private bin.
    `;
    setTimeout(() => syncDataOnline(), 800); // slight delay for full render
  }

  // Set up an automatic background sync loop (every 3 minutes)
  // 3 minutes is chosen to stay within JSONBin's free tier API limits 
  // (10,000 requests per month) while still keeping devices up to date.
  setInterval(() => {
    if (state.settings.syncEnabled && state.settings.syncApiKey && state.settings.syncBinId) {
      syncDataOnline();
    }
  }, 180000); // 180,000 ms = 3 minutes
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

      // Ensure settings fields added in later versions exist
      if (!state.settings.syncBinId) state.settings.syncBinId = '';
      if (!state.settings.syncApiKey) state.settings.syncApiKey = '';
      if (state.settings.syncEnabled === undefined) state.settings.syncEnabled = false;
      if (!state.settings.lastSyncTime) state.settings.lastSyncTime = '';
      if (state.settings.showFoodWeight === undefined) state.settings.showFoodWeight = true;
      if (state.settings.showFriendFinancing === undefined) state.settings.showFriendFinancing = true;
    } catch (e) {
      console.error("Error parsing localStorage data, resetting to sample...", e);
      state = JSON.parse(JSON.stringify(WILD_PASTA_SAMPLE_DATA));
      saveStateLocal();
    }
  } else {
    // Brand new user: start with an empty database to prevent sample data 
    // from getting merged into the cloud when connecting a second device.
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
  renderRecycleBin();
}

// ==========================================
// CUSTOM ALERTS & UI HELPERS
// ==========================================
function customAlert(message) {
  document.getElementById('custom-alert-message').textContent = message;
  openModal('modal-custom-alert');
}

function customConfirm(message, onConfirm, onCancel = null) {
  document.getElementById('custom-confirm-message').textContent = message;
  window.onCustomConfirmExecute = onConfirm;
  window.onCustomConfirmCancel = onCancel;
  openModal('modal-custom-confirm');
}

// ==========================================
// DATE FILTERING ENGINE
// ==========================================
window.currentDateFilter = 'all'; // 'all', 'this-month', 'last-month', 'this-year', 'custom'
window.customDateRange = { start: null, end: null };

function handleDateFilterChange(e) {
  const val = e.target.value;
  if (val === 'custom') {
    openModal('modal-custom-date-range');
    // Keep the previous filter active until they hit Apply
  } else {
    window.currentDateFilter = val;
    rebuildAppUI();
  }
}

function cancelCustomDateRange() {
  document.getElementById('global-date-filter').value = window.currentDateFilter;
}

function applyCustomDateRange() {
  const start = document.getElementById('filter-start-date').value;
  const end = document.getElementById('filter-end-date').value;
  if (!start || !end) {
    customAlert("Please select both a start and end date.");
    return;
  }
  if (start > end) {
    customAlert("Start date cannot be after end date.");
    return;
  }
  window.customDateRange = { start, end };
  window.currentDateFilter = 'custom';
  closeModal('modal-custom-date-range');
  rebuildAppUI();
}

function isDateInCurrentFilter(dateString) {
  if (window.currentDateFilter === 'all' || !dateString) return true;
  
  const d = new Date(dateString);
  if (isNaN(d.getTime())) return true;
  
  const now = new Date();
  
  if (window.currentDateFilter === 'this-month') {
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  } else if (window.currentDateFilter === 'last-month') {
    const lastMonth = now.getMonth() === 0 ? 11 : now.getMonth() - 1;
    const yearOfLastMonth = now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear();
    return d.getMonth() === lastMonth && d.getFullYear() === yearOfLastMonth;
  } else if (window.currentDateFilter === 'this-year') {
    return d.getFullYear() === now.getFullYear();
  } else if (window.currentDateFilter === 'custom') {
    if (window.customDateRange.start && window.customDateRange.end) {
      return dateString >= window.customDateRange.start && dateString <= window.customDateRange.end;
    }
  }
  
  return true;
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
  state.timesheet.filter(t => !t.deleted && isDateInCurrentFilter(t.date)).forEach(entry => {
    const worker = state.workers.find(w => w.id === entry.workerId);
    const rate = worker ? worker.hourlyRate : 0;
    totalLabor += entry.hours * rate;
    totalHours += entry.hours;
  });

  // 2. Calculate non-friend-financed operating expenses
  let totalOverhead = 0;
  state.expenses.filter(e => !e.deleted && isDateInCurrentFilter(e.date)).forEach(exp => {
    if (!exp.paidByFriend) {
      totalOverhead += exp.amount;
    }
  });

  // 3. Compute ingredient expenses (Exact cost based on sales if sales are logged, else weekly batch fallback)
  let totalIngredientCost = 0;
  const dishSales = state.sales.filter(s => !s.deleted && s.type === 'dishes' && isDateInCurrentFilter(s.date));
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
    state.recipes.filter(r => !r.deleted).forEach(recipe => {
      const metrics = calculateRecipeCostMetrics(recipe);
      totalIngredientCost += metrics.totalCost;
    });
  }

  // Count only retail finished menu items for the catalog KPI
  const menuItems = state.recipes.filter(r => !r.deleted && r.sellingPrice > 0);
  const activeMenuItemsCount = menuItems.length;

  let recipeMarginsTotal = 0;
  state.recipes.filter(r => !r.deleted).forEach(recipe => {
    if (recipe.sellingPrice > 0) {
      const metrics = calculateRecipeCostMetrics(recipe);
      recipeMarginsTotal += metrics.marginPct;
    }
  });
  const avgMarginPct = activeMenuItemsCount > 0 ? Math.round(recipeMarginsTotal / activeMenuItemsCount) : 0;

  // 4. Compute Revenue & Tips (Actual sales if logged, else weekly batch fallback)
  let totalRevenue = 0;
  let totalTips = 0;
  const activeSales = state.sales.filter(s => !s.deleted && isDateInCurrentFilter(s.date));
  if (activeSales.length > 0) {
    activeSales.forEach(s => {
      totalRevenue += s.subtotal;
      totalTips += s.tips;
    });
  } else {
    // Fallback to estimated weekly batch revenue of all active finished menu items
    totalRevenue = state.recipes.filter(r => !r.deleted).reduce((sum, r) => sum + (r.sellingPrice * r.portions), 0);
  }

  const weeklyFoodCostPct = totalRevenue > 0 ? (totalIngredientCost / totalRevenue) * 100 : 0;
  const totalCombinedExpenses = totalLabor + totalOverhead; // Ingredients explicitly excluded per user preference
  
  // Store globally for the click breakdown alert
  window.lastExpenseBreakdown = { food: totalIngredientCost, labor: totalLabor, overhead: totalOverhead, total: totalCombinedExpenses };

  // Render KPIs
  document.getElementById('kpi-total-expenses').textContent = formatCurrency(totalCombinedExpenses);
  document.getElementById('kpi-total-labor').textContent = formatCurrency(totalLabor);
  document.getElementById('kpi-labor-hours').textContent = `${totalHours.toFixed(1)} hours logged`;
  document.getElementById('kpi-recipe-count').textContent = activeMenuItemsCount;
  document.getElementById('kpi-avg-margin').textContent = `${avgMarginPct}% Avg profit margin`;
  document.getElementById('kpi-food-cost-pct').textContent = `${weeklyFoodCostPct.toFixed(1)}%`;
  
  // Sales & Profit KPIs
  const netProfit = totalRevenue - totalCombinedExpenses;
  const elSales = document.getElementById('kpi-dashboard-sales');
  const elProfit = document.getElementById('kpi-dashboard-profit');
  if (elSales) elSales.textContent = formatCurrency(totalRevenue);
  if (elProfit) {
    elProfit.textContent = formatCurrency(netProfit);
    elProfit.style.color = netProfit < 0 ? 'var(--color-tomato)' : 'var(--color-green)';
  }
  
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

function showExpenseBreakdown() {
  if (!window.lastExpenseBreakdown) return;
  const b = window.lastExpenseBreakdown;
  customAlert(`OVERALL EXPENSES BREAKDOWN:\n\n1. Active Labor & Timesheets: ${formatCurrency(b.labor)}\n2. Standard Operating Overhead (inc. Shopping Receipts): ${formatCurrency(b.overhead)}\n\nTOTAL OPERATIONAL EXPENSES: ${formatCurrency(b.total)}\n\n(Note: Recipe ingredient costs are calculated separately for margin tracking and are not included in this total)`);
}

// 5. CHART IMPLEMENTATION (CHART.JS DONUT)
function renderDashboardCharts() {
  const ctx = document.getElementById('chart-expense-allocation').getContext('2d');
  
  // Calculate total costs per category (matching dashboard rollup logic)

  let laborCost = 0;
  state.timesheet.filter(t => !t.deleted && isDateInCurrentFilter(t.date)).forEach(t => {
    const worker = state.workers.find(w => w.id === t.workerId);
    laborCost += t.hours * (worker ? worker.hourlyRate : 0);
  });

  let overheadCost = 0;
  state.expenses.filter(e => !e.deleted && isDateInCurrentFilter(e.date)).forEach(e => {
    if (!e.paidByFriend) {
      overheadCost += e.amount;
    }
  });

  const total = laborCost + overheadCost;
  
  if (total === 0) {
    // If no expenses logged, draw a placeholder or clear
    if (allocationChartInstance) allocationChartInstance.destroy();
    return;
  }

  const data = {
    labels: ['Labor Payroll', 'Operating Overhead'],
    datasets: [{
      data: [
        Math.round(laborCost), 
        Math.round(overheadCost)
      ],
      backgroundColor: [
        '#5ba370', // Basil Green
        '#dca032'  // Semolina Gold
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
  
  if (state.recipes.filter(r => !r.deleted).length === 0) {
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

  state.recipes.filter(r => !r.deleted).forEach(recipe => {
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
    if (ing.deleted) return false;
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
    const duplicate = state.ingredients.find(i => !i.deleted && i.name.toLowerCase() === name.toLowerCase());
    if (duplicate) {
      customAlert("An ingredient with this name already exists! Please edit the existing one.");
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
  const linkedRecipes = state.recipes.filter(r => !r.deleted && r.ingredients.some(ri => ri.ingredientId === id));
  if (linkedRecipes.length > 0) {
    const names = linkedRecipes.map(r => `"${r.name}"`).join(', ');
    customAlert(`Cannot delete ingredient! It is currently being used in recipes: ${names}. Remove it from those recipes first.`);
    return;
  }

  customConfirm(`Are you sure you want to delete "${ing.name}"?`, () => {
    ing.deleted = true;
    updateState("Deleted ingredient: " + ing.name);
  });
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
    if (r.deleted) return false;
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
    container.innerHTML = `<div style="grid-column: 1/-1; text-align: center; color: var(--text-muted); padding: 40px;">${noRecipesMsg}</div>`;
    return;
  }

  filtered.forEach(recipe => {
    const metrics = calculateRecipeCostMetrics(recipe);
    
    // Food cost indicator classification
    let fillClass = 'green';
    if (metrics.foodCostPct > 35) fillClass = 'red';
    else if (metrics.foodCostPct > 30) fillClass = 'yellow';

    // Calculate displayed weight if weight is enabled
    let weightHtml = '';
    if (state.settings.showFoodWeight !== false) {
      let rawWeightGrams = 0;
      recipe.ingredients.forEach(ri => {
        if (!ri.subRecipeId) {
          rawWeightGrams += convertToGrams(ri.amount, ri.unit) || 0;
        } else {
          // Approximate sub-recipe
          const subR = state.recipes.find(r => r.id === ri.subRecipeId);
          if (subR) {
             let subW = subR.manualWeight !== undefined && subR.manualWeight !== null ? subR.manualWeight : 0;
             if (!subW) {
               let subRaw = 0;
               subR.ingredients.forEach(sRi => subRaw += convertToGrams(sRi.amount, sRi.unit) || 0);
               subW = subRaw * ((subR.cookingYield || 85) / 100);
             }
             rawWeightGrams += (subW / subR.portions) * ri.amount;
          }
        }
      });
      const yieldPct = recipe.cookingYield || 85;
      const cookedWeight = recipe.manualWeight !== undefined && recipe.manualWeight !== null 
        ? recipe.manualWeight 
        : rawWeightGrams * (yieldPct / 100);
      
      weightHtml = `
        <div class="recipe-weight-badge">
          <i data-lucide="scale" style="width:12px;height:12px;"></i>
          ~${Math.round(cookedWeight)}g
        </div>
      `;
    }

    const card = `
      <div class="recipe-card glass" id="recipe-card-${recipe.id}">
        <div class="recipe-card-header">
          <div class="recipe-card-header-left">
            <h3>${recipe.name}</h3>
            <div style="display:flex; gap:10px; align-items:center;">
              <span>Yields: ${recipe.portions} portions</span>
              ${weightHtml}
            </div>
          </div>
          <div class="recipe-card-actions" class="no-print">
            <button class="btn-action-edit no-print" onclick="printRecipe(${recipe.id})" title="Print / PDF">
              <i data-lucide="printer"></i>
            </button>
            <button class="btn-action-edit no-print" onclick="editRecipe(${recipe.id})" title="Edit Recipe">
              <i data-lucide="edit-3"></i>
            </button>
            <button class="btn-action-delete no-print" onclick="deleteRecipe(${recipe.id})" title="Delete Recipe">
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
          
          ${recipe.instructions && recipe.instructions.length > 0 ? `
          <div class="recipe-instructions-preview">
            <h4>Instructions</h4>
            <p style="white-space: pre-wrap; font-size: 0.8rem; color: var(--text-main); line-height: 1.4; margin-top: 6px;">${recipe.instructions.join('\n')}</p>
          </div>
          ` : ''}
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
    document.getElementById('modal-recipe-title').textContent = 'Create Recipe';
    document.getElementById('label-rec-name').innerHTML = 'Recipe Name <span class="required">*</span>';
    document.getElementById('label-instructions-header').innerHTML = '<i data-lucide="clipboard-list" class="inline-icon"></i> Recipe Instructions';
    document.getElementById('rec-selling-price').value = 0;
    document.getElementById('rec-selling-price').required = false;
  } else {
    modal.classList.add('mode-menu-item');
    modal.classList.remove('mode-base-recipe');
    document.getElementById('modal-recipe-title').textContent = 'Create Menu Item';
    document.getElementById('label-rec-name').innerHTML = 'Menu Item Name <span class="required">*</span>';
    document.getElementById('label-instructions-header').innerHTML = '<i data-lucide="clipboard-list" class="inline-icon"></i> Prep Instructions';
    document.getElementById('rec-selling-price').value = '';
    document.getElementById('rec-selling-price').required = true;
    document.getElementById('rec-portions').value = 1;
  }
  
  // Reset the temporary recipe ingredient list
  currentRecipeIngredients = [];
  document.getElementById('recipe-instructions-input').value = 'Step 1: ';
  
  // Reset food weight
  document.getElementById('rec-manual-weight-toggle').checked = false;
  document.getElementById('rec-cooking-yield').value = 85;
  document.getElementById('rec-manual-weight').value = '';
  toggleManualWeight();
  updateFoodWeightEstimate();
  
  // Show/hide food weight section based on settings
  const weightSection = document.getElementById('recipe-weight-section');
  if (weightSection) weightSection.style.display = state.settings.showFoodWeight === false ? 'none' : '';
  
  // Hide the quick addition subform
  document.getElementById('recipe-two-way-subform').classList.add('hidden');
  document.getElementById('two-way-toggle-icon').textContent = '+';
  
  openModal('modal-recipe');
  lucide.createIcons();
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
    document.getElementById('modal-recipe-title').textContent = 'Edit Recipe';
    document.getElementById('label-rec-name').innerHTML = 'Recipe Name <span class="required">*</span>';
    document.getElementById('label-instructions-header').innerHTML = '<i data-lucide="clipboard-list" class="inline-icon"></i> Recipe Instructions';
    document.getElementById('rec-selling-price').required = false;
  } else {
    modal.classList.add('mode-menu-item');
    modal.classList.remove('mode-base-recipe');
    document.getElementById('modal-recipe-title').textContent = 'Edit Menu Item';
    document.getElementById('label-rec-name').innerHTML = 'Menu Item Name <span class="required">*</span>';
    document.getElementById('label-instructions-header').innerHTML = '<i data-lucide="clipboard-list" class="inline-icon"></i> Prep Instructions';
    document.getElementById('rec-selling-price').required = true;
  }

  // Clone current ingredients to temporary builder list
  currentRecipeIngredients = JSON.parse(JSON.stringify(recipe.ingredients));
  
  // Load instructions
  document.getElementById('recipe-instructions-input').value = recipe.instructions ? recipe.instructions.join('\n') : '';
  
  // Load food weight settings
  const isManual = recipe.manualWeight !== undefined && recipe.manualWeight !== null;
  document.getElementById('rec-manual-weight-toggle').checked = isManual;
  document.getElementById('rec-cooking-yield').value = recipe.cookingYield || 85;
  document.getElementById('rec-manual-weight').value = recipe.manualWeight || '';
  toggleManualWeight();

  populateRecipeBuilderSelect();
  renderRecipeBuilderAddedList();
  updateRecipeLiveSummary();
  updateFoodWeightEstimate();
  
  // Show/hide food weight section based on settings
  const weightSection = document.getElementById('recipe-weight-section');
  if (weightSection) weightSection.style.display = state.settings.showFoodWeight === false ? 'none' : '';

  document.getElementById('recipe-two-way-subform').classList.add('hidden');
  document.getElementById('two-way-toggle-icon').textContent = '+';

  openModal('modal-recipe');
  lucide.createIcons();
}

function populateRecipeBuilderSelect() {
  const select = document.getElementById('rec-add-ing-select');
  select.innerHTML = '<option value="" disabled selected>-- Choose Item --</option>';

  const currentRecipeId = parseInt(document.getElementById('recipe-form-id').value) || null;

  // 1. Raw Ingredients Optgroup
  const sortedIngs = state.ingredients.filter(i => !i.deleted).sort((a,b) => a.name.localeCompare(b.name));
  let ingGroup = '<optgroup label="Raw Ingredients (from inventory)">';
  sortedIngs.forEach(ing => {
    ingGroup += `<option value="ing-${ing.id}">${ing.name} (${ing.unit} pack)</option>`;
  });
  ingGroup += '</optgroup>';
  select.insertAdjacentHTML('beforeend', ingGroup);

  // 2. Sub-Recipes Optgroup (exclude the current recipe to avoid circular dependencies)
  const otherRecipes = state.recipes.filter(r => !r.deleted && r.id !== currentRecipeId);
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
    customAlert("Please select an item first.");
    return;
  }
  if (!amount || amount <= 0) {
    customAlert("Please enter a valid amount.");
    return;
  }

  if (val.startsWith('rec-')) {
    const subRecipeId = parseInt(val.substring(4));
    
    // Duplicate check in recipe
    const duplicate = currentRecipeIngredients.find(ri => ri.subRecipeId === subRecipeId);
    if (duplicate) {
      customAlert("This sub-recipe is already in the list.");
      return;
    }
    
    currentRecipeIngredients.push({ subRecipeId, amount, unit });
  } else if (val.startsWith('ing-')) {
    const ingredientId = parseInt(val.substring(4));
    
    const duplicate = currentRecipeIngredients.find(ri => ri.ingredientId === ingredientId);
    if (duplicate) {
      customAlert("This ingredient is already in the list.");
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
  
  updateFoodWeightEstimate();
}

function handleInstructionsKeydown(e) {
  if (e.key === 'Enter') {
    e.preventDefault();
    const textarea = e.target;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const val = textarea.value;

    // Count how many "Step " we already have to determine the next number
    const stepCount = (val.match(/Step \d+:/g) || []).length;
    const nextStep = `\nStep ${stepCount + 1}: `;

    textarea.value = val.substring(0, start) + nextStep + val.substring(end);
    textarea.selectionStart = textarea.selectionEnd = start + nextStep.length;
  }
}

// --- RECIPE FOOD WEIGHT ESTIMATOR ---
function toggleManualWeight() {
  const isManual = document.getElementById('rec-manual-weight-toggle').checked;
  const autoSection = document.getElementById('weight-auto-section');
  const manualSection = document.getElementById('weight-manual-section');
  
  if (isManual) {
    autoSection.classList.add('hidden');
    manualSection.classList.remove('hidden');
  } else {
    autoSection.classList.remove('hidden');
    manualSection.classList.add('hidden');
    updateFoodWeightEstimate();
  }
}

function updateFoodWeightEstimate() {
  const isManual = document.getElementById('rec-manual-weight-toggle').checked;
  if (isManual) return;
  
  let rawWeightGrams = calculateRecipeRawWeight();
  
  const yieldPctInput = document.getElementById('rec-cooking-yield');
  const yieldPct = parseFloat(yieldPctInput.value) || 85;
  
  const cookedWeightGrams = rawWeightGrams * (yieldPct / 100);
  
  document.getElementById('rec-raw-weight').textContent = Math.round(rawWeightGrams) + 'g';
  document.getElementById('rec-cooked-weight').textContent = Math.round(cookedWeightGrams) + 'g';
}

function calculateRecipeRawWeight() {
  let totalGrams = 0;
  
  currentRecipeIngredients.forEach(ri => {
    let baseUnit = ri.unit;
    let baseAmount = ri.amount;
    
    if (ri.subRecipeId) {
      const subR = state.recipes.find(r => r.id === ri.subRecipeId);
      if (subR) {
        let subWeight = 0;
        if (subR.manualWeight !== undefined && subR.manualWeight !== null) {
          subWeight = subR.manualWeight;
        } else {
          // Estimate sub-recipe weight recursively
          let subRaw = 0;
          subR.ingredients.forEach(sRi => subRaw += convertToGrams(sRi.amount, sRi.unit) || 0);
          subWeight = subRaw * ((subR.cookingYield || 85) / 100);
        }
        totalGrams += (subWeight / subR.portions) * ri.amount;
      }
    } else {
      totalGrams += convertToGrams(baseAmount, baseUnit) || 0;
    }
  });
  
  return totalGrams;
}

function convertToGrams(amount, unit) {
  const conversionMap = {
    'g': 1, 'kg': 1000, 'oz': 28.3495, 'lb': 453.592,
    'ml': 1, 'L': 1000, 'floz': 29.5735, 'cup': 236.588,
    'tbsp': 14.7868, 'gal': 3785.41
  };
  return conversionMap[unit] ? amount * conversionMap[unit] : 0;
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
    customAlert("Please enter a new ingredient name.");
    return;
  }
  if (isNaN(packageCost) || packageCost <= 0) {
    customAlert("Please enter a valid package cost.");
    return;
  }
  if (isNaN(packageSize) || packageSize <= 0) {
    customAlert("Please enter a valid package size.");
    return;
  }
  if (isNaN(recipeAmount) || recipeAmount <= 0) {
    customAlert("Please enter a valid recipe amount.");
    return;
  }

  // Check for duplicate in master list
  const duplicate = state.ingredients.find(i => !i.deleted && i.name.toLowerCase() === name.toLowerCase());
  if (duplicate) {
    customAlert("An ingredient with this name already exists in your inventory. Select it from the dropdown above!");
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
    customAlert("Please add at least one ingredient to this recipe before saving.");
    return;
  }

  const isManualWeight = document.getElementById('rec-manual-weight-toggle').checked;
  const cookingYield = parseFloat(document.getElementById('rec-cooking-yield').value) || 85;
  const manualWeight = isManualWeight ? parseFloat(document.getElementById('rec-manual-weight').value) || null : null;
  // Clean instructions array (remove empty strings)
  const instructionsRaw = document.getElementById('recipe-instructions-input').value;
  const instructions = instructionsRaw.split('\n').filter(step => step.trim() !== "");

  if (idVal) {
    // Edit existing recipe
    const index = state.recipes.findIndex(r => r.id === parseInt(idVal));
    if (index !== -1) {
      state.recipes[index] = {
        id: parseInt(idVal),
        name,
        portions,
        sellingPrice,
        ingredients: currentRecipeIngredients,
        instructions: instructions,
        cookingYield: cookingYield,
        manualWeight: manualWeight
      };
      // Keep the view on the correct tab after an edit
      setRecipeSubTab(sellingPrice > 0 ? 'menu' : 'base');
      updateState("Updated recipe: " + name);
    }
  } else {
    // Insert new recipe
    // Duplicate check
    const duplicate = state.recipes.find(r => !r.deleted && r.name.toLowerCase() === name.toLowerCase());
    if (duplicate) {
      customAlert("A recipe with this name already exists! Please edit the existing one.");
      return;
    }

    const newId = state.recipes.length > 0 ? Math.max(...state.recipes.map(r => r.id)) + 1 : 1;
    state.recipes.push({
      id: newId,
      name,
      portions,
      sellingPrice,
      ingredients: currentRecipeIngredients,
      instructions: instructions,
      cookingYield: cookingYield,
      manualWeight: manualWeight
    });
    // Sync the sub-tab to match the recipe type so it's visible immediately after save
    setRecipeSubTab(sellingPrice > 0 ? 'menu' : 'base');
    updateState("Created recipe: " + name);
  }

  closeModal('modal-recipe');
}

function deleteRecipe(id) {
  const recipe = state.recipes.find(r => r.id === id);
  if (!recipe) return;

  customConfirm(`Are you sure you want to delete the recipe "${recipe.name}"?`, () => {
    recipe.deleted = true;
    updateState("Deleted recipe: " + recipe.name);
  });
}

function printRecipe(id) {
  const recipe = state.recipes.find(r => r.id === id);
  if (!recipe) return;

  // Build ingredients list (quantities/weights for kitchen prep, not costs!)
  let ingredientsHtml = '<ul class="print-ingredients">';
  recipe.ingredients.forEach(ri => {
    if (ri.subRecipeId) {
      const subR = state.recipes.find(r => r.id === ri.subRecipeId);
      const name = subR ? subR.name : 'Unknown Recipe';
      ingredientsHtml += `<li><strong>${ri.amount} ${ri.unit}</strong> - ${name}</li>`;
    } else {
      const ing = state.ingredients.find(i => i.id === ri.ingredientId);
      const name = ing ? ing.name : 'Unknown Ingredient';
      ingredientsHtml += `<li><strong>${ri.amount} ${ri.unit}</strong> - ${name}</li>`;
    }
  });
  ingredientsHtml += '</ul>';

  const instructionsHtml = recipe.instructions && recipe.instructions.length > 0 
    ? `<div class="print-instructions"><h2>Instructions</h2><p>${recipe.instructions.join('\n')}</p></div>`
    : '';

  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <title>Prep Card - ${recipe.name}</title>
        <style>
          body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; padding: 40px; color: #000; max-width: 800px; margin: 0 auto; line-height: 1.5; }
          h1 { margin-top: 0; margin-bottom: 5px; font-size: 2.2rem; border-bottom: 3px solid #000; padding-bottom: 10px; }
          .meta { font-size: 1.1rem; color: #444; margin-bottom: 40px; font-weight: bold; }
          h2 { font-size: 1.5rem; margin-top: 40px; margin-bottom: 15px; border-bottom: 1px solid #ccc; padding-bottom: 8px; text-transform: uppercase; letter-spacing: 1px; }
          .print-ingredients { list-style-type: none; padding: 0; margin: 0; }
          .print-ingredients li { padding: 12px 0; border-bottom: 1px dashed #ddd; font-size: 1.1rem; }
          .print-ingredients li strong { display: inline-block; width: 140px; font-family: monospace; font-size: 1.2rem; }
          .print-instructions p { white-space: pre-wrap; font-size: 1.1rem; line-height: 1.8; }
        </style>
      </head>
      <body>
        <h1>${recipe.name.toUpperCase()}</h1>
        <div class="meta">YIELDS: ${recipe.portions} PORTIONS</div>
        
        <h2>Ingredients</h2>
        ${ingredientsHtml}
        
        ${instructionsHtml}
        
        <script>
          window.onload = function() {
            setTimeout(function() {
              window.print();
            }, 250);
          }
        </script>
      </body>
    </html>
  `;

  const printWindow = window.open('', '_blank');
  if (printWindow) {
    printWindow.document.write(html);
    printWindow.document.close();
  } else {
    customAlert("Your browser blocked the print pop-up. Please allow pop-ups for this site to print recipes.");
  }
}



// 9. WORKERS & TIMESHEET ENGINE
function renderWorkersAndTimesheets() {
  // RENDER WORKERS DIRECTORY
  const workersContainer = document.getElementById('workers-list-container');
  workersContainer.innerHTML = '';

  state.workers.filter(w => !w.deleted).forEach(w => {
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
  state.workers.filter(w => !w.deleted).forEach(w => {
    const roleDisplay = w.role ? ` (${w.role})` : "";
    workerSelect.insertAdjacentHTML('beforeend', `<option value="${w.id}">${w.name}${roleDisplay}</option>`);
  });

  // RENDER TIMESHEETS TABLE
  const tbody = document.getElementById('timesheets-table-body');
  tbody.innerHTML = '';

  const filteredTimesheet = state.timesheet.filter(t => !t.deleted && isDateInCurrentFilter(t.date));

  if (filteredTimesheet.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; color: var(--text-muted); padding: 30px;">No shifts found for this time period.</td></tr>`;
    lucide.createIcons();
    return;
  }

  filteredTimesheet.forEach(entry => {
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
    const duplicate = state.workers.find(w => !w.deleted && w.name.toLowerCase() === name.toLowerCase());
    if (duplicate) {
      customAlert("An employee with this name already exists.");
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

  const linkedShifts = state.timesheet.filter(t => !t.deleted && t.workerId === id);
  if (linkedShifts.length > 0) {
    customAlert(`Cannot delete worker! They have ${linkedShifts.length} logged shifts in the timesheet. Delete those shifts first.`);
    return;
  }

  customConfirm(`Are you sure you want to remove worker "${w.name}"?`, () => {
    w.deleted = true;
    updateState("Removed worker: " + w.name);
  });
}

// Timesheet Shift CRUD
function openLogShiftModal() {
  if (state.workers.length === 0) {
    customAlert("Please add at least one employee in the Worker Directory panel first!");
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
  const t = state.timesheet.find(entry => entry.id === id);
  if (!t) return;

  customConfirm("Are you sure you want to delete this timesheet record?", () => {
    t.deleted = true;
    updateState("Deleted timesheet record");
  });
}


// 10. SALES & INCOME MANAGER MODULE
function renderSalesList() {
  const tbody = document.getElementById('sales-table-body');
  if (!tbody) return;
  tbody.innerHTML = '';

  const searchVal = document.getElementById('sales-search').value.toLowerCase();
  
  const filtered = state.sales.filter(s => {
    if (s.deleted) return false;
    if (!isDateInCurrentFilter(s.date)) return false;
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
      
      const menuItems = (state.recipes || []).filter(r => r && !r.deleted && r.sellingPrice > 0);
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
    customAlert("Error opening sales modal: " + err.message);
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
      customAlert("Please select a valid menu item.");
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
  const s = state.sales.find(entry => entry.id === id);
  if (!s) return;

  customConfirm("Are you sure you want to delete this sales record?", () => {
    s.deleted = true;
    updateState("Deleted sales record");
  });
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

  const friendFinancedExpenses = state.expenses.filter(e => !e.deleted && e.paidByFriend);
  const standardExpenses = state.expenses.filter(e => !e.deleted && !e.paidByFriend);

  const filteredExpenses = state.expenses.filter(e => !e.deleted && isDateInCurrentFilter(e.date));

  if (filteredExpenses.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5" style="text-align: center; color: var(--text-muted); padding: 30px;">No operating expenses found for this time period.</td></tr>`;
    updateDebtTrackerUI();
    renderPaybacksList();
    return;
  }

  filteredExpenses.forEach(exp => {
    let friendBadge = '';
    if (exp.paidByFriend && state.settings.showFriendFinancing !== false) {
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
    customAlert("Please enter the lender/friend's name.");
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
  const e = state.expenses.find(entry => entry.id === id);
  if (!e) return;

  customConfirm("Are you sure you want to delete this expense record?", () => {
    e.deleted = true;
    updateState("Deleted expense record");
  });
}

// 12. FRIEND FINANCING DEBT REPAYMENTS LEDGER
function updateDebtTrackerUI() {
  const statBorrowed = document.getElementById('debt-total-borrowed');
  if (!statBorrowed) return;

  // 1. Calculate Borrowed and Paid Tally
  let totalBorrowed = 0;
  state.expenses.filter(e => !e.deleted).forEach(e => {
    if (e.paidByFriend) totalBorrowed += e.amount;
  });

  let totalRepaid = 0;
  state.paybacks.filter(p => !p.deleted).forEach(p => {
    totalRepaid += p.amount;
  });

  const remainingBalance = Math.max(0, totalBorrowed - totalRepaid);

  // 2. Calculate Available Cash Profits
  // Revenue
  let totalRevenue = 0;
  let totalTips = 0;
  const activeSales = state.sales.filter(s => !s.deleted);
  if (activeSales.length > 0) {
    activeSales.forEach(s => {
      totalRevenue += s.subtotal;
      totalTips += s.tips;
    });
  } else {
    totalRevenue = state.recipes.filter(r => !r.deleted).reduce((sum, r) => sum + (r.sellingPrice * r.portions), 0);
  }
  const combinedIncome = totalRevenue + totalTips;

  // Ingredients Cost
  let totalIngredientCost = 0;
  const dishSales = activeSales.filter(s => s.type === 'dishes');
  if (dishSales.length > 0) {
    dishSales.forEach(s => {
      const recipe = state.recipes.find(r => r.id === s.recipeId);
      if (recipe) {
        totalIngredientCost += s.quantity * calculateRecipeCostMetrics(recipe).portionCost;
      }
    });
  } else {
    state.recipes.filter(r => !r.deleted).forEach(recipe => {
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
  state.expenses.filter(e => !e.deleted).forEach(exp => {
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
  const sorted = state.paybacks.filter(p => !p.deleted).sort((a,b) => b.date.localeCompare(a.date));

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
      (state.expenses || []).filter(e => !e.deleted).forEach(e => {
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
    customAlert("Error opening payback modal: " + err.message);
  }
}

function savePaybackForm(e) {
  e.preventDefault();
  const friendName = document.getElementById('payback-friend-name').value;
  const date = document.getElementById('payback-date').value;
  const amount = parseFloat(document.getElementById('payback-amount').value);
  const notes = document.getElementById('payback-notes').value.trim();

  if (!friendName) {
    customAlert("Please select a lender first.");
    return;
  }
  if (isNaN(amount) || amount <= 0) {
    customAlert("Please enter a valid amount.");
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
  const p = state.paybacks.find(entry => entry.id === id);
  if (!p) return;

  customConfirm("Are you sure you want to delete this payback installment record?", () => {
    p.deleted = true;
    updateState("Deleted payback installment record");
  });
}


// 11. PRIVATE CLOUD SYNC ENGINE (JSONBIN.IO INTERFACE)
function setupSettingsListeners() {
  document.getElementById('sync-api-key').value = state.settings.syncApiKey || '';
  document.getElementById('sync-bin-id').value = state.settings.syncBinId || '';
  validateSyncSettings();
}

function validateSyncSettings() {
  const apiKey = document.getElementById('sync-api-key').value.trim();
  const binId = document.getElementById('sync-bin-id').value.trim();
  
  const btnToggle = document.getElementById('btn-toggle-sync');
  const btnSyncNow = document.getElementById('btn-sync-now');
  const btnCreateBin = document.getElementById('btn-create-bin');

  btnCreateBin.disabled = apiKey.length === 0;

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

// Generate a brand new cloud storage bin via JSONBin.io API
async function createNewCloudBin() {
  const apiKey = document.getElementById('sync-api-key').value.trim();
  if (!apiKey) {
    customAlert("Please enter your JSONBin.io API Key first.");
    return;
  }

  const btnCreate = document.getElementById('btn-create-bin');
  btnCreate.disabled = true;
  btnCreate.textContent = 'Creating...';

  try {
    const response = await fetch('https://api.jsonbin.io/v3/b', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Master-Key': apiKey,
        'X-Bin-Private': 'true'
      },
      body: JSON.stringify(state)
    });

    const data = await response.json();
    
    if (response.ok) {
      const binId = data.metadata.id;
      document.getElementById('sync-bin-id').value = binId;
      
      // Save details locally in state
      state.settings.syncApiKey = apiKey;
      state.settings.syncBinId = binId;
      state.settings.syncEnabled = true;
      state.settings.lastSyncTime = new Date().toLocaleTimeString();
      saveStateLocal();
      
      validateSyncSettings();
      customAlert(`Success! Created private sync bin.\nYour Sync Code is: ${binId}\nSync is now enabled and connected!`);
      
      // Update UI directly instead of running a redundant sync
      updateSyncBadge('synced', 'Synced');
      document.getElementById('sync-status-details').innerHTML = `
        <span style="color: var(--color-green); font-weight: bold;">Connected &amp; Synced!</span><br>
        Bin successfully created and initial data uploaded.<br>
        Cloud Sync Code: <code style="background:rgba(0,0,0,0.3); padding:2px 4px; border-radius:3px;">${binId}</code>
      `;
    } else {
      throw new Error(data.message || 'Failed to create bin.');
    }
  } catch (err) {
    console.error(err);
    customAlert(`Error creating bin: ${err.message}\nMake sure your API key is correct and valid.`);
  } finally {
    btnCreate.disabled = false;
    btnCreate.textContent = 'Create New Bin';
  }
}

async function toggleSyncState() {
  const btnToggle = document.getElementById('btn-toggle-sync');
  
  if (state.settings.syncEnabled) {
    // Disable Sync
    state.settings.syncEnabled = false;
    updateState("Disabled cloud sync");
    updateSyncBadge('local', 'Local Mode');
    document.getElementById('sync-status-details').innerHTML = `Cloud Sync has been disabled. All edits save locally.`;
  } else {
    // Enable Sync
    const apiKey = document.getElementById('sync-api-key').value.trim();
    const binId = document.getElementById('sync-bin-id').value.trim();

    if (!apiKey || !binId) {
      customAlert("Please ensure both your API Key and Sync Code (Bin ID) are entered.");
      return;
    }

    state.settings.syncApiKey = apiKey;
    state.settings.syncBinId = binId;
    state.settings.syncEnabled = true;
    saveStateLocal();

    updateSyncBadge('syncing', 'Syncing...');
    // Immediately update status text so user doesn't see stale 'disabled' message
    document.getElementById('sync-status-details').innerHTML = `
      <span style="color: var(--color-semolina);">Connecting to cloud sync...</span><br>
      Authenticating with JSONBin &amp; pulling your latest data. This takes a few seconds.
    `;
    await syncDataOnline();
  }
  
  validateSyncSettings();
}

// Re-entrancy guard — prevents two syncs running simultaneously
let isSyncing = false;

// Force a network pull/push cloud database synchronisation
async function syncDataOnline() {
  if (!state.settings.syncEnabled) return;
  if (isSyncing) return;

  const apiKey = state.settings.syncApiKey;
  const binId = state.settings.syncBinId;
  if (!apiKey || !binId) return;

  isSyncing = true;
  updateSyncBadge('syncing', 'Syncing...');

  const statusEl = document.getElementById('sync-status-details');
  const logLines = [];

  function syncLog(msg) {
    const time = new Date().toLocaleTimeString();
    logLines.push(`<span style="color:var(--text-muted);font-size:0.7em;">[${time}]</span> ${msg}`);
    statusEl.innerHTML = logLines.join('<br>');
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 15000);

  try {
    syncLog('⏳ Starting sync...');
    syncLog(`📡 GET cloud bin <code>${binId.slice(0, 8)}...</code>`);

    const response = await fetch(`https://api.jsonbin.io/v3/b/${binId}/latest`, {
      method: 'GET',
      headers: { 'X-Master-Key': apiKey },
      signal: controller.signal
    });

    syncLog(`📥 GET response: HTTP ${response.status}`);

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw new Error(`GET HTTP ${response.status}: ${body.slice(0, 150) || 'No details'}`);
    }

    const data = await response.json();
    const cloudState = data.record;
    syncLog(`✅ Cloud data received (${JSON.stringify(data).length} bytes)`);

    syncLog('🔄 Merging local + cloud data...');
    mergeLocalWithCloudState(cloudState);
    syncLog('✅ Merge complete');

    syncLog('📤 PUT merged data back to cloud...');
    const uploadResponse = await fetch(`https://api.jsonbin.io/v3/b/${binId}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'X-Master-Key': apiKey
      },
      body: JSON.stringify(state),
      signal: controller.signal
    });

    syncLog(`📥 PUT response: HTTP ${uploadResponse.status}`);

    if (!uploadResponse.ok) {
      const body = await uploadResponse.text().catch(() => '');
      throw new Error(`PUT HTTP ${uploadResponse.status}: ${body.slice(0, 150) || 'No details'}`);
    }

    state.settings.lastSyncTime = new Date().toLocaleTimeString();
    saveStateLocal();
    rebuildAppUI();
    updateSyncBadge('synced', 'Synced');

    syncLog(`<span style="color:var(--color-basil);font-weight:bold;">🎉 Sync complete!</span> Synced at ${state.settings.lastSyncTime}`);

  } catch (err) {
    console.error('[Sync Error]', err);
    const isTimeout = err.name === 'AbortError';
    updateSyncBadge('error', 'Sync Error');
    syncLog(`<span style="color:var(--color-tomato);font-weight:bold;">❌ ${isTimeout ? 'TIMEOUT — request took over 15s' : err.message}</span>`);
    syncLog(`<span style="font-size:0.75em;color:var(--text-muted);">401=bad API key | 404=wrong Bin ID | 429=rate limited | AbortError=timeout/network</span>`);
  } finally {
    clearTimeout(timeoutId);
    isSyncing = false;
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
        // Explicitly propagate soft deletions
        if (cItem.deleted) combined[exists].deleted = true;
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
      const existsIndex = combined.findIndex(l => l.workerId === c.workerId && l.date === c.date && l.hours === c.hours && l.notes === c.notes);
      if (existsIndex === -1) {
        c.id = combined.length > 0 ? Math.max(...combined.map(t => t.id)) + 1 : 1;
        combined.push(c);
      } else {
        if (c.deleted) combined[existsIndex].deleted = true;
      }
    });
    return combined;
  }
  
  function mergeExpenses(lExp, cExp) {
    const combined = [...lExp];
    cExp.forEach(c => {
      const existsIndex = combined.findIndex(l => l.date === c.date && l.category === c.category && l.amount === c.amount && l.notes === c.notes);
      if (existsIndex === -1) {
        c.id = combined.length > 0 ? Math.max(...combined.map(e => e.id)) + 1 : 1;
        combined.push(c);
      } else {
        if (c.deleted) combined[existsIndex].deleted = true;
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
        if (c.deleted) combined[exists].deleted = true;
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
        if (c.deleted) combined[exists].deleted = true;
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
  
  // Set toggles
  document.getElementById('toggle-food-weight').checked = state.settings.showFoodWeight !== false;
  document.getElementById('toggle-friend-financing').checked = state.settings.showFriendFinancing !== false;
  
  applyFeatureTogglesToUI();
  validateSyncSettings();
}

function toggleFeatureSetting(settingName) {
  if (settingName === 'showFoodWeight') {
    state.settings.showFoodWeight = document.getElementById('toggle-food-weight').checked;
  } else if (settingName === 'showFriendFinancing') {
    state.settings.showFriendFinancing = document.getElementById('toggle-friend-financing').checked;
  }
  saveStateLocal();
  applyFeatureTogglesToUI();
}

function applyFeatureTogglesToUI() {
  // Food weight toggle (hide weight in recipes if off)
  const isFoodWeightOn = state.settings.showFoodWeight !== false;
  // This is handled dynamically when rendering recipes list and modal, but we'll force a re-render here
  renderRecipesList();
  
  // Friend financing toggle (hide friend column in expenses list, hide paybacks summary tab/table, hide friend checkbox in expense modal)
  const isFriendFinancingOn = state.settings.showFriendFinancing !== false;
  
  const friendModalGroup = document.getElementById('exp-is-friend-group');
  if (friendModalGroup) friendModalGroup.style.display = isFriendFinancingOn ? '' : 'none';
  
  const paybacksSection = document.getElementById('paybacks-history-section');
  if (paybacksSection) paybacksSection.style.display = isFriendFinancingOn ? '' : 'none';
  
  const friendPanel = document.getElementById('friend-financing-panel');
  if (friendPanel) friendPanel.style.display = isFriendFinancingOn ? 'grid' : 'none';
  
  // Force re-render expenses to hide/show friend column
  renderExpensesList();
}

function updateSyncBadge(status, text) {
  const badge = document.getElementById('sync-badge');
  const txt = badge.querySelector('.sync-text');

  badge.className = `sync-badge ${status}`;
  txt.textContent = text;

  // Lucide replaces <i> with <svg>, so we must find by class name and remove it
  const existingIcon = badge.querySelector('.sync-icon');
  if (existingIcon) existingIcon.remove();

  let iconName = 'cloud-off';
  if (status === 'synced') iconName = 'cloud-check';
  else if (status === 'syncing') iconName = 'refresh-cw';
  else if (status === 'error') iconName = 'cloud-lightning';

  const newIcon = document.createElement('i');
  newIcon.setAttribute('data-lucide', iconName);
  newIcon.className = 'sync-icon';
  if (status === 'syncing') newIcon.classList.add('icon-spin-hover');

  badge.insertBefore(newIcon, txt);
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

// ==========================================
// RECYCLE BIN ENGINE
// ==========================================
function renderRecycleBin() {
  const container = document.getElementById('recycle-bin-list');
  if (!container) return;
  container.innerHTML = '';

  const deletedItems = [];

  state.ingredients.filter(i => i.deleted).forEach(i => deletedItems.push({ type: 'ingredients', id: i.id, label: `Ingredient: ${i.name}` }));
  state.recipes.filter(r => r.deleted).forEach(r => deletedItems.push({ type: 'recipes', id: r.id, label: `Recipe: ${r.name}` }));
  state.workers.filter(w => w.deleted).forEach(w => deletedItems.push({ type: 'workers', id: w.id, label: `Worker: ${w.name}` }));
  state.timesheet.filter(t => t.deleted).forEach(t => {
    const w = state.workers.find(worker => worker.id === t.workerId);
    deletedItems.push({ type: 'timesheet', id: t.id, label: `Timesheet: ${w ? w.name : 'Unknown'} - ${t.date}` });
  });
  state.expenses.filter(e => e.deleted).forEach(e => deletedItems.push({ type: 'expenses', id: e.id, label: `Expense: ${formatCurrency(e.amount)} - ${e.category}` }));
  state.sales.filter(s => s.deleted).forEach(s => deletedItems.push({ type: 'sales', id: s.id, label: `Sale: ${formatCurrency(s.subtotal || 0)} - ${s.type}` }));
  state.paybacks.filter(p => p.deleted).forEach(p => deletedItems.push({ type: 'paybacks', id: p.id, label: `Payback: ${formatCurrency(p.amount)} to ${p.friendName}` }));

  if (deletedItems.length === 0) {
    container.innerHTML = `<div style="padding: 10px; color: var(--text-muted); font-size: 0.9rem; text-align: center;">Recycle bin is empty.</div>`;
    return;
  }

  deletedItems.forEach(item => {
    const el = document.createElement('div');
    el.style.display = 'flex';
    el.style.justifyContent = 'space-between';
    el.style.alignItems = 'center';
    el.style.padding = '8px 12px';
    el.style.background = 'rgba(255, 255, 255, 0.05)';
    el.style.borderRadius = '6px';
    el.style.fontSize = '0.85rem';

    el.innerHTML = `
      <span style="color: var(--text-color);">${item.label}</span>
      <div style="display: flex; gap: 6px;">
        <button onclick="restoreItem('${item.type}', ${item.id})" style="background: none; border: none; color: var(--color-basil); cursor: pointer; padding: 4px;" title="Restore">
          <i data-lucide="rotate-ccw" style="width: 14px; height: 14px;"></i>
        </button>
        <button onclick="permanentlyDeleteItem('${item.type}', ${item.id})" style="background: none; border: none; color: var(--color-tomato); cursor: pointer; padding: 4px;" title="Delete Forever">
          <i data-lucide="x" style="width: 14px; height: 14px;"></i>
        </button>
      </div>
    `;
    container.appendChild(el);
  });

  lucide.createIcons();
}

function restoreItem(type, id) {
  const collection = state[type];
  if (!collection) return;
  const item = collection.find(x => x.id === id);
  if (item) {
    item.deleted = false;
    updateState(`Restored ${type} item`);
  }
}

function permanentlyDeleteItem(type, id) {
  const collection = state[type];
  if (!collection) return;
  customConfirm("Permanently delete this item? This cannot be undone.", () => {
    state[type] = collection.filter(x => x.id !== id);
    updateState(`Permanently deleted ${type} item`);
  });
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
        customAlert("Database successfully restored from backup file!");
      } else {
        customAlert("Invalid file format. Ensure it is a valid Wild Pasta backup JSON.");
      }
    } catch (e) {
      customAlert("Failed to parse JSON file.");
    }
  };
  
  if (input.files && input.files[0]) {
    reader.readAsText(input.files[0]);
  }
}

function resetToSampleDatabase() {
  customConfirm("WARNING: This will overwrite your current active database with standard sample pasta data. Continue?", () => {
    state = JSON.parse(JSON.stringify(WILD_PASTA_SAMPLE_DATA));
    updateState("Reset database to standard sample data");
    customAlert("Database overwritten with sample data!");
  });
}

async function forceUploadStateToCloud() {
  if (!state.settings.syncEnabled || !state.settings.syncBinId || !state.settings.syncApiKey) return;
  try {
    const response = await fetch(`https://api.jsonbin.io/v3/b/${state.settings.syncBinId}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'X-Master-Key': state.settings.syncApiKey
      },
      body: JSON.stringify(state)
    });
    if (!response.ok) console.error("Force upload failed");
  } catch(e) {
    console.error("Force upload error", e);
  }
}

function purgeDeletedItems() {
  customConfirm("This will permanently obliterate all hidden deleted (trash) items from the database. Make sure all your devices are fully synced before doing this! Proceed?", () => {
    state.ingredients = state.ingredients.filter(i => !i.deleted);
    state.recipes = state.recipes.filter(r => !r.deleted);
    state.workers = state.workers.filter(w => !w.deleted);
    state.timesheet = state.timesheet.filter(t => !t.deleted);
    state.sales = state.sales.filter(s => !s.deleted);
    state.expenses = state.expenses.filter(e => !e.deleted);
    state.paybacks = state.paybacks.filter(p => !p.deleted);
    
    updateState("Purged trash items");
    forceUploadStateToCloud();
    customAlert("Trash successfully purged!");
  });
}

function nukeDatabase() {
  customConfirm("EXTREME WARNING: This will completely wipe all of your recipes, ingredients, labor records, and operating costs. This cannot be undone. Are you absolutely sure?", () => {
    const wasSyncEnabled = state.settings.syncEnabled;
    const binId = state.settings.syncBinId;
    const apiKey = state.settings.syncApiKey;
    
    state = {
      settings: { unitSystem: 'us', syncBinId: binId, syncApiKey: apiKey, syncEnabled: wasSyncEnabled, lastSyncTime: '' },
      ingredients: [],
      recipes: [],
      workers: [],
      timesheet: [],
      expenses: [],
      sales: [],
      paybacks: []
    };
    
    updateState("Wiped database");
    
    if (wasSyncEnabled) {
      // Force push the empty state to cloud immediately to nuke it across devices
      forceUploadStateToCloud();
    }
    
    customAlert("Database fully wiped.");
  });
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
