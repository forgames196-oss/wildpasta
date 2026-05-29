const WILD_PASTA_SAMPLE_DATA = {
  settings: {
    unitSystem: 'us', // 'us' (US Standard) or 'metric'
    syncBinId: '',
    syncApiKey: '',
    syncEnabled: false,
    lastSyncTime: ''
  },
  ingredients: [
    {
      id: 1,
      name: "Semolina Flour",
      category: "Ingredients",
      supplier: "US Foods",
      packageCost: 32.50,
      packageSize: 50,
      unit: "lb" // Bought in lbs, recipes can use g or oz
    },
    {
      id: 2,
      name: "Farm Fresh Eggs",
      category: "Ingredients",
      supplier: "Valley Poultry",
      packageCost: 15.00,
      packageSize: 30,
      unit: "unit" // Bought by count
    },
    {
      id: 3,
      name: "Fresh Sweet Basil",
      category: "Ingredients",
      supplier: "Valley Greens",
      packageCost: 12.00,
      packageSize: 16,
      unit: "oz" // Bought in ounces
    },
    {
      id: 4,
      name: "Extra Virgin Olive Oil",
      category: "Ingredients",
      supplier: "ItalFood Imports",
      packageCost: 48.00,
      packageSize: 1,
      unit: "gal" // Bought in gallons
    },
    {
      id: 5,
      name: "Parmigiano-Reggiano (Aged)",
      category: "Ingredients",
      supplier: "ItalFood Imports",
      packageCost: 85.00,
      packageSize: 5,
      unit: "lb"
    },
    {
      id: 6,
      name: "Raw Pine Nuts",
      category: "Ingredients",
      supplier: "Whole Foods Wholesale",
      packageCost: 24.00,
      packageSize: 16,
      unit: "oz"
    },
    {
      id: 7,
      name: "Organic Garlic Bulbs",
      category: "Ingredients",
      supplier: "Valley Greens",
      packageCost: 8.00,
      packageSize: 3,
      unit: "lb"
    },
    {
      id: 8,
      name: "Wild Porcini Mushrooms (Dried)",
      category: "Ingredients",
      supplier: "Forest Foraged Co",
      packageCost: 45.00,
      packageSize: 16,
      unit: "oz"
    },
    {
      id: 9,
      name: "Eco Kraft Pasta Boxes",
      category: "Packaging",
      supplier: "EcoPack Supplies",
      packageCost: 45.00,
      packageSize: 100,
      unit: "unit"
    },
    {
      id: 10,
      name: "Sauce Tubs with Lids",
      category: "Packaging",
      supplier: "EcoPack Supplies",
      packageCost: 18.00,
      packageSize: 100,
      unit: "unit"
    }
  ],
  recipes: [
    {
      id: 1,
      name: "Basic Fresh Egg Dough (Base Assembly)",
      portions: 10, // Yields 10 portions of pasta dough
      sellingPrice: 0.00, // Not sold directly (internal sub-assembly)
      ingredients: [
        { ingredientId: 1, amount: 1000, unit: "g" },     // 1kg Semolina Flour
        { ingredientId: 2, amount: 8, unit: "unit" }      // 8 Eggs
      ]
    },
    {
      id: 2,
      name: "Rustic Porcini Tomato Sauce (Base Assembly)",
      portions: 8, // Yields 8 portions of mushroom tomato sauce
      sellingPrice: 0.00, // Not sold directly
      ingredients: [
        { ingredientId: 8, amount: 4, unit: "oz" },       // Dried Wild Porcini
        { ingredientId: 4, amount: 12, unit: "floz" },    // Olive Oil
        { ingredientId: 7, amount: 2, unit: "oz" }        // Garlic
      ]
    },
    {
      id: 3,
      name: "Wild Porcini Tagliatelle (Menu Item Box)",
      portions: 1, // Single portion box sold at market
      sellingPrice: 14.00,
      ingredients: [
        { subRecipeId: 1, amount: 1, unit: "portion" },   // 1 portion of our Tagliatelle dough
        { subRecipeId: 2, amount: 1, unit: "portion" },   // 1 portion of our mushroom tomato sauce
        { ingredientId: 9, amount: 1, unit: "unit" },     // 1 Eco Pasta Box packaging
        { ingredientId: 5, amount: 0.5, unit: "oz" }      // 0.5 oz Parmigiano topping
      ]
    },
    {
      id: 4,
      name: "Wild Basil Pesto (8oz Tub Menu Item)",
      portions: 8, // Tubs sold in batches of 8
      sellingPrice: 9.00,
      ingredients: [
        { ingredientId: 3, amount: 8, unit: "oz" },       // Basil
        { ingredientId: 4, amount: 1.5, unit: "cup" },    // Olive Oil
        { ingredientId: 5, amount: 4, unit: "oz" },       // Parmigiano
        { ingredientId: 6, amount: 2, unit: "oz" },       // Pine Nuts
        { ingredientId: 7, amount: 1, unit: "oz" },       // Garlic
        { ingredientId: 10, amount: 8, unit: "unit" }     // 8 Sauce Tubs packaging
      ]
    }
  ],
  workers: [
    { id: 1, name: "Luigi", role: "Lead Pasta Maker", hourlyRate: 18.00 },
    { id: 2, name: "Sofia", role: "Sales Associate", hourlyRate: 16.50 },
    { id: 3, name: "Me (Owner)", role: "Founder / Owner", hourlyRate: 0.00 }
  ],
  timesheet: [
    { id: 1, workerId: 2, date: "2026-05-23", hours: 6.5, notes: "Saturday Farmers Market Prep & Customer Service" },
    { id: 2, workerId: 1, date: "2026-05-23", hours: 8.0, notes: "Saturday Market Booth Operator (Sales/Set up)" },
    { id: 3, workerId: 2, date: "2026-05-24", hours: 4.0, notes: "Sunday Kitchen Prep (Mushroom Drying & Dough Prep)" }
  ],
  expenses: [
    { id: 1, date: "2026-05-23", category: "Booth Fee", amount: 75.00, notes: "Saturday Downtown Farmers Market Stall Fee", paidByFriend: false },
    { id: 2, date: "2026-05-20", category: "Kitchen Rent", amount: 120.00, notes: "Commercial Prep Kitchen Rental - 4 hours", paidByFriend: false },
    { id: 3, date: "2026-05-22", category: "Gas & Travel", amount: 25.00, notes: "Fuel for delivery van", paidByFriend: false },
    { id: 4, date: "2026-05-18", category: "Marketing", amount: 45.00, notes: "Wild Pasta Logo Banner & Price Tags Printing", paidByFriend: true, friendName: "Sarah" }
  ],
  sales: [
    { id: 1, date: "2026-05-23", type: "dishes", recipeId: 3, quantity: 45, pricePerUnit: 14.00, subtotal: 630.00, tips: 35.00, total: 665.00, notes: "Saturday Downtown Farmers Market Booth Sales" },
    { id: 2, date: "2026-05-23", type: "dishes", recipeId: 4, quantity: 28, pricePerUnit: 9.00, subtotal: 252.00, tips: 15.00, total: 267.00, notes: "Saturday Market - Wild Basil Pesto Tubs" },
    { id: 3, date: "2026-05-24", type: "lump", subtotal: 450.00, tips: 0.00, total: 450.00, notes: "Private Catering Sunday Luncheon (Lump Sum)" }
  ],
  paybacks: [
    { id: 1, friendName: "Sarah", date: "2026-05-24", amount: 25.00, notes: "First installment paid back from Saturday market profits" }
  ]
};
