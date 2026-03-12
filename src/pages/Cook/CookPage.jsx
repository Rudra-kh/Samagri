import { useEffect, useMemo, useState } from 'react'
import { collection, doc, onSnapshot, orderBy, query, serverTimestamp, updateDoc } from 'firebase/firestore'
import { db } from '../../firebase/config'
import { RECIPE_BOOK } from '../../data/recipeBook'
import { buildOrderSource, loadOrdersSnapshot, saveOrdersSnapshot, sortOrdersNewestFirst } from '../../utils/orderStore'
import styles from './CookPage.module.css'

function formatOrderTime(order) {
  const value = order.createdAtMs ?? Date.now()
  return new Date(value).toLocaleTimeString('en-IN', {
    hour: '2-digit',
    minute: '2-digit',
  })
}

function formatIngredient(ingredient, qtyMultiplier) {
  return `${ingredient.name} (${ingredient.quantity * qtyMultiplier} ${ingredient.unit})`
}

export default function CookPage({ onBack }) {
  const [orders, setOrders] = useState(() => sortOrdersNewestFirst(loadOrdersSnapshot()))
  const [expandedItems, setExpandedItems] = useState({})
  const [offline, setOffline] = useState(true)

  useEffect(() => {
    const q = query(collection(db, 'orders'), orderBy('createdAt', 'desc'))
    return onSnapshot(q, snap => {
      if (snap.docs.length > 0) {
        const remoteOrders = snap.docs.map(d => {
          const data = d.data()
          const createdAtMs = data.createdAt?.toMillis?.() ?? data.createdAtMs ?? Date.now()
          return {
            id: d.id,
            ...data,
            createdAtMs,
            sourceLabel: data.sourceLabel ?? buildOrderSource(data.orderType, data.platform),
          }
        })
        const normalized = sortOrdersNewestFirst(remoteOrders)
        setOrders(normalized)
        saveOrdersSnapshot(normalized)
        setOffline(false)
      }
    }, () => {
      setOffline(true)
    })
  }, [])

  const activeOrders = useMemo(
    () => orders.filter(order => order.status !== 'completed'),
    [orders]
  )
  const completedOrders = useMemo(
    () => orders.filter(order => order.status === 'completed'),
    [orders]
  )

  function toggleItem(orderId, itemName) {
    const key = `${orderId}:${itemName}`
    setExpandedItems(prev => ({ ...prev, [key]: !prev[key] }))
  }

  async function toggleComplete(orderId, checked) {
    const updated = sortOrdersNewestFirst(
      orders.map(order => order.id === orderId ? { ...order, status: checked ? 'completed' : 'pending' } : order)
    )
    setOrders(updated)
    saveOrdersSnapshot(updated)

    if (!offline && !String(orderId).startsWith('local-order-')) {
      try {
        await updateDoc(doc(db, 'orders', orderId), {
          status: checked ? 'completed' : 'pending',
          updatedAt: serverTimestamp(),
        })
      } catch {
        // keep local state if cloud update fails
      }
    }
  }

  function renderOrderCard(order) {
    return (
      <article key={order.id} className={styles.orderCard}>
        <div className={styles.cardHead}>
          <div className={styles.orderMetaRow}>
            <label className={styles.checkWrap}>
              <input
                type="checkbox"
                checked={order.status === 'completed'}
                onChange={e => toggleComplete(order.id, e.target.checked)}
              />
              <span className={styles.orderNo}>Order #{order.orderNumber ?? '---'}</span>
            </label>
            <span className={styles.sourceBadge}>{order.sourceLabel}</span>
          </div>
          <div className={styles.orderSubRow}>
            <span>{formatOrderTime(order)}</span>
            {order.table && <span>Table {order.table}</span>}
            <span>{order.items?.length ?? 0} items</span>
            <span>₹{Number(order.subtotal ?? 0).toFixed(0)}</span>
          </div>
        </div>

        <div className={styles.itemsList}>
          {(order.items ?? []).map(item => {
            const expandKey = `${order.id}:${item.name}`
            const recipe = RECIPE_BOOK[item.name] ?? []
            const isExpanded = Boolean(expandedItems[expandKey])
            return (
              <div key={`${order.id}-${item.name}`} className={styles.itemRowWrap}>
                <div className={styles.itemRow}>
                  <div>
                    <div className={styles.itemName}>{item.name}</div>
                    <div className={styles.itemQty}>Qty {item.qty}</div>
                  </div>
                  <div className={styles.itemActions}>
                    <span className={styles.itemPrice}>₹{Number(item.price * item.qty).toFixed(0)}</span>
                    <button
                      className={styles.expandBtn}
                      onClick={() => toggleItem(order.id, item.name)}
                      aria-expanded={isExpanded}
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={isExpanded ? styles.chevronOpen : ''}>
                        <polyline points="6 9 12 15 18 9" />
                      </svg>
                    </button>
                  </div>
                </div>
                {isExpanded && (
                  <div className={styles.recipePanel}>
                    {recipe.length > 0 ? (
                      recipe.map(ingredient => (
                        <div key={`${item.name}-${ingredient.name}`} className={styles.recipeLine}>
                          {formatIngredient(ingredient, item.qty)}
                        </div>
                      ))
                    ) : (
                      <div className={styles.recipeLine}>No ingredient recipe mapped yet.</div>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </article>
    )
  }

  return (
    <div className={styles.root}>
      <div className={styles.topBar}>
        <button className={styles.backBtn} onClick={onBack}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6" />
          </svg>
          Back
        </button>
        <div>
          <h1 className={styles.title}>Cook Dashboard{offline && <span className={styles.offlineTag}>Offline</span>}</h1>
          <p className={styles.subtitle}>Track live orders, ingredient requirements, and completed tickets.</p>
        </div>
      </div>

      <section className={styles.section}>
        <div className={styles.sectionHead}>
          <h2 className={styles.sectionTitle}>Active Orders</h2>
          <span className={styles.sectionCount}>{activeOrders.length}</span>
        </div>
        {activeOrders.length === 0 ? (
          <div className={styles.emptyCard}>No active orders yet.</div>
        ) : (
          <div className={styles.orderGrid}>
            {activeOrders.map(renderOrderCard)}
          </div>
        )}
      </section>

      <section className={styles.section}>
        <div className={styles.sectionHead}>
          <h2 className={styles.sectionTitle}>Completed Orders</h2>
          <span className={styles.sectionCount}>{completedOrders.length}</span>
        </div>
        {completedOrders.length === 0 ? (
          <div className={styles.emptyCard}>No completed orders yet.</div>
        ) : (
          <div className={styles.orderGrid}>
            {completedOrders.map(renderOrderCard)}
          </div>
        )}
      </section>
    </div>
  )
}
