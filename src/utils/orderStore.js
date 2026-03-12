const STORAGE_KEY = 'samagri.orders'
const LEGACY_STORAGE_KEY = 'maalmasala.orders'

function normalizeOrder(order) {
  return {
    ...order,
    items: Array.isArray(order.items) ? order.items : [],
    status: order.status ?? 'pending',
    sourceLabel: order.sourceLabel ?? buildOrderSource(order.orderType, order.platform),
    createdAtMs: order.createdAtMs ?? Date.now(),
  }
}

export function buildOrderSource(orderType, platform) {
  if (orderType === 'dine-in') return 'Dine In'
  if (platform === 'Swiggy' || platform === 'Zomato') return platform
  return 'Take Away'
}

export function createOrderNumber(existingOrders = []) {
  const maxOrder = existingOrders.reduce((max, order) => {
    const value = Number(String(order.orderNumber ?? '').replace(/[^0-9]/g, ''))
    return Number.isFinite(value) ? Math.max(max, value) : max
  }, 0)
  return String(maxOrder + 1).padStart(3, '0')
}

export function loadOrdersSnapshot() {
  if (typeof window === 'undefined') return []

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY) ?? window.localStorage.getItem(LEGACY_STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.map(normalizeOrder)
  } catch {
    return []
  }
}

export function saveOrdersSnapshot(orders) {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(orders.map(normalizeOrder)))
}

export function sortOrdersNewestFirst(orders) {
  return [...orders].sort((a, b) => (b.createdAtMs ?? 0) - (a.createdAtMs ?? 0))
}
