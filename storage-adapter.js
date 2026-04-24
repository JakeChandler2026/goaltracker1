(function attachGoalTrackerStorage(globalScope) {
  const backendRuntime = globalScope.BishopGoalTrackerBackend || {
    runtimeMode: "demo-local",
    supabase: {
      storageKey: "bishop-goal-tracker-state-v1"
    },
    statusMessage: "Running in demo local mode with browser storage."
  };
  const storageKeyPrefix = backendRuntime.runtimeMode === "supabase" ? "supabase-staging" : "demo-local";

  const storage = {
    name: "browser-localStorage",
    mode: backendRuntime.runtimeMode,
    statusMessage: backendRuntime.statusMessage,
    getItem(key) {
      return globalScope.localStorage.getItem(`${storageKeyPrefix}:${key}`);
    },
    setItem(key, value) {
      globalScope.localStorage.setItem(`${storageKeyPrefix}:${key}`, value);
    },
    removeItem(key) {
      globalScope.localStorage.removeItem(`${storageKeyPrefix}:${key}`);
    }
  };

  globalScope.BishopGoalTrackerStorage = storage;
})(window);
