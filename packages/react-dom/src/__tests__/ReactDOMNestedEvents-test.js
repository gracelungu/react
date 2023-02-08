/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @emails react-core
 */

'use strict';

describe('ReactDOMNestedEvents', () => {
  let React;
  let ReactDOMClient;
  let Scheduler;
  let act;
  let useState;
  let dispatchCustomEvent;

  beforeEach(() => {
    jest.resetModules();
    React = require('react');
    ReactDOMClient = require('react-dom/client');
    Scheduler = require('scheduler');
    act = require('jest-react').act;
    useState = React.useState;
    dispatchCustomEvent = (el) => {
      // Jest doesn't set window.event for custom events
      const prevEvent = window.event;
      const customEvent = new Event('custom');
      window.event = customEvent;
      el.dispatchEvent(customEvent);
      window.event = prevEvent;     
    };
  });

  it('nested event dispatches should not cause updates to flush', async () => {
    const buttonRef = React.createRef(null);
    function App() {
      const [isClicked, setIsClicked] = useState(false);
      const [isFocused, setIsFocused] = useState(false);
      const onClick = () => {
        setIsClicked(true);
        const el = buttonRef.current;
        el.focus();
        // The update triggered by the focus event should not have flushed yet.
        // Nor the click update. They would have if we had wrapped the focus
        // call in `flushSync`, though.
        Scheduler.unstable_yieldValue(
          'Value right after focus call: ' + el.innerHTML,
        );
      };
      const onFocus = () => {
        setIsFocused(true);
      };
      return (
        <>
          <button ref={buttonRef} onFocus={onFocus} onClick={onClick}>
            {`Clicked: ${isClicked}, Focused: ${isFocused}`}
          </button>
        </>
      );
    }

    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = ReactDOMClient.createRoot(container);

    await act(async () => {
      root.render(<App />);
    });
    expect(buttonRef.current.innerHTML).toEqual(
      'Clicked: false, Focused: false',
    );

    await act(async () => {
      buttonRef.current.click();
    });
    expect(Scheduler).toHaveYielded([
      'Value right after focus call: Clicked: false, Focused: false',
    ]);
    expect(buttonRef.current.innerHTML).toEqual('Clicked: true, Focused: true');
  });

  fit('custom events inside a discrete event is batched with sync updates and flushed synchronously', async () => {
    const buttonRef = React.createRef(null);
    function App() {
      const [isClicked, setIsClicked] = useState(false);
      const [isCustom, setIsCustom] = useState(false);
      const onClick = () => {
        setIsClicked(true);
        dispatchCustomEvent(buttonRef.current);
      };
      const onCustomEvent = ()  => {
        console.log(window.event.type);
        setIsCustom(true);
      }
      React.useEffect(() => {
        buttonRef.current.addEventListener('custom', onCustomEvent);
        return () => {
          buttonRef.current.removeEventListener('custom', onCustomEvent);
        }
      }, []);
      Scheduler.unstable_yieldValue(
        `render: ${isClicked} / ${isCustom}`,
      );
      return <button ref={buttonRef} onClick={onClick}/>;
    }

    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = ReactDOMClient.createRoot(container);

    await act(async () => {
      root.render(<App />);
    });
    expect(Scheduler).toHaveYielded([
      "render: false / false",
    ]);

    await act(async () => {
      buttonRef.current.click();
    });
    expect(Scheduler).toHaveYielded([
      "render: true / true",
    ]);
  })

  fit('custom events inside a discrete event flushes synchronously', async () => {
    const buttonRef = React.createRef(null);
    function App() {
      const [isClicked, setIsClicked] = useState(false);
      const [isCustom, setIsCustom] = useState(false);
      const onClick = () => {
        // Make `setIsClicked` not sync
        dispatchCustomEvent(buttonRef.current);
      };
      const onCustomEvent = ()  => {
        console.log('set custom', window.event);
        setIsCustom(true);
      }
      React.useEffect(() => {
        buttonRef.current.addEventListener('custom', onCustomEvent);
        return () => {
          buttonRef.current.removeEventListener('custom', onCustomEvent);
        }
      }, []);
      Scheduler.unstable_yieldValue(
        `render: ${isClicked} / ${isCustom}`,
      );
      return <button ref={buttonRef} onClick={onClick}/>;
    }

    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = ReactDOMClient.createRoot(container);

    await act(async () => {
      root.render(<App />);
    });
    expect(Scheduler).toHaveYielded([
      "render: false / false",
    ]);

    await act(async () => {
      queueMicrotask(() => {
        Scheduler.unstable_yieldValue('Sync');
      })
      Scheduler.unstable_scheduleCallback(
        Scheduler.unstable_ImmediatePriority,
        () => {
          Scheduler.unstable_yieldValue('Immediate');
          },
      );
      buttonRef.current.click();
    });

    expect(Scheduler).toHaveYielded([
      "render: false / true",
    ]);
  })
});
