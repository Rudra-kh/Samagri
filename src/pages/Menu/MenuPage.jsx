import { useState, useEffect, useCallback, useRef } from 'react'
import {
  collection, addDoc, updateDoc, deleteDoc, doc,
  query, orderBy, onSnapshot, serverTimestamp,
} from 'firebase/firestore'
import { ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage'
import { db, storage } from '../../firebase/config'
import { MENU_SEED, CATEGORIES as CAT_LIST } from '../../data/menuSeed'
import styles from './MenuPage.module.css'

const CATEGORIES = CAT_LIST.map(c => c.id)

const EMPTY_FORM = { name: '', category: '', price: '', description: '' }

// Simulated OCR: extracts potential dish names from text using common patterns.
// In production, replace with a real Vision API (Google Vision, OpenAI Vision, etc.).
function simulateOCR(filename) {
  return new Promise(resolve => {
    setTimeout(() => {
      // Return simulated extracted dishes for demonstration
      resolve([
        'Paneer Butter Masala',
        'Dal Makhani',
        'Garlic Naan',
        'Jeera Rice',
        'Mango Lassi',
        'Gulab Jamun',
      ])
    }, 1800)
  })
}

export default function MenuPage() {
  const [items, setItems]             = useState([])
  const [form, setForm]               = useState(EMPTY_FORM)
  const [editId, setEditId]           = useState(null)
  const [showForm, setShowForm]       = useState(false)
  const [imageFile, setImageFile]     = useState(null)
  const [imagePreview, setImagePreview] = useState(null)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [loading, setLoading]         = useState(false)
  const [toast, setToast]             = useState(null)
  const [filterCat, setFilterCat]     = useState('All')
  const [searchQ, setSearchQ]         = useState('')

  // Scan menu state
  const [scanMode, setScanMode]       = useState(false)
  const [scanFile, setScanFile]       = useState(null)
  const [scanLoading, setScanLoading] = useState(false)
  const [scannedDishes, setScannedDishes] = useState([])
  const [selectedScanned, setSelectedScanned] = useState([])
  const [scanCategory, setScanCategory] = useState('Main Course')
  const [scanPrice, setScanPrice]     = useState('')
  const scanInputRef = useRef()

  useEffect(() => {
    const q = query(collection(db, 'menu'), orderBy('name'))
    return onSnapshot(q, snap => {
      setItems(snap.docs.map(d => ({ id: d.id, ...d.data() })))
    })
  }, [])

  const showToast = useCallback((msg, type = 'success') => {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 3200)
  }, [])

  function handleChange(e) {
    setForm(f => ({ ...f, [e.target.name]: e.target.value }))
  }

  function handleImageChange(e) {
    const file = e.target.files[0]
    if (!file) return
    setImageFile(file)
    setImagePreview(URL.createObjectURL(file))
  }

  async function uploadImage(file) {
    const storageRef = ref(storage, `menu/${Date.now()}_${file.name}`)
    return new Promise((resolve, reject) => {
      const task = uploadBytesResumable(storageRef, file)
      task.on('state_changed',
        snap => setUploadProgress(Math.round(snap.bytesTransferred / snap.totalBytes * 100)),
        reject,
        async () => {
          const url = await getDownloadURL(task.snapshot.ref)
          resolve(url)
        }
      )
    })
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!form.name.trim() || !form.price) return showToast('Name and price are required.', 'error')
    setLoading(true)
    try {
      let imageUrl = form.imageUrl ?? null
      if (imageFile) {
        imageUrl = await uploadImage(imageFile)
        setUploadProgress(0)
      }
      const data = {
        name: form.name.trim(),
        category: form.category,
        price: parseFloat(form.price),
        description: form.description,
        imageUrl,
        updatedAt: serverTimestamp(),
      }
      if (editId) {
        await updateDoc(doc(db, 'menu', editId), data)
        showToast('Menu item updated.')
      } else {
        await addDoc(collection(db, 'menu'), { ...data, createdAt: serverTimestamp() })
        showToast('Menu item added.')
      }
      resetForm()
    } catch (err) {
      showToast('Failed to save item.', 'error')
    } finally {
      setLoading(false)
    }
  }

  function resetForm() {
    setForm(EMPTY_FORM)
    setEditId(null)
    setImageFile(null)
    setImagePreview(null)
    setShowForm(false)
  }

  function startEdit(item) {
    setForm({
      name: item.name ?? '',
      category: item.category ?? '',
      price: String(item.price ?? ''),
      description: item.description ?? '',
      imageUrl: item.imageUrl ?? '',
    })
    setEditId(item.id)
    setImagePreview(item.imageUrl ?? null)
    setShowForm(true)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  async function handleDelete(id) {
    if (!window.confirm('Delete this menu item?')) return
    try {
      await deleteDoc(doc(db, 'menu', id))
      showToast('Item deleted.')
    } catch {
      showToast('Failed to delete.', 'error')
    }
  }

  async function handleSeedMenu() {
    if (!window.confirm(`This will add ${MENU_SEED.length} menu items from the Samagri menu. Continue?`)) return
    setLoading(true)
    try {
      for (const item of MENU_SEED) {
        await addDoc(collection(db, 'menu'), {
          ...item,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        })
      }
      showToast(`${MENU_SEED.length} menu items loaded successfully!`)
    } catch (err) {
      showToast('Failed to load menu items.', 'error')
    } finally {
      setLoading(false)
    }
  }

  // Scan Menu
  async function handleScanUpload(e) {
    const file = e.target.files[0]
    if (!file) return
    setScanFile(file)
    setScanLoading(true)
    setScannedDishes([])
    setSelectedScanned([])
    const dishes = await simulateOCR(file.name)
    setScanLoading(false)
    setScannedDishes(dishes)
    setSelectedScanned(dishes.map((_, i) => i))
  }

  function toggleSelected(idx) {
    setSelectedScanned(prev =>
      prev.includes(idx) ? prev.filter(i => i !== idx) : [...prev, idx]
    )
  }

  async function confirmScanSave() {
    const toSave = selectedScanned.map(i => scannedDishes[i]).filter(Boolean)
    if (!toSave.length) return showToast('No items selected.', 'error')
    if (!scanPrice) return showToast('Set a price before saving.', 'error')
    setLoading(true)
    try {
      for (const name of toSave) {
        await addDoc(collection(db, 'menu'), {
          name,
          category: scanCategory,
          price: parseFloat(scanPrice),
          imageUrl: null,
          createdAt: serverTimestamp(),
        })
      }
      showToast(`${toSave.length} dish${toSave.length > 1 ? 'es' : ''} added.`)
      setScanMode(false)
      setScanFile(null)
      setScannedDishes([])
      setSelectedScanned([])
      setScanPrice('')
    } catch {
      showToast('Failed to save scanned items.', 'error')
    } finally {
      setLoading(false)
    }
  }

  const categories = ['All', ...CATEGORIES]
  const filtered = items.filter(item => {
    const matchCat = filterCat === 'All' || item.category === filterCat
    const matchQ = item.name?.toLowerCase().includes(searchQ.toLowerCase())
    return matchCat && matchQ
  })

  return (
    <div className={`page-enter ${styles.root}`}>
      <div className={styles.pageHead}>
        <div className="page-header">
          <h2 className="page-title">Menu</h2>
          <p className="page-subtitle">Manage your restaurant's dishes</p>
        </div>
        <div className={styles.headActions}>
          {items.length === 0 && (
            <button className="btn btn-green" onClick={handleSeedMenu} disabled={loading}>
              {loading ? <span className="spinner" style={{ width: 14, height: 14, borderTopColor: '#fff' }} /> : '🌿'}
              {loading ? 'Loading…' : 'Load Sample Menu'}
            </button>
          )}
          <button className="btn btn-outline" onClick={() => { setScanMode(s => !s); setShowForm(false) }}>
            📷 Scan Menu
          </button>
          <button
            className="btn btn-primary"
            onClick={() => { resetForm(); setShowForm(s => !s); setScanMode(false) }}
          >
            {showForm && !editId ? '✕ Cancel' : '+ Add Item'}
          </button>
        </div>
      </div>

      {/* Add / Edit Form */}
      {showForm && (
        <div className={`card ${styles.formCard}`}>
          <h3 className={styles.formTitle}>{editId ? 'Edit Menu Item' : 'Add Menu Item'}</h3>
          <form onSubmit={handleSubmit} className={styles.form}>
            <div className={styles.formBody}>
              <div className={styles.formFields}>
                <div className={styles.formRow}>
                  <div className="form-group" style={{ flex: 2 }}>
                    <label className="form-label">Dish Name *</label>
                    <input name="name" className="form-input" value={form.name} onChange={handleChange} placeholder="e.g. Paneer Tikka" required />
                  </div>
                  <div className="form-group" style={{ flex: 1 }}>
                    <label className="form-label">Category</label>
                    <select name="category" className="form-select" value={form.category} onChange={handleChange}>
                      <option value="">Select…</option>
                      {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>
                  <div className="form-group" style={{ flex: 1 }}>
                    <label className="form-label">Price (₹) *</label>
                    <input name="price" type="number" min="0" step="0.01" className="form-input" value={form.price} onChange={handleChange} placeholder="0.00" required />
                  </div>
                </div>
                <div className="form-group">
                  <label className="form-label">Description</label>
                  <input name="description" className="form-input" value={form.description} onChange={handleChange} placeholder="Optional description" />
                </div>
              </div>

              {/* Image upload */}
              <div className={styles.imageUploadArea}>
                {imagePreview ? (
                  <div className={styles.imagePreviewWrap}>
                    <img src={imagePreview} alt="preview" className={styles.imagePreview} />
                    <button type="button" className={styles.clearImg} onClick={() => { setImageFile(null); setImagePreview(null) }}>✕</button>
                  </div>
                ) : (
                  <label className={styles.imageUploadLabel}>
                    <span className={styles.uploadIcon}>🖼️</span>
                    <span>Upload Image</span>
                    <span className={styles.uploadHint}>Optional · JPG, PNG</span>
                    <input type="file" accept="image/*" style={{ display: 'none' }} onChange={handleImageChange} />
                  </label>
                )}
                {uploadProgress > 0 && uploadProgress < 100 && (
                  <div className={styles.progressBar}>
                    <div style={{ width: `${uploadProgress}%` }} />
                  </div>
                )}
              </div>
            </div>

            <div className={styles.formActions}>
              <button type="button" className="btn btn-outline" onClick={resetForm}>Cancel</button>
              <button type="submit" className="btn btn-primary" disabled={loading}>
                {loading ? <span className="spinner" style={{ width: 14, height: 14 }} /> : null}
                {loading ? 'Saving…' : editId ? 'Save Changes' : 'Add to Menu'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Scan Menu Mode */}
      {scanMode && (
        <div className={`card ${styles.formCard}`}>
          <h3 className={styles.formTitle}>📷 Scan Menu Photo</h3>
          <p style={{ fontSize: 13, color: 'var(--slate)', marginBottom: 16 }}>
            Upload a photo of a menu — dish names will be extracted and you can select which to save.
          </p>
          {!scannedDishes.length ? (
            <label className={styles.scanUpload}>
              {scanLoading ? (
                <><span className="spinner" style={{ width: 28, height: 28 }} /><span>Analyzing image…</span></>
              ) : (
                <>
                  <span style={{ fontSize: 32 }}>📸</span>
                  <span style={{ fontWeight: 600, color: 'var(--charcoal)' }}>Click to upload menu photo</span>
                  <span style={{ fontSize: 12, color: 'var(--slate)' }}>JPG, PNG · max 10 MB</span>
                </>
              )}
              <input ref={scanInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleScanUpload} disabled={scanLoading} />
            </label>
          ) : (
            <div className={styles.scanResults}>
              <p style={{ fontSize: 13, fontWeight: 600, marginBottom: 12, color: 'var(--charcoal)' }}>
                Found {scannedDishes.length} dishes — select which to add:
              </p>
              <div className={styles.scannedList}>
                {scannedDishes.map((dish, i) => (
                  <label key={i} className={`${styles.scannedItem} ${selectedScanned.includes(i) ? styles.scannedItemSelected : ''}`}>
                    <input type="checkbox" checked={selectedScanned.includes(i)} onChange={() => toggleSelected(i)} />
                    <span>{dish}</span>
                  </label>
                ))}
              </div>
              <div className={styles.scanSave}>
                <div className="form-group">
                  <label className="form-label">Category</label>
                  <select className="form-select" value={scanCategory} onChange={e => setScanCategory(e.target.value)}>
                    {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Price (₹)</label>
                  <input type="number" className="form-input" value={scanPrice} onChange={e => setScanPrice(e.target.value)} placeholder="e.g. 180" />
                </div>
                <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end' }}>
                  <button className="btn btn-outline" onClick={() => { setScanMode(false); setScannedDishes([]); setScanFile(null) }}>Cancel</button>
                  <button className="btn btn-primary" onClick={confirmScanSave} disabled={loading || !selectedScanned.length}>
                    Save {selectedScanned.length} item{selectedScanned.length !== 1 ? 's' : ''}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Filters */}
      <div className={styles.filters}>
        <div className={styles.catFilter}>
          {categories.map(cat => (
            <button
              key={cat}
              className={`${styles.catBtn} ${filterCat === cat ? styles.catBtnActive : ''}`}
              onClick={() => setFilterCat(cat)}
            >
              {cat}
            </button>
          ))}
        </div>
        <input
          className="form-input"
          style={{ width: 200, fontSize: 13 }}
          placeholder="Search dishes…"
          value={searchQ}
          onChange={e => setSearchQ(e.target.value)}
        />
      </div>

      {/* Menu Grid */}
      {filtered.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">🍽️</div>
          <p className="empty-state-text">
            {items.length === 0 ? 'No menu items yet.' : 'No items match your filters.'}
          </p>
        </div>
      ) : (
        <div className={styles.menuGrid}>
          {filtered.map(item => (
            <div key={item.id} className={`card ${styles.menuCard}`}>
              {item.imageUrl ? (
                <img src={item.imageUrl} alt={item.name} className={styles.menuImg} />
              ) : (
                <div className={styles.menuImgPlaceholder}>🍽️</div>
              )}
              <div className={styles.menuCardBody}>
                {item.category && <span className="badge badge-neutral">{item.category}</span>}
                <h4 className={styles.menuName}>{item.name}</h4>
                {item.description && <p className={styles.menuDesc}>{item.description}</p>}
                <div className={styles.menuCardFooter}>
                  <span className={styles.menuPrice}>₹{item.price?.toFixed(2)}</span>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button className="btn btn-ghost btn-sm" onClick={() => startEdit(item)}>Edit</button>
                    <button className="btn btn-ghost btn-sm" style={{ color: 'var(--danger)' }} onClick={() => handleDelete(item.id)}>Del</button>
                  </div>
                </div>
              </div>
            </div>
          ))}
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
