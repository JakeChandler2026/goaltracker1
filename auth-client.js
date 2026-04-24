(function attachGoalTrackerAuthClient(globalScope) {
  const runtime = globalScope.BishopGoalTrackerBackend || {
    runtimeMode: "demo-local",
    canBootSupabase: false,
    supabase: {}
  };

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function createSupabaseClient() {
    return globalScope.supabase.createClient(runtime.supabase.url, runtime.supabase.anonKey);
  }

  function isSelfSignupRoleAllowed(role) {
    return role === "youth" || role === "youth_leader" || role === "bishop";
  }

  async function ensureWardRecord(client, wardName) {
    const existingWard = await client.from("wards").select("id, name").eq("name", wardName).maybeSingle();
    if (existingWard.data?.id) {
      return existingWard.data;
    }

    const insertResult = await client.from("wards").insert({ name: wardName }).select("id, name").single();
    if (insertResult.error) {
      throw insertResult.error;
    }

    return insertResult.data;
  }

  async function fetchProfileByEmail(client, email) {
    const result = await client
      .from("profiles")
      .select("id, email, full_name, role, organization, approval_status, ward:wards(name)")
      .eq("email", email)
      .maybeSingle();

    if (result.error) {
      throw result.error;
    }

    if (!result.data) {
      return null;
    }

    return {
      id: result.data.id,
      email: result.data.email,
      name: result.data.full_name,
      role: result.data.role,
      organization: result.data.role === "bishop" ? "all" : result.data.organization,
      approvalStatus: result.data.approval_status,
      ward: result.data.ward?.name || ""
    };
  }

  function getApprovalStatusForRole(role) {
    return role === "youth_leader" ? "pending" : "verified";
  }

  async function ensureProfileForAuthUser(client, authUser) {
    const email = String(authUser?.email || "").trim().toLowerCase();
    if (!authUser?.id || !email) {
      return null;
    }

    const existingProfile = await fetchProfileByEmail(client, email);
    if (existingProfile) {
      return existingProfile;
    }

    const metadata = authUser.user_metadata || {};
    const role = metadata.role;
    const ward = String(metadata.ward || "").trim();
    const fullName = String(metadata.full_name || metadata.fullName || "").trim();
    const organization = role === "bishop" ? "all" : metadata.organization;

    if (!isSelfSignupRoleAllowed(role) || !ward || !fullName || !organization) {
      return null;
    }

    const wardRecord = await ensureWardRecord(client, ward);
    const profileInsert = await client.from("profiles").upsert({
      id: authUser.id,
      email,
      full_name: fullName,
      role,
      ward_id: wardRecord.id,
      organization: role === "bishop" ? "all" : organization,
      approval_status: getApprovalStatusForRole(role)
    }).select("id, email, full_name, role, organization, approval_status, ward:wards(name)").single();

    if (profileInsert.error) {
      throw profileInsert.error;
    }

    return {
      id: profileInsert.data.id,
      email: profileInsert.data.email,
      name: profileInsert.data.full_name,
      role: profileInsert.data.role,
      organization: profileInsert.data.role === "bishop" ? "all" : profileInsert.data.organization,
      approvalStatus: profileInsert.data.approval_status,
      ward: profileInsert.data.ward?.name || ward
    };
  }

  function findUserByCredentials(appState, role, email, password) {
    return appState.users.find((user) =>
      user.role === role &&
      String(user.email || "").toLowerCase() === email &&
      user.password === password
    );
  }

  function getApprovalError(user) {
    if (user.role === "youth_leader" && user.approvalStatus !== "approved") {
      return "This Youth leader account is waiting for bishop approval.";
    }

    return null;
  }

  const demoAuthProvider = {
    async hydrateSession(appState) {
      return { session: appState.session || null, appState };
    },
    async signIn({ appState, role, email, password }) {
      const matchedUser = findUserByCredentials(appState, role, email, password);
      if (!matchedUser) {
        return { ok: false, error: "Login not recognized. Please use one of the demo accounts or create a new account." };
      }

      const approvalError = getApprovalError(matchedUser);
      if (approvalError) {
        return { ok: false, error: approvalError };
      }

      return {
        ok: true,
        session: { userId: matchedUser.id, authMode: "demo-local" }
      };
    },
    async signUp({ appState, role, name, email, ward, organization, password, createId }) {
      const emailInUse = appState.users.some((user) => String(user.email || "").toLowerCase() === email);
      if (emailInUse) {
        return { ok: false, error: "That email already has an account. Please sign in instead." };
      }

      const newUser = {
        id: createId(role === "bishop" ? "bishop" : role === "youth_leader" ? "leader" : "youth"),
        role,
        name,
        email,
        password,
        ward,
        organization,
        approvalStatus: role === "youth_leader" ? "pending" : "verified"
      };

      const nextState = clone(appState);
      nextState.users.push(newUser);

      return {
        ok: true,
        appState: nextState,
        pendingApproval: role === "youth_leader",
        session: role === "youth_leader" ? null : { userId: newUser.id, authMode: "demo-local" }
      };
    },
    async signOut() {
      return { ok: true };
    }
  };

  const supabaseAuthProvider = {
    async hydrateSession(appState) {
      if (!runtime.canBootSupabase) {
        return demoAuthProvider.hydrateSession(appState);
      }

      const client = createSupabaseClient();
      const { data, error } = await client.auth.getSession();
      if (error || !data.session?.user?.email) {
        return { session: null, appState };
      }

      const matchedUser = await ensureProfileForAuthUser(client, data.session.user);

      if (!matchedUser) {
        return { session: null, appState };
      }

      const nextState = clone(appState);
      const existingUserIndex = nextState.users.findIndex((user) => user.id === matchedUser.id);
      if (existingUserIndex >= 0) {
        nextState.users[existingUserIndex] = { ...nextState.users[existingUserIndex], ...matchedUser };
      } else {
        nextState.users.push({ ...matchedUser, password: "" });
      }

      return {
        session: {
          userId: matchedUser.id,
          authMode: "supabase",
          authUserId: data.session.user.id
        },
        appState: nextState
      };
    },
    async signIn({ appState, role, email, password }) {
      if (!runtime.canBootSupabase) {
        return {
          ok: false,
          error: "Supabase mode is selected, but the browser SDK or credentials are not ready yet."
        };
      }

      const client = createSupabaseClient();
      const { data, error } = await client.auth.signInWithPassword({ email, password });
      if (error || !data.user) {
        return { ok: false, error: error?.message || "Supabase sign-in failed." };
      }

      const matchedUser = await ensureProfileForAuthUser(client, data.user);

      if (!matchedUser || matchedUser.role !== role) {
        await client.auth.signOut();
        return { ok: false, error: "The auth account exists, but no matching app profile was found yet." };
      }

      const approvalError = getApprovalError(matchedUser);
      if (approvalError) {
        await client.auth.signOut();
        return { ok: false, error: approvalError };
      }

      const nextState = clone(appState);
      const existingUserIndex = nextState.users.findIndex((user) => user.id === matchedUser.id);
      if (existingUserIndex >= 0) {
        nextState.users[existingUserIndex] = { ...nextState.users[existingUserIndex], ...matchedUser };
      } else {
        nextState.users.push({ ...matchedUser, password: "" });
      }

      return {
        ok: true,
        appState: nextState,
        session: {
          userId: matchedUser.id,
          authMode: "supabase",
          authUserId: data.user.id
        }
      };
    },
    async signUp({ appState, role, name, email, ward, organization, password }) {
      if (!runtime.canBootSupabase) {
        return {
          ok: false,
          error: "Supabase mode is selected, but the browser SDK or credentials are not ready yet."
        };
      }

      const emailInUse = appState.users.some((user) => String(user.email || "").toLowerCase() === email);
      if (emailInUse) {
        return { ok: false, error: "That email already has an account. Please sign in instead." };
      }

      const client = createSupabaseClient();
      const { data, error } = await client.auth.signUp({
        email,
        password,
        options: {
          data: {
            role,
            ward,
            organization,
            full_name: name
          }
        }
      });

      if (error) {
        return { ok: false, error: error.message || "Supabase sign-up failed." };
      }

      try {
        if (!data.session) {
          return {
            ok: true,
            appState,
            session: null,
            pendingApproval: false,
            requiresEmailVerification: true
          };
        }

        const ensuredProfile = await ensureProfileForAuthUser(client, data.user);
        if (!ensuredProfile) {
          throw new Error("Supabase profile setup could not be completed after sign-up.");
        }

        const newUser = {
          id: ensuredProfile.id,
          role: ensuredProfile.role,
          email: ensuredProfile.email,
          name: ensuredProfile.name,
          ward: ensuredProfile.ward,
          organization: ensuredProfile.organization,
          approvalStatus: ensuredProfile.approvalStatus
        };

        const nextState = clone(appState);
        nextState.users.push({ ...newUser, password: "" });

        return {
          ok: true,
          appState: nextState,
          pendingApproval: role === "youth_leader",
          session: role === "youth_leader"
            ? null
            : {
              userId: newUser.id,
              authMode: "supabase",
              authUserId: data.user?.id || null
            }
        };
      } catch (profileError) {
        return { ok: false, error: profileError.message || "Supabase profile setup failed." };
      }
    },
    async signOut() {
      if (!runtime.canBootSupabase) {
        return { ok: true };
      }

      const client = globalScope.supabase.createClient(runtime.supabase.url, runtime.supabase.anonKey);
      await client.auth.signOut();
      return { ok: true };
    }
  };

  const activeProvider = runtime.runtimeMode === "supabase" ? supabaseAuthProvider : demoAuthProvider;

  globalScope.BishopGoalTrackerAuthClient = {
    runtimeMode: runtime.runtimeMode,
    hydrateSession(appState) {
      return activeProvider.hydrateSession(appState);
    },
    signIn(payload) {
      return activeProvider.signIn(payload);
    },
    signUp(payload) {
      return activeProvider.signUp(payload);
    },
    signOut() {
      return activeProvider.signOut();
    }
  };
})(window);
