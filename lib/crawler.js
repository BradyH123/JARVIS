'use strict';

/**
 * Deep web crawler — follows links from a starting page, several levels deep, to
 * pull as much data as possible from a site.
 *
 * Fetches pages server-side (Node fetch) so it's fast and doesn't disrupt the
 * browser, extracting title, text, links, meta, and JSON-LD from the raw HTML.
 *
 * Politeness / responsibility (this can hit a site many times):
 *   - same-origin by default (won't wander the whole internet),
 *   - hard caps on depth and total pages,
 *   - a rate-limit delay between requests,
 *   - honours robots.txt Disallow rules for `*`,
 *   - identifies itself with a User-Agent,
 *   - abortable (STOP) at any time.
 */

const { URL } = require('url');

const UA = 'JARVIS-Assistant/1.0 (personal data harvest; respects robots.txt)';

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/** Extract structured data from a raw HTML string. */
function extract(html, baseUrl) {
  const titleM = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html);
  const title = titleM ? titleM[1].replace(/\s+/g, ' ').trim() : '';

  const links = [];
  const seen = new Set();
  const aRe = /<a\s[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let m;
  while ((m = aRe.exec(html)) && links.length < 2500) {
    let href = m[1].trim();
    try {
      href = new URL(href, baseUrl).toString();
    } catch {
      continue;
    }
    if (!/^https?:/i.test(href)) continue;
    const key = href.split('#')[0];
    if (seen.has(key)) continue;
    seen.add(key);
    links.push({ href: key, text: m[2].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim().slice(0, 140) });
  }

  const meta = {};
  const metaRe = /<meta\s+[^>]*?(?:name|property)=["']([^"']+)["'][^>]*?content=["']([^"']*)["'][^>]*>/gi;
  while ((m = metaRe.exec(html))) if (!meta[m[1]]) meta[m[1]] = m[2].slice(0, 300);

  const jsonld = [];
  const ldRe = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  while ((m = ldRe.exec(html)) && jsonld.length < 30) {
    try {
      jsonld.push(JSON.parse(m[1]));
    } catch {
      /* skip bad block */
    }
  }

  const text = html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 200000);

  return { title, meta, jsonld, links, text };
}

async function fetchHtml(url, timeoutMs) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs || 15000);
  try {
    const resp = await fetch(url, {
      headers: { 'User-Agent': UA, Accept: 'text/html,application/xhtml+xml,*/*' },
      signal: ctrl.signal,
      redirect: 'follow',
    });
    const ct = resp.headers.get('content-type') || '';
    if (!resp.ok || !/text\/html|application\/xhtml/i.test(ct)) return { ok: false };
    const buf = await resp.arrayBuffer();
    return { ok: true, html: Buffer.from(buf).toString('utf8').slice(0, 3000000), finalUrl: resp.url || url };
  } catch {
    return { ok: false };
  } finally {
    clearTimeout(timer);
  }
}

async function loadRobots(origin) {
  try {
    const resp = await fetch(origin + '/robots.txt', { headers: { 'User-Agent': UA } });
    if (!resp.ok) return [];
    const body = (await resp.text()).slice(0, 200000);
    const dis = [];
    let applies = false;
    for (const raw of body.split('\n')) {
      const line = raw.trim();
      const lc = line.toLowerCase();
      if (lc.startsWith('user-agent:')) applies = line.slice(11).trim() === '*';
      else if (applies && lc.startsWith('disallow:')) {
        const p = line.slice(9).trim();
        if (p) dis.push(p);
      }
    }
    return dis;
  } catch {
    return [];
  }
}

function disallowed(url, rules) {
  if (!rules || !rules.length) return false;
  const p = new URL(url).pathname;
  return rules.some((d) => d && d !== '/' && p.startsWith(d));
}

/**
 * @param {object}   opts
 * @param {string}   opts.startUrl
 * @param {number}   [opts.maxDepth=2]     link levels to follow (capped at 5)
 * @param {number}   [opts.maxPages=50]    total pages (capped at 500)
 * @param {boolean}  [opts.sameOrigin=true]
 * @param {number}   [opts.delayMs=500]    politeness delay between fetches
 * @param {Function} [opts.onProgress]
 * @param {Function} [opts.shouldAbort]
 * @returns {Promise<Array>} one record per crawled page
 */
async function crawl(opts) {
  const start = String(opts.startUrl || '');
  if (!/^https?:/i.test(start)) return [];
  const maxDepth = Math.min(Math.max(opts.maxDepth ?? 2, 0), 5);
  const maxPages = Math.min(Math.max(opts.maxPages ?? 50, 1), 500);
  const sameOrigin = opts.sameOrigin !== false;
  const delayMs = Math.max(opts.delayMs ?? 500, 150);
  const onProgress = opts.onProgress || (() => {});
  const shouldAbort = opts.shouldAbort || (() => false);

  const startOrigin = new URL(start).origin;
  const robots = {};
  const visited = new Set();
  const results = [];
  const queue = [{ url: start.split('#')[0], depth: 0 }];

  while (queue.length && results.length < maxPages) {
    if (shouldAbort()) break;
    const { url, depth } = queue.shift();
    if (visited.has(url)) continue;
    visited.add(url);

    const origin = new URL(url).origin;
    if (!(origin in robots)) robots[origin] = await loadRobots(origin);
    if (disallowed(url, robots[origin])) continue;

    onProgress({ url, depth, done: results.length, queued: queue.length });
    const r = await fetchHtml(url, opts.timeoutMs);
    if (r.ok) {
      const data = extract(r.html, r.finalUrl);
      results.push({
        url: r.finalUrl,
        depth,
        title: data.title,
        meta: data.meta,
        jsonld: data.jsonld,
        text: data.text,
        links: data.links,
        counts: { links: data.links.length, chars: data.text.length },
      });
      if (depth < maxDepth) {
        for (const l of data.links) {
          const u = l.href;
          if (visited.has(u)) continue;
          if (sameOrigin && new URL(u).origin !== startOrigin) continue;
          if (queue.length < maxPages * 4) queue.push({ url: u, depth: depth + 1 });
        }
      }
    }
    await sleep(delayMs);
  }
  return results;
}

module.exports = { crawl, extract };
