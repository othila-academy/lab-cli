// Client HTTP sans dépendance qui gère le proxy lui-même (validé par un spike de Node 18 à 25) :
// requête ordinaire sans proxy ; URL absolue adressée au proxy pour le HTTP en clair ;
// tunnel CONNECT puis TLS pour le HTTPS. NO_PROXY exclut des hôtes, localhost en premier.
import http from 'node:http';
import https from 'node:https';
import tls from 'node:tls';

function noProxyMatches(hostname) {
  const list = (process.env.NO_PROXY ?? process.env.no_proxy ?? '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
  const host = hostname.toLowerCase();
  return list.some((entry) => entry === '*' || host === entry || host.endsWith(`.${entry.replace(/^\./, '')}`));
}

export function proxyFor(target) {
  if (noProxyMatches(target.hostname)) return null;
  const value = target.protocol === 'https:'
    ? process.env.HTTPS_PROXY ?? process.env.https_proxy
    : process.env.HTTP_PROXY ?? process.env.http_proxy;
  return value ? new URL(value) : null;
}

export function request(urlString, { method = 'GET', headers = {}, body, timeoutMs = 3000 } = {}) {
  const target = new URL(urlString);
  const proxy = proxyFor(target);
  const allHeaders = { host: target.host, ...headers };
  if (body !== undefined) allHeaders['content-length'] = Buffer.byteLength(body);

  return new Promise((resolve, reject) => {
    let settled = false;
    let active = null;
    const timer = setTimeout(() => {
      finish(reject)(new Error(`délai de ${timeoutMs} ms dépassé vers ${target.host}`));
      active?.destroy();
    }, timeoutMs);
    function finish(fn) {
      return (value) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        fn(value);
      };
    }
    const onResponse = (res) => {
      let data = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => (data += chunk));
      res.on('end', finish(() => resolve({ status: res.statusCode, headers: res.headers, body: data })));
      res.on('error', finish(reject));
    };
    const send = (req) => {
      active = req;
      req.on('error', finish(reject));
      req.end(body);
    };

    if (!proxy) {
      const mod = target.protocol === 'https:' ? https : http;
      send(mod.request(target, { method, headers: allHeaders }, onResponse));
      return;
    }
    if (target.protocol === 'http:') {
      send(http.request({ host: proxy.hostname, port: proxy.port || 80, method, path: target.href, headers: allHeaders }, onResponse));
      return;
    }
    const connect = http.request({ host: proxy.hostname, port: proxy.port || 80, method: 'CONNECT', path: `${target.hostname}:${target.port || 443}` });
    active = connect;
    connect.on('connect', (res, socket) => {
      if (res.statusCode !== 200) {
        finish(reject)(new Error(`le proxy refuse le tunnel : ${res.statusCode}`));
        socket.destroy();
        return;
      }
      send(https.request(
        { host: target.hostname, path: target.pathname + target.search, method, headers: allHeaders, agent: false, createConnection: () => tls.connect({ socket, servername: target.hostname }) },
        onResponse
      ));
    });
    connect.on('error', finish(reject));
    connect.end();
  });
}

const parseJson = (text) => {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
};

export async function postJson(url, payload, { headers = {}, timeoutMs } = {}) {
  const { status, body } = await request(url, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(payload), timeoutMs });
  return { status, json: parseJson(body) };
}

export async function getJson(url, { headers = {}, timeoutMs } = {}) {
  const { status, body } = await request(url, { method: 'GET', headers, timeoutMs });
  return { status, json: parseJson(body) };
}

export async function putJson(url, payload, { headers = {}, timeoutMs } = {}) {
  const { status, body } = await request(url, { method: 'PUT', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(payload), timeoutMs });
  return { status, json: parseJson(body) };
}
