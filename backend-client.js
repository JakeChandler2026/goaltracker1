(function attachGoalTrackerBackendClient(globalScope) {
  const runtime = globalScope.BishopGoalTrackerBackend || {
    runtimeMode: "demo-local",
    canBootSupabase: false,
    supabase: {
      snapshotTable: "app_runtime_snapshots",
      snapshotScope: "default"
    }
  };

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function normalizePointValue(value) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed < 0) {
      return 0;
    }
    return Math.floor(parsed);
  }

  function mergeSnapshotProgressData(relationalState, snapshotState) {
    const nextState = clone(relationalState);
    const snapshotGoalsById = new Map((snapshotState?.goals || []).map((goal) => [goal.id, goal]));
    const snapshotTemplatesById = new Map((snapshotState?.templates || []).map((template) => [template.id, template]));

    nextState.goals = nextState.goals.map((goal) => {
      const snapshotGoal = snapshotGoalsById.get(goal.id);
      return {
        ...goal,
        points: normalizePointValue(snapshotGoal?.points ?? goal.points),
        goalApproved: Boolean(snapshotGoal?.goalApproved ?? goal.goalApproved),
        goalApprovedBy: snapshotGoal?.goalApprovedBy ?? goal.goalApprovedBy ?? null,
        goalApprovedAt: snapshotGoal?.goalApprovedAt ?? goal.goalApprovedAt ?? null,
        leaderApproved: Boolean(snapshotGoal?.leaderApproved ?? goal.leaderApproved),
        leaderApprovedBy: snapshotGoal?.leaderApprovedBy ?? goal.leaderApprovedBy ?? null,
        completedAt: snapshotGoal?.completedAt ?? goal.completedAt ?? null
      };
    });

    nextState.templates = nextState.templates.map((template) => {
      const snapshotTemplate = snapshotTemplatesById.get(template.id);
      return {
        ...template,
        points: normalizePointValue(snapshotTemplate?.points ?? template.points)
      };
    });

    return nextState;
  }

  function mergeGoalIntoState(appState, goal, options = {}) {
    const nextState = clone(appState);
    const goalIndex = nextState.goals.findIndex((item) => item.id === goal.id);
    if (goalIndex >= 0) {
      nextState.goals[goalIndex] = {
        ...nextState.goals[goalIndex],
        points: normalizePointValue(goal.points),
        goalApproved: Boolean(goal.goalApproved),
        goalApprovedBy: goal.goalApprovedBy || null,
        goalApprovedAt: goal.goalApprovedAt || null,
        leaderApproved: Boolean(goal.leaderApproved),
        leaderApprovedBy: goal.leaderApprovedBy || null,
        completedAt: goal.completedAt || null
      };
    } else if (options.insert) {
      nextState.goals.unshift({
        ...goal,
        points: normalizePointValue(goal.points)
      });
    }
    return nextState;
  }

  function mergeTemplateIntoState(appState, template, options = {}) {
    const nextState = clone(appState);
    const templateIndex = nextState.templates.findIndex((item) => item.id === template.id);
    if (templateIndex >= 0) {
      nextState.templates[templateIndex] = {
        ...nextState.templates[templateIndex],
        points: normalizePointValue(template.points)
      };
    } else if (options.insert) {
      nextState.templates.unshift({
        ...template,
        points: normalizePointValue(template.points)
      });
    }
    return nextState;
  }

  function createSupabaseClient() {
    return globalScope.supabase.createClient(runtime.supabase.url, runtime.supabase.anonKey);
  }

  function getAdminUserManagementFunctionName() {
    return runtime.supabase.adminUserManagementFunction || "admin-user-management";
  }

  async function invokeAdminUserManagement(client, action, payload) {
    if (!runtime.canBootSupabase) {
      throw new Error("Supabase mode is selected, but the browser SDK or credentials are not ready yet.");
    }

    const functionName = getAdminUserManagementFunctionName();
    const result = await client.functions.invoke(functionName, {
      body: {
        action,
        ...payload
      }
    });

    if (result.error) {
      throw result.error;
    }

    if (result.data?.error) {
      throw new Error(result.data.error);
    }

    return result.data || {};
  }

  function buildGoalSubGoals(checklistItems, checklistUnits, goalId) {
    const items = checklistItems
      .filter((item) => item.goal_id === goalId)
      .sort((left, right) => left.sort_order - right.sort_order);

    return items.map((item) => {
      const units = checklistUnits
        .filter((unit) => unit.checklist_item_id === item.id)
        .sort((left, right) => left.unit_index - right.unit_index);
      const completedUnits = Array.from({ length: item.repeat_count }, (_, index) => {
        const match = units.find((unit) => unit.unit_index === index);
        return match?.completed_at ? String(match.completed_at).slice(0, 10) : null;
      });

      return {
        id: item.id,
        title: item.title,
        repeatCount: item.repeat_count,
        completedUnits
      };
    });
  }

  function buildTemplateSubGoals(templateItems, templateId) {
    return templateItems
      .filter((item) => item.template_id === templateId)
      .sort((left, right) => left.sort_order - right.sort_order)
      .map((item) => ({
        id: item.id,
        title: item.title,
        repeatCount: item.repeat_count
      }));
  }

  function ensureArray(value) {
    return Array.isArray(value) ? value : [];
  }

  function getCompletedCount(subGoal) {
    return ensureArray(subGoal.completedUnits).filter(Boolean).length;
  }

  function getGoalProgress(goal) {
    const totalChecks = ensureArray(goal.subGoals).reduce((sum, subGoal) => sum + subGoal.repeatCount, 0);
    const completedChecks = ensureArray(goal.subGoals).reduce((sum, subGoal) => sum + getCompletedCount(subGoal), 0);
    return totalChecks ? Math.round((completedChecks / totalChecks) * 100) : 0;
  }

  function getTodayDateString() {
    return new Date().toISOString().slice(0, 10);
  }

  function isGoalClosed(goal) {
    return Boolean(goal.deadline && getTodayDateString() > goal.deadline && !goal.leaderApproved);
  }

  function findMostRecentCompletedIndex(subGoal) {
    let latestIndex = -1;
    let latestValue = "";
    ensureArray(subGoal.completedUnits).forEach((value, index) => {
      if (value && value >= latestValue) {
        latestIndex = index;
        latestValue = value;
      }
    });
    return latestIndex;
  }

  async function reloadSupabaseAppState(storageKey, fallbackState) {
    return supabaseRelationalProvider.loadAppState(storageKey, fallbackState);
  }

  async function upsertGoalChecklist(client, goalId, subGoals) {
    const existingItemsResult = await client
      .from("goal_checklist_items")
      .select("id, goal_id")
      .eq("goal_id", goalId);

    if (existingItemsResult.error) {
      throw existingItemsResult.error;
    }

    const existingItems = existingItemsResult.data || [];
    const keepIds = subGoals.map((subGoal) => subGoal.id).filter(Boolean);
    const deleteIds = existingItems.map((item) => item.id).filter((id) => !keepIds.includes(id));
    if (deleteIds.length) {
      const deleteResult = await client.from("goal_checklist_items").delete().in("id", deleteIds);
      if (deleteResult.error) {
        throw deleteResult.error;
      }
    }

    for (let index = 0; index < subGoals.length; index += 1) {
      const subGoal = subGoals[index];
      const itemPayload = {
        id: subGoal.id,
        goal_id: goalId,
        title: subGoal.title,
        repeat_count: subGoal.repeatCount,
        sort_order: index
      };
      const itemResult = await client.from("goal_checklist_items").upsert(itemPayload).select("id").single();
      if (itemResult.error) {
        throw itemResult.error;
      }

      const checklistItemId = itemResult.data.id;
      const unitRows = Array.from({ length: subGoal.repeatCount }, (_, unitIndex) => ({
        checklist_item_id: checklistItemId,
        unit_index: unitIndex,
        completed_at: subGoal.completedUnits?.[unitIndex] ? `${subGoal.completedUnits[unitIndex]}T00:00:00.000Z` : null
      }));
      const unitsResult = await client.from("goal_checklist_units").upsert(unitRows);
      if (unitsResult.error) {
        throw unitsResult.error;
      }

      const staleUnitsResult = await client
        .from("goal_checklist_units")
        .delete()
        .eq("checklist_item_id", checklistItemId)
        .gte("unit_index", subGoal.repeatCount);
      if (staleUnitsResult.error) {
        throw staleUnitsResult.error;
      }
    }
  }

  async function upsertTemplateChecklist(client, templateId, subGoals) {
    const existingItemsResult = await client
      .from("template_checklist_items")
      .select("id")
      .eq("template_id", templateId);
    if (existingItemsResult.error) {
      throw existingItemsResult.error;
    }

    const existingItems = existingItemsResult.data || [];
    const keepIds = subGoals.map((subGoal) => subGoal.id).filter(Boolean);
    const deleteIds = existingItems.map((item) => item.id).filter((id) => !keepIds.includes(id));
    if (deleteIds.length) {
      const deleteResult = await client.from("template_checklist_items").delete().in("id", deleteIds);
      if (deleteResult.error) {
        throw deleteResult.error;
      }
    }

    for (let index = 0; index < subGoals.length; index += 1) {
      const subGoal = subGoals[index];
      const result = await client.from("template_checklist_items").upsert({
        id: subGoal.id,
        template_id: templateId,
        title: subGoal.title,
        repeat_count: subGoal.repeatCount,
        sort_order: index
      });
      if (result.error) {
        throw result.error;
      }
    }
  }

  async function findProfileIdByName(client, fullName) {
    if (!fullName) {
      return null;
    }
    const result = await client.from("profiles").select("id").eq("full_name", fullName).maybeSingle();
    return result.data?.id || null;
  }

  const localStorageProvider = {
    async loadAppState(storageKey, fallbackState) {
      const raw = globalScope.localStorage.getItem(`demo-local:${storageKey}`);
      if (!raw) {
        globalScope.localStorage.setItem(`demo-local:${storageKey}`, JSON.stringify(fallbackState));
        return clone(fallbackState);
      }

      try {
        return JSON.parse(raw);
      } catch (error) {
        globalScope.localStorage.setItem(`demo-local:${storageKey}`, JSON.stringify(fallbackState));
        return clone(fallbackState);
      }
    },
    async saveAppState(storageKey, nextState) {
      globalScope.localStorage.setItem(`demo-local:${storageKey}`, JSON.stringify(nextState));
      return true;
    },
    async createGoal(storageKey, appState, payload) {
      const nextState = clone(appState);
      nextState.goals.unshift(payload.goal);
      return nextState;
    },
    async updateGoal(storageKey, appState, payload) {
      const nextState = clone(appState);
      const goalIndex = nextState.goals.findIndex((goal) => goal.id === payload.goal.id);
      if (goalIndex >= 0) {
        nextState.goals[goalIndex] = payload.goal;
      }
      return nextState;
    },
    async createTemplate(storageKey, appState, payload) {
      const nextState = clone(appState);
      nextState.templates.unshift(payload.template);
      return nextState;
    },
    async updateTemplate(storageKey, appState, payload) {
      const nextState = clone(appState);
      const templateIndex = nextState.templates.findIndex((template) => template.id === payload.template.id);
      if (templateIndex >= 0) {
        nextState.templates[templateIndex] = payload.template;
      }
      return nextState;
    },
    async createYouthAccount(storageKey, appState, payload) {
      const nextState = clone(appState);
      nextState.users.push(payload.user);
      return nextState;
    },
    async approveYouthLeader(storageKey, appState, payload) {
      const nextState = clone(appState);
      const leader = nextState.users.find((user) => user.id === payload.leaderId);
      if (leader) {
        leader.approvalStatus = "approved";
      }
      return nextState;
    }
  };

  const supabaseSnapshotProvider = {
    async loadAppState(storageKey, fallbackState) {
      if (!runtime.canBootSupabase) {
        return localStorageProvider.loadAppState(storageKey, fallbackState);
      }

      const client = createSupabaseClient();
      const snapshotTable = runtime.supabase.snapshotTable || "app_runtime_snapshots";
      const snapshotScope = runtime.supabase.snapshotScope || "default";
      const { data, error } = await client
        .from(snapshotTable)
        .select("state_json")
        .eq("scope", snapshotScope)
        .maybeSingle();

      if (error) {
        console.warn("Supabase snapshot load failed; falling back to local demo storage.", error);
        return localStorageProvider.loadAppState(storageKey, fallbackState);
      }

      if (!data) {
        await client.from(snapshotTable).upsert({
          scope: snapshotScope,
          state_json: fallbackState
        });
        return clone(fallbackState);
      }

      return data.state_json || clone(fallbackState);
    },
    async saveAppState(storageKey, nextState) {
      if (!runtime.canBootSupabase) {
        return localStorageProvider.saveAppState(storageKey, nextState);
      }

      const client = createSupabaseClient();
      const snapshotTable = runtime.supabase.snapshotTable || "app_runtime_snapshots";
      const snapshotScope = runtime.supabase.snapshotScope || "default";
      const { error } = await client.from(snapshotTable).upsert({
        scope: snapshotScope,
        state_json: nextState
      });

      if (error) {
        console.warn("Supabase snapshot save failed; keeping the local demo cache updated.", error);
        await localStorageProvider.saveAppState(storageKey, nextState);
      }

      return !error;
    }
  };

  const supabaseRelationalProvider = {
    async loadAppState(storageKey, fallbackState) {
      if (!runtime.canBootSupabase) {
        return supabaseSnapshotProvider.loadAppState(storageKey, fallbackState);
      }

      try {
        const client = createSupabaseClient();
        const [
          wardsResult,
          profilesResult,
          goalsResult,
          goalChecklistItemsResult,
          goalChecklistUnitsResult,
          templatesResult,
          templateChecklistItemsResult
        ] = await Promise.all([
          client.from("wards").select("id, name"),
          client.from("profiles").select("id, email, full_name, role, organization, approval_status, ward_id"),
          client.from("goals").select("*"),
          client.from("goal_checklist_items").select("id, goal_id, title, repeat_count, sort_order"),
          client.from("goal_checklist_units").select("checklist_item_id, unit_index, completed_at"),
          client.from("goal_templates").select("*"),
          client.from("template_checklist_items").select("id, template_id, title, repeat_count, sort_order")
        ]);

        const firstError = [
          wardsResult.error,
          profilesResult.error,
          goalsResult.error,
          goalChecklistItemsResult.error,
          goalChecklistUnitsResult.error,
          templatesResult.error,
          templateChecklistItemsResult.error
        ].find(Boolean);

        if (firstError) {
          throw firstError;
        }

        const wards = wardsResult.data || [];
        const profiles = profilesResult.data || [];
        const goals = goalsResult.data || [];
        const goalChecklistItems = goalChecklistItemsResult.data || [];
        const goalChecklistUnits = goalChecklistUnitsResult.data || [];
        const templates = templatesResult.data || [];
        const templateChecklistItems = templateChecklistItemsResult.data || [];

        const wardNamesById = new Map(wards.map((ward) => [ward.id, ward.name]));
        const profileNamesById = new Map(profiles.map((profile) => [profile.id, profile.full_name]));

        const relationalState = {
          users: profiles.map((profile) => ({
            id: profile.id,
            role: profile.role,
            email: profile.email,
            password: "",
            name: profile.full_name,
            ward: wardNamesById.get(profile.ward_id) || "",
            organization: profile.role === "bishop" ? "all" : profile.organization,
            approvalStatus: profile.approval_status
          })),
          goals: goals.map((goal) => ({
            id: goal.id,
            userId: goal.youth_id,
            title: goal.title,
            summary: goal.summary,
            points: normalizePointValue(goal.points),
            goalApproved: Boolean(goal.goal_approved),
            goalApprovedBy: goal.goal_approved_by ? (profileNamesById.get(goal.goal_approved_by) || null) : null,
            goalApprovedAt: goal.goal_approved_at ? String(goal.goal_approved_at).slice(0, 10) : null,
            deadline: goal.deadline,
            leaderApproved: Boolean(goal.leader_approved),
            leaderApprovedBy: goal.leader_approved_by ? (profileNamesById.get(goal.leader_approved_by) || null) : null,
            completedAt: goal.completed_at ? String(goal.completed_at).slice(0, 10) : null,
            subGoals: buildGoalSubGoals(goalChecklistItems, goalChecklistUnits, goal.id)
          })),
          templates: templates.map((template) => ({
            id: template.id,
            title: template.title,
            summary: template.summary,
            points: normalizePointValue(template.points),
            subGoals: buildTemplateSubGoals(templateChecklistItems, template.id)
          })),
          session: null
        };
        const snapshotState = await supabaseSnapshotProvider.loadAppState(storageKey, fallbackState);
        return mergeSnapshotProgressData(relationalState, snapshotState);
      } catch (error) {
        console.warn("Supabase relational load failed; falling back to snapshot bridge.", error);
        return supabaseSnapshotProvider.loadAppState(storageKey, fallbackState);
      }
    },
    async saveAppState(storageKey, nextState) {
      return supabaseSnapshotProvider.saveAppState(storageKey, nextState);
    },
    async createGoal(storageKey, appState, payload) {
      try {
        const client = createSupabaseClient();
        const goalApproverId = await findProfileIdByName(client, payload.goal.goalApprovedBy);
        const goalResult = await client.from("goals").insert({
          id: payload.goal.id,
          youth_id: payload.goal.userId,
          created_by: payload.createdBy,
          source_template_id: payload.sourceTemplateId || null,
          source_goal_id: payload.sourceGoalId || null,
          title: payload.goal.title,
          summary: payload.goal.summary,
          points: normalizePointValue(payload.goal.points),
          goal_approved: Boolean(payload.goal.goalApproved),
          goal_approved_by: goalApproverId,
          goal_approved_at: payload.goal.goalApprovedAt ? `${payload.goal.goalApprovedAt}T00:00:00.000Z` : null,
          deadline: payload.goal.deadline,
          leader_approved: Boolean(payload.goal.leaderApproved),
          completed_at: payload.goal.completedAt ? `${payload.goal.completedAt}T00:00:00.000Z` : null
        });
        if (goalResult.error) {
          throw goalResult.error;
        }
        await upsertGoalChecklist(client, payload.goal.id, payload.goal.subGoals);
        const nextState = await reloadSupabaseAppState(storageKey, payload.fallbackState);
        return mergeGoalIntoState(nextState, payload.goal, { insert: true });
      } catch (error) {
        console.warn("Supabase createGoal failed; falling back to snapshot bridge.", error);
        const nextState = await localStorageProvider.createGoal(storageKey, appState, payload);
        await supabaseSnapshotProvider.saveAppState(storageKey, nextState);
        return nextState;
      }
    },
    async updateGoal(storageKey, appState, payload) {
      try {
        const client = createSupabaseClient();
        const goalApproverId = await findProfileIdByName(client, payload.goal.goalApprovedBy);
        const approverId = await findProfileIdByName(client, payload.goal.leaderApprovedBy);
        const goalResult = await client.from("goals").update({
          title: payload.goal.title,
          summary: payload.goal.summary,
          points: normalizePointValue(payload.goal.points),
          goal_approved: Boolean(payload.goal.goalApproved),
          goal_approved_by: goalApproverId,
          goal_approved_at: payload.goal.goalApprovedAt ? `${payload.goal.goalApprovedAt}T00:00:00.000Z` : null,
          deadline: payload.goal.deadline,
          leader_approved: Boolean(payload.goal.leaderApproved),
          leader_approved_by: approverId,
          completed_at: payload.goal.completedAt ? `${payload.goal.completedAt}T00:00:00.000Z` : null
        }).eq("id", payload.goal.id);
        if (goalResult.error) {
          throw goalResult.error;
        }
        await upsertGoalChecklist(client, payload.goal.id, payload.goal.subGoals);
        const nextState = await reloadSupabaseAppState(storageKey, payload.fallbackState);
        return mergeGoalIntoState(nextState, payload.goal);
      } catch (error) {
        console.warn("Supabase updateGoal failed; falling back to snapshot bridge.", error);
        const nextState = await localStorageProvider.updateGoal(storageKey, appState, payload);
        await supabaseSnapshotProvider.saveAppState(storageKey, nextState);
        return nextState;
      }
    },
    async createTemplate(storageKey, appState, payload) {
      try {
        const client = createSupabaseClient();
        const wardResult = await client.from("profiles").select("ward_id").eq("id", payload.createdBy).maybeSingle();
        const wardId = wardResult.data?.ward_id || null;
        const templateResult = await client.from("goal_templates").insert({
          id: payload.template.id,
          title: payload.template.title,
          summary: payload.template.summary,
          points: normalizePointValue(payload.template.points),
          created_by: payload.createdBy,
          ward_id: wardId
        });
        if (templateResult.error) {
          throw templateResult.error;
        }
        await upsertTemplateChecklist(client, payload.template.id, payload.template.subGoals);
        const nextState = await reloadSupabaseAppState(storageKey, payload.fallbackState);
        return mergeTemplateIntoState(nextState, payload.template, { insert: true });
      } catch (error) {
        console.warn("Supabase createTemplate failed; falling back to snapshot bridge.", error);
        const nextState = await localStorageProvider.createTemplate(storageKey, appState, payload);
        await supabaseSnapshotProvider.saveAppState(storageKey, nextState);
        return nextState;
      }
    },
    async updateTemplate(storageKey, appState, payload) {
      try {
        const client = createSupabaseClient();
        const templateResult = await client.from("goal_templates").update({
          title: payload.template.title,
          summary: payload.template.summary,
          points: normalizePointValue(payload.template.points)
        }).eq("id", payload.template.id);
        if (templateResult.error) {
          throw templateResult.error;
        }
        await upsertTemplateChecklist(client, payload.template.id, payload.template.subGoals);
        const nextState = await reloadSupabaseAppState(storageKey, payload.fallbackState);
        return mergeTemplateIntoState(nextState, payload.template);
      } catch (error) {
        console.warn("Supabase updateTemplate failed; falling back to snapshot bridge.", error);
        const nextState = await localStorageProvider.updateTemplate(storageKey, appState, payload);
        await supabaseSnapshotProvider.saveAppState(storageKey, nextState);
        return nextState;
      }
    },
    async createYouthAccount(storageKey, appState, payload) {
      const client = createSupabaseClient();
      await invokeAdminUserManagement(client, "create_managed_youth_account", {
        email: payload.user.email,
        password: payload.password,
        fullName: payload.user.name,
        ward: payload.user.ward,
        organization: payload.user.organization
      });
      return reloadSupabaseAppState(storageKey, payload.fallbackState);
    },
    async approveYouthLeader(storageKey, appState, payload) {
      const client = createSupabaseClient();
      await invokeAdminUserManagement(client, "approve_youth_leader", {
        leaderId: payload.leaderId
      });
      return reloadSupabaseAppState(storageKey, payload.fallbackState);
    }
  };

  const activeProvider = runtime.runtimeMode === "supabase" ? supabaseRelationalProvider : localStorageProvider;

  globalScope.BishopGoalTrackerClient = {
    runtimeMode: runtime.runtimeMode,
    async loadAppState(storageKey, fallbackState) {
      return activeProvider.loadAppState(storageKey, fallbackState);
    },
    async saveAppState(storageKey, nextState) {
      return activeProvider.saveAppState(storageKey, nextState);
    },
    async createGoal(storageKey, appState, payload) {
      return (activeProvider.createGoal || localStorageProvider.createGoal)(storageKey, appState, payload);
    },
    async updateGoal(storageKey, appState, payload) {
      return (activeProvider.updateGoal || localStorageProvider.updateGoal)(storageKey, appState, payload);
    },
    async createTemplate(storageKey, appState, payload) {
      return (activeProvider.createTemplate || localStorageProvider.createTemplate)(storageKey, appState, payload);
    },
    async updateTemplate(storageKey, appState, payload) {
      return (activeProvider.updateTemplate || localStorageProvider.updateTemplate)(storageKey, appState, payload);
    },
    async createYouthAccount(storageKey, appState, payload) {
      return (activeProvider.createYouthAccount || localStorageProvider.createYouthAccount)(storageKey, appState, payload);
    },
    async approveYouthLeader(storageKey, appState, payload) {
      return (activeProvider.approveYouthLeader || localStorageProvider.approveYouthLeader)(storageKey, appState, payload);
    }
  };
})(window);
