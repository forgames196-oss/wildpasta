# 🍝 Wild Pasta - Farmers Market Cost & Expense Manager

A comprehensive, offline-first, browser-based web application designed specifically for farmers market vendors to track ingredient costs, analyze recipe profit margins, manage labor, and track operating expenses. 

## ✨ Key Features

### 1. Recipe & Ingredient Management
*   **Ingredient Database:** Add and manage bulk ingredients with custom package sizes, purchase units, and costs.
*   **Intelligent Unit Conversion:** Automatically converts between weight and volume (e.g., cups to grams, pounds to ounces) to accurately cost recipes down to the penny.
*   **Base Recipes (Sub-Recipes):** Create intermediate prep recipes (like a batch of pasta dough or a master sauce) and use them as ingredients inside your final menu items.
*   **Menu Item Builder:** Build final products for the market. Add ingredients, specify your desired portions, set a selling price, and write step-by-step prep instructions.
*   **Prep Card PDF Export:** Generate distraction-free, print-ready 8.5x11 PDF "Prep Cards" for the kitchen, featuring pure recipe instructions and exact ingredient weights (no financial data).

### 2. Live Margin & Profit Tracking
*   **Real-time Dashboard:** See your overall Total Revenue, Active Labor Payroll, Standard Operating Expenses, and exact Net Profit at a glance.
*   **Food Cost Alerts:** Intelligent alerts on the dashboard warn you if a menu item's food cost percentage creeps into the "Dangerously High" (>35%) zone.
*   **Time Period Filters:** Globally filter your dashboard, sales, expenses, and payroll by "This Month," "Last Month," "This Year," or a custom date range.

### 3. Financial Logs
*   **Sales & Income Logger:** Record daily gross revenue and tips. You can log bulk lump-sum income or track exact quantities of specific dishes sold.
*   **Expense & Overhead Tracking:** Log standard cash operating expenses (e.g., market booth fees, ice, packaging) distinct from your recipe ingredient costs to prevent double-counting.
*   **Active Labor Payroll:** Log team members' hourly rates and clock their shifts.
*   **Friend Financing Ledger:** A dedicated debt-payback tracker to monitor seed-money loans from friends, logging payback installments out of available cash profits.

### 4. Advanced System Features
*   **Premium Glassmorphism UI:** A stunning, fully responsive dark-glass theme with micro-animations and a built-in toggle between US Standard and Metric units.
*   **Local Storage First:** 100% of your data is securely saved in your browser's local storage—no database required to run the app.
*   **Multi-Device Cloud Sync:** Built-in JSONBin API integration allows you to generate a private sync code. Input the sync code on a secondary device (like a mobile phone) to merge your data over the cloud.
*   **Recycle Bin:** Soft-deletion engine protects you from accidental clicks. Deleted items are sent to the settings recycle bin where they can be restored or permanently purged.

## 🚀 How to Run (No Server Required!)
Because this application is 100% client-side, you don't need a complex backend or database to run it.

1.  **Run Locally:** Just double-click the `index.html` file to open it in your browser.
2.  **Host for Free:** Simply drag and drop the project files into a GitHub repository and turn on **GitHub Pages**, or deploy it via platforms like Vercel or Cloudflare Pages.

## 🛠️ Technology Stack
*   **Structure:** Vanilla HTML5
*   **Styling:** Pure CSS3 (Custom Properties, Flexbox, CSS Grid)
*   **Logic:** Vanilla JavaScript (ES6)
*   **Icons:** Lucide Icons
*   **Charts:** Chart.js
*   **Sync Infrastructure:** JSONBin.io API
