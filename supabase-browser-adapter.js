(function attachSupabaseRuntime(globalScope) {
  const fallbackConfig = {
    runtimeMode: "demo-local",
    projectName: "Bishop Goal Tracker",
    supabase: {
      url: "",
      anonKey: "",
      projectLabel: "",
      storageKey: "bishop-goal-tracker-state-v1",
      snapshotTable: "app_runtime_snapshots",
      snapshotScope: "default",
      adminUserManagementFunction: "admin-user-management"
    }
  };

  const config = globalScope.BishopGoalTrackerConfig || fallbackConfig;
  const supabaseConfig = config.supabase || fallbackConfig.supabase;
  const hasRuntimeConfig = Boolean(supabaseConfig.url && supabaseConfig.anonKey);
  const hasSupabaseSdk = Boolean(globalScope.supabase && typeof globalScope.supabase.createClient === "function");

  globalScope.BishopGoalTrackerBackend = {
    runtimeMode: config.runtimeMode || "demo-local",
    projectName: config.projectName || fallbackConfig.projectName,
    supabase: supabaseConfig,
    hasRuntimeConfig,
    hasSupabaseSdk,
    canBootSupabase: Boolean(config.runtimeMode === "supabase" && hasRuntimeConfig && hasSupabaseSdk),
    statusMessage:
      config.runtimeMode === "supabase"
        ? hasRuntimeConfig
          ? hasSupabaseSdk
            ? "Supabase runtime is configured and ready for API integration."
            : "Supabase mode is selected, but the Supabase browser SDK is not loaded yet."
          : "Supabase mode is selected, but the project URL and anon key still need to be added to app-config.js."
        : "Running in demo local mode with browser storage."
  };
})(window);
