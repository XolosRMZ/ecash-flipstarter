import { describe, expect, it } from 'vitest';
import { addressToScriptPubKey } from '../blockchain/ecashClient';

describe('addressToScriptPubKey', () => {
  it('derives a scriptPubKey from ecash cashaddr', async () => {
    const scriptPubKey = await addressToScriptPubKey(
      'ecash:qpjm4qgv50v5vc6dpf6nu0w0epp8tzdn7gt0e06ssk',
    );
    expect(scriptPubKey).toMatch(/^(76a914[0-9a-f]+88ac|a914[0-9a-f]+87)$/);
  });
});
