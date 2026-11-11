import dns from 'node:dns/promises';
import https from 'node:https';
import http from 'node:http';
import net from 'node:net';

export function publicAddress(ip) {
  if (net.isIP(ip) === 4) {
    const [a, b] = ip.split('.').map(Number);
    return !(
      a === 0 ||
      a === 10 ||
      a === 127 ||
      a >= 224 ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 198 && (b === 18 || b === 19))
    );
  }
  // Allow only global-unicast IPv6; exclude mapped, local and special ranges.
  return net.isIP(ip) === 6 && /^[23]/.test(ip) && !ip.toLowerCase().startsWith('2001:db8:');
}

export async function openSource(raw, signal, hops = 0) {
  const url = new URL(raw);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password)
    throw new Error('Use a public HTTP or HTTPS file URL without embedded credentials.');
  if (hops > 5) throw new Error('The source redirected too many times.');
  const host = url.hostname.replace(/^\[|\]$/g, '');
  const addresses = net.isIP(host)
    ? [{ address: host, family: net.isIP(host) }]
    : await dns.lookup(host, { all: true });
  if (!addresses.length || addresses.some((a) => !publicAddress(a.address)))
    throw new Error('Local and private network URLs are not allowed.');
  const chosen = addresses[0];
  const response = await new Promise((resolve, reject) => {
    const req = (url.protocol === 'https:' ? https : http).get(
      url,
      {
        signal,
        headers: { 'User-Agent': 'URL-to-Drive/1.0', 'Accept-Encoding': 'identity' },
        lookup: (_hostname, options, cb) =>
          options.all ? cb(null, [chosen]) : cb(null, chosen.address, chosen.family),
      },
      resolve,
    );
    req.setTimeout(60000, () => req.destroy(new Error('The source stopped responding.')));
    req.on('error', reject);
  });
  if ([301, 302, 303, 307, 308].includes(response.statusCode) && response.headers.location) {
    response.destroy();
    return openSource(new URL(response.headers.location, url).href, signal, hops + 1);
  }
  if (response.statusCode !== 200) {
    response.destroy();
    throw new Error(`The source returned HTTP ${response.statusCode}. Use a direct download link.`);
  }
  return { response, url };
}

export function fileName(url, disposition = '') {
  const encoded = disposition.match(/filename\*=UTF-8''([^;]+)/i);
  const ordinary = disposition.match(/filename="([^"]+)"|filename=([^;]+)/i);
  let name =
    encoded?.[1] ||
    ordinary?.[1] ||
    ordinary?.[2] ||
    new URL(url).pathname.split('/').pop() ||
    'download';
  try {
    name = decodeURIComponent(name);
  } catch {}
  return (
    name
      .replace(/[\\/\x00-\x1f]/g, '_')
      .trim()
      .slice(0, 240) || 'download'
  );
}

export async function* chunks(stream, size = 8 * 1024 * 1024) {
  let pending = Buffer.alloc(0);
  for await (const chunk of stream) {
    pending = Buffer.concat([pending, chunk]);
    while (pending.length > size) {
      yield { data: pending.subarray(0, size), last: false };
      pending = pending.subarray(size);
    }
  }
  yield { data: pending, last: true };
}
