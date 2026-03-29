// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from "vitest";
import { createStore } from "./index";

describe("Store", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("should clone initialState to prevent mutations leaking back into the store fallback", () => {
    const initialState = { config: { theme: "light" } };
    const store = createStore("test-store", initialState);

    // Get the state when storage is empty (falls back to initialState)
    const state = store.get();
    expect(state).toEqual(initialState);

    // Mutate the returned state
    state.config.theme = "dark";

    // Request state again when storage is still empty
    const stateAgain = store.get();

    // Because it's cloned, the state should remain "light"
    expect(stateAgain.config.theme).toBe("light");
  });

  it("should clone stored data to prevent mutations leaking back into the store", () => {
    const store = createStore("test-store-2", { config: { theme: "light" } });
    store.set({ config: { theme: "dark" } });

    const state = store.get();
    expect(state.config.theme).toBe("dark");

    // Mutate the returned state
    state.config.theme = "light";

    // Request state again — should still be "dark" from storage
    const stateAgain = store.get();
    expect(stateAgain.config.theme).toBe("dark");
  });
});
