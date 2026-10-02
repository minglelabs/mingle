import { createNativeIapBridge, sanitizeIapProductIds, type NativeIapEvent } from '../src/nativeIap';

jest.mock('react-native', () => ({ Platform: { OS: 'ios' } }));

function fixture() {
  const events: NativeIapEvent[] = [];
  let onPurchase: (purchase: any) => void = () => {};
  let onError: (error: any) => void = () => {};
  const library = {
    initConnection: jest.fn(async () => true),
    fetchProducts: jest.fn(async () => [
      { id: 'coin_1000', displayPrice: '₩1,500', currency: 'KRW' },
    ]),
    requestPurchase: jest.fn(async () => null),
    finishTransaction: jest.fn(async () => undefined),
    getAvailablePurchases: jest.fn(async () => [] as any[]),
    purchaseUpdatedListener: jest.fn((listener: (purchase: any) => void) => {
      onPurchase = listener;
      return { remove: () => {} };
    }),
    purchaseErrorListener: jest.fn((listener: (error: any) => void) => {
      onError = listener;
      return { remove: () => {} };
    }),
  };
  const bridge = createNativeIapBridge({
    emit: (event) => events.push(event),
    loadLibrary: () => library as any,
    platform: 'ios',
  });
  return { bridge, events, library, purchase: (p: any) => onPurchase(p), fail: (e: any) => onError(e) };
}

const paid = { id: 'tx-1', productId: 'coin_1000', purchaseState: 'purchased', purchaseToken: 'jws-token' };

describe('native IAP bridge', () => {
  it('reports store prices exactly as the store formats them', async () => {
    const { bridge, events, library } = fixture();
    await bridge.getProducts(['coin_1000'], 'r1');
    expect(library.fetchProducts).toHaveBeenCalledWith({ skus: ['coin_1000'], type: 'in-app' });
    expect(events).toEqual([{
      type: 'products', requestId: 'r1', platform: 'ios',
      products: [{ productId: 'coin_1000', displayPrice: '₩1,500', currency: 'KRW' }],
    }]);
  });

  it('hands the store proof to the web app and finishes only when told to', async () => {
    const { bridge, events, library, purchase } = fixture();
    await bridge.purchase('coin_1000');
    purchase(paid);
    expect(events).toEqual([{
      type: 'purchase_success', platform: 'ios', productId: 'coin_1000',
      transactionId: 'tx-1', purchaseToken: 'jws-token', restored: false,
    }]);
    expect(library.finishTransaction).not.toHaveBeenCalled();

    await bridge.finish('tx-1');
    expect(library.finishTransaction).toHaveBeenCalledWith({ purchase: paid, isConsumable: true });
    await bridge.finish('tx-1');
    expect(library.finishTransaction).toHaveBeenCalledTimes(1);
  });

  it('maps cancellation, pending approval and failures to separate events', async () => {
    const { bridge, events, purchase, fail } = fixture();
    await bridge.purchase('coin_5000');
    fail({ code: 'user-cancelled' });
    purchase({ ...paid, purchaseState: 'pending' });
    fail({ code: 'network-error', productId: 'coin_5000' });
    expect(events).toEqual([
      { type: 'purchase_cancelled', productId: 'coin_5000' },
      { type: 'purchase_pending', productId: 'coin_1000' },
      { type: 'purchase_error', productId: 'coin_5000', code: 'network-error' },
    ]);
  });

  it('replays paid but unfinished purchases on restore', async () => {
    const { bridge, events, library } = fixture();
    library.getAvailablePurchases.mockResolvedValueOnce([paid]);
    await bridge.restore();
    expect(events).toEqual([expect.objectContaining({ type: 'purchase_success', transactionId: 'tx-1', restored: true })]);
  });

  it('retries the store connection after a failure', async () => {
    const { bridge, events, library } = fixture();
    library.initConnection.mockRejectedValueOnce(new Error('offline'));
    await bridge.getProducts(['coin_1000']);
    expect(events[0]).toEqual({ type: 'purchase_error', productId: '', code: 'products_unavailable', requestId: undefined });
    await bridge.getProducts(['coin_1000']);
    expect(events[1].type).toBe('products');
  });

  it('accepts only plain product ids', () => {
    expect(sanitizeIapProductIds(['coin_1000', 'coin_1000', 'bad id', 7, '<x>'])).toEqual(['coin_1000']);
    expect(sanitizeIapProductIds('coin_1000')).toEqual([]);
  });
});
