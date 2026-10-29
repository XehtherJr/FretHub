import { spawn, spawnSync } from 'node:child_process';
import { expect, test } from './support/test';

test('rejects unsafe or ambiguous host opt-ins', async () => {
  for (const value of ['*', '.example.test', 'true', '127.0.0.1', 'https://example.test', 'example.test:5173']) {
    const result = spawnSync(process.execPath, ['node_modules/vite/bin/vite.js', '--port', '4178', '--strictPort'], {
      cwd: process.cwd(), encoding: 'utf8', timeout: 5000,
      env: { ...process.env, FRETHUB_ALLOWED_HOSTS: value },
    });
    expect(result.status, value).not.toBe(0);
    expect(result.stderr, value).toContain('FRETHUB_ALLOWED_HOSTS must contain exact DNS hostnames');
  }
});

for (const [mode, port] of [['dev', 4176], ['preview', 4177]] as const) {
  test(`${mode} rejects untrusted hosts by default`, async ({ request }) => {
    // Separate from the main preview, whose test explicitly opts in one host.
    const args = ['node_modules/vite/bin/vite.js', ...(mode === 'preview' ? ['preview', '--outDir', '.e2e-dist'] : []), '--port', String(port), '--strictPort'];
    const server = spawn(process.execPath, args, {
      cwd: process.cwd(),
      env: { ...process.env, FRETHUB_ALLOWED_HOSTS: '', VITE_SUPABASE_URL: 'http://127.0.0.1:54399', VITE_SUPABASE_ANON_KEY: 'frethub-browser-test-public-key' },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let output = '';
    const stopped = new Promise<void>((resolve) => server.once('close', () => resolve()));
    try {
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error(`Vite did not start: ${output}`)), 15_000);
        const onData = (chunk: Buffer) => {
          output += chunk.toString();
          const plain = output.replace(/\u001b\[[0-9;]*m/g, '');
          if (plain.includes(`http://127.0.0.1:${port}/`)) { clearTimeout(timer); resolve(); }
        };
        server.stdout.on('data', onData);
        server.stderr.on('data', onData);
        server.once('error', (error) => { clearTimeout(timer); reject(error); });
        server.once('exit', (code) => { clearTimeout(timer); reject(new Error(`Vite exited ${code}: ${output}`)); });
      });
      expect(output.replace(/\u001b\[[0-9;]*m/g, '')).toContain(`http://127.0.0.1:${port}/`);
      const local = await request.get(`http://127.0.0.1:${port}/`, { headers: { Host: 'localhost' } });
      const attacker = await request.get(`http://127.0.0.1:${port}/`, { headers: { Host: 'attacker.invalid' } });
      const notOptedIn = await request.get(`http://127.0.0.1:${port}/`, { headers: { Host: 'preview.frethub.test' } });
      expect(local.status()).toBe(200);
      expect(attacker.status()).toBe(403);
      expect(notOptedIn.status()).toBe(403);
    } finally {
      server.kill('SIGTERM');
      await stopped;
    }
  });
}
