/* eslint-disable @typescript-eslint/ban-ts-comment,@typescript-eslint/no-explicit-any */

import assert from 'assert';
import { EventEmitter } from 'events';

import { BetterWebRequest } from '../src/electron-better-web-request';

import type { Resolver } from '../src/types';
import type { CallbackResponse } from 'electron';

describe('Resolver', () => {
  describe('Default resolver', () => {
    it('resolves with the last registered listener', () => {
      const trigger = new EventEmitter();
      // Mock the function that registers a listener in electron-web-request (and triggers it)
      const mockedWebRequest = {
        // @ts-ignore
        onBeforeRequest: (filters: any, listenerFactory: any) => {
          // Then trigger the listenerFactory, mimicking a instant trigger
          trigger.on('on-before-request', () => {
            // eslint-disable-next-line @typescript-eslint/no-unsafe-call
            listenerFactory(
              { result : 'failure', method : 'onBeforeRequest', url: 'http://test.com' },
              // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
              (response: any) => assert.equal(response.result, 'BAZ')
            );
          });
        },
      };

      // Create different listeners with an exepected signature
      const fakeListenerFoo = () => assert.fail('Foo listener should not have been called');
      const fakeListenerBar = () => assert.fail('Foo listener should not have been called');
      const fakeListenerBaz = (details: any, callback?: Resolver) => {
        const response = { ...details, ...{ result: 'BAZ' } } as CallbackResponse;
        callback?.(response);
      };

      // Add listeners
      const webRq = new BetterWebRequest(mockedWebRequest as Electron.WebRequest);
      assert.doesNotThrow(() => {
        webRq.addListener('onBeforeRequest', { urls: ['*://test.com/'] }, fakeListenerFoo, { origin: 'FOO' });
        webRq.addListener('onBeforeRequest', { urls: ['*://test.com/'] }, fakeListenerBar, { origin: 'BAR' });
        webRq.addListener('onBeforeRequest', { urls: ['*://test.com/'] }, fakeListenerBaz, { origin: 'BAZ' });
      });

      // Pray
      trigger.emit('on-before-request');
    });
  });

  it('can use a custom resolver', () => {
    const mockedWebRequest = {
      onBeforeRequest: () => {},
      onBeforeSendHeaders: () => {},
      onBeforeRedirect: () => {},
      onCompleted: () => {},
      onErrorOccurred: () => {},
      onHeadersReceived: () => {},
      onResponseStarted: () => {},
      onSendHeaders: () => {},
    } satisfies Electron.WebRequest;
    const fakeListener = () => {};

    // Set a custom resolver, then add a listener to mock the trigger & call
    const webRq = new BetterWebRequest(mockedWebRequest);
    webRq.setResolver('onBeforeRequest', () => {
      assert.ok(true, 'Custom resolver has been called');
    });
    webRq.addListener('onBeforeRequest', { urls: ['*://test.com/'] }, fakeListener, { origin: 'FOO' });
  });
});
