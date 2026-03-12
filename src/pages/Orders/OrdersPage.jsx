import { useState, useEffect, useCallback } from 'react'
import { collection, onSnapshot, addDoc, deleteDoc, doc, query, orderBy, getDocs, serverTimestamp, updateDoc } from 'firebase/firestore'
import { db } from '../../firebase/config'
import { MENU_SEED, CATEGORIES } from '../../data/menuSeed'
import { applyOrderToInventory, loadInventorySnapshot, saveInventorySnapshot } from '../../utils/inventoryStore'
import { buildOrderSource, createOrderNumber, loadOrdersSnapshot, saveOrdersSnapshot, sortOrdersNewestFirst } from '../../utils/orderStore'
import styles from './OrdersPage.module.css'

const PLATFORMS = ['Swiggy', 'Zomato', 'Direct Pickup']
const TABLES = Array.from({ length: 10 }, (_, i) => `${i + 1}`)

export default function OrdersPage({ onBack }) {
  const localMenu = MENU_SEED.map((item, i) => ({ id: `local-${i}`, ...item }))
  const [menuItems, setMenuItems] = useState(localMenu)
  const [cart, setCart] = useState([])
  const [activeCat, setActiveCat] = useState(CATEGORIES[0].id)
  const [showCart, setShowCart] = useState(false)
  const [showModal, setShowModal] = useState(false)
  const [orderType, setOrderType] = useState(null)
  const [table, setTable] = useState('')
  const [platform, setPlatform] = useState('')
  const [placing, setPlacing] = useState(false)
  const [toast, setToast] = useState(null)
  const [offline, setOffline] = useState(true)

  useEffect(() => {
    const q = query(collection(db, 'menu'), orderBy('name'))
    const unsub = onSnapshot(q, snap => {
      if (snap.docs.length >= MENU_SEED.length) {
        setMenuItems(snap.docs.map(d => ({ id: d.id, ...d.data() })))
        setOffline(false)
      }
    }, () => { /* Firestore blocked — local data already loaded */ })
    return () => unsub()
  }, [])

  const showToast = useCallback((msg, type = 'success') => {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 3000)
  }, [])

  // Seed menu if empty
  async function handleSeedMenu() {
    for (const item of MENU_SEED) {
      await addDoc(collection(db, 'menu'), {
        ...item,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      })
    }
    showToast('Menu loaded!')
  }

  // Clear old menu and re-seed
  async function handleResetMenu() {
    const snap = await getDocs(collection(db, 'menu'))
    for (const d of snap.docs) {
      await deleteDoc(doc(db, 'menu', d.id))
    }
    await handleSeedMenu()
  }

  function addToCart(item) {
    setCart(prev => {
      const existing = prev.find(c => c.id === item.id)
      if (existing) return prev.map(c => c.id === item.id ? { ...c, qty: c.qty + 1 } : c)
      return [...prev, { ...item, qty: 1 }]
    })
  }

  function updateQty(id, delta) {
    setCart(prev =>
      prev.map(c => c.id === id ? { ...c, qty: c.qty + delta } : c)
        .filter(c => c.qty > 0)
    )
  }

  function removeFromCart(id) {
    setCart(prev => prev.filter(c => c.id !== id))
  }

  const subtotal = cart.reduce((s, c) => s + c.price * c.qty, 0)
  const totalQty = cart.reduce((s, c) => s + c.qty, 0)

  const filteredMenu = menuItems.filter(m => m.category === activeCat)

  async function placeOrder() {
    if (!cart.length) return showToast('Cart is empty', 'error')
    if (!orderType) return
    if (orderType === 'dine-in' && !table) return showToast('Select a table', 'error')
    if (orderType === 'takeout' && !platform) return showToast('Select a platform', 'error')

    setPlacing(true)
    try {
      let latestInventory = loadInventorySnapshot()
      const existingOrders = loadOrdersSnapshot()
      const sourceLabel = buildOrderSource(orderType, platform)
      const createdAtMs = Date.now()
      const orderRecord = {
        orderNumber: createOrderNumber(existingOrders),
        items: cart.map(c => ({ id: c.id, name: c.name, price: c.price, qty: c.qty })),
        orderType,
        sourceLabel,
        table: orderType === 'dine-in' ? table : null,
        platform: orderType === 'takeout' ? platform : null,
        subtotal,
        status: 'pending',
        createdAtMs,
      }

      if (!offline) {
        const orderRef = await addDoc(collection(db, 'orders'), {
          ...orderRecord,
          createdAt: serverTimestamp(),
        })
        orderRecord.id = orderRef.id

        const inventorySnap = await getDocs(query(collection(db, 'inventory'), orderBy('name')))
        if (!inventorySnap.empty) {
          latestInventory = inventorySnap.docs.map(d => ({ id: d.id, ...d.data() }))
        }
      }

      if (!orderRecord.id) {
        orderRecord.id = `local-order-${createdAtMs}`
      }

      saveOrdersSnapshot(sortOrdersNewestFirst([orderRecord, ...existingOrders]))

      const updatedInventory = applyOrderToInventory(latestInventory, cart)
      saveInventorySnapshot(updatedInventory)

      if (!offline) {
        for (const item of updatedInventory) {
          if (!item.id) continue
          await updateDoc(doc(db, 'inventory', item.id), {
            quantity: item.quantity,
            totalCost: item.totalCost,
            updatedAt: serverTimestamp(),
          })
        }
      }

      setCart([])
      setShowCart(false)
      setShowModal(false)
      setOrderType(null)
      setTable('')
      setPlatform('')
      showToast(offline ? 'Order placed and stock updated locally.' : 'Order placed and stock updated.')
    } catch {
      showToast('Failed to place order', 'error')
    } finally {
      setPlacing(false)
    }
  }

  return (
    <div className={styles.root}>
      {/* Left Category Sidebar */}
      <aside className={styles.catSidebar}>
        <button className={styles.backBtn} onClick={onBack} title="Go back">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6"/>
          </svg>
        </button>

        {CATEGORIES.map(cat => (
          <button
            key={cat.id}
            className={`${styles.catBtn} ${activeCat === cat.id ? styles.catBtnActive : ''}`}
            onClick={() => setActiveCat(cat.id)}
          >
            <span className={styles.catIcon}>{cat.icon}</span>
            <span className={styles.catLabel}>{cat.label}</span>
          </button>
        ))}
      </aside>

      {/* Main Content */}
      <div className={styles.main}>
        {/* Header */}
        <div className={styles.header}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <h1 className={styles.headerTitle}>
              {activeCat}
              {offline && <span style={{ fontSize: 12, color: '#d4290c', marginLeft: 8 }}>⚡ Offline</span>}
            </h1>
            {!offline && menuItems.length > 0 && (
              <button className={styles.resetBtn} onClick={handleResetMenu}>
                Reload Full Menu
              </button>
            )}
          </div>
        </div>

        {/* Item Grid */}
        {menuItems.length === 0 ? (
          <div className={styles.emptyState}>
            <span className={styles.emptyIcon}>🍽️</span>
            <p>No menu items yet.</p>
            <button className={styles.seedBtn} onClick={handleSeedMenu}>
              Load Menu Items
            </button>
          </div>
        ) : (
          <div className={styles.itemGrid}>
            {filteredMenu.map(item => {
              const inCart = cart.find(c => c.id === item.id)
              return (
                <button
                  key={item.id}
                  className={`${styles.itemCard} ${inCart ? styles.itemCardActive : ''}`}
                  onClick={() => addToCart(item)}
                >
                  {item.imageUrl ? (
                    <img src={item.imageUrl} alt={item.name} className={styles.itemImg} loading="lazy" />
                  ) : (
                    <div className={styles.itemImgPlaceholder}>🍽️</div>
                  )}
                  <div className={styles.itemInfo}>
                    <span className={styles.itemName}>{item.name}</span>
                    {item.description && (
                      <span className={styles.itemDesc}>{item.description}</span>
                    )}
                    <span className={styles.itemPrice}>₹{item.price}</span>
                  </div>
                  {inCart && <div className={styles.itemBadge}>{inCart.qty}</div>}
                </button>
              )
            })}
          </div>
        )}

        {/* Bottom Cart Bar */}
        <div className={styles.bottomBar}>
          <button className={styles.cartToggle} onClick={() => setShowCart(!showCart)}>
            <span className={styles.cartToggleIcon}>🛒</span>
            <span>Show cart</span>
            {totalQty > 0 && <span className={styles.cartCount}>{totalQty}</span>}
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" className={showCart ? styles.chevronUp : styles.chevronDown}>
              <polyline points="18 15 12 9 6 15"/>
            </svg>
          </button>

          <button
            className={styles.orderBtn}
            disabled={cart.length === 0}
            onClick={() => setShowModal(true)}
          >
            Order and pay ₹{subtotal.toFixed(0)}
          </button>
        </div>
      </div>

      {/* Slide-up Cart Panel */}
      {showCart && (
        <div className={styles.cartOverlay} onClick={() => setShowCart(false)}>
          <div className={styles.cartPanel} onClick={e => e.stopPropagation()}>
            <div className={styles.cartHeader}>
              <h3 className={styles.cartTitle}>Your Order ({totalQty})</h3>
              {cart.length > 0 && (
                <button className={styles.clearBtn} onClick={() => { setCart([]); setShowCart(false) }}>
                  Clear all
                </button>
              )}
            </div>

            {cart.length === 0 ? (
              <div className={styles.cartEmpty}>
                <p>Your cart is empty</p>
              </div>
            ) : (
              <div className={styles.cartItems}>
                {cart.map(item => (
                  <div key={item.id} className={styles.cartItem}>
                    {item.imageUrl && (
                      <img src={item.imageUrl} alt={item.name} className={styles.cartItemImg} />
                    )}
                    <div className={styles.cartItemInfo}>
                      <span className={styles.cartItemName}>{item.name}</span>
                      <span className={styles.cartItemPrice}>₹{item.price}</span>
                    </div>
                    <div className={styles.qtyControl}>
                      <button className={styles.qtyBtn} onClick={() => updateQty(item.id, -1)}>−</button>
                      <span className={styles.qtyNum}>{item.qty}</span>
                      <button className={styles.qtyBtn} onClick={() => updateQty(item.id, 1)}>+</button>
                    </div>
                    <span className={styles.cartItemTotal}>₹{(item.price * item.qty).toFixed(0)}</span>
                    <button className={styles.removeBtn} onClick={() => removeFromCart(item.id)}>×</button>
                  </div>
                ))}
              </div>
            )}

            <div className={styles.cartFooter}>
              <div className={styles.cartSubtotal}>
                <span>Total</span>
                <span className={styles.totalAmt}>₹{subtotal.toFixed(0)}</span>
              </div>
              <button
                className={styles.checkoutBtn}
                disabled={cart.length === 0}
                onClick={() => { setShowCart(false); setShowModal(true) }}
              >
                Proceed to Order
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Order Type Modal */}
      {showModal && (
        <div className={styles.modalOverlay} onClick={e => e.target === e.currentTarget && setShowModal(false)}>
          <div className={styles.modalBox}>
            <div className={styles.modalHeader}>
              <h2 className={styles.modalTitle}>Place Order</h2>
              <button className={styles.modalClose} onClick={() => setShowModal(false)}>✕</button>
            </div>

            <p className={styles.modalSub}>
              {cart.length} item{cart.length !== 1 ? 's' : ''} · ₹{subtotal.toFixed(0)}
            </p>

            <p className={styles.modalLabel}>Order Type</p>
            <div className={styles.typeButtons}>
              <button
                className={`${styles.typeBtn} ${orderType === 'dine-in' ? styles.typeBtnActive : ''}`}
                onClick={() => setOrderType('dine-in')}
              >
                🪑 Dine In
              </button>
              <button
                className={`${styles.typeBtn} ${orderType === 'takeout' ? styles.typeBtnActive : ''}`}
                onClick={() => setOrderType('takeout')}
              >
                📦 Takeout
              </button>
            </div>

            {orderType === 'dine-in' && (
              <div className={styles.formGroup}>
                <label className={styles.formLabel}>Table Number</label>
                <select className={styles.formSelect} value={table} onChange={e => setTable(e.target.value)}>
                  <option value="">Select…</option>
                  {TABLES.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
            )}

            {orderType === 'takeout' && (
              <div className={styles.formGroup}>
                <label className={styles.formLabel}>Platform</label>
                <div className={styles.typeButtons}>
                  {PLATFORMS.map(p => (
                    <button
                      key={p}
                      className={`${styles.typeBtn} ${platform === p ? styles.typeBtnActive : ''}`}
                      onClick={() => setPlatform(p)}
                    >{p}</button>
                  ))}
                </div>
              </div>
            )}

            <div className={styles.modalActions}>
              <button className={styles.cancelBtn} onClick={() => setShowModal(false)}>Cancel</button>
              <button
                className={styles.confirmBtn}
                onClick={placeOrder}
                disabled={placing || !orderType}
              >
                {placing ? 'Placing…' : 'Confirm Order'}
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div className="toast-container">
          <div className={`toast toast-${toast.type}`}>{toast.msg}</div>
        </div>
      )}
    </div>
  )
}
