import { INVENTORY_SEED } from '../data/inventorySeed'
import { RECIPE_BOOK } from '../data/recipeBook'

const STORAGE_KEY = 'samagri.inventory'
const LEGACY_STORAGE_KEY = 'maalmasala.inventory'
const OREO_PIECES_PER_PACK = 12

function roundQuantity(value, unit) {
  if (unit === 'pcs' || unit === 'pack' || unit === 'dozen' || unit === 'box' || unit === 'bag' || unit === 'bottle') {
    return Number(Math.max(0, value).toFixed(2))
  }
  return Number(Math.max(0, value).toFixed(3))
}

export function normalizeIngredientName(name = '') {
  const lower = name.toLowerCase().trim()
  if (lower.includes('cheese')) return 'cheese'
  if (lower.includes('mayo (plain)') || lower === 'mayo') return 'mayo'
  if (lower.includes('tandoori mayo')) return 'tandoori mayo'
  if (lower.includes('chipotle mayo')) return 'chipotle mayo'
  if (lower.includes('fries')) return 'fries'
  if (lower.includes('frankie wrap')) return 'frankie wrap'
  if (lower.includes('ice cream')) return 'ice cream'
  if (lower.includes('oreo')) return 'oreo cookies'
  return lower.replace(/\([^)]*\)/g, '').replace(/[^a-z0-9]+/g, ' ').trim()
}

function convertQuantity(quantity, fromUnit, toUnit, ingredientName) {
  const from = fromUnit.toLowerCase()
  const to = toUnit.toLowerCase()

  if (from === to) return quantity

  if (from === 'g' && to === 'kg') return quantity / 1000
  if (from === 'kg' && to === 'g') return quantity * 1000
  if (from === 'ml' && to === 'l') return quantity / 1000
  if (from === 'l' && to === 'ml') return quantity * 1000
  if (from === 'pcs' && to === 'pack' && normalizeIngredientName(ingredientName) === 'oreo cookies') {
    return quantity / OREO_PIECES_PER_PACK
  }
  if (from === 'pack' && to === 'pcs' && normalizeIngredientName(ingredientName) === 'oreo cookies') {
    return quantity * OREO_PIECES_PER_PACK
  }

  return quantity
}

export function buildSeedInventory() {
  return INVENTORY_SEED.map(item => ({
    ...item,
    totalCost: Number(item.quantity) * Number(item.costPerUnit || 0),
  }))
}

export function loadInventorySnapshot() {
  if (typeof window === 'undefined') return buildSeedInventory()

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY) ?? window.localStorage.getItem(LEGACY_STORAGE_KEY)
    if (!raw) return buildSeedInventory()
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed) || parsed.length === 0) return buildSeedInventory()
    return parsed.map(item => ({
      ...item,
      totalCost: Number(item.quantity) * Number(item.costPerUnit || 0),
    }))
  } catch {
    return buildSeedInventory()
  }
}

export function saveInventorySnapshot(items) {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(items))
}

export function applyOrderToInventory(items, cartItems) {
  const nextItems = items.map(item => ({ ...item }))
  const indexByName = new Map(
    nextItems.map((item, index) => [normalizeIngredientName(item.name), index])
  )

  for (const cartItem of cartItems) {
    const recipe = RECIPE_BOOK[cartItem.name] ?? []
    for (const ingredient of recipe) {
      const index = indexByName.get(normalizeIngredientName(ingredient.name))
      if (index == null) continue

      const stockItem = nextItems[index]
      const required = convertQuantity(
        ingredient.quantity * cartItem.qty,
        ingredient.unit,
        stockItem.unit,
        ingredient.name
      )

      const updatedQty = roundQuantity(Number(stockItem.quantity || 0) - required, stockItem.unit)
      stockItem.quantity = updatedQty
      stockItem.totalCost = Number((updatedQty * Number(stockItem.costPerUnit || 0)).toFixed(2))
    }
  }

  return nextItems
}
