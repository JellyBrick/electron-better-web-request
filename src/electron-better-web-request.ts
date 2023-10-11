import { Session } from 'electron';
import { matchPattern } from 'browser-extension-url-match';
import { v4 as uuid } from 'uuid';

import {
  IBetterWebRequest,
  WebRequestMethod,
  URLPattern,
  IFilter,
  IListener,
  IContext,
  IApplier,
  IListenerCollection,
  IAliasParameters,
  ParseParametersFunction, AliasFunction, IResolver, IAction, IDetail,
} from './types';

const defaultResolver = ((listeners) => {
  const sorted = listeners.sort((a, b) => b.context.order - a.context.order);
  const last = sorted[0];
  return last.apply();
}) as IResolver;

const methodsWithCallback = [
  'onBeforeRequest',
  'onBeforeSendHeaders',
  'onHeadersReceived',
];

const aliasMethods: WebRequestMethod[] = [
  'onBeforeRequest',
  'onBeforeSendHeaders',
  'onHeadersReceived',
  'onSendHeaders',
  'onResponseStarted',
  'onBeforeRedirect',
  'onCompleted',
  'onErrorOccurred',
];

export class BetterWebRequest implements IBetterWebRequest {
  private readonly webRequest: Electron.WebRequest;

  private orderIndex: number;
  private readonly listeners: Map<WebRequestMethod, IListenerCollection>;
  private readonly filters: Map<WebRequestMethod, Set<URLPattern>>;
  private resolvers: Map<WebRequestMethod, IResolver>;

  constructor(webRequest: Electron.WebRequest) {
    this.orderIndex = 0;
    this.webRequest = webRequest;
    this.listeners = new Map();
    this.filters = new Map();
    this.resolvers = new Map();
  }

  private get nextIndex() {
    return this.orderIndex += 1;
  }

  getListeners() {
    return this.listeners;
  }

  getListenersFor(method: WebRequestMethod) {
    return this.listeners.get(method);
  }

  getFilters() {
    return this.filters;
  }

  getFiltersFor(method: WebRequestMethod) {
    return this.filters.get(method);
  }

  hasCallback(method: WebRequestMethod): boolean {
    return methodsWithCallback.includes(method);
  }

  /**
   * Handling alias for drop-in replacement
   */
  alias: AliasFunction = (method, parameters = []) => {
    const args = this.parseArguments(parameters as never);
    return this.identifyAction(method, args);
  };

  addListener(
    method: WebRequestMethod,
    filter: IFilter,
    action: IListener['action'],
    outerContext: Partial<IContext> = {},
  ) {
    const { urls } = filter;
    const id = uuid();
    const innerContext = { order: this.nextIndex };
    const context = { ...outerContext, ...innerContext };
    const listener: IListener = {
      id,
      urls,
      action,
      context,
    };

    // Add listener to method map
    if (!this.listeners.has(method)) {
      this.listeners.set(method, new Map());
    }

    this.listeners.get(method)!.set(id, listener);

    // Add filters to the method map
    if (!this.filters.has(method)) {
      this.filters.set(method, new Set());
    }

    const currentFilters = this.filters.get(method)!;
    for (const url of urls) {
      currentFilters.add(url);
    }

    // Remake the new hook
    // eslint-disable-next-line @typescript-eslint/no-unsafe-call,@typescript-eslint/no-explicit-any
    (this.webRequest[method] as any)({ urls: [...currentFilters] }, this.listenerFactory(method));

    return listener;
  }

  removeListener(method: WebRequestMethod, id: IListener['id']) {
    const listeners = this.listeners.get(method);

    if (!listeners || !listeners.has(id)) {
      return;
    }

    if (listeners.size === 1) {
      this.clearListeners(method);
    } else {
      listeners.delete(id);

      const newFilters = this.mergeFilters(listeners);
      this.filters.set(method, newFilters);

      // Rebind the new hook
      // eslint-disable-next-line @typescript-eslint/no-unsafe-call,@typescript-eslint/no-explicit-any
      (this.webRequest[method] as any)([...newFilters], this.listenerFactory(method));
    }
  }

  clearListeners(method: WebRequestMethod) {
    const listeners = this.listeners.get(method);
    const filters = this.filters.get(method);

    if (listeners) listeners.clear();
    if (filters) filters.clear();

    // eslint-disable-next-line @typescript-eslint/no-unsafe-call,@typescript-eslint/no-explicit-any
    (this.webRequest[method] as any)(null);
  }

  setResolver(method: WebRequestMethod, resolver: IResolver) {
    if (!this.hasCallback(method)) {
      console.warn(`Event method "${method}" has no callback and does not use a resolver`);
      return;
    }

    if (this.resolvers.has(method)) {
      console.warn(`Overriding resolver on "${method}" method event`);
    }

    this.resolvers.set(method, resolver);
  }

  /**
   * Find a subset of listeners that match a given url
   */
  matchListeners(url: string, listeners: IListenerCollection): IListener[] {
    const arrayListeners = Array.from(listeners.values());

    return arrayListeners.filter(
      (element) => element.urls.some((value) => matchPattern(value).assertValid().match(url))
    );
  }

  /**
   * Workflow triggered when a web request arrive
   * Use the original listener signature needed by electron.webrequest.onXXXX()
   */
  private listenerFactory(method: WebRequestMethod) {
    return async (details: IDetail, callback?: (response: Electron.CallbackResponse) => void) => {
      if (!this.listeners.has(method)) {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-call,@typescript-eslint/no-explicit-any
        (this.webRequest[method] as any)(null);
        return;
      }

      const listeners = this.listeners.get(method);

      if (!listeners) {
        callback?.({ cancel: false });
        return;
      }

      const matchedListeners = this.matchListeners(details.url, listeners);

      if (matchedListeners.length === 0) {
        callback?.({ cancel: false });
        return;
      }

      const resolve = this.resolvers.get(method) ?? defaultResolver;
      const requestsProcesses = this.processRequests(details, matchedListeners);

      if (this.hasCallback(method) && callback) {
        const modified = await resolve(requestsProcesses);
        if (modified) {
          callback(modified);
        }
      } else {
        requestsProcesses.map((listener) => listener.apply());
      }
    };
  }

  /**
   * Create all the executions of listeners on the web request (independently)
   * Wrap them, so they can be triggered only when needed
   */
  private processRequests(details: IDetail, requestListeners: IListener[]): IApplier[] {
    const appliers: IApplier[] = [];

    for (const listener of requestListeners) {
      const apply = this.makeApplier(details, listener.action);

      appliers.push({
        apply,
        context: listener.context,
      });
    }

    return appliers;
  }

  /**
   * Factory : make a function that will return a Promise wrapping the execution of the listener
   * Allow to trigger the application only when needed + promisify the execution of this listener
   * @param details
   * @param listener
   */
  private makeApplier(details: IDetail, listener: IAction): () => Promise<Electron.CallbackResponse> {
    return () => new Promise<Electron.CallbackResponse>((resolve, reject) => {
      try {
        listener(details, resolve);
      } catch (err) {
        reject(err);
      }
    });
  }

  private mergeFilters(listeners: IListenerCollection): Set<URLPattern> {
    const arrayListeners = Array.from(listeners.values());

    return arrayListeners.reduce(
      (accumulator, value) => {
        for (const url of value.urls) accumulator.add(url);
        return accumulator;
      },
      new Set<URLPattern>()
    );
  }

  private parseArguments: ParseParametersFunction = (parameters = []) => {
    const args: IAliasParameters = {
      unbind: false,
      filter: { urls: ['<all_urls>'] },
      action: null,
      context: {},
    };

    switch (parameters.length) {
      case 0:
        args.unbind = true;
        break;

      case 1:
        if (typeof parameters[0] === 'function') {
          args.action = parameters[0];
          break;
        }

        throw new Error('Wrong function signature : No function listener given');

      case 2:
        if (typeof parameters[0] === 'object' && typeof parameters[1] === 'function') {
          args.filter = parameters[0]!;
          args.action = parameters[1];
          break;
        }

        if (typeof parameters[0] === 'function' && typeof parameters[1] === 'object') {
          args.action = parameters[0];
          args.context = parameters[1]!;
          break;
        }

        throw new Error('Wrong function signature : argument 1 should be an object filters or the function listener');

      case 3:
        if (typeof parameters[0] === 'object' && typeof parameters[1] === 'function') {
          args.filter = parameters[0];
          args.action = parameters[1];
          args.context = parameters[2];
          break;
        }

        throw new Error('Wrong function signature : should be arg 1 -> filter object, arg 2 -> function listener, arg 3 -> context');

      default:
        throw new Error('Wrong function signature : Too many arguments');
    }

    return args;
  };

  private identifyAction(method: WebRequestMethod, args: IAliasParameters) {
    const { unbind, filter, action, context } = args;

    if (unbind) {
      return this.clearListeners(method);
    }

    if (!action) {
      throw new Error(`Cannot bind with ${method} : a listener is missing.`);
    }

    return this.addListener(method, filter, action, context);
  }
}

/**
 * Proxy handler that add support for all alias methods by redirecting to BetterWebRequest.alias()
 */
const aliasHandler: ProxyHandler<BetterWebRequest> = {
  get(target, property: keyof typeof target) {
    if (typeof property === 'string') {
      if (aliasMethods.includes(property as WebRequestMethod)) {
        return (...parameters: unknown[]) => {
          target.alias(property as WebRequestMethod, parameters as never);
        };
      }
    }

    return target[property];
  },
};

export default (session: Session) => {
  return new Proxy(
    new BetterWebRequest(session.webRequest),
    aliasHandler
  );
};
