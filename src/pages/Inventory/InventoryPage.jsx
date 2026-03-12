import { useState, useEffect, useCallback } from 'react'
import {
  collection, addDoc, updateDoc, deleteDoc, doc,
  query, orderBy, onSnapshot, serverTimestamp, getDocs,
} from 'firebase/firestore'
import { db } from '../../firebase/config'
import { INVENTORY_SEED } from '../../data/inventorySeed'
import { DEALERS } from '../../data/dealersSeed'
import { buildSeedInventory, loadInventorySnapshot, saveInventorySnapshot } from '../../utils/inventoryStore'
import styles from './InventoryPage.module.css'

const UNITS = ['kg', 'g', 'L', 'mL', 'pcs', 'dozen', 'box', 'pack', 'bottle', 'bag']

const EMPTY_FORM = {
  name: '', description: '', quantity: '', unit: 'kg',
  costPerUnit: '', expiryDate: '', dealerName: '',
}

function expiryStatus(dateStr) {
  if (!dateStr) return null
  const now = new Date()
  now.setHours(0, 0, 0, 0)
  const exp = new Date(dateStr)
  const diff = Math.floor((exp - now) / 86400000)
  if (diff < 0) return 'expired'
  if (diff <= 7) return 'expiring'
  return 'ok'
}

function formatDate(str) {
  if (!str) return '—'
  return new Date(str).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
}

function getIngredientEmoji(name = '') {
  const lower = name.toLowerCase()
  if (lower.includes('pizza')) return '🍕'
  if (lower.includes('bun')) return '🍔'
  if (lower.includes('wrap') || lower.includes('tortilla')) return '🌯'
  if (lower.includes('garlic bread')) return '🥖'
  if (lower.includes('fries')) return '🍟'
  if (lower.includes('veg patty')) return '🥬'
  if (lower.includes('chicken')) return '🍗'
  if (lower.includes('paneer')) return '🧀'
  if (lower.includes('cheese')) return '🧀'
  if (lower.includes('butter')) return '🧈'
  if (lower.includes('milk')) return '🥛'
  if (lower.includes('ice cream')) return '🍨'
  if (lower.includes('salt')) return '🧂'
  if (lower.includes('seasoning')) return '🌶️'
  if (lower.includes('oreo')) return '🍪'
  if (lower.includes('kitkat')) return '🍫'
  if (lower.includes('syrup')) return '🍯'
  if (lower.includes('sauce') || lower.includes('mayo')) return '🥫'
  return '📦'
}

function getIngredientVisual(name = '') {
  const emoji = getIngredientEmoji(name)
  const safeName = name.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 560">
      <defs>
        <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="#faf1de"/>
          <stop offset="100%" stop-color="#e9dcc1"/>
        </linearGradient>
      </defs>
      <rect width="800" height="560" fill="url(#bg)" rx="32"/>
      <circle cx="650" cy="110" r="110" fill="#d9c7a5" opacity="0.45"/>
      <circle cx="140" cy="430" r="160" fill="#f5e9cf" opacity="0.75"/>
      <text x="400" y="250" text-anchor="middle" font-size="132">${emoji}</text>
      <text x="400" y="360" text-anchor="middle" font-family="Georgia, serif" font-size="42" fill="#2d3748">${safeName}</text>
      <text x="400" y="410" text-anchor="middle" font-family="Arial, sans-serif" font-size="18" letter-spacing="4" fill="#6b7280">INVENTORY ITEM</text>
    </svg>
  `
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`
}

export default function InventoryPage() {
  const [items, setItems]         = useState(() =>
    loadInventorySnapshot().map((item, i) => ({
      id: item.id ?? `local-${i}`,
      ...item,
      totalCost: Number(item.quantity) * Number(item.costPerUnit || 0),
      visualUrl: getIngredientVisual(item.name),
    }))
  )
  const [form, setForm]           = useState(EMPTY_FORM)
  const [editId, setEditId]       = useState(null)
  const [selectedItem, setSelectedItem] = useState(null)
  const [showForm, setShowForm]   = useState(false)
  const [loading, setLoading]     = useState(false)
  const [searchQ, setSearchQ]     = useState('')
  const [toast, setToast]         = useState(null)
  const [offline, setOffline]     = useState(true)
  const [seeding, setSeeding]     = useState(false)

  useEffect(() => {
    const q = query(collection(db, 'inventory'), orderBy('name'))
    return onSnapshot(q, snap => {
      if (snap.docs.length > 0) {
        const remoteItems = snap.docs.map(d => {
          const item = { id: d.id, ...d.data() }
          return { ...item, visualUrl: getIngredientVisual(item.name) }
        })
        setItems(remoteItems)
        saveInventorySnapshot(remoteItems.map(({ visualUrl, ...item }) => item))
        setOffline(false)
      }
    }, () => { /* Firestore blocked — local data already loaded */ })
  }, [])

  const showToast = useCallback((msg, type = 'success') => {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 3000)
  }, [])

  async function handleSeedInventory() {
    setSeeding(true)
    try {
      const snap = await getDocs(collection(db, 'inventory'))
      for (const d of snap.docs) await deleteDoc(doc(db, 'inventory', d.id))
      const seedItems = buildSeedInventory()
      for (const item of seedItems) {
        await addDoc(collection(db, 'inventory'), {
          ...item,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        })
      }
      saveInventorySnapshot(seedItems)
      showToast('Inventory synced to cloud!')
    } catch {
      showToast('Cloud sync failed — using local data', 'error')
    } finally {
      setSeeding(false)
    }
  }

  const totalCost = (form.quantity && form.costPerUnit)
    ? (parseFloat(form.quantity) * parseFloat(form.costPerUnit)).toFixed(2)
    : null

  function handleChange(e) {
    setForm(f => ({ ...f, [e.target.name]: e.target.value }))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!form.name.trim() || !form.quantity || !form.expiryDate) {
      return showToast('Name, quantity and expiry date are required.', 'error')
    }
    setLoading(true)
    const data = {
      ...form,
      quantity: parseFloat(form.quantity),
      costPerUnit: parseFloat(form.costPerUnit) || 0,
      totalCost: parseFloat(form.quantity) * (parseFloat(form.costPerUnit) || 0),
      updatedAt: serverTimestamp(),
    }
    try {
      if (editId) {
        if (!offline) {
          await updateDoc(doc(db, 'inventory', editId), data)
        }
        const updatedItems = items.map(item =>
          item.id === editId
            ? { ...item, ...data, id: editId, visualUrl: getIngredientVisual(data.name) }
            : item
        )
        setItems(updatedItems)
        saveInventorySnapshot(updatedItems.map(({ visualUrl, ...item }) => item))
        showToast('Item updated.')
      } else {
        let newId = `local-${Date.now()}`
        if (!offline) {
          const ref = await addDoc(collection(db, 'inventory'), { ...data, createdAt: serverTimestamp() })
          newId = ref.id
        }
        const newItem = { ...data, id: newId, visualUrl: getIngredientVisual(data.name) }
        const updatedItems = [newItem, ...items]
        setItems(updatedItems)
        saveInventorySnapshot(updatedItems.map(({ visualUrl, ...item }) => item))
        showToast('Item added to inventory.')
      }
      setForm(EMPTY_FORM)
      setEditId(null)
      setShowForm(false)
    } catch {
      showToast('Failed to save item.', 'error')
    } finally {
      setLoading(false)
    }
  }

  function startEdit(item) {
    setForm({
      name: item.name ?? '',
      description: item.description ?? '',
      quantity: String(item.quantity ?? ''),
      unit: item.unit ?? 'kg',
      costPerUnit: String(item.costPerUnit ?? ''),
      expiryDate: item.expiryDate ?? '',
      dealerName: item.dealerName ?? '',
    })
    setEditId(item.id)
    setShowForm(true)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  async function handleDelete(id) {
    if (!window.confirm('Delete this inventory item?')) return
    try {
      if (!offline && !String(id).startsWith('local-')) {
        await deleteDoc(doc(db, 'inventory', id))
      }
      const updatedItems = items.filter(item => item.id !== id)
      setItems(updatedItems)
      saveInventorySnapshot(updatedItems.map(({ visualUrl, ...item }) => item))
      if (selectedItem?.id === id) setSelectedItem(null)
      showToast('Item deleted.')
    } catch {
      showToast('Failed to delete.', 'error')
    }
  }

  const sorted = [...items]
    .filter(i => i.name?.toLowerCase().includes(searchQ.toLowerCase()))
    .sort((a, b) => a.name.localeCompare(b.name))

  return (
    <div className={`page-enter ${styles.root}`}>
      <div className={styles.pageHead}>
        <div className="page-header">
          <h2 className="page-title">Inventory{offline && <span style={{ fontSize: 13, color: '#d4290c', marginLeft: 8 }}>⚡ Offline</span>}</h2>
          <p className="page-subtitle">{items.length} ingredients in stock</p>
        </div>
        <div className={styles.headActions}>
          <input
            className="form-input"
            style={{ width: 220, fontSize: 13 }}
            placeholder="Search ingredients…"
            value={searchQ}
            onChange={e => setSearchQ(e.target.value)}
          />
          {!offline && (
            <button
              className="btn btn-outline"
              onClick={handleSeedInventory}
              disabled={seeding}
            >
              {seeding ? 'Syncing…' : 'Sync Stock'}
            </button>
          )}
          <button
            className="btn btn-primary"
            onClick={() => { setForm(EMPTY_FORM); setEditId(null); setShowForm(s => !s) }}
          >
            {showForm && !editId ? '✕ Cancel' : '+ Add Ingredient'}
          </button>
        </div>
      </div>

      {/* Add / Edit Form */}
      {showForm && (
        <div className={`card ${styles.formCard}`}>
          <h3 className={styles.formTitle}>{editId ? 'Edit Ingredient' : 'Add Ingredient'}</h3>
          <form onSubmit={handleSubmit} className={styles.form}>
            {/* Row 1 */}
            <div className={styles.formRow}>
              <div className="form-group" style={{ flex: 2 }}>
                <label className="form-label">Ingredient Name *</label>
                <input name="name" className="form-input" value={form.name} onChange={handleChange} placeholder="e.g. Basmati Rice" required />
              </div>
              <div className="form-group" style={{ flex: 2 }}>
                <label className="form-label">Description</label>
                <input name="description" className="form-input" value={form.description} onChange={handleChange} placeholder="Optional note" />
              </div>
            </div>

            {/* Row 2 */}
            <div className={styles.formRow}>
              <div className="form-group" style={{ flex: 1 }}>
                <label className="form-label">Quantity *</label>
                <input name="quantity" type="number" min="0" step="any" className="form-input" value={form.quantity} onChange={handleChange} placeholder="0" required />
              </div>
              <div className="form-group" style={{ flex: 1 }}>
                <label className="form-label">Unit</label>
                <select name="unit" className="form-select" value={form.unit} onChange={handleChange}>
                  {UNITS.map(u => <option key={u} value={u}>{u}</option>)}
                </select>
              </div>
              <div className="form-group" style={{ flex: 1 }}>
                <label className="form-label">Cost / Unit (₹)</label>
                <input name="costPerUnit" type="number" min="0" step="any" className="form-input" value={form.costPerUnit} onChange={handleChange} placeholder="0.00" />
              </div>
              <div className="form-group" style={{ flex: 1 }}>
                <label className="form-label">Total Cost</label>
                <div className={styles.totalCostDisplay}>
                  {totalCost != null ? `₹${totalCost}` : '—'}
                </div>
              </div>
            </div>

            {/* Row 3 */}
            <div className={styles.formRow}>
              <div className="form-group" style={{ flex: 1 }}>
                <label className="form-label">Expiry Date *</label>
                <input name="expiryDate" type="date" className="form-input" value={form.expiryDate} onChange={handleChange} required />
              </div>
              <div className="form-group" style={{ flex: 1 }}>
                <label className="form-label">Dealer Name</label>
                <select name="dealerName" className="form-select" value={form.dealerName} onChange={handleChange}>
                  <option value="">Select dealer</option>
                  {DEALERS.map(dealer => (
                    <option key={dealer.id} value={dealer.name}>{dealer.name}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className={styles.formActions}>
              <button type="button" className="btn btn-outline" onClick={() => { setShowForm(false); setForm(EMPTY_FORM); setEditId(null) }}>
                Cancel
              </button>
              <button type="submit" className="btn btn-primary" disabled={loading}>
                {loading ? <span className="spinner" style={{ width: 14, height: 14 }} /> : null}
                {loading ? 'Saving…' : editId ? 'Save Changes' : 'Add to Inventory'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Inventory Cards */}
      {sorted.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">📦</div>
          <p className="empty-state-text">
            {items.length === 0
              ? 'No ingredients yet. Add your first ingredient above.'
              : 'No results for that search.'}
          </p>
        </div>
      ) : (
        <div className={styles.cardGrid}>
          {sorted.map(item => {
            const status = expiryStatus(item.expiryDate)
            return (
              <article
                key={item.id}
                className={`${styles.stockCard} ${styles[`card_${status}`] ?? ''}`}
                onClick={() => setSelectedItem(item)}
              >
                <div className={styles.cardImageWrap}>
                  <img src={item.visualUrl} alt={item.name} className={styles.cardImage} loading="lazy" />
                  <div className={styles.cardTopBadges}>
                    <span className={styles.qtyBadge}>{item.quantity} {item.unit}</span>
                    {status === 'expired' && <span className={`${styles.statusBadge} ${styles.statusExpired}`}>Expired</span>}
                    {status === 'expiring' && <span className={`${styles.statusBadge} ${styles.statusExpiring}`}>Exp. soon</span>}
                  </div>
                </div>

                <div className={styles.cardBody}>
                  <div>
                    <h3 className={styles.cardTitle}>{item.name}</h3>
                    {item.description && <p className={styles.cardDesc}>{item.description}</p>}
                  </div>

                  <div className={styles.cardMeta}>
                    <div>
                      <span className={styles.metaLabel}>Dealer</span>
                      <span className={styles.metaValue}>{item.dealerName || '—'}</span>
                    </div>
                    <div>
                      <span className={styles.metaLabel}>Expiry</span>
                      <span className={styles.metaValue}>{formatDate(item.expiryDate)}</span>
                    </div>
                  </div>

                  <div className={styles.cardFooter}>
                    <div>
                      <span className={styles.priceLabel}>Cost</span>
                      <strong className={styles.priceValue}>₹{item.costPerUnit?.toFixed(2) ?? '—'} <span className={styles.priceUnit}>/ {item.unit || '—'}</span></strong>
                    </div>
                    <div className={styles.cardActions} onClick={e => e.stopPropagation()}>
                      <button className="btn btn-ghost btn-sm" onClick={() => startEdit(item)}>Edit</button>
                      <button className="btn btn-ghost btn-sm" style={{ color: 'var(--danger)' }} onClick={() => handleDelete(item.id)}>Del</button>
                    </div>
                  </div>
                </div>
              </article>
            )
          })}
        </div>
      )}

      {selectedItem && (
        <div className={styles.overlay} onClick={() => setSelectedItem(null)}>
          <div className={styles.modal} onClick={e => e.stopPropagation()}>
            <button className={styles.closeBtn} onClick={() => setSelectedItem(null)}>✕</button>
            <div className={styles.modalMedia}>
              <img src={selectedItem.visualUrl ?? getIngredientVisual(selectedItem.name)} alt={selectedItem.name} className={styles.modalImage} />
            </div>

            <div className={styles.modalBody}>
              <div className={styles.modalHeader}>
                <div>
                  <h3 className={styles.modalTitle}>{selectedItem.name}</h3>
                  {selectedItem.description && <p className={styles.modalDesc}>{selectedItem.description}</p>}
                </div>
                <span className={styles.modalQty}>{selectedItem.quantity} {selectedItem.unit}</span>
              </div>

              <div className={styles.modalStats}>
                <div className={styles.statCard}>
                  <span className={styles.metaLabel}>Cost / unit</span>
                  <strong className={styles.statValue}>₹{selectedItem.costPerUnit?.toFixed(2) ?? '—'}</strong>
                </div>
                <div className={styles.statCard}>
                  <span className={styles.metaLabel}>Total stock value</span>
                  <strong className={styles.statValue}>₹{selectedItem.totalCost?.toFixed(2) ?? '—'}</strong>
                </div>
                <div className={styles.statCard}>
                  <span className={styles.metaLabel}>Expiry</span>
                  <strong className={styles.statValue}>{formatDate(selectedItem.expiryDate)}</strong>
                </div>
              </div>

              <div className={styles.dealerPanel}>
                <h4 className={styles.panelTitle}>Supplier</h4>
                <p className={styles.panelText}>{selectedItem.dealerName || '—'}</p>
                <p className={styles.panelText}>{selectedItem.dealerPhone || '—'}</p>
                <p className={styles.panelText}>{selectedItem.dealerAddress || '—'}</p>
              </div>
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
