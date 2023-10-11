type WebRequestWithCallback =
  'onBeforeRequest' |
  'onBeforeSendHeaders' |
  'onHeadersReceived';

type WebRequestWithoutCallback =
  'onSendHeaders' |
  'onResponseStarted' |
  'onBeforeRedirect' |
  'onCompleted' |
  'onErrorOccurred';

export type WebRequestMethod = WebRequestWithCallback | WebRequestWithoutCallback;
export type URLPattern = string;

export interface ParseParametersFunction {
  (noParams?: []): IAliasParameters;
  (action: [action: Required<IAliasParameters>['action']]): IAliasParameters;
  (filterWithAction: [filter: IAliasParameters['filter'], action: Required<IAliasParameters>['action']]): IAliasParameters;
  (actionWithContext: [action: Required<IAliasParameters>['action'], context: IAliasParameters['context']]): IAliasParameters;
  (allParams: [filter: IAliasParameters['filter'], action: Required<IAliasParameters>['action'], context: IAliasParameters['context']]): IAliasParameters;
}
export interface AliasFunction {
  (method: WebRequestMethod): void | IListener;
  (method: WebRequestMethod, action: [action: Required<IAliasParameters>['action']]): void | IListener;
  (method: WebRequestMethod, filterWithAction: [filter: IAliasParameters['filter'], action: Required<IAliasParameters>['action']]): void | IListener;
  (method: WebRequestMethod, actionWithContext: [action: Required<IAliasParameters>['action'], context: IAliasParameters['context']]): void | IListener;
  (method: WebRequestMethod, allParams: [filter: IAliasParameters['filter'], action: Required<IAliasParameters>['action'], context: IAliasParameters['context']]): void | IListener;
}

export type IDetail = Electron.OnBeforeRequestListenerDetails
  | Electron.OnBeforeSendHeadersListenerDetails
  | Electron.OnHeadersReceivedListenerDetails
  | Electron.OnSendHeadersListenerDetails
  | Electron.OnResponseStartedListenerDetails
  | Electron.OnBeforeRedirectListenerDetails
  | Electron.OnCompletedListenerDetails
  | Electron.OnErrorOccurredListenerDetails;
export type IAction = (details?: IDetail, resolver?: (response: Electron.CallbackResponse) => void) => void | Promise<void> | Electron.CallbackResponse | Promise<Electron.CallbackResponse>;
export type IResolver = (appliers: IApplier[]) => Electron.CallbackResponse | Promise<Electron.CallbackResponse> | void;

export interface IFilter {
  urls: string[],
}

export interface IListener {
  id: string,
  urls: string[],
  action: IAction,
  context: IContext,
}

export interface IContext {
  priority?: number,
  origin?: string,
  order: number,
}

export interface IApplier {
  apply: IAction,
  context: IContext,
}

export interface IAliasParameters {
  unbind: boolean,
  filter: IFilter,
  action: IAction | null,
  context: Partial<IContext>;
}

export type IListenerCollection = Map<IListener['id'], IListener>;

export interface IBetterWebRequest {
  addListener(method: WebRequestMethod, filter: IFilter, action: IAction, context: Partial<IContext>): IListener;
  removeListener(method: WebRequestMethod, id: IListener['id']): void;
  clearListeners(method: WebRequestMethod): void;
  setResolver(requestMethod: WebRequestMethod, resolver: IResolver): void;
  matchListeners(url: string, listeners: IListenerCollection): IListener[];

  getListeners(): Map<WebRequestMethod, IListenerCollection>;
  getListenersFor(method: WebRequestMethod): IListenerCollection | undefined;
  getFilters(): Map<WebRequestMethod, Set<URLPattern>>;
  getFiltersFor(method: WebRequestMethod): Set<URLPattern> | undefined;
  hasCallback(method: WebRequestMethod): boolean;
}
