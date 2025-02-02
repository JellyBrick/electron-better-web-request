import betterWebRequest, { type BetterWebRequest } from './electron-better-web-request';

import type { Session } from 'electron';

export type BetterSession = Omit<Electron.Session, 'webRequest'> & { webRequest: BetterWebRequest & Electron.WebRequest };

const store = new Set<Session>();

const enhanceWebRequest = (session: Session): BetterSession => {
  if (store.has(session)) {
    return session as BetterSession;
  }

  Object.defineProperty(session, 'webRequest', {
    value: betterWebRequest(session),
    writable: false,
  });

  store.add(session);

  return session as BetterSession;
};

export default enhanceWebRequest;
