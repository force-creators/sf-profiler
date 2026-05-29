import { urlLogParam } from './storageKeys';

export function getUrlLogHash(): string | undefined {
  const hash = window.location.hash.startsWith('#')
    ? window.location.hash.slice(1)
    : window.location.hash;
  const params = new URLSearchParams(hash);
  const logHash = params.get(urlLogParam);

  return logHash ?? undefined;
}

export function setUrlLogHash(logHash: string) {
  const params = new URLSearchParams(
    window.location.hash.startsWith('#')
      ? window.location.hash.slice(1)
      : window.location.hash
  );
  params.set(urlLogParam, logHash);
  const nextUrl = `${window.location.pathname}${window.location.search}#${params.toString()}`;
  window.history.replaceState(null, '', nextUrl);
}

export function clearUrlLogHash() {
  const params = new URLSearchParams(
    window.location.hash.startsWith('#')
      ? window.location.hash.slice(1)
      : window.location.hash
  );
  params.delete(urlLogParam);
  const nextHash = params.toString();
  const nextUrl = `${window.location.pathname}${window.location.search}${
    nextHash ? `#${nextHash}` : ''
  }`;
  window.history.replaceState(null, '', nextUrl);
}
