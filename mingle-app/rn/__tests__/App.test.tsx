/**
 * @format
 */

import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import App from '../App';

test('renders correctly', async () => {
  const consoleErrorSpy = jest
    .spyOn(console, 'error')
    .mockImplementation((...args: unknown[]) => {
      const [firstArg] = args;
      if (typeof firstArg === 'string') {
        if (firstArg.includes('react-test-renderer is deprecated')) return;
        if (firstArg.includes('The current testing environment is not configured to support act')) return;
      }
      // eslint-disable-next-line no-console
      console.warn(...args);
    });

  try {
    await ReactTestRenderer.act(() => {
      ReactTestRenderer.create(<App />);
    });
  } finally {
    consoleErrorSpy.mockRestore();
  }
});
