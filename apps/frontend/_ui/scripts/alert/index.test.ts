// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { showAlert } from './index';
import { MAX_ALERTS, CONTAINER_ID, DEFAULT_DURATION } from './constants';

describe('Alert queue logic', () => {
  let animateMock: any;

  beforeEach(() => {
    document.body.innerHTML = '';
    vi.useFakeTimers();

    // Mock the Web Animations API because jsdom lacks it
    animateMock = vi.fn(() => ({
      onfinish: null,
      oncancel: null,
    }));
    window.Element.prototype.animate = animateMock;
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('should enforce MAX_ALERTS even if triggers happen rapidly and concurrently', () => {
    // Spam the alerts synchronously
    for (let i = 0; i < MAX_ALERTS + 2; i++) {
      showAlert({ message: `Alert ${i}` });
    }

    const container = document.getElementById(CONTAINER_ID);
    expect(container).not.toBeNull();

    // Out of the MAX_ALERTS + 2 alerts, 2 should have animateOut called on them
    // Each animateOut calls `element.animate` with keyframes reversed.
    // animateIn is also called for every alert.
    // Total animate calls: (MAX_ALERTS + 2) for In + 2 for Out
    expect(animateMock).toHaveBeenCalledTimes(MAX_ALERTS + 4);

    // Furthermore, if we manually trigger the `onfinish` for the animation out, they should be removed.
    // In our code, animateMock returns an object with `onfinish`.
    // Let's just verify the latest alerts added.
    const messageSpans = Array.from(container!.querySelectorAll('span'));

    // We expect the original 2 to still be appended, but animating out. So we might have MAX_ALERTS + 2 elements.
    expect(messageSpans.length).toBe(MAX_ALERTS + 2);

    // But let's trigger the `onfinish` handlers of the animateOut mock results!
    const mockResults = animateMock.mock.results;
    for (const result of mockResults) {
      if (result.value && result.value.onfinish) {
        result.value.onfinish();
      }
    }

    // Now after they finish, the container should only hold MAX_ALERTS elements
    expect(container!.children.length).toBe(MAX_ALERTS);

    // The inner text of the remaining alerts should be the *latest* ones!
    const remainingSpans = Array.from(container!.querySelectorAll('span')).map((s) => s.textContent);

    for (let i = 0; i < MAX_ALERTS; i++) {
      expect(remainingSpans).toContain(`Alert ${i + 2}`);
    }
  });

  it('should remove alert when animation is cancelled (oncancel)', () => {
    showAlert({ message: 'cancel me' });

    const container = document.getElementById(CONTAINER_ID)!;
    expect(container.children.length).toBe(1);

    // animateIn is call 0, animateOut is call 1.
    // Advance timer to trigger animateOut (auto-dismiss timeout).
    vi.advanceTimersByTime(DEFAULT_DURATION);

    // Find the animateOut call's mock result (index 1) and fire oncancel on it.
    const mockResults = animateMock.mock.results;
    const animateOutResult = mockResults[1].value;
    animateOutResult.oncancel();

    expect(container.children.length).toBe(0);
  });
});
