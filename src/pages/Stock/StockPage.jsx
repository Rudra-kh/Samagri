import { useState, useEffect, useCallback } from 'react'
import {
  collection, addDoc, updateDoc, doc,
  query, orderBy, onSnapshot, serverTimestamp,
  where,
} from 'firebase/firestore'
import { db } from '../../firebase/config'
import { MENU_SEED } from '../../data/menuSeed'
import { RECIPE_BOOK } from '../../data/recipeBook'
import { loadInventorySnapshot, normalizeIngredientName } from '../../utils/inventoryStore'
import styles from './StockPage.module.css'

const LOCAL_PENDING_KEY = 'samagri.procurement.pending.local'
const LOCAL_COMPLETED_KEY = 'samagri.procurement.completed.local'

function loadLocalOrders(key) {
  if (typeof window === 'undefined') return []
  try {
    const raw = window.localStorage.getItem(key)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function saveLocalOrders(key, items) {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(key, JSON.stringify(items))
}

function formatDate(ts) {
  if (!ts) return '—'
  const d = ts.toDate ? ts.toDate() : new Date(ts)
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
}

function convertQuantity(quantity, fromUnit, toUnit, ingredientName) {
  const from = String(fromUnit || '').toLowerCase()
  const to = String(toUnit || '').toLowerCase()

  if (!from || !to || from === to) return quantity
  if (from === 'g' && to === 'kg') return quantity / 1000
  if (from === 'kg' && to === 'g') return quantity * 1000
  if (from === 'ml' && to === 'l') return quantity / 1000
  if (from === 'l' && to === 'ml') return quantity * 1000
  if (from === 'pcs' && to === 'pack' && normalizeIngredientName(ingredientName) === 'oreo cookies') return quantity / 12
  if (from === 'pack' && to === 'pcs' && normalizeIngredientName(ingredientName) === 'oreo cookies') return quantity * 12

  return quantity
}

function withTimeout(promise, timeoutMs, message) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error(message)), timeoutMs)),
  ])
}

function buildOrderSignature(order) {
  const source = order.source || ''
  const supplier = order.supplierName || ''
  const supplierPhone = order.supplierPhone || ''
  const ingredient = order.ingredientName || ''
  const unit = order.unit || ''
  const qty = Number(order.quantityOrdered || 0).toFixed(3)
  return `${source}|${supplier}|${supplierPhone}|${ingredient}|${unit}|${qty}`
}

export default function StockPage() {
  const [menuItems, setMenuItems]   = useState(MENU_SEED)
  const [inventory, setInventory]   = useState(() =>
    loadInventorySnapshot().map((item, index) => ({
      id: item.id ?? `local-${index}`,
      ...item,
    }))
  )
  const [thresholds, setThresholds] = useState({}) // { [inventoryId]: number }
  const [pending, setPending]       = useState([])
  const [completed, setCompleted]   = useState([])
  const [localPending, setLocalPending] = useState(() => loadLocalOrders(LOCAL_PENDING_KEY))
  const [localCompleted, setLocalCompleted] = useState(() => loadLocalOrders(LOCAL_COMPLETED_KEY))
  const [activeTab, setActiveTab]   = useState('stock') // stock | generate | pending | history
  const [toast, setToast]           = useState(null)
  const [receivingId, setReceivingId] = useState(null)
  const [newExpiry, setNewExpiry]   = useState('')

  const [menuPlanRows, setMenuPlanRows] = useState([{ dishName: '', qty: '' }])
  const [generatingFromMenu, setGeneratingFromMenu] = useState(false)
  const [generatingLowStock, setGeneratingLowStock] = useState(false)

  // History filters
  const [filterSupplier, setFilterSupplier] = useState('')
  const [filterFrom, setFilterFrom] = useState('')
  const [filterTo, setFilterTo]     = useState('')

  useEffect(() => {
    const q = query(collection(db, 'inventory'), orderBy('name'))
    return onSnapshot(q, snap => {
      if (snap.docs.length === 0) return
      const items = snap.docs.map(d => ({ id: d.id, ...d.data() }))
      setInventory(items)
      // Init thresholds from stored values
      const t = {}
      items.forEach(i => { if (i.lowStockThreshold != null) t[i.id] = i.lowStockThreshold })
      setThresholds(prev => ({ ...t, ...prev }))
    }, () => {
      if (inventory.length === 0) {
        const fallback = loadInventorySnapshot().map((item, index) => ({
          id: item.id ?? `local-${index}`,
          ...item,
        }))
        setInventory(fallback)
      }
    })
  }, [inventory.length])

  useEffect(() => {
    const qPending = query(
      collection(db, 'procurementOrders'),
      where('status', '==', 'pending'),
      orderBy('createdAt', 'desc')
    )
    return onSnapshot(qPending, snap => {
      setPending(snap.docs.map(d => ({ id: d.id, ...d.data() })))
    })
  }, [])

  useEffect(() => {
    const qDone = query(
      collection(db, 'procurementOrders'),
      where('status', '==', 'completed'),
      orderBy('receivedAt', 'desc')
    )
    return onSnapshot(qDone, snap => {
      setCompleted(snap.docs.map(d => ({ id: d.id, ...d.data() })))
    })
  }, [])

  useEffect(() => {
    saveLocalOrders(LOCAL_PENDING_KEY, localPending)
  }, [localPending])

  useEffect(() => {
    saveLocalOrders(LOCAL_COMPLETED_KEY, localCompleted)
  }, [localCompleted])

  const showToast = useCallback((msg, type = 'success') => {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 3000)
  }, [])

  async function saveThreshold(item) {
    const val = parseFloat(thresholds[item.id])
    if (isNaN(val)) return
    try {
      await updateDoc(doc(db, 'inventory', item.id), { lowStockThreshold: val })
      showToast('Threshold saved.')
    } catch {
      showToast('Failed to save threshold.', 'error')
    }
  }

  async function reorder(item) {
    try {
      await addDoc(collection(db, 'procurementOrders'), {
        inventoryId: item.id,
        ingredientName: item.name,
        unit: item.unit,
        quantityOrdered: item.lowStockThreshold ?? 0,
        supplierName: item.dealerName ?? '',
        supplierPhone: item.dealerPhone ?? '',
        supplierAddress: item.dealerAddress ?? '',
        source: 'manual-low-stock',
        status: 'pending',
        createdAt: serverTimestamp(),
      })
      showToast(`Reorder created for ${item.name}.`)
    } catch {
      showToast('Failed to create order.', 'error')
    }
  }

  function updateMenuPlanRow(i, field, value) {
    setMenuPlanRows(prev => prev.map((row, idx) => idx === i ? { ...row, [field]: value } : row))
  }

  function addMenuPlanRow() {
    setMenuPlanRows(prev => [...prev, { dishName: '', qty: '' }])
  }

  function removeMenuPlanRow(i) {
    setMenuPlanRows(prev => prev.filter((_, idx) => idx !== i))
  }

  function findRecipeByName(name) {
    if (!name) return null
    const direct = RECIPE_BOOK[name]
    if (direct) return direct
    const key = Object.keys(RECIPE_BOOK).find(r => r.toLowerCase() === name.toLowerCase())
    return key ? RECIPE_BOOK[key] : null
  }

  async function createIngredientOrders(items, source) {
    const localToAdd = []
    let cloudSaved = 0
    let localSaved = 0

    for (let idx = 0; idx < items.length; idx += 1) {
      const item = items[idx]
      const payload = {
        inventoryId: item.inventoryId ?? null,
        ingredientName: item.ingredientName ?? '',
        unit: item.unit ?? '',
        quantityOrdered: Number(item.quantityOrdered ?? 0),
        supplierName: item.supplierName ?? 'Unknown Dealer',
        supplierPhone: item.supplierPhone ?? '',
        supplierAddress: item.supplierAddress ?? '',
        status: 'pending',
        source,
      }

      try {
        await withTimeout(addDoc(collection(db, 'procurementOrders'), {
          ...payload,
          createdAt: serverTimestamp(),
        }), 4000, 'Request timed out while saving order')
        cloudSaved += 1
      } catch (err) {
        console.error('createIngredientOrders failed', err)
        localToAdd.push({
          id: `local-pending-${Date.now()}-${idx}`,
          ...payload,
          createdAt: new Date().toISOString(),
        })
        localSaved += 1
      }
    }

    if (localToAdd.length > 0) {
      setLocalPending(prev => [...localToAdd, ...prev])
    }

    return { cloudSaved, localSaved }
  }

  async function generateFromMenuPlan() {
    const rows = menuPlanRows
      .map(row => ({ dishName: row.dishName.trim(), qty: Number(row.qty) }))
      .filter(row => row.dishName && row.qty > 0)

    if (rows.length === 0) {
      showToast('Add at least one dish with quantity.', 'error')
      return
    }

    setGeneratingFromMenu(true)
    try {
      const demandByInventory = new Map()
      let usedRecipeCount = 0

      const missingIngredients = new Set()

      for (const row of rows) {
        const recipe = findRecipeByName(row.dishName)
        if (!recipe) continue
        usedRecipeCount += 1

        for (const ingredient of recipe) {
          const stockItem = inventory.find(item => normalizeIngredientName(item.name) === normalizeIngredientName(ingredient.name))
          const baseQty = ingredient.quantity * row.qty

          if (stockItem) {
            const convertedQty = convertQuantity(baseQty, ingredient.unit, stockItem.unit, ingredient.name)
            const key = stockItem.id ?? `${normalizeIngredientName(stockItem.name)}|${stockItem.unit || ''}`
            const prev = demandByInventory.get(key) || {
              inventoryId: stockItem.id ?? null,
              ingredientName: stockItem.name,
              unit: stockItem.unit,
              quantityOrdered: 0,
              supplierName: stockItem.dealerName ?? 'Unknown Dealer',
              supplierPhone: stockItem.dealerPhone ?? '',
              supplierAddress: stockItem.dealerAddress ?? '',
            }
            prev.quantityOrdered += convertedQty
            demandByInventory.set(key, prev)
          } else {
            const key = `missing:${normalizeIngredientName(ingredient.name)}:${ingredient.unit}`
            const prev = demandByInventory.get(key) || {
              inventoryId: null,
              ingredientName: ingredient.name,
              unit: ingredient.unit,
              quantityOrdered: 0,
              supplierName: 'Unknown Dealer',
              supplierPhone: '',
              supplierAddress: '',
            }
            prev.quantityOrdered += baseQty
            demandByInventory.set(key, prev)
            missingIngredients.add(ingredient.name)
          }
        }
      }

      const demandItems = Array.from(demandByInventory.values()).filter(item => item.quantityOrdered > 0)
      if (usedRecipeCount === 0) {
        showToast('No recipes found for selected dishes. Please pick from the list.', 'error')
        return
      }

      if (demandItems.length === 0) {
        showToast('No matching inventory items for selected dishes. Add ingredients in Inventory or check names.', 'error')
        return
      }

      const result = await createIngredientOrders(demandItems, 'menu-plan')
      if (missingIngredients.size > 0) {
        showToast(`Generated ${result.cloudSaved + result.localSaved} list(s). Missing inventory for: ${Array.from(missingIngredients).join(', ')}.`, 'error')
      } else if (result.localSaved > 0) {
        showToast(`Generated ${result.cloudSaved + result.localSaved} list(s). ${result.localSaved} saved locally (cloud unavailable).`, 'error')
      } else {
        showToast(`Generated ${result.cloudSaved} ingredient order list(s) from menu plan.`)
      }
      setMenuPlanRows([{ dishName: '', qty: '' }])
      setActiveTab('pending')
    } catch (err) {
      console.error('generateFromMenuPlan failed', err)
      showToast(`Failed to generate order list from menu plan. ${err?.message ?? ''}`.trim(), 'error')
    } finally {
      setGeneratingFromMenu(false)
    }
  }

  async function generateFromLowStock(stockRows) {
    const lowItems = stockRows
      .filter(item => item.isLow)
      .map(item => {
        const target = Number(item.threshold ?? 0)
        const current = Number(item.quantity ?? 0)
        const qty = Math.max(target - current, 0)
        return {
          inventoryId: item.id,
          ingredientName: item.name,
          unit: item.unit,
          quantityOrdered: qty > 0 ? qty : target,
          supplierName: item.dealerName ?? 'Unknown Dealer',
          supplierPhone: item.dealerPhone ?? '',
          supplierAddress: item.dealerAddress ?? '',
        }
      })
      .filter(item => item.quantityOrdered > 0)

    if (lowItems.length === 0) {
      showToast('No low-stock items available for generation.', 'error')
      return
    }

    setGeneratingLowStock(true)
    try {
      const result = await createIngredientOrders(lowItems, 'low-stock')
      if (result.localSaved > 0) {
        showToast(`Generated ${result.cloudSaved + result.localSaved} list(s). ${result.localSaved} saved locally (cloud unavailable).`, 'error')
      } else {
        showToast(`Generated ${result.cloudSaved} ingredient order list(s) from low stock.`)
      }
      setActiveTab('pending')
    } catch (err) {
      console.error('generateFromLowStock failed', err)
      showToast(`Failed to generate order list from low stock. ${err?.message ?? ''}`.trim(), 'error')
    } finally {
      setGeneratingLowStock(false)
    }
  }

  async function markReceived(order) {
    if (!newExpiry) return showToast('Enter updated expiry date.', 'error')
    const isLocalOrder = String(order.id || '').startsWith('local-pending-')

    if (isLocalOrder) {
      const orderItems = Array.isArray(order.items)
        ? order.items
        : [{
          inventoryId: order.inventoryId,
          ingredientName: order.ingredientName,
          unit: order.unit,
          quantityOrdered: order.quantityOrdered,
        }]

      const nextInventory = inventory.map(item => ({ ...item }))
      for (const orderedItem of orderItems) {
        if (!orderedItem.inventoryId) continue
        const idx = nextInventory.findIndex(i => i.id === orderedItem.inventoryId)
        if (idx >= 0) {
          nextInventory[idx].quantity = Number(nextInventory[idx].quantity ?? 0) + Number(orderedItem.quantityOrdered ?? 0)
          nextInventory[idx].expiryDate = newExpiry
        }
      }
      setInventory(nextInventory)

      setLocalPending(prev => prev.filter(p => p.id !== order.id))
      setLocalCompleted(prev => [{
        ...order,
        status: 'completed',
        receivedAt: new Date().toISOString(),
        updatedExpiryDate: newExpiry,
      }, ...prev])

      showToast('Local order marked as received. Inventory updated locally.')
      setReceivingId(null)
      setNewExpiry('')
      return
    }

    try {
      // Update procurement order
      await updateDoc(doc(db, 'procurementOrders', order.id), {
        status: 'completed',
        receivedAt: serverTimestamp(),
        updatedExpiryDate: newExpiry,
      })

      // Update inventory quantity and expiry
      const orderItems = Array.isArray(order.items)
        ? order.items
        : [{
          inventoryId: order.inventoryId,
          ingredientName: order.ingredientName,
          unit: order.unit,
          quantityOrdered: order.quantityOrdered,
        }]

      for (const orderedItem of orderItems) {
        if (!orderedItem.inventoryId) continue
        const invItem = inventory.find(i => i.id === orderedItem.inventoryId)
        if (invItem) {
          await updateDoc(doc(db, 'inventory', orderedItem.inventoryId), {
            quantity: Number(invItem.quantity ?? 0) + Number(orderedItem.quantityOrdered ?? 0),
            expiryDate: newExpiry,
          })
        }
      }

      showToast('Order marked as received. Inventory updated.')
      setReceivingId(null)
      setNewExpiry('')
    } catch {
      showToast('Failed to mark as received.', 'error')
    }
  }

  // Stock table
  const stockRows = inventory.map(item => {
    const t = thresholds[item.id] ?? item.lowStockThreshold
    const isLow = t != null && item.quantity <= t
    return { ...item, isLow, threshold: t }
  })
  const lowStockCount = stockRows.filter(item => item.isLow).length
  const menuRecipeItems = menuItems.filter(item => RECIPE_BOOK[item.name])
  const cloudSigs = new Set(pending.map(buildOrderSignature))
  const localPendingDeduped = localPending.filter(order => !cloudSigs.has(buildOrderSignature(order)))
  const mergedPending = [...localPendingDeduped, ...pending]
  const mergedCompleted = [...localCompleted, ...completed]

  // History filter
  const filteredHistory = mergedCompleted.filter(o => {
    if (filterSupplier && !o.supplierName?.toLowerCase().includes(filterSupplier.toLowerCase())) return false
    if (filterFrom) {
      const from = new Date(filterFrom)
      const d = o.createdAt?.toDate ? o.createdAt.toDate() : new Date(o.createdAt)
      if (d < from) return false
    }
    if (filterTo) {
      const to = new Date(filterTo)
      to.setHours(23, 59, 59)
      const d = o.createdAt?.toDate ? o.createdAt.toDate() : new Date(o.createdAt)
      if (d > to) return false
    }
    return true
  })

  return (
    <div className={`page-enter ${styles.root}`}>
      <div className={styles.pageHead}>
        <div className="page-header">
          <h2 className="page-title">Stock & Procurement</h2>
          <p className="page-subtitle">Monitor stock levels and manage supplier orders</p>
        </div>
        <div className={styles.headTabs}>
          {[
            { id: 'stock', label: 'Live Stock' },
            { id: 'generate', label: 'Generate List' },
            { id: 'pending', label: `Pending Orders${mergedPending.length ? ` (${mergedPending.length})` : ''}` },
            { id: 'history', label: 'Order History' },
          ].map(t => (
            <button
              key={t.id}
              className={`${styles.tab} ${activeTab === t.id ? styles.tabActive : ''}`}
              onClick={() => setActiveTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Live Stock Tab ── */}
      {activeTab === 'stock' && (
        stockRows.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">📦</div>
            <p className="empty-state-text">No inventory items yet. Add items in the Inventory section.</p>
          </div>
        ) : (
          <div className={styles.stockSection}>
            <div className="table-wrapper">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Ingredient</th>
                    <th>Current Stock</th>
                    <th>Unit</th>
                    <th>Low Stock Threshold</th>
                    <th>Status</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {stockRows.map(item => (
                    <tr key={item.id ?? item.name} className={item.isLow ? styles.lowStockRow : ''}>
                      <td>
                        <div className={styles.itemName}>{item.name}</div>
                        {item.dealerName && <div className={styles.itemDealer}>{item.dealerName}</div>}
                      </td>
                      <td>
                        <span className={`${styles.stockQty} ${item.isLow ? styles.stockQtyLow : ''}`}>
                          {item.quantity}
                        </span>
                      </td>
                      <td style={{ color: 'var(--slate)' }}>{item.unit}</td>
                      <td>
                        <div className={styles.thresholdCell}>
                          <input
                            type="number"
                            min="0"
                            step="any"
                            className="form-input"
                            style={{ width: 80, fontSize: 13, padding: '5px 8px' }}
                            value={thresholds[item.id] ?? item.lowStockThreshold ?? ''}
                            onChange={e => setThresholds(prev => ({ ...prev, [item.id]: e.target.value }))}
                            placeholder="—"
                          />
                          <button
                            className="btn btn-ghost btn-sm"
                            onClick={() => saveThreshold(item)}
                            title="Save threshold"
                          >
                            Save
                          </button>
                        </div>
                      </td>
                      <td>
                        {item.isLow
                          ? <span className="badge badge-warning">⚠ Low Stock</span>
                          : <span className="badge badge-success">OK</span>
                        }
                      </td>
                      <td>
                        {item.isLow && (
                          <button className={`btn btn-sm ${styles.reorderBtn}`} onClick={() => reorder(item)}>
                            Reorder
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )
      )}

      {/* ── Generate List Tab ── */}
      {activeTab === 'generate' && (
        <div className={styles.stockSection}>
          <div className={`card ${styles.generateCard}`}>
            <div className={styles.generateHead}>
              <h3 className={styles.generateTitle}>Generate List</h3>
              <p className={styles.generateSub}>Create dealer-wise raw-material purchase orders directly into Pending Orders.</p>
            </div>

            <div className={styles.generateGrid}>
              <div className={styles.generateBlock}>
                <h4 className={styles.generateBlockTitle}>1. From menu plan</h4>
                <p className={styles.generateBlockSub}>Enter party order quantities (e.g. 50 pizzas, burgers, shakes) and auto-generate raw material lists.</p>

                <div className={styles.planRows}>
                  {menuPlanRows.map((row, i) => (
                    <div key={i} className={styles.planRow}>
                      <input
                        className="form-input"
                        list="menu-dish-options"
                        placeholder="Search dish"
                        value={row.dishName}
                        onChange={e => updateMenuPlanRow(i, 'dishName', e.target.value)}
                        style={{ flex: 2 }}
                      />
                      <input
                        type="number"
                        min="1"
                        className="form-input"
                        placeholder="Qty"
                        value={row.qty}
                        onChange={e => updateMenuPlanRow(i, 'qty', e.target.value)}
                        style={{ flex: 1 }}
                      />
                      {menuPlanRows.length > 1 && (
                        <button className="btn btn-ghost btn-sm" onClick={() => removeMenuPlanRow(i)}>×</button>
                      )}
                    </div>
                  ))}
                </div>

                <datalist id="menu-dish-options">
                  {menuRecipeItems.map(item => (
                    <option key={item.name} value={item.name} />
                  ))}
                </datalist>

                <div className={styles.generateActions}>
                  <button className="btn btn-ghost btn-sm" onClick={addMenuPlanRow}>+ Add Dish</button>
                  <button className="btn btn-primary btn-sm" disabled={generatingFromMenu} onClick={generateFromMenuPlan}>
                    {generatingFromMenu ? 'Generating…' : 'Generate Dealer-wise List'}
                  </button>
                </div>
              </div>

              <div className={styles.generateBlock}>
                <h4 className={styles.generateBlockTitle}>2. From low stock</h4>
                <p className={styles.generateBlockSub}>Auto-generate dealer-wise pending procurement orders for all low-stock ingredients.</p>
                <div className={styles.lowStockSummary}>
                  <span>Low stock items: <strong>{lowStockCount}</strong></span>
                </div>
                <button
                  className="btn btn-outline btn-sm"
                  disabled={lowStockCount === 0 || generatingLowStock}
                  onClick={() => generateFromLowStock(stockRows)}
                >
                  {generatingLowStock ? 'Generating…' : 'Generate from Low Stock'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Pending Orders Tab ── */}
      {activeTab === 'pending' && (
        <div className={styles.pendingSection}>
          {mergedPending.length === 0 ? (
            <div className="empty-state">
              <div className="empty-state-icon">🏪</div>
              <p className="empty-state-text">No pending procurement orders.</p>
            </div>
          ) : (
            <div className={styles.pendingList}>
              {mergedPending.map(order => {
                const orderItems = Array.isArray(order.items)
                  ? order.items
                  : [{ ingredientName: order.ingredientName, quantityOrdered: order.quantityOrdered, unit: order.unit }]

                const totalLines = orderItems.length
                const totalQty = orderItems.reduce((sum, item) => sum + Number(item.quantityOrdered || 0), 0)
                const singleUnit = totalLines === 1 ? (orderItems[0]?.unit || order.unit || '') : ''

                return (
                  <div key={order.id} className={`card ${styles.pendingCard}`}>
                    <div className={styles.pendingCardTop}>
                      <div>
                        <h4 className={styles.pendingIngName}>{totalLines > 1 ? `${totalLines} items for ${order.supplierName || 'Supplier'}` : orderItems[0]?.ingredientName}</h4>
                        <p className={styles.pendingMeta}>
                          Qty: <strong>{Number(totalQty.toFixed(3))}{singleUnit ? ` ${singleUnit}` : ''}</strong> &middot; Ordered: {formatDate(order.createdAt)}
                          {order.source ? ` · Source: ${order.source}` : ''}
                        </p>
                      </div>
                      <span className="badge badge-warning">Pending</span>
                    </div>

                    {orderItems.length > 1 && (
                      <div className={styles.pendingItemsList}>
                        {orderItems.map((item, idx) => (
                          <div key={`${order.id}-${idx}`} className={styles.pendingItemRow}>
                            <span>{item.ingredientName}</span>
                            <strong>{Number(item.quantityOrdered || 0).toFixed(3)} {item.unit}</strong>
                          </div>
                        ))}
                      </div>
                    )}

                    {order.supplierName && (
                      <div className={styles.supplierInfo}>
                        <div className={styles.supplierRow}>
                          <span>🏬</span> <span>{order.supplierName}</span>
                        </div>
                        {order.supplierPhone && (
                          <div className={styles.supplierRow}>
                            <span>📞</span> <span>{order.supplierPhone}</span>
                          </div>
                        )}
                        {order.supplierAddress && (
                          <div className={styles.supplierRow}>
                            <span>📍</span> <span>{order.supplierAddress}</span>
                          </div>
                        )}
                      </div>
                    )}

                    {receivingId === order.id ? (
                      <div className={styles.receiveForm}>
                        <div className="form-group">
                          <label className="form-label">Updated Expiry Date</label>
                          <input
                            type="date"
                            className="form-input"
                            value={newExpiry}
                            onChange={e => setNewExpiry(e.target.value)}
                          />
                        </div>
                        <div style={{ display: 'flex', gap: 8 }}>
                          <button className="btn btn-outline btn-sm" onClick={() => { setReceivingId(null); setNewExpiry('') }}>Cancel</button>
                          <button className="btn btn-green btn-sm" onClick={() => markReceived(order)}>Confirm Received</button>
                        </div>
                      </div>
                    ) : (
                      <button
                        className="btn btn-outline btn-sm"
                        style={{ marginTop: 12, alignSelf: 'flex-start' }}
                        onClick={() => { setReceivingId(order.id); setNewExpiry('') }}
                      >
                        ✓ Mark as Received
                      </button>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* ── Order History Tab ── */}
      {activeTab === 'history' && (
        <div className={styles.historySection}>
          <div className={styles.historyFilters}>
            <div className="form-group">
              <label className="form-label">Supplier</label>
              <input
                className="form-input"
                style={{ fontSize: 13 }}
                placeholder="Filter by supplier…"
                value={filterSupplier}
                onChange={e => setFilterSupplier(e.target.value)}
              />
            </div>
            <div className="form-group">
              <label className="form-label">From</label>
              <input type="date" className="form-input" style={{ fontSize: 13 }} value={filterFrom} onChange={e => setFilterFrom(e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">To</label>
              <input type="date" className="form-input" style={{ fontSize: 13 }} value={filterTo} onChange={e => setFilterTo(e.target.value)} />
            </div>
            {(filterSupplier || filterFrom || filterTo) && (
              <button className="btn btn-ghost btn-sm" style={{ alignSelf: 'flex-end', marginBottom: 2 }} onClick={() => { setFilterSupplier(''); setFilterFrom(''); setFilterTo('') }}>
                Clear
              </button>
            )}
          </div>

          {filteredHistory.length === 0 ? (
            <div className="empty-state">
              <div className="empty-state-icon">📋</div>
              <p className="empty-state-text">No completed orders found.</p>
            </div>
          ) : (
            <div className="table-wrapper">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Ingredient</th>
                    <th>Qty</th>
                    <th>Supplier</th>
                    <th>Phone</th>
                    <th>Order Date</th>
                    <th>Received Date</th>
                    <th>Updated Expiry</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredHistory.map(order => {
                    const orderItems = Array.isArray(order.items)
                      ? order.items
                      : [{ ingredientName: order.ingredientName, quantityOrdered: order.quantityOrdered, unit: order.unit }]

                    const ingredientPreview = orderItems
                      .slice(0, 3)
                      .map(item => item.ingredientName)
                      .join(', ')

                    const totalQty = orderItems.reduce((sum, item) => sum + Number(item.quantityOrdered || 0), 0)

                    return (
                      <tr key={order.id}>
                        <td style={{ fontWeight: 600 }}>
                          {ingredientPreview}{orderItems.length > 3 ? ` +${orderItems.length - 3} more` : ''}
                        </td>
                        <td>{Number(totalQty.toFixed(3))} ({orderItems.length} item{orderItems.length !== 1 ? 's' : ''})</td>
                        <td>{order.supplierName || '—'}</td>
                        <td style={{ color: 'var(--slate)' }}>{order.supplierPhone || '—'}</td>
                        <td style={{ color: 'var(--slate)' }}>{formatDate(order.createdAt)}</td>
                        <td style={{ color: 'var(--slate)' }}>{formatDate(order.receivedAt)}</td>
                        <td>
                          {order.updatedExpiryDate
                            ? <span className="badge badge-success">{formatDate(order.updatedExpiryDate)}</span>
                            : '—'
                          }
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
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
