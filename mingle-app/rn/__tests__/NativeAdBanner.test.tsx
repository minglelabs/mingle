import React from 'react';
import ReactTestRenderer from 'react-test-renderer';

import { NativeAdBanner } from '../App';

function BannerAdMock(props: Record<string, unknown>) {
  return React.createElement('BannerAd', props);
}

function createAdModule() {
  return {
    BannerAd: BannerAdMock,
    BannerAdSize: {
      BANNER: 'BANNER',
    },
  };
}

describe('NativeAdBanner', () => {
  it('keeps the banner slot visible until the creative loads', async () => {
    const consoleErrorSpy = jest
      .spyOn(console, 'error')
      .mockImplementation((...args: unknown[]) => {
        const [firstArg] = args;
        if (typeof firstArg === 'string' && firstArg.includes('react-test-renderer is deprecated')) return;
        // eslint-disable-next-line no-console
        console.warn(...args);
      });

    try {
      let renderer: ReactTestRenderer.ReactTestRenderer | null = null;
      await ReactTestRenderer.act(() => {
        renderer = ReactTestRenderer.create(
          <NativeAdBanner
            adModule={createAdModule()}
            position="bottom"
            unitId="ca-app-pub-3940256099942544/6300978111"
            heightPx={50}
            frameWidthPx={390}
            topOffsetPx={0}
            bottomOffsetPx={0}
            ready
            reloadToken={0}
          />,
        );
      });

      expect(renderer).not.toBeNull();
      expect(renderer!.root.findAllByProps({ testID: 'native-banner-fallback' }).length).toBeGreaterThan(0);

      const bannerAd = renderer!.root.findByType(BannerAdMock);
      await ReactTestRenderer.act(() => {
        bannerAd.props.onAdLoaded({ width: 320, height: 50 });
      });

      expect(renderer!.root.findAllByProps({ testID: 'native-banner-fallback' })).toHaveLength(0);
    } finally {
      consoleErrorSpy.mockRestore();
    }
  });

  it('removes the production fallback badge when Google returns no fill', async () => {
    const consoleWarnSpy = jest
      .spyOn(console, 'warn')
      .mockImplementation(() => {});
    const consoleErrorSpy = jest
      .spyOn(console, 'error')
      .mockImplementation((...args: unknown[]) => {
        const [firstArg] = args;
        if (typeof firstArg === 'string' && firstArg.includes('react-test-renderer is deprecated')) return;
        // eslint-disable-next-line no-console
        console.warn(...args);
      });

    try {
      let renderer: ReactTestRenderer.ReactTestRenderer | null = null;
      await ReactTestRenderer.act(() => {
        renderer = ReactTestRenderer.create(
          <NativeAdBanner
            adModule={createAdModule()}
            position="bottom"
            unitId="ca-app-pub-7057041881494735/6522262692"
            heightPx={50}
            frameWidthPx={390}
            topOffsetPx={0}
            bottomOffsetPx={0}
            ready
            reloadToken={0}
          />,
        );
      });

      expect(renderer).not.toBeNull();
      expect(renderer!.root.findAllByProps({ testID: 'native-banner-fallback' }).length).toBeGreaterThan(0);

      const bannerAd = renderer!.root.findByType(BannerAdMock);
      await ReactTestRenderer.act(() => {
        bannerAd.props.onAdFailedToLoad(new Error('no fill'));
      });

      expect(renderer!.root.findAllByProps({ testID: 'native-banner-fallback' })).toHaveLength(0);
    } finally {
      consoleErrorSpy.mockRestore();
      consoleWarnSpy.mockRestore();
    }
  });
});
