/* eslint-disable @typescript-eslint/ban-ts-comment,@typescript-eslint/no-explicit-any */

import assert = require('assert');

import { BetterWebRequest } from '../src/electron-better-web-request';

import type { CallbackResponse } from 'electron';

describe('Electron Better Web Request', () => {
  it('executes', () => {
    // Mock the function that registers a listener in electron-web-request (and triggers it)
    const mockedWebRequest = {
      onBeforeRequest: (filters: any, listenerFactory: any) => {
        // Just assert the filters
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        assert.equal(filters.urls[0], '*://test.url/');
        // Then trigger the listenerFactory, mimicking a instant trigger
        // eslint-disable-next-line @typescript-eslint/no-unsafe-call
        listenerFactory(
          { result : 'failure', method : 'onBeforeRequest', url: 'http://test.url' },
          // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
          (response: any) => assert.equal(response.result, 'success')
        );
      },
    };

    // Create a listener with an exepected signature
    const fakeListener = (details: any, callback: ((response: CallbackResponse) => void) | undefined) => {
      const response = { ...details, ...{ result: 'success' } } as CallbackResponse;
      callback?.(response);
    };

    // Add the listener
    const webRq = new BetterWebRequest(mockedWebRequest as Electron.WebRequest);
    webRq.addListener('onBeforeRequest', { urls: ['*://test.url/'] }, fakeListener, { origin: 'EXEC' });

    // Pray
  });

  it('does not use callback when the method is without callback', () => {
    const mockedWebRequest = {
      // @ts-ignore
      onSendHeaders: (filters: any, listenerFactory: any) => {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-call
        listenerFactory(
          { result: 'received', method: 'onSendHeaders', url: 'http://nop.url' },
          () => assert.fail('Callback should not have been called')
        );
      },
    };

    // Create a listener with an exepected signature
    const fakeListener = (details: any, callback: ((response: CallbackResponse) => void) | undefined) => {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      assert.equal(details.result, 'received');
      callback?.(details as CallbackResponse);
    };

    // Add the listener
    const webRq = new BetterWebRequest(mockedWebRequest as Electron.WebRequest);
    webRq.addListener('onSendHeaders', { urls: ['http://*.url/'] }, fakeListener, { origin: 'NO CALLBACK' });
  });

  it('does not executes when no listeners matches the url', () => {
    const mockedWebRequest = {
      // @ts-ignore
      onBeforeRequest: (filters: any, listenerFactory: any) => {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-call
        listenerFactory({ method: 'onBeforeRequest', url: 'http://nop.url' });
      },
    };

    // Create a listener with an exepected signature
    // @ts-ignore
    const fakeListener = (details: any, callback: ((response: CallbackResponse) => void) | undefined) => {
      assert.fail('Listener should not have been called');
    };

    // Add the listener
    const webRq = new BetterWebRequest(mockedWebRequest as Electron.WebRequest);
    webRq.addListener('onBeforeRequest', { urls: ['http://*.different/'] }, fakeListener, { origin: 'NO CALLBACK' });
  });

  it('unsubscribes when no listeners at all are registered for a method', () => {
    // This mockup has 2 function that will :
    // onBeforeRequest    -> will be triggered when executing addListener
    //                    -> then the listenerFactory inside will pretend to run for onHeadersReceived
    //                    -> no registered listener will be found for onHeadersReceived
    //                    -> will try to unsubscribe from onHeadersReceived hook
    // onHeadersReceived  -> will be called when the listenerFactory will try to unsubscribe
    const mockedWebRequest = {
      // @ts-ignore
      onBeforeRequest: (filters: any, listenerFactory: any) => {
        // Make the listener factory pretend it has been called for a different method
        // eslint-disable-next-line @typescript-eslint/no-unsafe-call
        listenerFactory({ method: 'onHeadersReceived', url: 'http://nop.url' });
      },
      // Will be called again with 'null', since no registered listener will be found
      onHeadersReceived: (arg: any) => {
        assert.equal(arg, null);
      },
    };

    // Create a listener with an exepected signature
    // @ts-ignore
    const fakeListener = (details: any, callback: ((response: CallbackResponse) => void) | undefined) => {
      assert.fail('Listener should not have been called');
    };

    // Add the listener to the first method
    const webRq = new BetterWebRequest(mockedWebRequest as Electron.WebRequest);
    webRq.addListener('onBeforeRequest', { urls: ['http://*.different/'] }, fakeListener, { origin: 'NO CALLBACK' });
  });
});
