import { Platform } from 'react-native';
import type { Purchase, PurchaseError } from 'react-native-iap';

/**
 * In-app purchase bridge for the coin store (docs/coin-iap-spec.md 6.2).
 *
 * Web -> native: iap_get_products, iap_purchase, iap_finish, iap_restore.
 * Native -> web: `mingle:native-iap` events (products, purchase_pending,
 * purchase_success, purchase_cancelled, purchase_error).
 *
 * The shell never grants anything. It hands the store's proof (iOS signed
 * transaction, Android purchase token) to the web app, which posts it to the
 * server; only after the server confirms the grant does the web app send
 * iap_finish, which finishes (consumes) the transaction. A purchase that is
 * paid but not yet finished is replayed by iap_restore on the next launch.
 */

export const NATIVE_IAP_EVENT = 'mingle:native-iap';

export type NativeIapProduct = {
  productId: string;
  // The store's own localized price string; never converted by us.
  displayPrice: string;
  currency: string;
};

export type NativeIapEvent =
  | { type: 'products'; requestId?: string; platform: string; products: NativeIapProduct[] }
  | { type: 'purchase_pending'; productId: string }
  | {
      type: 'purchase_success';
      platform: string;
      productId: string;
      transactionId: string;
      purchaseToken: string;
      restored: boolean;
    }
  | { type: 'purchase_cancelled'; productId: string }
  | { type: 'purchase_error'; productId: string; code: string; requestId?: string };

type IapLibrary = Pick<
  typeof import('react-native-iap'),
  | 'initConnection'
  | 'fetchProducts'
  | 'requestPurchase'
  | 'finishTransaction'
  | 'getAvailablePurchases'
  | 'purchaseUpdatedListener'
  | 'purchaseErrorListener'
>;

export type NativeIapBridge = {
  getProducts: (productIds: string[], requestId?: string) => Promise<void>;
  purchase: (productId: string) => Promise<void>;
  finish: (transactionId: string) => Promise<void>;
  restore: () => Promise<void>;
};

const PRODUCT_ID_PATTERN = /^[A-Za-z0-9._-]{1,100}$/;

export function sanitizeIapProductIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const ids = value.filter((entry): entry is string => typeof entry === 'string' && PRODUCT_ID_PATTERN.test(entry));
  return [...new Set(ids)].slice(0, 20);
}

export function createNativeIapBridge(options: {
  emit: (event: NativeIapEvent) => void;
  // Loaded lazily so the store library is only touched when the store is used.
  loadLibrary?: () => IapLibrary;
  platform?: string;
}): NativeIapBridge {
  const { emit } = options;
  const platform = options.platform ?? Platform.OS;
  const loadLibrary = options.loadLibrary ?? (() => require('react-native-iap') as IapLibrary);
  // Paid, unfinished purchases by transaction id, kept until the server confirms the grant.
  const unfinished = new Map<string, Purchase>();
  let connection: Promise<IapLibrary> | null = null;
  let activeProductId = '';

  const emitPurchase = (purchase: Purchase, restored: boolean) => {
    if (purchase.purchaseState === 'pending') {
      emit({ type: 'purchase_pending', productId: purchase.productId });
      return;
    }
    const purchaseToken = purchase.purchaseToken || '';
    if (purchase.purchaseState !== 'purchased' || !purchase.id || !purchaseToken) return;
    unfinished.set(purchase.id, purchase);
    emit({
      type: 'purchase_success',
      platform,
      productId: purchase.productId,
      transactionId: purchase.id,
      purchaseToken,
      restored,
    });
  };

  const handleError = (error: PurchaseError) => {
    const productId = error.productId || activeProductId;
    const code = String(error.code || 'unknown');
    if (code === 'user-cancelled') emit({ type: 'purchase_cancelled', productId });
    else if (code === 'pending') emit({ type: 'purchase_pending', productId });
    else emit({ type: 'purchase_error', productId, code });
  };

  const connect = (): Promise<IapLibrary> => {
    if (!connection) {
      connection = (async () => {
        const library = loadLibrary();
        await library.initConnection();
        library.purchaseUpdatedListener((purchase) => emitPurchase(purchase, false));
        library.purchaseErrorListener(handleError);
        return library;
      })();
      // A failed connection must not be cached: the next call retries.
      connection.catch(() => {
        connection = null;
      });
    }
    return connection;
  };

  return {
    getProducts: async (productIds, requestId) => {
      try {
        const library = await connect();
        const products = (await library.fetchProducts({ skus: productIds, type: 'in-app' })) ?? [];
        emit({
          type: 'products',
          requestId,
          platform,
          products: products.map((product) => ({
            productId: product.id,
            displayPrice: product.displayPrice,
            currency: product.currency,
          })),
        });
      } catch {
        emit({ type: 'purchase_error', productId: '', code: 'products_unavailable', requestId });
      }
    },
    purchase: async (productId) => {
      activeProductId = productId;
      try {
        const library = await connect();
        // The result arrives through the purchase listeners registered in connect().
        await library.requestPurchase({
          request: { apple: { sku: productId }, google: { skus: [productId] } },
          type: 'in-app',
        });
      } catch (error) {
        handleError(error as PurchaseError);
      }
    },
    finish: async (transactionId) => {
      const purchase = unfinished.get(transactionId);
      if (!purchase) return;
      try {
        const library = await connect();
        await library.finishTransaction({ purchase, isConsumable: true });
        unfinished.delete(transactionId);
      } catch {
        // Left unfinished: the next restore replays it and the server grant is idempotent.
      }
    },
    restore: async () => {
      try {
        const library = await connect();
        const purchases = (await library.getAvailablePurchases()) ?? [];
        for (const purchase of purchases) emitPurchase(purchase, true);
      } catch {
        // Nothing to restore, or the store is unreachable; the user can retry from the store screen.
      }
    },
  };
}
