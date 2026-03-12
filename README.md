# MaalMasala — Restaurant POS & Inventory Management

A minimal, warm, single-login web app for restaurant staff covering POS, inventory, menu management, recipe costing, and stock procurement — built with React + Firebase.

---

## Tech Stack

- **Frontend:** React 18 + Vite
- **Auth:** Firebase Authentication (email + password)
- **Database:** Cloud Firestore (real-time via `onSnapshot`)
- **Storage:** Firebase Storage (menu item images)
- **Styling:** Custom CSS Modules — no UI library dependencies

---

## Firebase Setup

### 1. Create a Firebase Project
Go to [console.firebase.google.com](https://console.firebase.google.com) and create a new project.

### 2. Enable Authentication
- Firebase Console → Authentication → Sign-in method → Enable **Email/Password**
- Manually create one staff user under Authentication → Users

### 3. Create Firestore Database
- Firebase Console → Firestore Database → Create database (start in **test mode** for development)

### 4. Enable Storage
- Firebase Console → Storage → Get started

### 5. Firestore Collections
The app uses these Firestore collections (auto-created on first use):

| Collection | Purpose |
|---|---|
| `menu` | Restaurant dishes |
| `inventory` | Raw ingredients |
| `recipes` | Dish recipes with cost/margin |
| `orders` | Customer orders (POS) |
| `procurementOrders` | Supplier/reorder requests |

### 6. Firestore Security Rules (Production)
```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /{document=**} {
      allow read, write: if request.auth != null;
    }
  }
}
```

### 7. Storage Rules
```
rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {
    match /{allPaths=**} {
      allow read, write: if request.auth != null;
    }
  }
}
```

---

## Local Development

### 1. Clone and install
```bash
npm install
```

### 2. Set up environment variables
```bash
cp .env.example .env.local
# Fill in your Firebase config values in .env.local
```

### 3. Run dev server
```bash
npm run dev
```

Open [http://localhost:5173](http://localhost:5173) and log in with the staff credentials you created in Firebase Auth.

---

## Build for Production
```bash
npm run build
```

---

## Features

### 🧾 Orders (POS)
- Menu item grid — click to add to cart
- Real-time cart with quantity controls
- Order placement: Dine-In (table select) or Takeout (Swiggy / Zomato / Direct Pickup)
- Live order queue with status updates (Pending → Preparing → Ready → Completed)

### 📦 Inventory
- Add/edit/delete ingredients with quantity, unit, cost, expiry, and dealer details
- Auto-calculated total cost
- Color-coded expiry warnings (yellow = expiring in ≤ 7 days, red = expired)
- Sortable table

### 🍽️ Menu
- Add dishes manually with image upload to Firebase Storage
- "Scan Menu" — upload a menu photo, review extracted dish names, batch-save to Firestore
- Filter by category and search by name

### 📋 Recipes
- Typeahead dish selector
- Build ingredient list with quantities and units
- Cost price + selling price → auto-calculates profit, margin %, markup %
- Saved recipes show full breakdown

### 🏪 Stock & Procurement
- Live stock table with configurable low-stock thresholds (saved to Firestore per item)
- "Reorder" button creates a procurement order linked to the ingredient's dealer info
- **Pending Orders** checklist — mark as "Received", enter updated expiry → auto-updates inventory
- **Order History** — filterable by supplier and date range
