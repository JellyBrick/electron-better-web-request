import betterWebRequest from './electron-better-web-request';

import type { Session } from 'electron';

const store = new Set<Session>();

const enhanceWebRequest = (session: Session): Session => {
  if (store.has(session)) {
    return session;
  }

  Object.defineProperty(session, 'webRequest', {
    value: betterWebRequest(session),
    writable: false,
  });

  store.add(session);

  return session;
};

export default enhanceWebRequest;
