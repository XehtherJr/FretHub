import { test as base, expect, type BrowserContext } from '@playwright/test';

/** Block all browser network traffic except the isolated test app.
 * A fake service may register a more specific route after this guard. */
export async function blockExternalNetwork(context: BrowserContext) {
  await context.route('**/*', (route) => {
    const url = new URL(route.request().url());
    return url.origin === 'http://127.0.0.1:4175' ? route.continue() : route.abort('blockedbyclient');
  });
  await context.routeWebSocket('**/*', (socket) => socket.close({ code: 1008, reason: 'Browser tests do not use live services' }));
}

export const test = base.extend({
  context: async ({ context }, use) => {
    await blockExternalNetwork(context);
    await use(context);
  },
});
export { expect };
