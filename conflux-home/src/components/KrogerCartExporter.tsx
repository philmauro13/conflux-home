// KrogerCartExporter — TEMPORARILY DISABLED (2026-04-22)
// @ts-nocheck — re-enable + implement once src-tauri/src/kroger.rs is created
// KrogerCartExporter — Match grocery items → Kroger products → Add to cart
// Full modal flow: find store → search products → confirm → add.

import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useKroger, bestMatch, formatPrice } from '../hooks/useKroger';
import type { KrogerLocation, KrogerProduct, CartItem } from '../hooks/useKroger';
import type { GroceryItem } from '../types';
import '../styles/kroger.css';

interface MatchRow {
  ingredient: GroceryItem;
  products: KrogerProduct[];
  selected: KrogerProduct | null;
  skipped: boolean;
  quantity: number;
  searchQuery: string;
}

interface Props {
  groceryItems: GroceryItem[];
  onClose: () => void;
}

type Step = 'location' | 'matching' | 'review' | 'adding' | 'done' | 'error';

export default function KrogerCartExporter({ groceryItems, onClose }: Props) {
  const { isConnected, getLocation, searchProducts, addToCart } = useKroger();

  // Step flow
  const [step, setStep] = useState<Step>('location');
  const [error, setError] = useState<string | null>(null);

  // Location
  const [zipCode, setZipCode] = useState('');
  const [locations, setLocations] = useState<KrogerLocation[]>([]);
  const [selectedLocation, setSelectedLocation] = useState<KrogerLocation | null>(null);

  // Matching
  const [matches, setMatches] = useState<MatchRow[]>([]);
  const [searchingIndex, setSearchingIndex] = useState<number>(-1);

  // Adding
  const [addedCount, setAddedCount] = useState(0);
  const [failedItems, setFailedItems] = useState<string[]>([]);

  // ── Step 1: Find store ─────────────────────────────────────────────────────

  const handleFindStore = useCallback(async () => {
    if (!zipCode.trim()) return;
    setError(null);
    try {
      const results = await getLocation(zipCode.trim());
      if (results.length === 0) {
        setError('No Kroger stores found near that ZIP code.');
        return;
      }
      setLocations(results);
    } catch (e) {
      setError(String(e));
    }
  }, [getLocation, zipCode]);

  const handleSelectLocation = useCallback((loc: KrogerLocation) => {
    setSelectedLocation(loc);
    try {
      localStorage.setItem('kroger_preferred_store', JSON.stringify(loc));
      localStorage.setItem('kroger_preferred_zip', zipCode);
    } catch {}
  }, [zipCode]);

  // Load saved ZIP + store on mount, and auto-select if found in results
  useEffect(() => {
    try {
      const savedZip = localStorage.getItem('kroger_preferred_zip');
      const savedStore = localStorage.getItem('kroger_preferred_store');
      if (savedZip) setZipCode(savedZip);
      if (savedStore) {
        const parsed: KrogerLocation = JSON.parse(savedStore);
        // Store in state but don't select yet — wait for locations to load
        setSelectedLocation(parsed);
      }
    } catch {}
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // run once on mount

  // When locations load, auto-select saved store if it's in the list
  useEffect(() => {
    if (locations.length === 0 || !selectedLocation) return;
    const match = locations.find((l) => l.locationId === selectedLocation.locationId);
    if (match) handleSelectLocation(match);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locations]); // run when locations change

  // ── Step 2: Search products for each ingredient ─────────────────────────────

  const handleStartMatching = useCallback(async () => {
    if (!selectedLocation) return;
    setStep('matching');
    setError(null);

    // Initialize match rows
    const initial: MatchRow[] = groceryItems
      .filter((i) => !i.is_checked)
      .map((i) => ({
        ingredient: i,
        products: [],
        selected: null,
        skipped: false,
        quantity: i.quantity ?? 1,
        searchQuery: buildSearchQuery(i),
      }));

    setMatches(initial);

    // Search for each ingredient
    const locationId = selectedLocation.locationId;
    const updated = await Promise.all(
      initial.map(async (row, idx) => {
        setSearchingIndex(idx);
        try {
          const products = await searchProducts(
            row.searchQuery,
            locationId,
            5
          );
          const best = bestMatch(row.searchQuery, products);
          return { ...row, products, selected: best };
        } catch {
          return { ...row, products: [], selected: null };
        }
      })
    );

    setSearchingIndex(-1);
    setMatches(updated);
    setStep('review');
  }, [selectedLocation, groceryItems, searchProducts]);

  // ── Step 3: Review & tweak ─────────────────────────────────────────────────

  const handleSkip = useCallback((idx: number) => {
    setMatches((prev) =>
      prev.map((m, i) => (i === idx ? { ...m, skipped: true, selected: null } : m))
    );
  }, []);

  const handleSelectProduct = useCallback((idx: number, product: KrogerProduct) => {
    setMatches((prev) =>
      prev.map((m, i) => (i === idx ? { ...m, selected: product, skipped: false } : m))
    );
  }, []);

  const handleQuantityChange = useCallback((idx: number, qty: number) => {
    setMatches((prev) =>
      prev.map((m, i) => (i === idx ? { ...m, quantity: Math.max(1, qty) } : m))
    );
  }, []);

  const confirmedItems = matches.filter((m) => !m.skipped && m.selected !== null);
  const skippedCount = matches.filter((m) => m.skipped).length;

  // ── Step 4: Add to cart ─────────────────────────────────────────────────────

  const handleAddToCart = useCallback(async () => {
    if (!selectedLocation) return;
    setStep('adding');
    setAddedCount(0);
    setFailedItems([]);

    const failed: string[] = [];

    // First pass: validate UPCs and collect items with missing UPCs
    const validItems: { upc: string; quantity: number; itemName: string }[] = [];
    for (const m of confirmedItems) {
      const upc = m.selected!.items?.[0]?.itemId ?? '';
      const itemName = m.ingredient.name ?? m.searchQuery;
      if (!upc) {
        failed.push(itemName);
        continue;
      }
      validItems.push({ upc, quantity: m.quantity, itemName });
    }

    // Add items sequentially so counters stay accurate
    for (let i = 0; i < validItems.length; i++) {
      const { upc, quantity, itemName } = validItems[i];
      console.info(`[Kroger] Attempting cart add ${i + 1}/${validItems.length}: ${itemName} — UPC: ${upc}`);
      try {
        await addToCart([{ upc, quantity }], selectedLocation.locationId);
        setAddedCount((c) => c + 1);
        console.info(`[Kroger] ✓ Item ${i + 1} succeeded: ${itemName}`);
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        console.error(`[Kroger] ✗ Item ${i + 1} failed: ${itemName} — ${msg}`);
        failed.push(itemName);
      }
    }

    setFailedItems(failed);
    setStep('done');
  }, [selectedLocation, confirmedItems, addToCart]);

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="kroger-modal-backdrop" onClick={onClose}>
      <motion.div
        className="kroger-modal"
        onClick={(e) => e.stopPropagation()}
        initial={{ opacity: 0, scale: 0.95, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 10 }}
        transition={{ type: 'spring', damping: 25, stiffness: 300 }}
      >
        {/* Header */}
        <div className="kroger-modal-header">
          <div className="kroger-modal-title">
            <span className="kroger-logo">🛒</span>
            <span>Kroger Cart</span>
          </div>
          <button className="kroger-close" onClick={onClose}>
            ✕
          </button>
        </div>

        {/* Progress steps */}
        <div className="kroger-steps">
          {(['location', 'matching', 'review', 'done'] as Step[]).map((s, i) => {
            const labels: Record<string, string> = {
              location: '1. Store',
              matching: '2. Search',
              review: '3. Review',
              done: '✓ Done',
            };
            const active = s === step || (step === 'adding' && s === 'review');
            const done =
              ['matching', 'review', 'adding', 'done'].indexOf(step) >
              ['location', 'matching', 'review', 'done'].indexOf(s);
            return (
              <span
                key={s}
                className={`kroger-step ${active ? 'active' : ''} ${done ? 'done' : ''}`}
              >
                {labels[s]}
              </span>
            );
          })}
        </div>

        {/* Error */}
        <AnimatePresence>
          {error && (
            <motion.div
              className="kroger-error-banner"
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
            >
              ❌ {error}
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── Step: Location ── */}
        <AnimatePresence>
          {step === 'location' && (
            <motion.div
              key="location"
              className="kroger-body"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
            >
              <p className="kroger-desc">
                Enter your ZIP code to find the nearest Kroger store.
              </p>
              <div className="kroger-zip-row">
                <input
                  className="kroger-input"
                  type="text"
                  placeholder="e.g. 45202"
                  value={zipCode}
                  onChange={(e) => setZipCode(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleFindStore()}
                  maxLength={5}
                />
                <button
                  className="kroger-btn kroger-btn-primary"
                  onClick={handleFindStore}
                >
                  Find Store
                </button>
              </div>

              {locations.length > 0 && (
                <div className="kroger-locations">
                  {locations.map((loc) => (
                    <button
                      key={loc.locationId}
                      className={`kroger-location-card ${
                        selectedLocation?.locationId === loc.locationId
                          ? 'selected'
                          : ''
                      }`}
                      onClick={() => handleSelectLocation(loc)}
                    >
                      <strong>{loc.name ?? 'Kroger'}</strong>
                      <span>
                        {loc.address?.addressLine1}, {loc.address?.city},{' '}
                        {loc.address?.state} {loc.address?.zipCode}
                      </span>
                    </button>
                  ))}
                </div>
              )}

              {selectedLocation && (
                <motion.div
                  className="kroger-actions"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                >
                  <button
                    className="kroger-btn kroger-btn-primary"
                    onClick={handleStartMatching}
                  >
                    Search {groceryItems.filter((i) => !i.is_checked).length}{' '}
                    items →
                  </button>
                </motion.div>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── Step: Matching ── */}
        <AnimatePresence>
          {step === 'matching' && (
            <motion.div
              key="matching"
              className="kroger-body kroger-matching"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              <p className="kroger-desc">
                Searching Kroger catalog for your{' '}
                <strong>{groceryItems.filter((i) => !i.is_checked).length}</strong>{' '}
                ingredients…
              </p>
              <div className="kroger-search-progress">
                <div className="kroger-spinner" />
                <span>
                  {searchingIndex >= 0
                    ? matches[searchingIndex]?.searchQuery ?? '…'
                    : 'Preparing…'}
                </span>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── Step: Review ── */}
        <AnimatePresence>
          {step === 'review' && (
            <motion.div
              key="review"
              className="kroger-body kroger-review"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
            >
              <p className="kroger-desc">
                {confirmedItems.length} items matched — review and confirm.
                {skippedCount > 0 && (
                  <span className="kroger-skipped-hint">
                    {' '}
                    ({skippedCount} skipped)
                  </span>
                )}
              </p>

              <div className="kroger-match-list">
                {matches.map((row, idx) => (
                  <MatchRowCard
                    key={row.ingredient.id ?? idx}
                    row={row}
                    idx={idx}
                    onSkip={handleSkip}
                    onSelect={handleSelectProduct}
                    onQuantityChange={handleQuantityChange}
                  />
                ))}
              </div>

              <div className="kroger-actions">
                <div className="kroger-actions-info">
                  <strong>{confirmedItems.length}</strong> items to add
                </div>
                <button
                  className="kroger-btn kroger-btn-primary"
                  onClick={handleAddToCart}
                  disabled={confirmedItems.length === 0}
                >
                  Add to Kroger Cart 🛒
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── Step: Adding ── */}
        <AnimatePresence>
          {step === 'adding' && (
            <motion.div
              key="adding"
              className="kroger-body kroger-adding"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              <div className="kroger-spinner large" />
              <p>
                Adding items to cart…{' '}
                <strong>
                  {addedCount}/{confirmedItems.length}
                </strong>
              </p>
              <div className="kroger-progress-bar">
                <div
                  className="kroger-progress-fill"
                  style={{
                    width: `${(addedCount / confirmedItems.length) * 100}%`,
                  }}
                />
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── Step: Done ── */}
        <AnimatePresence>
          {step === 'done' && (
            <motion.div
              key="done"
              className="kroger-body kroger-done"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0 }}
            >
              {failedItems.length === 0 ? (
                <>
                  <div className="kroger-done-icon">🎉</div>
                  <p className="kroger-done-title">
                    {addedCount} items added to your Kroger cart!
                  </p>
                  <p className="kroger-desc">
                    Open the Kroger app or Kroger.com to review and checkout.
                  </p>
                </>
              ) : (
                <>
                  <div className="kroger-done-icon">⚠️</div>
                  <p className="kroger-done-title">
                    {addedCount} items added, {failedItems.length} failed
                  </p>
                  <p className="kroger-desc">
                    The following items couldn't be added:{' '}
                    {failedItems.join(', ')}
                  </p>
                </>
              )}
              <div className="kroger-actions">
                <button
                  className="kroger-btn kroger-btn-primary"
                  onClick={onClose}
                >
                  Done
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  );
}

// ── Match Row Card ─────────────────────────────────────────────────────────────

function MatchRowCard({
  row,
  idx,
  onSkip,
  onSelect,
  onQuantityChange,
}: {
  row: MatchRow;
  idx: number;
  onSkip: (idx: number) => void;
  onSelect: (idx: number, product: KrogerProduct) => void;
  onQuantityChange: (idx: number, qty: number) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const selected = row.selected;
  const primaryPrice = selected?.items?.[0]?.price?.regular;

  return (
    <div className={`kroger-match-row ${row.skipped ? 'skipped' : ''}`}>
      {/* Ingredient info */}
      <div className="kroger-match-left">
        <div className="kroger-match-ingredient">
          <span className="kroger-match-name">
            {row.ingredient.name}
          </span>
          {row.ingredient.quantity && row.ingredient.quantity > 1 && (
            <span className="kroger-match-qty">
              ×{row.ingredient.quantity}
            </span>
          )}
        </div>

        {row.selected ? (
          <div className="kroger-match-selected">
            <span className="kroger-match-product">
              {row.selected.description}
            </span>
            {row.selected.brand && (
              <span className="kroger-match-brand">{row.selected.brand}</span>
            )}
          </div>
        ) : row.products.length > 0 ? (
          <span className="kroger-match-none">
            ⚠️ Select a product below
          </span>
        ) : (
          <span className="kroger-match-none">
            ❌ Not available at this store
          </span>
        )}
      </div>

      {/* Price + actions */}
      <div className="kroger-match-right">
        {primaryPrice != null && (
          <span className="kroger-match-price">
            {formatPrice(primaryPrice)}
          </span>
        )}

        {row.products.length > 0 && (
          <button
            className="kroger-btn kroger-btn-swap"
            onClick={() => setExpanded((v) => !v)}
          >
            {expanded ? '▲' : '▼'}
          </button>
        )}

        <button
          className="kroger-btn kroger-btn-ghost"
          onClick={() => onSkip(idx)}
        >
          Skip
        </button>
      </div>

      {/* Expanded alternatives */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            className="kroger-match-alts"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
          >
            {row.products.map((p) => (
              <button
                key={p.productId}
                className={`kroger-alt-item ${
                  selected?.productId === p.productId ? 'active' : ''
                }`}
                onClick={() => {
                onSelect(idx, p);
                setExpanded(false);
              }}
              >
                <span>{p.description}</span>
                <span className="kroger-alt-price">
                  {p.items?.[0]?.price?.regular != null
                    ? formatPrice(p.items[0].price.regular)
                    : '—'}
                </span>
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function buildSearchQuery(item: GroceryItem): string {
  const parts = [item.name];
  if (item.quantity && item.quantity > 1) {
    const q = item.quantity;
    // "1 dozen eggs" → "dozen eggs"
    if (q % 12 === 0 && item.name.toLowerCase().includes('egg')) {
      parts.push(`${q / 12} dozen`);
    }
  }
  return parts.join(' ');
}
