import { useState } from 'react'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import { isFirebaseConfigured } from './firebase/config'
import Login from './components/Auth/Login'
import Sidebar from './components/Layout/Sidebar'
import Landing from './pages/Landing/Landing'
import OrdersPage from './pages/Orders/OrdersPage'
import CookPage from './pages/Cook/CookPage'
import InventoryPage from './pages/Inventory/InventoryPage'
// MenuPage removed from inventory section
import RecipesPage from './pages/Recipes/RecipesPage'
import StockPage from './pages/Stock/StockPage'
import ContactsPage from './pages/Contacts/ContactsPage'
import SamagriLogo from './components/Brand/SamagriLogo'

const SIDEBAR_PAGES = {
  inventory: InventoryPage,
  contacts:  ContactsPage,
  recipes:   RecipesPage,
  stock:     StockPage,
}

function AppShell() {
  const { user } = useAuth()
  const [activePage, setActivePage] = useState('landing') // 'landing' | 'orders' | sidebar pages

  // Still loading auth state
  if (user === undefined) {
    return (
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        height: '100vh', background: 'var(--bg-body)',
      }}>
        <span className="spinner" style={{ width: 32, height: 32 }} />
      </div>
    )
  }

  if (!user) return <Login />

  // Landing page — no sidebar
  if (activePage === 'landing') {
    return <Landing onNavigate={setActivePage} />
  }

  // Orders page — full-screen BK kiosk, no sidebar
  if (activePage === 'orders') {
    return <OrdersPage onBack={() => setActivePage('landing')} />
  }

  if (activePage === 'cook') {
    return <CookPage onBack={() => setActivePage('landing')} />
  }

  // Sidebar pages (inventory, menu, recipes, stock)
  const Page = SIDEBAR_PAGES[activePage] ?? InventoryPage

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>
      <Sidebar activePage={activePage} setActivePage={(p) => {
        if (p === 'orders') { setActivePage('landing'); return }
        setActivePage(p)
      }} />
      <main style={{
        marginLeft: 230,
        flex: 1,
        overflow: 'auto',
        background: 'var(--bg-body)',
        display: 'flex',
        flexDirection: 'column',
      }}>
        <Page />
      </main>
    </div>
  )
}

function FirebaseSetupBanner() {
  return (
    <div style={{
      minHeight: '100vh', background: 'var(--bg-body)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24,
    }}>
      <div style={{
        background: 'var(--bg-surface)', border: '1px solid var(--border-light)',
        borderRadius: 'var(--radius-lg)', padding: '40px 36px', maxWidth: 480,
        boxShadow: 'var(--shadow-md)', display: 'flex', flexDirection: 'column', gap: 16,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 4 }}>
          <SamagriLogo style={{ width: 44, height: 44 }} />
          <span style={{ fontFamily: 'var(--font-serif)', fontSize: 20, fontWeight: 600, color: 'var(--charcoal)' }}>
            Samagri
          </span>
        </div>
        <div style={{
          background: '#FEF7EC', border: '1px solid #e8c870', borderRadius: 8,
          padding: '12px 16px', color: 'var(--warning)', fontSize: 13, fontWeight: 500,
        }}>
          ⚠ Firebase is not configured yet.
        </div>
        <p style={{ fontSize: 13, color: 'var(--charcoal-light)', lineHeight: 1.7 }}>
          To use Samagri, you need a Firebase project. Edit <code style={{
            background: 'var(--cream-dark)', padding: '1px 6px', borderRadius: 4, fontSize: 12
          }}>.env.local</code> with your Firebase credentials:
        </p>
        <pre style={{
          background: 'var(--cream)', border: '1px solid var(--border)',
          borderRadius: 8, padding: '12px 14px', fontSize: 12,
          color: 'var(--charcoal)', overflowX: 'auto', lineHeight: 1.7,
        }}>{`VITE_FIREBASE_API_KEY=...
VITE_FIREBASE_AUTH_DOMAIN=...
VITE_FIREBASE_PROJECT_ID=...
VITE_FIREBASE_STORAGE_BUCKET=...
VITE_FIREBASE_MESSAGING_SENDER_ID=...
VITE_FIREBASE_APP_ID=...`}</pre>
        <p style={{ fontSize: 12, color: 'var(--slate)' }}>
          Get these values from Firebase Console → Project Settings → Your Apps → Web App.
          Then restart the dev server.
        </p>
      </div>
    </div>
  )
}

export default function App() {
  if (!isFirebaseConfigured) return <FirebaseSetupBanner />
  return (
    <AuthProvider>
      <AppShell />
    </AuthProvider>
  )
}
