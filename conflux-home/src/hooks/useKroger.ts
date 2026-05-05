// Kroger integration — TEMPORARILY DISABLED (2026-04-22)
// This stub exists so KrogerCartExporter.tsx still type-checks while disabled.
// Restore: replace with full implementation + create src-tauri/src/kroger.rs

export interface KrogerLocation {
  location_id: string;
  name: string;
  address: string;
  zip_code: string;
  chain: string;
}

export interface KrogerProduct {
  product_id: string;
  description: string;
  brand: string;
  price: number;
  uom: string;
  image_url?: string;
}

export interface CartItem {
  product_id: string;
  quantity: number;
  description: string;
  price: number;
}

export function formatPrice(n: number): string {
  return `$${n.toFixed(2)}`;
}

export function bestMatch(_query: string, _products: KrogerProduct[]): KrogerProduct | null {
  return null;
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function useKroger() {
  return {
    isConnected: false,
    connect: async () => {},
    disconnect: async () => {},
    getLocation: async (_zip: string) => null,
    searchProducts: async (_query: string) => [],
    addToCart: async (_items: CartItem[]) => {},
    getCart: async () => [],
  };
}
