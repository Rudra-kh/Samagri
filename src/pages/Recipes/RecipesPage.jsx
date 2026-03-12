import { useState, useEffect, useCallback, useMemo } from 'react'
import {
  collection, addDoc, deleteDoc, doc,
  query, orderBy, onSnapshot, serverTimestamp,
} from 'firebase/firestore'
import { db } from '../../firebase/config'
import { MENU_SEED, CATEGORIES } from '../../data/menuSeed'
import { RECIPE_BOOK } from '../../data/recipeBook'
import { loadInventorySnapshot, normalizeIngredientName } from '../../utils/inventoryStore'
import styles from './RecipesPage.module.css'

const UNITS = ['g', 'kg', 'mL', 'L', 'tsp', 'tbsp', 'cup', 'pcs', 'pinch']

const EMPTY_INGREDIENT = { name: '', qty: '', unit: 'g' }

function convertQuantity(quantity, fromUnit, toUnit, ingredientName) {
  const from = String(fromUnit).toLowerCase()
  const to = String(toUnit).toLowerCase()

  if (from === to) return quantity
  if (from === 'g' && to === 'kg') return quantity / 1000
  if (from === 'kg' && to === 'g') return quantity * 1000
  if (from === 'ml' && to === 'l') return quantity / 1000
  if (from === 'l' && to === 'ml') return quantity * 1000
  if (from === 'pcs' && to === 'pack' && normalizeIngredientName(ingredientName) === 'oreo cookies') return quantity / 12
  if (from === 'pack' && to === 'pcs' && normalizeIngredientName(ingredientName) === 'oreo cookies') return quantity * 12

  return quantity
}

function calculateIngredientCost(ingredient, inventoryItems) {
  const stockItem = inventoryItems.find(item => normalizeIngredientName(item.name) === normalizeIngredientName(ingredient.name))
  if (!stockItem) return 0

  const qty = Number(ingredient.qty || 0)
  const stockCost = Number(stockItem.costPerUnit || 0)
  const convertedQty = convertQuantity(qty, ingredient.unit, stockItem.unit, ingredient.name)
  return convertedQty * stockCost
}

export default function RecipesPage() {
  const [menuItems, setMenuItems]   = useState(MENU_SEED)
  const [inventoryItems, setInventoryItems] = useState(() => loadInventorySnapshot())
  const [recipes, setRecipes]       = useState([])
  const [dishName, setDishName]     = useState('')
  const [dishCategory, setDishCategory] = useState(CATEGORIES[0]?.id ?? '')
  const [ingredients, setIngredients] = useState([{ ...EMPTY_INGREDIENT }])
  const [sellingPrice, setSellingPrice] = useState('')
  const [recipeSearchQ, setRecipeSearchQ] = useState('')
  const [saving, setSaving]         = useState(false)
  const [expandedRecipe, setExpandedRecipe] = useState(null)
  const [toast, setToast]           = useState(null)

  useEffect(() => {
    const q1 = query(collection(db, 'menu'), orderBy('name'))
    const qInventory = query(collection(db, 'inventory'), orderBy('name'))
    const q2 = query(collection(db, 'recipes'), orderBy('dishName'))
    const unsub1 = onSnapshot(q1, snap => {
      if (snap.docs.length > 0) {
        setMenuItems(snap.docs.map(d => ({ id: d.id, ...d.data() })))
      }
    }, () => {})
    const unsubInventory = onSnapshot(qInventory, snap => {
      if (snap.docs.length > 0) {
        setInventoryItems(snap.docs.map(d => ({ id: d.id, ...d.data() })))
      }
    }, () => {})
    const unsub2 = onSnapshot(q2, snap => setRecipes(snap.docs.map(d => ({ id: d.id, ...d.data() }))))
    return () => { unsub1(); unsubInventory(); unsub2() }
  }, [])

  const showToast = useCallback((msg, type = 'success') => {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 3000)
  }, [])


  const matchedMenuDish = useMemo(() => {
    const normalizedName = dishName.trim().toLowerCase()
    if (!normalizedName) return null
    return menuItems.find(item => item.name?.trim().toLowerCase() === normalizedName) ?? null
  }, [dishName, menuItems])

  useEffect(() => {
    if (!matchedMenuDish) return

    if (matchedMenuDish.category && matchedMenuDish.category !== dishCategory) {
      setDishCategory(matchedMenuDish.category)
    }

    if (matchedMenuDish.price != null && String(matchedMenuDish.price) !== sellingPrice) {
      setSellingPrice(String(matchedMenuDish.price))
    }

    if (RECIPE_BOOK[matchedMenuDish.name]) {
      setIngredients(current => {
        const hasTypedValues = current.some(ingredient => ingredient.name.trim() || ingredient.qty)
        if (hasTypedValues) return current
        return RECIPE_BOOK[matchedMenuDish.name].map(ingredient => ({
          name: ingredient.name,
          qty: String(ingredient.quantity),
          unit: ingredient.unit,
        }))
      })
    }
  }, [matchedMenuDish, dishCategory, sellingPrice])

  function addIngredientRow() {
    setIngredients(prev => [...prev, { ...EMPTY_INGREDIENT }])
  }

  function removeIngredientRow(i) {
    setIngredients(prev => prev.filter((_, idx) => idx !== i))
  }

  function updateIngredient(i, field, value) {
    setIngredients(prev => prev.map((ing, idx) => idx === i ? { ...ing, [field]: value } : ing))
  }

  const ingredientOptions = useMemo(
    () => inventoryItems.map(item => item.name).sort((a, b) => a.localeCompare(b)),
    [inventoryItems]
  )

  const autoCost = useMemo(() => {
    const filled = ingredients.filter(i => i.name.trim() && i.qty)
    return filled.reduce((sum, ingredient) => sum + calculateIngredientCost(ingredient, inventoryItems), 0)
  }, [ingredients, inventoryItems])

  const cost = autoCost
  const sell = parseFloat(sellingPrice) || 0
  const profit = sell - cost
  const margin = sell > 0 ? ((profit / sell) * 100).toFixed(1) : null
  const markup = cost > 0 ? ((profit / cost) * 100).toFixed(1) : null

  const seededRecipes = useMemo(() => {
    return menuItems
      .filter(item => RECIPE_BOOK[item.name])
      .map(item => {
        const presetIngredients = RECIPE_BOOK[item.name].map(ingredient => ({
          name: ingredient.name,
          qty: ingredient.quantity,
          unit: ingredient.unit,
        }))
        const recipeCost = presetIngredients.reduce((sum, ingredient) => sum + calculateIngredientCost(ingredient, inventoryItems), 0)
        const recipeProfit = Number(item.price || 0) - recipeCost
        const recipeMargin = Number(item.price || 0) > 0 ? Number(((recipeProfit / Number(item.price || 0)) * 100).toFixed(1)) : null
        const recipeMarkup = recipeCost > 0 ? Number(((recipeProfit / recipeCost) * 100).toFixed(1)) : null
        return {
          id: `seed-${item.name}`,
          dishName: item.name,
          ingredients: presetIngredients,
          costPrice: recipeCost,
          sellingPrice: Number(item.price || 0),
          profit: recipeProfit,
          margin: recipeMargin,
          markup: recipeMarkup,
          seeded: true,
        }
      })
  }, [menuItems, inventoryItems])

  const displayRecipes = useMemo(() => {
    const recipeMap = new Map(seededRecipes.map(recipe => [recipe.dishName, recipe]))
    recipes.forEach(recipe => recipeMap.set(recipe.dishName, recipe))
    return Array.from(recipeMap.values()).sort((a, b) => a.dishName.localeCompare(b.dishName))
  }, [recipes, seededRecipes])

  const filteredDisplayRecipes = useMemo(() => {
    const q = recipeSearchQ.trim().toLowerCase()
    if (!q) return displayRecipes
    return displayRecipes.filter(recipe =>
      recipe.dishName?.toLowerCase().includes(q) ||
      recipe.dishCategory?.toLowerCase().includes(q)
    )
  }, [displayRecipes, recipeSearchQ])

  async function handleSave() {
    if (!dishName.trim()) return showToast('Enter a dish name first.', 'error')
    if (!dishCategory) return showToast('Select a category first.', 'error')
    const filled = ingredients.filter(i => i.name.trim() && i.qty)
    if (!filled.length) return showToast('Add at least one ingredient.', 'error')
    setSaving(true)
    try {
      await addDoc(collection(db, 'recipes'), {
        dishId: matchedMenuDish?.id ?? null,
        dishName: dishName.trim(),
        dishCategory,
        ingredients: filled,
        costPrice: cost,
        sellingPrice: sell,
        profit,
        margin: parseFloat(margin),
        markup: parseFloat(markup),
        createdAt: serverTimestamp(),
      })
      setDishName('')
      setDishCategory(CATEGORIES[0]?.id ?? '')
      setIngredients([{ ...EMPTY_INGREDIENT }])
      setSellingPrice('')
      showToast('Recipe saved!')
    } catch {
      showToast('Failed to save recipe.', 'error')
    } finally {
      setSaving(false)
    }
  }

  async function deleteRecipe(id) {
    if (!window.confirm('Delete this recipe?')) return
    try {
      await deleteDoc(doc(db, 'recipes', id))
      showToast('Recipe deleted.')
    } catch {
      showToast('Failed to delete.', 'error')
    }
  }

  return (
    <div className={`page-enter ${styles.root}`}>
      {/* Left: Recipe Builder */}
      <div className={styles.builderPanel}>
        <div className="page-header">
          <h2 className="page-title">Recipes</h2>
          <p className="page-subtitle">Build and cost your dishes</p>
        </div>

        {/* Dish Details */}
        <div className={`card ${styles.section}`}>
          <h3 className={styles.sectionTitle}>1. Dish Details</h3>
          <div className={styles.dishFieldsGrid}>
            <div className="form-group">
              <label className="form-label">Name Your Dish</label>
              <input
                className="form-input"
                placeholder="e.g. Margherita"
                value={dishName}
                onChange={e => setDishName(e.target.value)}
              />
            </div>
            <div className="form-group">
              <label className="form-label">Category</label>
              <select
                className="form-select"
                value={dishCategory}
                onChange={e => setDishCategory(e.target.value)}
              >
                {CATEGORIES.map(category => (
                  <option key={category.id} value={category.id}>{category.label}</option>
                ))}
              </select>
            </div>
          </div>
          {matchedMenuDish && (
            <div className={styles.selectedDishBadge}>
              <span>✓</span> Matched menu item: {matchedMenuDish.name} — ₹{matchedMenuDish.price?.toFixed(2)}
            </div>
          )}
        </div>

        {/* Ingredients */}
        <div className={`card ${styles.section}`}>
          <div className={styles.sectionHeader}>
            <h3 className={styles.sectionTitle}>2. Ingredients</h3>
          </div>
          <div className={styles.ingredientList}>
            {ingredients.map((ing, i) => (
              <div key={i} className={styles.ingRow}>
                <input
                  list={`ingredient-options-${i}`}
                  className="form-input"
                  placeholder="Search ingredient"
                  value={ing.name}
                  onChange={e => updateIngredient(i, 'name', e.target.value)}
                  style={{ flex: 2 }}
                />
                <datalist id={`ingredient-options-${i}`}>
                  {ingredientOptions.map(option => <option key={option} value={option} />)}
                </datalist>
                <input
                  className="form-input"
                  type="number"
                  placeholder="Qty"
                  value={ing.qty}
                  min="0"
                  step="any"
                  onChange={e => updateIngredient(i, 'qty', e.target.value)}
                  style={{ flex: 1, minWidth: 70 }}
                />
                <select
                  className="form-select"
                  value={ing.unit}
                  onChange={e => updateIngredient(i, 'unit', e.target.value)}
                  style={{ flex: 1, minWidth: 70 }}
                >
                  {UNITS.map(u => <option key={u} value={u}>{u}</option>)}
                </select>
                {ingredients.length > 1 && (
                  <button className={styles.removeIngBtn} onClick={() => removeIngredientRow(i)}>×</button>
                )}
              </div>
            ))}
          </div>
          <button className="btn btn-ghost btn-sm" style={{ marginTop: 8 }} onClick={addIngredientRow}>
            + Add Ingredient
          </button>
        </div>

        {/* Pricing */}
        <div className={`card ${styles.section}`}>
          <h3 className={styles.sectionTitle}>3. Pricing & Margins</h3>
          <div className={styles.pricingRow}>
            <div className="form-group" style={{ flex: 1 }}>
              <label className="form-label">Auto Cost Price (₹)</label>
              <div className={styles.autoCostDisplay}>₹{cost.toFixed(2)}</div>
            </div>
            <div className="form-group" style={{ flex: 1 }}>
              <label className="form-label">Selling Price (₹)</label>
              <input
                type="number" min="0" step="0.01" className="form-input"
                value={sellingPrice} onChange={e => setSellingPrice(e.target.value)}
                placeholder="0.00"
              />
            </div>
          </div>

          {(cost > 0 || sell > 0) && (
            <div className={styles.marginDisplay}>
              <div className={styles.marginStat}>
                <span className={styles.marginLabel}>Profit</span>
                <span className={`${styles.marginValue} ${profit >= 0 ? styles.positive : styles.negative}`}>
                  ₹{profit.toFixed(2)}
                </span>
              </div>
              {margin != null && (
                <div className={styles.marginStat}>
                  <span className={styles.marginLabel}>Margin</span>
                  <span className={`${styles.marginValue} ${parseFloat(margin) >= 0 ? styles.positive : styles.negative}`}>
                    {margin}%
                  </span>
                </div>
              )}
              {markup != null && (
                <div className={styles.marginStat}>
                  <span className={styles.marginLabel}>Markup</span>
                  <span className={`${styles.marginValue} ${parseFloat(markup) >= 0 ? styles.positive : styles.negative}`}>
                    {markup}%
                  </span>
                </div>
              )}
            </div>
          )}
        </div>

        <button
          className="btn btn-primary btn-lg"
          style={{ width: '100%', justifyContent: 'center' }}
          onClick={handleSave}
          disabled={saving}
        >
          {saving ? <span className="spinner" style={{ width: 14, height: 14 }} /> : null}
          {saving ? 'Saving…' : '💾  Save Recipe'}
        </button>
      </div>

      {/* Right: Saved Recipes */}
      <div className={styles.recipesPanel}>
        <div className={styles.recipesTopRow}>
          <h3 className={styles.recipesHeading}>Recipes <span className={styles.recipeCount}>{filteredDisplayRecipes.length}</span></h3>
          <input
            className={`form-input ${styles.recipesSearchInput}`}
            placeholder="Search recipes..."
            value={recipeSearchQ}
            onChange={e => setRecipeSearchQ(e.target.value)}
          />
        </div>

        {filteredDisplayRecipes.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">📋</div>
            <p className="empty-state-text">No recipes saved yet.</p>
          </div>
        ) : (
          <div className={styles.recipeList}>
            {filteredDisplayRecipes.map(recipe => (
              <div key={recipe.id} className={`card ${styles.recipeCard}`}>
                <div
                  className={styles.recipeCardHeader}
                  onClick={() => setExpandedRecipe(expandedRecipe === recipe.id ? null : recipe.id)}
                >
                  <div>
                    <h4 className={styles.recipeDishName}>{recipe.dishName}</h4>
                    <span className={styles.recipeIngCount}>{recipe.ingredients?.length} ingredient{recipe.ingredients?.length !== 1 ? 's' : ''}</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div className={styles.recipeStats}>
                      <span className={styles.recipeMargin}>
                        {recipe.margin != null ? `${recipe.margin}% margin` : ''}
                      </span>
                      <span className={styles.recipePrice}>₹{recipe.sellingPrice?.toFixed(2)}</span>
                    </div>
                    <span className={styles.expandIcon}>{expandedRecipe === recipe.id ? '▲' : '▼'}</span>
                  </div>
                </div>

                {expandedRecipe === recipe.id && (
                  <div className={styles.recipeCardDetail}>
                    <div className={styles.ingGrid}>
                      {recipe.ingredients?.map((ing, i) => (
                        <div key={i} className={styles.ingChip}>
                          <span>{ing.name}</span>
                          <span className={styles.ingChipQty}>{ing.qty} {ing.unit}</span>
                        </div>
                      ))}
                    </div>
                    <div className={styles.recipeFinancials}>
                      <div className={styles.finRow}><span>Cost Price</span><span>₹{recipe.costPrice?.toFixed(2)}</span></div>
                      <div className={styles.finRow}><span>Selling Price</span><span>₹{recipe.sellingPrice?.toFixed(2)}</span></div>
                      <div className={`${styles.finRow} ${styles.finRowHighlight}`}>
                        <span>Profit</span>
                        <span style={{ color: recipe.profit >= 0 ? 'var(--success)' : 'var(--danger)' }}>
                          ₹{recipe.profit?.toFixed(2)}
                        </span>
                      </div>
                      <div className={styles.finRow}>
                        <span>Margin / Markup</span>
                        <span>{recipe.margin}% / {recipe.markup}%</span>
                      </div>
                    </div>
                    {!recipe.seeded && (
                      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 10 }}>
                        <button className="btn btn-ghost btn-sm" style={{ color: 'var(--danger)' }} onClick={() => deleteRecipe(recipe.id)}>
                          Delete
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {toast && (
        <div className="toast-container">
          <div className={`toast toast-${toast.type}`}>{toast.msg}</div>
        </div>
      )}
    </div>
  )
}
