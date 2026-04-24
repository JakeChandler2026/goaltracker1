window.BishopGoalTrackerConfig = {
  runtimeMode: "supabase",
  projectName: "Bishop Goal Tracker",
  supabase: {
    url: "https://YOUR_PROJECT.supabase.co",
    anonKey: "YOUR_SUPABASE_ANON_KEY",
    projectLabel: "production",
    storageKey: "bishop-goal-tracker-state-v1",
    snapshotTable: "app_runtime_snapshots",
    snapshotScope: "default",
    adminUserManagementFunction: "admin-user-management"
  }
};
