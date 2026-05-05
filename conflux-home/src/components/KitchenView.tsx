// Conflux Home — Kitchen View (Hearth Overhaul)
import { playSuccess } from '../lib/sound';
import { invoke, convertFileSrc } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-dialog';
import { listen } from '@tauri-apps/api/event';
import { useState, useCallback, useEffect, useMemo, useTransition } from 'react';
import { useMeals, useWeeklyPlan, useGroceryList } from '../hooks/useKitchen';
import { useHomeMenu, useKitchenNudges, useKitchenDigest } from '../hooks/useHearth';
import { useFridgeScanner } from '../hooks/useFridgeScanner';
import { useAuth } from '../hooks/useAuth';
import type { Meal } from '../types';
import { MEAL_CATEGORIES, MEAL_CUISINES, MEAL_CATEGORY_EMOJI } from '../types';

import KitchenNudges from './KitchenNudges';
import KitchenDigestCard from './KitchenDigest';
import SmartGrocery from './SmartGrocery';
import PantryHeatmap from './PantryHeatmap';
import CookingMode from './CookingMode';
import CookingModeEnhanced from './CookingModeEnhanced';
import RestaurantMenu from './RestaurantMenu';
import BrowseCards from './BrowseCards';
import { MicButton } from './voice';
import KitchenBoot from './KitchenBoot';
import HearthOnboarding, { hasCompletedHearthOnboarding } from './HearthOnboarding';
import HearthTour, { hasCompletedHearthTour } from './HearthTour';
import KitchenEmptyState from './KitchenEmptyState';
// Kroger integration — TEMPORARILY DISABLED (2026-04-22):
// restore by uncommenting + creating src-tauri/src/kroger.rs
// import KrogerConnect from './KrogerConnect';
// import KrogerCartExporter from './KrogerCartExporter';

function getWeekStart(): string {
  const now = new Date();
  const day = now.getDay();
  const diff = now.getDate() - day + (day === 0 ? -6 : 1);
  const monday = new Date(now.setDate(diff));
  return monday.toISOString().split('T')[0];
}

function formatCost(n: number | null): string {
  if (n == null) return '—';
  return `$${n.toFixed(2)}`;
}

const SLOTS = ['breakfast', 'lunch', 'dinner'] as const;

export default function KitchenView() {
  const { user } = useAuth();
  const [tab, setTab] = useState<'home' | 'library' | 'plan' | 'grocery' | 'pantry'>('home');
  const [filterCat, setFilterCat] = useState<string>('all');
  const [filterCuisine, setFilterCuisine] = useState<string>('all');
  const [showFavorites, setShowFavorites] = useState(false);
  const [aiPrompt, setAiPrompt] = useState('');
  // Track AI loading separate from meals loading (for transition)
  const [aiLoading, setAiLoading] = useState(false);
  const [isPending, startAiTransition] = useTransition();
  const [selectedMeal, setSelectedMeal] = useState<Meal | null>(null);
  const [cookingMealId, setCookingMealId] = useState<string | null>(null);
  // Cooking mode step tracking (placeholder — wire to real steps when available)
  const [cookingSteps, setCookingSteps] = useState([]);
  const [cookingCurrentStep, setCookingCurrentStep] = useState(0);

  // Boot → Onboarding → Tour state
  // bootDone persists across sessions (plays once ever).
  // showOnboarding: show if the user hasn't completed onboarding yet.
  // Boot sequence gates its own visibility; onboarding only renders after boot finishes.
  const [bootDone, setBootDone] = useState(() => localStorage.getItem('hearth-boot-done') === 'true');
  const hasOnboarded = hasCompletedHearthOnboarding();
  const hasTakenTour = hasCompletedHearthTour();
  const [showOnboarding, setShowOnboarding] = useState(!hasOnboarded);
  const [showTour, setShowTour] = useState(!bootDone ? false : !hasTakenTour);
  const [onboardingComplete, setOnboardingComplete] = useState(false);
  const [tourComplete, setTourComplete] = useState(false);
  const [showAddPantryItem, setShowAddPantryItem] = useState(false);
  // const [showKrogerExporter, setShowKrogerExporter] = useState(false); // KROGER_DISABLED

  // Week-plan inline meal picker: which cell is currently open for selection
  const [planPicker, setPlanPicker] = useState<{ day: number; slot: string } | null>(null);

  const weekStart = useMemo(getWeekStart, []);

  // Existing kitchen hooks
  const { meals, loading, addWithAI, toggleFavorite, reload: reloadMeals, setMeals } = useMeals(
    filterCat === 'all' ? undefined : filterCat,
    filterCuisine === 'all' ? undefined : filterCuisine,
    showFavorites,
  );
  const { plan, setEntry } = useWeeklyPlan(weekStart);
  const { items: groceryItems, generate: generateGrocery, toggleItem, totalCost } = useGroceryList(weekStart);

  // New Hearth hooks
  const { menu: homeMenu, loading: menuLoading, load: loadHomeMenu } = useHomeMenu();
  const { nudges, load: loadNudges } = useKitchenNudges();
  const { digest, loading: digestLoading, load: loadDigest } = useKitchenDigest(weekStart);

  // Track whether initial meals load has completed (for empty state detection)
  const [mealsLoaded, setMealsLoaded] = useState(false);
  useEffect(() => {
    if (!loading) setMealsLoaded(true);
  }, [loading]);

  // Load home data on mount and when switching to home tab
  useEffect(() => {
    loadHomeMenu();
    loadNudges();
    loadDigest();
  }, [loadHomeMenu, loadNudges, loadDigest]);


  // Listen for heartbeat beat events → refresh Kitchen data
  useEffect(() => {
    let ignore = false;
    const unlistenPromise = listen<null>('conflux:heartbeat-beat', () => {
      if (ignore) return;
      loadHomeMenu();
      loadNudges();
      loadDigest();
    });
    return () => {
      ignore = true;
      unlistenPromise.then(fn => fn());
    };
  }, [loadHomeMenu, loadNudges, loadDigest]);

  // Refresh Chef's Specials whenever meals change (covers adds from any tab)
  useEffect(() => {
    if (meals.length > 0) {
      loadHomeMenu();
    }
  }, [meals.length, loadHomeMenu]);

  // Load pantry inventory for Pantry tab
  const [pantryItems, setPantryItems] = useState<any[]>([]);
  useEffect(() => {
    const loadInventory = async () => {
      try {
        const inventory = await invoke<any[]>('kitchen_get_inventory', { location: null, member_id: user?.id || null });
        console.log('[KitchenView] Inventory loaded:', inventory.length, 'items');
        // Convert KitchenInventoryItem → PantryHeatItem
        const today = new Date();
        const heatItems = inventory.map((item: any) => {
          let daysUntilExpiry: number | null = null;
          let freshness = 1.0;
          if (item.expiry_date) {
            const expiry = new Date(item.expiry_date);
            daysUntilExpiry = Math.ceil((expiry.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
            freshness = Math.max(0, Math.min(1, daysUntilExpiry / 30));
          }
          return {
            name: item.name,
            freshness,
            days_until_expiry: daysUntilExpiry,
            location: item.location || 'pantry',
          };
        });
        setPantryItems(heatItems);
      } catch (e) {
        console.error('[KitchenView] Failed to load inventory:', e);
      }
    };
    loadInventory();
  }, [user?.id]);

  const handleAIAdd = useCallback(async (description?: string) => {
    const text = description ?? aiPrompt;
    if (!text.trim() || aiLoading) return;
    setAiLoading(true);
    startAiTransition(async () => {
      try {
        const result = await addWithAI(text);
        if (!description) setAiPrompt('');
        setSelectedMeal(result.meal);
        await reloadMeals();
        playSuccess();
      } catch (e) {
        console.error('AI add failed:', e);
      } finally {
        setAiLoading(false);
      }
    });
  }, [aiPrompt, aiLoading, addWithAI, reloadMeals]);

  const handleNudgeAction = useCallback((nudge: { nudge_type: string }) => {
    if (nudge.nudge_type === 'cook') setTab('library');
    else if (nudge.nudge_type === 'pantry') setTab('pantry');
    else if (nudge.nudge_type === 'grocery') setTab('grocery');
  }, []);

  const dayNames = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

  return (
    <div className="kitchen-matrix">
      {/* Background effects */}
      <div className="matrix-bg-effects" />

      {/* ── Boot Sequence ── */}
      {!bootDone && (
        <KitchenBoot
          onComplete={() => {
            localStorage.setItem('hearth-boot-done', 'true');
            setBootDone(true);
          }}
        />
      )}

      {/* ── Onboarding ── */}
      {bootDone && showOnboarding && !onboardingComplete && (
        <HearthOnboarding
          onComplete={(createdMeal) => {
            console.log('[KitchenView] onComplete called, createdMeal:', createdMeal?.name ?? 'UNDEFINED');
            console.log('[KitchenView] current meals before update:', meals.length);
            setOnboardingComplete(true);
            setShowOnboarding(false);
            if (!hasTakenTour) setShowTour(true);
            if (createdMeal) {
              setMeals(prev => {
                console.log('[KitchenView] setMeals called with meal:', createdMeal.name, 'prev length:', prev.length);
                return [createdMeal, ...prev];
              });
              loadHomeMenu();
            } else {
              console.warn('[KitchenView] createdMeal was null/undefined, falling back to reloadMeals()');
              reloadMeals();
            }
          }}
        />
      )}

      {/* ── Guided Tour ── */}
      {bootDone && !showOnboarding && showTour && !tourComplete && (
        <HearthTour
          onComplete={() => {
            setTourComplete(true);
          }}
        />
      )}

      {/* Header */}
      <div className="kitchen-header">
        <h2 className="kitchen-title">🔥 Hearth</h2>
        <div className="kitchen-tabs">
          <button data-tab="home" className={`kitchen-tab ${tab === 'home' ? 'active' : ''}`} onClick={() => setTab('home')}>
            🏠 Home
          </button>
          <button data-tab="library" className={`kitchen-tab ${tab === 'library' ? 'active' : ''}`} onClick={() => setTab('library')}>
            📖 Library
          </button>
          <button data-tab="plan" className={`kitchen-tab ${tab === 'plan' ? 'active' : ''}`} onClick={() => setTab('plan')}>
            📅 Week Plan
          </button>
          <button data-tab="grocery" className={`kitchen-tab ${tab === 'grocery' ? 'active' : ''}`} onClick={() => setTab('grocery')}>
            🛒 Grocery
          </button>
          <button data-tab="pantry" className={`kitchen-tab ${tab === 'pantry' ? 'active' : ''}`} onClick={() => setTab('pantry')}>
            🌡️ Pantry
          </button>
        </div>
      </div>

      {/* ── HOME TAB ── */}
      {tab === 'home' && (
        <div className="kitchen-home">
          {/* Empty state — first run experience */}
          {mealsLoaded && meals.length === 0 ? (
            <KitchenEmptyState
              onAddMeal={async (desc) => {
                console.log('[KitchenView] onAddMeal START');
                setAiPrompt(desc);
                setAiLoading(true);
                console.log('[KitchenView] state set, starting transition');
                startAiTransition(async () => {
                  console.log('[KitchenView] transition running, calling addWithAI');
                  try {
                    const result = await addWithAI(desc);
                    console.log('[KitchenView] addWithAI done, updating state');
                    setAiPrompt('');
                    setSelectedMeal(result.meal);
                    console.log('[KitchenView] meal state set, reloading');
                    await reloadMeals();
                    console.log('[KitchenView] reloadMeals done');
                    loadHomeMenu();
                  } catch (e) {
                    console.error('[KitchenView] AI add failed:', e);
                  } finally {
                    console.log('[KitchenView] finally block, clearing aiLoading');
                    setAiLoading(false);
                  }
                });
                console.log('[KitchenView] onAddMeal END - transition started');
              }}
              onOpenLibrary={() => setTab('library')}
              isLoading={aiLoading}
            />
          ) : (
            <>
              {/* Restaurant Menu — Main Home View */}
              <RestaurantMenu
                chefsSpecials={homeMenu}
                yourRegulars={meals.filter(m => m.is_favorite).slice(0, 6)}
                onSelect={(id) => {
                  // Look up the full meal from the library — works for both
                  // Chef's Specials (meal_id → matches AI-created meals) and Your Regulars
                  const meal = meals.find(m => m.id === id);
                  if (meal) setSelectedMeal(meal);
                }}
                loading={menuLoading}
              />

              <KitchenNudges nudges={nudges} onAction={handleNudgeAction} />

              {digest && !digestLoading && (
                <KitchenDigestCard digest={digest} />
              )}
            </>
          )}
        </div>
      )}

      {/* ── LIBRARY TAB ── */}
      {tab === 'library' && (
        <div className="kitchen-library">
          {/* AI Add Bar */}
          <div className="kitchen-ai-add">
            <div className="ai-add-header">
              <span className="ai-add-icon">✨</span>
              <span>Add a meal with AI</span>
            </div>
            <div className="ai-add-row">
              <div className="input-with-mic">
                <input
                  type="text"
                  value={aiPrompt}
                  onChange={e => setAiPrompt(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleAIAdd()}
                  placeholder="Describe a meal... e.g., 'chicken parmesan with spaghetti'"
                  className="ai-add-input"
                />
                <MicButton
                  onTranscription={(text) => setAiPrompt(text)}
                  variant="inline"
                  size="sm"
                  className="mic-button-inline"
                />
              </div>
              <button className="btn-primary" onClick={() => handleAIAdd()} disabled={aiLoading || !aiPrompt.trim()}>
                {aiLoading ? '✨ Creating...' : 'Add'}
              </button>
            </div>
          </div>

          {/* Browse Cards — replaces old filter + grid */}
          <BrowseCards
            meals={meals}
            loading={loading}
            selectedCategory={filterCat}
            selectedCuisine={filterCuisine}
            showFavorites={showFavorites}
            onCategoryChange={setFilterCat}
            onCuisineChange={setFilterCuisine}
            onFavoritesToggle={() => setShowFavorites(!showFavorites)}
            onSelect={setSelectedMeal}
            onQuickAdd={(mealId) => {
              // Quick add to week plan — default to today's dinner
              const today = new Date().getDay();
              const dayIndex = today === 0 ? 6 : today - 1;
              setEntry(dayIndex, 'dinner', mealId);
              setTab('plan');
              playSuccess();
            }}
            pantryItems={[]}
          />

          {/* Meal Detail Sidebar (kept from old impl) */}
          {selectedMeal && (
            <div className="meal-detail">
              <div className="meal-detail-header">
                <h3>{selectedMeal.name}</h3>
                <button className="modal-close" onClick={() => setSelectedMeal(null)}>✕</button>
              </div>
              {/* Meal Photo */}
              <div className="meal-detail-photo">
                {selectedMeal.photo_url ? (
                  <img
                    src={(() => {
                      const url: string = selectedMeal.photo_url!;
                      return convertFileSrc(url);
                    })()}
                    alt={selectedMeal.name ?? ''}
                    className="meal-detail-img"
                    onError={(e) => {
                      const target = e.currentTarget;
                      console.error('[KitchenView] Photo failed to load:', convertFileSrc(selectedMeal.photo_url!));
                      target.style.display = 'none';
                      const parent = target.parentElement;
                      if (parent) {
                        const emoji = parent.querySelector('.meal-detail-photo-emoji') as HTMLElement;
                        if (emoji) emoji.style.display = 'flex';
                      }
                    }}
                  />
                ) : null}
                <span
                  className="meal-detail-photo-emoji"
                  style={{ display: selectedMeal.photo_url ? 'none' : 'flex' }}
                >
                  {MEAL_CATEGORY_EMOJI[selectedMeal.category ?? 'dinner'] ?? '🍽️'}
                </span>
              </div>
              <div className="meal-detail-photo-actions">
                <button
                  className="replace-photo-btn"
                  onClick={async () => {
                    try {
                      console.log('[KitchenView] Replace photo clicked, opening dialog...');
                      const selected = await open({
                        multiple: false,
                        filters: [{ name: 'Images', extensions: ['jpg', 'jpeg', 'png', 'webp', 'gif'] }],
                      });
                      console.log('[KitchenView] Dialog returned:', selected, typeof selected);
                      if (selected && typeof selected === 'string') {
                        // Upload the file — in this app we store the file path as photo_url
                        // For cross-platform compatibility, we copy to app data directory
                        console.log('[KitchenView] Calling kitchen_update_meal_photo for meal:', selectedMeal.id, '→', selected);
                        await invoke('kitchen_update_meal_photo', {
                          mealId: selectedMeal.id, photoUrl: selected,
                        });
                        console.log('[KitchenView] kitchen_update_meal_photo succeeded');
                        // Reload meals to get updated photo_url
                        await reloadMeals();
                        // Update the selected meal in state
                        setSelectedMeal((prev: Meal | null) => prev ? { ...prev, photo_url: selected } : prev);
                      }
                    } catch (err) {
                      console.error('[KitchenView] Failed to upload photo:', err);
                    }
                  }}
                >
                  📷 Replace Photo
                </button>
                {(selectedMeal.photo_url) && (
                  <button
                    className="remove-photo-btn"
                    onClick={async () => {
                      try {
                        await invoke('kitchen_update_meal_photo', {
                          mealId: selectedMeal.id, photoUrl: '',
                        });
                        await reloadMeals();
                        setSelectedMeal((prev: Meal | null) => prev ? { ...prev, photo_url: null } : prev);
                      } catch (err) {
                        console.error('[KitchenView] Failed to remove photo:', err);
                      }
                    }}
                  >
                    ✕ Clear
                  </button>
                )}
              </div>
              {selectedMeal.description && <p className="meal-detail-desc">{selectedMeal.description}</p>}
              <div className="meal-detail-stats">
                {selectedMeal.prep_time_min && <div className="stat"><span className="stat-label">Prep</span><span>{selectedMeal.prep_time_min} min</span></div>}
                {selectedMeal.cook_time_min && <div className="stat"><span className="stat-label">Cook</span><span>{selectedMeal.cook_time_min} min</span></div>}
                <div className="stat"><span className="stat-label">Servings</span><span>{selectedMeal.servings}</span></div>
                {selectedMeal.estimated_cost != null && <div className="stat"><span className="stat-label">Total Cost</span><span>{formatCost(selectedMeal.estimated_cost)}</span></div>}
                {selectedMeal.cost_per_serving != null && <div className="stat"><span className="stat-label">Per Serving</span><span>{formatCost(selectedMeal.cost_per_serving)}</span></div>}
              </div>
              {selectedMeal.instructions && (
                <div className="meal-detail-section">
                  <h4>Instructions</h4>
                  <p className="meal-instructions">{selectedMeal.instructions}</p>
                </div>
              )}
              {selectedMeal.tags && (
                <div className="meal-detail-tags">
                  {(() => { try { return JSON.parse(selectedMeal.tags); } catch { return []; } })().map((t: string, i: number) => (
                    <span key={i} className="topic-tag">{t}</span>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── WEEK PLAN TAB ── */}
      {tab === 'plan' && (
        <div className="kitchen-plan">
          <div className="plan-header">
            <h3>Week of {new Date(weekStart + 'T12:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric' })}</h3>
            <div className="plan-stats">
              {plan ? (
                <>
                  <span>🍽️ {plan.meal_count} meals planned</span>
                  <span>💰 Est. {formatCost(plan.total_estimated_cost)}</span>
                </>
              ) : (
                <span>Loading plan...</span>
              )}
            </div>
          </div>

          {plan ? (
            <div className="plan-grid">
              <div className="plan-grid-header">
                <div className="plan-slot-label"></div>
                {dayNames.map(d => (
                  <div key={d} className="plan-day-header">{d}</div>
                ))}
              </div>

              {SLOTS.map(slot => (
                <div key={slot} className="plan-grid-row">
                  <div className="plan-slot-label">{MEAL_CATEGORY_EMOJI[slot]} {slot}</div>
                  {plan.days.map(day => {
                    const planSlot = day.slots.find(s => s.meal_slot === slot);
                    const isPickerOpen = planPicker?.day === day.day_of_week && planPicker?.slot === slot;
                    return (
                      <div
                        key={day.day_of_week}
                        className={`plan-cell ${planSlot?.meal ? 'filled' : 'empty'}`}
                        onClick={() => {
                          if (!isPickerOpen) setPlanPicker({ day: day.day_of_week, slot });
                        }}
                      >
                        {isPickerOpen ? (
                          <select
                            className="plan-picker"
                            autoFocus
                            value={planSlot?.meal?.id ?? ''}
                            onChange={(e) => {
                              const val = e.target.value;
                              if (val === '__remove__') {
                                setEntry(day.day_of_week, slot, null);
                              } else if (val) {
                                setEntry(day.day_of_week, slot, val);
                              }
                              setPlanPicker(null);
                            }}
                            onClick={(e) => e.stopPropagation()}
                            onBlur={() => setPlanPicker(null)}
                          >
                            <option value="">— choose —</option>
                            {planSlot?.meal && (
                              <option value="__remove__">✕ Remove</option>
                            )}
                            {meals.map(m => (
                              <option key={m.id} value={m.id}>{m.name}</option>
                            ))}
                          </select>
                        ) : planSlot?.meal ? (
                          <div className="plan-meal-chip">
                            <span className="plan-meal-name">{planSlot.meal.name}</span>
                            {planSlot.meal.cost_per_serving != null && (
                              <span className="plan-meal-cost">{formatCost(planSlot.meal.cost_per_serving)}</span>
                            )}
                          </div>
                        ) : (
                          <button className="plan-add-btn" onClick={(e) => {
                            e.stopPropagation();
                            setPlanPicker({ day: day.day_of_week, slot });
                          }}>
                            +
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          ) : (
            <div className="plan-loading">Loading your week plan...</div>
          )}
        </div>
      )}

      {/* ── GROCERY TAB ── */}
      {tab === 'grocery' && (
        <div className="kitchen-grocery">
          <div className="grocery-header">
            <div className="grocery-actions">
              <span className="grocery-total">Est. total: <strong>{formatCost(totalCost)}</strong></span>
              {/* <KrogerConnect /> */}
              {/* {groceryItems.length > 0 && (
                <button className="btn-primary" onClick={() => setShowKrogerExporter(true)}>
                  🛒 Add to Kroger
                </button>
              )} */}
              <button className="btn-primary" onClick={generateGrocery}>
                ✨ Generate from Plan
              </button>
            </div>
          </div>

          {groceryItems.length === 0 ? (
            <div className="kitchen-empty">
              <p>No items yet. Plan some meals and click "Generate from Plan".</p>
            </div>
          ) : (
            <SmartGrocery items={groceryItems} onToggle={toggleItem} />
          )}
        </div>
      )}

      {/* ── PANTRY TAB ── */}
      {tab === 'pantry' && (
        <div className="kitchen-pantry">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <h3>🌡️ Pantry</h3>
            <button className="btn-primary" onClick={() => setShowAddPantryItem(true)}>
              + Add Item
            </button>
          </div>
          {pantryItems.length > 0 ? (
            <PantryHeatmap items={pantryItems} />
          ) : (
            <div className="kitchen-empty">
              <p>🌡️ Your pantry is empty. Add items to track freshness and get nudges when things are about to expire.</p>
            </div>
          )}
        </div>
      )}

      {/* ── ADD PANTRY ITEM MODAL ── */}
      {showAddPantryItem && (
        <div className="hearth-modal-backdrop" style={{ alignItems: 'center' }} onClick={() => setShowAddPantryItem(false)}>
          <div className="hearth-modal" onClick={e => e.stopPropagation()} style={{ background: '#1a1a2e', padding: '1.5rem', borderRadius: '12px', minWidth: '340px', maxWidth: '420px', color: '#e0e0e0' }}>
            <h3 style={{ marginBottom: '1rem' }}>Add Pantry Item</h3>
            <form onSubmit={async (e) => {
              e.preventDefault();
              const form = e.currentTarget;
              const name = (form.elements.namedItem('name') as HTMLInputElement).value;
              if (!name) return;
              try {
                await invoke('kitchen_add_inventory', {
                  req: {
                    name,
                    quantity: parseFloat((form.elements.namedItem('quantity') as HTMLInputElement).value) || null,
                    unit: (form.elements.namedItem('unit') as HTMLInputElement).value || null,
                    category: (form.elements.namedItem('category') as HTMLInputElement).value || null,
                    expiry_date: (form.elements.namedItem('expiry_date') as HTMLInputElement).value || null,
                    location: (form.elements.namedItem('location') as HTMLInputElement).value || null,
                  },
                  member_id: user?.id || null,
                });
                setShowAddPantryItem(false);
                // Reload inventory
                const inventory = await invoke<any[]>('kitchen_get_inventory', { location: null, member_id: user?.id || null });
                const today = new Date();
                const heatItems = inventory.map((item: any) => {
                  let daysUntilExpiry: number | null = null;
                  let freshness = 1.0;
                  if (item.expiry_date) {
                    const expiryDate = new Date(item.expiry_date);
                    daysUntilExpiry = Math.ceil((expiryDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
                    freshness = Math.max(0, Math.min(1, daysUntilExpiry / 30));
                  }
                  return { name: item.name, freshness, days_until_expiry: daysUntilExpiry, location: item.location || 'pantry' };
                });
                setPantryItems(heatItems);
              } catch (err) {
                console.error('[KitchenView] Failed to add pantry item:', err);
              }
            }}>
              <div style={{ marginBottom: '0.75rem' }}>
                <label style={{ display: 'block', marginBottom: '0.25rem', fontSize: '0.85rem' }}>Name *</label>
                <input name="name" type="text" required placeholder="e.g. Chicken breast" style={{ width: '100%', padding: '0.5rem', borderRadius: '6px', border: '1px solid #333', background: '#0e0e1a', color: '#e0e0e0' }} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', marginBottom: '0.75rem' }}>
                <div>
                  <label style={{ display: 'block', marginBottom: '0.25rem', fontSize: '0.85rem' }}>Quantity</label>
                  <input name="quantity" type="number" step="any" placeholder="2" style={{ width: '100%', padding: '0.5rem', borderRadius: '6px', border: '1px solid #333', background: '#0e0e1a', color: '#e0e0e0' }} />
                </div>
                <div>
                  <label style={{ display: 'block', marginBottom: '0.25rem', fontSize: '0.85rem' }}>Unit</label>
                  <input name="unit" type="text" placeholder="pieces" style={{ width: '100%', padding: '0.5rem', borderRadius: '6px', border: '1px solid #333', background: '#0e0e1a', color: '#e0e0e0' }} />
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', marginBottom: '0.75rem' }}>
                <div>
                  <label style={{ display: 'block', marginBottom: '0.25rem', fontSize: '0.85rem' }}>Category</label>
                  <select name="category" style={{ width: '100%', padding: '0.5rem', borderRadius: '6px', border: '1px solid #333', background: '#0e0e1a', color: '#e0e0e0' }}>
                    <option value="">Select...</option>
                    <option value="produce">🍎 Produce</option>
                    <option value="dairy">🥛 Dairy</option>
                    <option value="meat">🥩 Meat</option>
                    <option value="pantry">🥫 Pantry</option>
                    <option value="frozen">🧊 Frozen</option>
                    <option value="spice">🌿 Spice</option>
                  </select>
                </div>
                <div>
                  <label style={{ display: 'block', marginBottom: '0.25rem', fontSize: '0.85rem' }}>Location</label>
                  <select name="location" style={{ width: '100%', padding: '0.5rem', borderRadius: '6px', border: '1px solid #333', background: '#0e0e1a', color: '#e0e0e0' }}>
                    <option value="">Select...</option>
                    <option value="fridge">🧊 Fridge</option>
                    <option value="freezer">❄️ Freezer</option>
                    <option value="pantry">🏠 Pantry</option>
                  </select>
                </div>
              </div>
              <div style={{ marginBottom: '1rem' }}>
                <label style={{ display: 'block', marginBottom: '0.25rem', fontSize: '0.85rem' }}>Expiry Date</label>
                <input name="expiry_date" type="date" style={{ width: '100%', padding: '0.5rem', borderRadius: '6px', border: '1px solid #333', background: '#0e0e1a', color: '#e0e0e0' }} />
              </div>
              <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
                <button type="button" onClick={() => setShowAddPantryItem(false)} style={{ padding: '0.5rem 1rem', borderRadius: '6px', border: '1px solid #333', background: 'transparent', color: '#888', cursor: 'pointer' }}>Cancel</button>
                <button type="submit" className="btn-primary">Add Item</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── COOKING MODE OVERLAY — Enhanced ── */}
      {cookingMealId && (
        <CookingModeEnhanced
          steps={cookingSteps}
          currentStep={cookingCurrentStep}
          onNext={() => setCookingCurrentStep(prev => Math.min(prev + 1, cookingSteps.length - 1))}
          onPrev={() => setCookingCurrentStep(prev => Math.max(prev - 1, 0))}
          onClose={() => setCookingMealId(null)}
          autoAdvance={true}
        />
      )}

      {/* ── KROGER CART EXPORTER ── */}
      {/*
      {showKrogerExporter && (
        <KrogerCartExporter
          groceryItems={groceryItems}
          onClose={() => setShowKrogerExporter(false)}
        />
      )}
      */}
    </div>
  );
}
