/**
 * Typed localStorage-backed store API.
 *
 * Each store instance is scoped by its own `storageKey` and schema type.
 *
 * @typeParam TSchema - Object shape persisted by the store.
 */
export interface Store<TSchema extends object> {
  /**
   * Returns the full persisted state.
   *
   * When storage is empty or invalid, the store falls back to the initial state.
   *
   * @returns Current state object.
   */
  get(): TSchema;

  /**
   * Replaces the full persisted state.
   *
   * @param nextState - Full next state to persist.
   */
  set(nextState: TSchema): void;

  /**
   * Merges a partial object into the current state and persists the result.
   *
   * @param partialState - Partial state fields to merge.
   * @returns The merged and persisted state.
   */
  patch(partialState: Partial<TSchema>): TSchema;

  /**
   * Returns a single typed value from the current state.
   *
   * @typeParam TKey - Key of the target field in the schema.
   * @param key - Field name to read.
   * @returns Field value, or `undefined` when the key is missing.
   */
  getItem<TKey extends keyof TSchema>(key: TKey): TSchema[TKey] | undefined;

  /**
   * Sets a single typed value, persists it, and returns the next state.
   *
   * @typeParam TKey - Key of the target field in the schema.
   * @param key - Field name to write.
   * @param value - Typed value for the field.
   * @returns Updated and persisted state.
   */
  setItem<TKey extends keyof TSchema>(key: TKey, value: TSchema[TKey]): TSchema;

  /**
   * Removes a key from the state object, persists, and returns the next state.
   *
   * @typeParam TKey - Key of the target field in the schema.
   * @param key - Field name to remove.
   * @returns Updated and persisted state.
   */
  removeItem<TKey extends keyof TSchema>(key: TKey): TSchema;

  /**
   * Removes the stored entry for this store key from localStorage.
   *
   * After clearing, subsequent reads return the initial state.
   */
  clear(): void;
}

/**
 * Creates a simple, strictly typed localStorage store for a module.
 *
 * If storage is empty or contains invalid JSON, reads fall back to `initialState`.
 *
 * @typeParam TSchema - Object shape persisted by the store.
 * @param storageKey - localStorage key used to persist the store.
 * @param initialState - Fallback state used when nothing valid is stored.
 * @returns A typed store instance bound to the provided key.
 */
export function createStore<TSchema extends object>(storageKey: string, initialState: TSchema): Store<TSchema> {
  const readState = (): TSchema => {
    const raw = localStorage.getItem(storageKey);

    if (raw === null) {
      return structuredClone(initialState);
    }

    try {
      return structuredClone(JSON.parse(raw) as TSchema);
    } catch {
      return structuredClone(initialState);
    }
  };

  const writeState = (state: TSchema): void => {
    localStorage.setItem(storageKey, JSON.stringify(state));
  };

  return {
    get(): TSchema {
      return readState();
    },
    set(nextState: TSchema): void {
      writeState(nextState);
    },
    patch(partialState: Partial<TSchema>): TSchema {
      const nextState = { ...readState(), ...partialState };
      writeState(nextState);
      return nextState;
    },
    getItem<TKey extends keyof TSchema>(key: TKey): TSchema[TKey] | undefined {
      return readState()[key];
    },
    setItem<TKey extends keyof TSchema>(key: TKey, value: TSchema[TKey]): TSchema {
      const nextState = { ...readState(), [key]: value } as TSchema;
      writeState(nextState);
      return nextState;
    },
    removeItem<TKey extends keyof TSchema>(key: TKey): TSchema {
      const currentState = readState();
      const nextState = { ...currentState };
      delete nextState[key];
      writeState(nextState);
      return nextState;
    },
    clear(): void {
      localStorage.removeItem(storageKey);
    },
  };
}
