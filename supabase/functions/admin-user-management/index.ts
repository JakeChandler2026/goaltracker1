import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type"
};

type ActionName = "create_managed_youth_account" | "update_managed_youth_profile" | "upsert_youth_parent_link" | "unlink_youth_parent_link" | "approve_youth_leader" | "update_profile_access_status" | "create_ward" | "create_bishop_account" | "assign_bishop_ward";

type AdminActionRequest = {
  action?: ActionName;
  email?: string;
  password?: string;
  fullName?: string;
  ward?: string;
  organization?: "young_men" | "young_women";
  leaderId?: string;
  userId?: string;
  approvalStatus?: "approved" | "verified" | "rejected";
  youthId?: string;
  parentId?: string;
  relationship?: string;
};

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json"
    }
  });
}

function errorResponse(message: string, status = 400) {
  return jsonResponse({ error: message }, status);
}

function normalizeWardName(value: string) {
  return String(value || "")
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/\bward\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

async function getOrCreateWard(adminClient: any, wardName: string) {
  const normalizedRequestedWard = normalizeWardName(wardName);
  if (!normalizedRequestedWard) {
    return { data: null, error: "Ward name is required.", status: 400 };
  }

  const wardsResult = await adminClient
    .from("wards")
    .select("id, name");

  if (wardsResult.error) {
    return { data: null, error: wardsResult.error.message || "Unable to load wards.", status: 500 };
  }

  const existingWard = (wardsResult.data || []).find((ward: { id: string; name: string }) =>
    normalizeWardName(ward.name) === normalizedRequestedWard
  );
  if (existingWard) {
    return { data: existingWard, error: null, status: 200 };
  }

  const createWardResult = await adminClient
    .from("wards")
    .insert({ name: wardName.trim() })
    .select("id, name")
    .single();

  if (createWardResult.error) {
    return { data: null, error: createWardResult.error.message || "Unable to create the ward.", status: 500 };
  }

  return { data: createWardResult.data, error: null, status: 201 };
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !anonKey || !serviceRoleKey) {
      return errorResponse("Supabase function environment variables are not configured.", 500);
    }

    const authHeader = request.headers.get("Authorization");
    if (!authHeader) {
      return errorResponse("Missing Authorization header.", 401);
    }

    const userClient = createClient(supabaseUrl, anonKey, {
      global: {
        headers: {
          Authorization: authHeader
        }
      }
    });
    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    const {
      data: { user: actorAuthUser },
      error: actorAuthError
    } = await userClient.auth.getUser();

    if (actorAuthError || !actorAuthUser) {
      return errorResponse("Unable to verify the signed-in user.", 401);
    }

    const actorProfileResult = await adminClient
      .from("profiles")
      .select("id, role, ward_id, organization, approval_status")
      .or(`id.eq.${actorAuthUser.id},auth_user_id.eq.${actorAuthUser.id}`)
      .maybeSingle();

    if (actorProfileResult.error || !actorProfileResult.data) {
      return errorResponse("No app profile was found for the signed-in user.", 403);
    }

    const actor = actorProfileResult.data;
    const body = await request.json() as AdminActionRequest;

    if (body.action === "create_ward") {
      if (actor.role !== "administrator") {
        return errorResponse("Only administrators can create wards.", 403);
      }

      const wardName = String(body.ward || "").trim();
      const wardResult = await getOrCreateWard(adminClient, wardName);
      if (wardResult.error || !wardResult.data) {
        return errorResponse(String(wardResult.error || "Unable to create the ward."), wardResult.status || 500);
      }

      return jsonResponse({ ward: wardResult.data });
    }

    if (body.action === "create_bishop_account") {
      if (actor.role !== "administrator") {
        return errorResponse("Only administrators can create bishop accounts.", 403);
      }

      const email = String(body.email || "").trim().toLowerCase();
      const password = String(body.password || "");
      const fullName = String(body.fullName || "").trim();
      const wardName = String(body.ward || "").trim();

      if (!email || !password || !fullName || !wardName) {
        return errorResponse("Bishop name, email, password, and ward are required.");
      }

      const existingProfileResult = await adminClient
        .from("profiles")
        .select("id")
        .eq("email", email)
        .maybeSingle();

      if (existingProfileResult.error) {
        return errorResponse(existingProfileResult.error.message || "Unable to check for existing bishop profiles.", 500);
      }

      if (existingProfileResult.data?.id) {
        return errorResponse("That email already has an account.", 409);
      }

      const wardResult = await getOrCreateWard(adminClient, wardName);
      if (wardResult.error || !wardResult.data) {
        return errorResponse(String(wardResult.error || "Unable to resolve the ward."), wardResult.status || 500);
      }

      const createdUserResult = await adminClient.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: {
          role: "bishop",
          ward: wardResult.data.name,
          full_name: fullName
        }
      });

      if (createdUserResult.error || !createdUserResult.data.user) {
        return errorResponse(createdUserResult.error?.message || "Unable to create the bishop auth account.", 500);
      }

      const authUserId = createdUserResult.data.user.id;
      const profileResult = await adminClient
        .from("profiles")
        .insert({
          id: authUserId,
          auth_user_id: authUserId,
          email,
          full_name: fullName,
          role: "bishop",
          ward_id: wardResult.data.id,
          organization: "all",
          approval_status: "verified",
          approved_by: actor.id,
          approved_at: new Date().toISOString()
        })
        .select("id, auth_user_id, email, full_name, role, organization, approval_status")
        .single();

      if (profileResult.error) {
        return errorResponse(profileResult.error.message || "Unable to create the bishop profile.", 500);
      }

      return jsonResponse({ profile: profileResult.data });
    }

    if (body.action === "assign_bishop_ward") {
      if (actor.role !== "administrator") {
        return errorResponse("Only administrators can assign bishops to wards.", 403);
      }

      const userId = String(body.userId || "").trim();
      const wardName = String(body.ward || "").trim();
      if (!userId || !wardName) {
        return errorResponse("Bishop id and ward are required.");
      }

      const bishopResult = await adminClient
        .from("profiles")
        .select("id, role")
        .eq("id", userId)
        .maybeSingle();

      if (bishopResult.error || !bishopResult.data) {
        return errorResponse("The selected bishop could not be found.", 404);
      }

      if (bishopResult.data.role !== "bishop") {
        return errorResponse("Only bishop profiles can be assigned to wards.", 400);
      }

      const wardResult = await getOrCreateWard(adminClient, wardName);
      if (wardResult.error || !wardResult.data) {
        return errorResponse(String(wardResult.error || "Unable to resolve the ward."), wardResult.status || 500);
      }

      const assignmentResult = await adminClient
        .from("profiles")
        .update({
          ward_id: wardResult.data.id,
          organization: "all",
          approval_status: "verified",
          approved_by: actor.id,
          approved_at: new Date().toISOString()
        })
        .eq("id", bishopResult.data.id)
        .select("id, ward_id, approval_status")
        .single();

      if (assignmentResult.error) {
        return errorResponse(assignmentResult.error.message || "Unable to assign the bishop.", 500);
      }

      return jsonResponse({ profile: assignmentResult.data });
    }

    if (body.action === "approve_youth_leader") {
      if (actor.role !== "bishop") {
        return errorResponse("Only bishops can approve Youth leaders.", 403);
      }

      if (!body.leaderId) {
        return errorResponse("A Youth leader id is required.");
      }

      const leaderResult = await adminClient
        .from("profiles")
        .select("id, role, ward_id, approval_status")
        .eq("id", body.leaderId)
        .maybeSingle();

      if (leaderResult.error || !leaderResult.data) {
        return errorResponse("The selected Youth leader could not be found.", 404);
      }

      const leader = leaderResult.data;
      if (leader.role !== "youth_leader") {
        return errorResponse("Only Youth leader accounts can be approved here.", 400);
      }

      if (leader.ward_id !== actor.ward_id) {
        return errorResponse("Bishops can only approve Youth leaders in their own ward.", 403);
      }

      const approvalResult = await adminClient
        .from("profiles")
        .update({
          approval_status: "approved",
          approved_by: actor.id,
          approved_at: new Date().toISOString()
        })
        .eq("id", leader.id)
        .select("id, approval_status, approved_at")
        .single();

      if (approvalResult.error) {
        return errorResponse(approvalResult.error.message || "Unable to approve the Youth leader.", 500);
      }

      return jsonResponse({ profile: approvalResult.data });
    }

    if (body.action === "update_profile_access_status") {
      if (!["bishop", "administrator"].includes(actor.role)) {
        return errorResponse("Only bishops and administrators can update access.", 403);
      }

      const userId = String(body.userId || "").trim();
      const approvalStatus = body.approvalStatus;
      if (!userId || !approvalStatus || !["approved", "verified", "rejected"].includes(approvalStatus)) {
        return errorResponse("User id and a valid access status are required.");
      }

      const targetResult = await adminClient
        .from("profiles")
        .select("id, role, ward_id")
        .eq("id", userId)
        .maybeSingle();

      if (targetResult.error || !targetResult.data) {
        return errorResponse("The selected profile could not be found.", 404);
      }

      const target = targetResult.data;
      if (!["youth_leader", "parent", "bishop"].includes(target.role)) {
        return errorResponse("Only bishop, Youth leader, and parent access can be updated here.", 400);
      }

      if (actor.role === "bishop") {
        if (!["youth_leader", "parent"].includes(target.role)) {
          return errorResponse("Bishops can only update Youth leader and parent access.", 403);
        }

        if (target.ward_id !== actor.ward_id) {
          return errorResponse("Bishops can only update access inside their own ward.", 403);
        }
      }

      const normalizedStatus = target.role === "youth_leader"
        ? (approvalStatus === "rejected" ? "rejected" : "approved")
        : (approvalStatus === "rejected" ? "rejected" : "verified");

      const accessResult = await adminClient
        .from("profiles")
        .update({
          approval_status: normalizedStatus,
          approved_by: normalizedStatus === "rejected" ? null : actor.id,
          approved_at: normalizedStatus === "rejected" ? null : new Date().toISOString()
        })
        .eq("id", target.id)
        .select("id, approval_status, approved_at")
        .single();

      if (accessResult.error) {
        return errorResponse(accessResult.error.message || "Unable to update access.", 500);
      }

      return jsonResponse({ profile: accessResult.data });
    }

    if (body.action === "create_managed_youth_account") {
      if (!["bishop", "youth_leader"].includes(actor.role)) {
        return errorResponse("Only bishops and approved Youth leaders can create youth accounts.", 403);
      }

      if (actor.role === "youth_leader" && actor.approval_status !== "approved") {
        return errorResponse("This Youth leader account is still waiting for bishop approval.", 403);
      }

      const email = String(body.email || "").trim().toLowerCase();
      const password = String(body.password || "");
      const fullName = String(body.fullName || "").trim();
      const wardName = String(body.ward || "").trim();
      const organization = body.organization;

      if (!fullName || !wardName || !organization) {
        return errorResponse("Full name, ward, and organization are required.");
      }

      if (!["young_men", "young_women"].includes(organization)) {
        return errorResponse("Organization must be Young Men or Young Women.");
      }

      const wardResult = await adminClient
        .from("wards")
        .select("id, name")
        .eq("name", wardName)
        .maybeSingle();

      if (wardResult.error || !wardResult.data) {
        return errorResponse("The selected ward could not be found.", 404);
      }

      if (wardResult.data.id !== actor.ward_id) {
        return errorResponse("You can only create youth accounts in your own ward.", 403);
      }

      if (actor.role === "youth_leader" && actor.organization !== organization) {
        return errorResponse("Youth leaders can only create youth in the organization they manage.", 403);
      }

      const existingProfileResult = email
        ? await adminClient
          .from("profiles")
          .select("id")
          .eq("email", email)
          .maybeSingle()
        : { data: null, error: null };

      if (existingProfileResult.error) {
        return errorResponse(existingProfileResult.error.message || "Unable to check for existing accounts.", 500);
      }

      if (existingProfileResult.data?.id) {
        return errorResponse("That email already has an account.", 409);
      }

      let authUserId: string | null = null;
      if (email && password) {
        const createdUserResult = await adminClient.auth.admin.createUser({
          email,
          password,
          email_confirm: true,
          user_metadata: {
            role: "youth",
            ward: wardName,
            organization,
            full_name: fullName
          }
        });

        if (createdUserResult.error || !createdUserResult.data.user) {
          return errorResponse(createdUserResult.error?.message || "Unable to create the auth account.", 500);
        }

        authUserId = createdUserResult.data.user.id;
      }

      const profileResult = await adminClient
        .from("profiles")
        .insert({
          ...(authUserId ? { id: authUserId, auth_user_id: authUserId } : {}),
          email: email || null,
          full_name: fullName,
          role: "youth",
          ward_id: wardResult.data.id,
          organization,
          approval_status: "verified"
        })
        .select("id, auth_user_id, email, full_name, role, organization, approval_status")
        .single();

      if (profileResult.error) {
        return errorResponse(profileResult.error.message || "Unable to create the youth profile.", 500);
      }

      return jsonResponse({ profile: profileResult.data });
    }

    if (body.action === "update_managed_youth_profile") {
      if (!["bishop", "youth_leader"].includes(actor.role)) {
        return errorResponse("Only bishops and approved Youth leaders can edit youth accounts.", 403);
      }

      if (actor.role === "youth_leader" && actor.approval_status !== "approved") {
        return errorResponse("This Youth leader account is still waiting for bishop approval.", 403);
      }

      const youthId = String(body.youthId || "").trim();
      const email = String(body.email || "").trim().toLowerCase();
      const fullName = String(body.fullName || "").trim();
      const organization = body.organization;

      if (!youthId || !fullName || !organization) {
        return errorResponse("Youth id, full name, and organization are required.");
      }

      if (!["young_men", "young_women"].includes(organization)) {
        return errorResponse("Organization must be Young Men or Young Women.");
      }

      const youthResult = await adminClient
        .from("profiles")
        .select("id, role, ward_id, organization")
        .eq("id", youthId)
        .maybeSingle();

      if (youthResult.error || !youthResult.data) {
        return errorResponse("The selected youth could not be found.", 404);
      }

      const youth = youthResult.data;
      if (youth.role !== "youth") {
        return errorResponse("Only youth accounts can be edited here.", 400);
      }

      if (youth.ward_id !== actor.ward_id) {
        return errorResponse("You can only edit youth in your own ward.", 403);
      }

      if (actor.role === "youth_leader" && (actor.organization !== youth.organization || actor.organization !== organization)) {
        return errorResponse("Youth leaders can only edit youth in the organization they manage.", 403);
      }

      const existingProfileResult = email
        ? await adminClient
          .from("profiles")
          .select("id")
          .eq("email", email)
          .neq("id", youthId)
          .maybeSingle()
        : { data: null, error: null };

      if (existingProfileResult.error) {
        return errorResponse(existingProfileResult.error.message || "Unable to check for existing accounts.", 500);
      }

      if (existingProfileResult.data?.id) {
        return errorResponse("That email is already attached to another account.", 409);
      }

      const profileResult = await adminClient
        .from("profiles")
        .update({
          email: email || null,
          full_name: fullName,
          organization
        })
        .eq("id", youthId)
        .select("id, auth_user_id, email, full_name, role, organization, approval_status")
        .single();

      if (profileResult.error) {
        return errorResponse(profileResult.error.message || "Unable to update the youth profile.", 500);
      }

      return jsonResponse({ profile: profileResult.data });
    }

    if (body.action === "upsert_youth_parent_link" || body.action === "unlink_youth_parent_link") {
      if (!["bishop", "youth_leader"].includes(actor.role)) {
        return errorResponse("Only bishops and approved Youth leaders can manage parent links.", 403);
      }

      if (actor.role === "youth_leader" && actor.approval_status !== "approved") {
        return errorResponse("This Youth leader account is still waiting for bishop approval.", 403);
      }

      const youthId = String(body.youthId || "").trim();
      const parentId = String(body.parentId || "").trim();
      const email = String(body.email || "").trim().toLowerCase();
      const password = String(body.password || "");
      const fullName = String(body.fullName || "").trim();
      const relationship = String(body.relationship || "Parent").trim() || "Parent";

      if (!youthId) {
        return errorResponse("Youth id is required.");
      }

      const youthResult = await adminClient
        .from("profiles")
        .select("id, role, ward_id, organization")
        .eq("id", youthId)
        .maybeSingle();

      if (youthResult.error || !youthResult.data || youthResult.data.role !== "youth") {
        return errorResponse("The selected youth could not be found.", 404);
      }

      const youth = youthResult.data;
      if (youth.ward_id !== actor.ward_id) {
        return errorResponse("You can only manage parent links for youth in your own ward.", 403);
      }

      if (actor.role === "youth_leader" && actor.organization !== youth.organization) {
        return errorResponse("Youth leaders can only manage parent links for youth in their organization.", 403);
      }

      if (body.action === "unlink_youth_parent_link") {
        if (!parentId) {
          return errorResponse("Parent id is required.");
        }

        const unlinkResult = await adminClient
          .from("parent_youth_links")
          .delete()
          .eq("parent_id", parentId)
          .eq("youth_id", youthId);

        if (unlinkResult.error) {
          return errorResponse(unlinkResult.error.message || "Unable to unlink the parent.", 500);
        }

        return jsonResponse({ ok: true });
      }

      if (!fullName) {
        return errorResponse("Parent name is required.");
      }

      let resolvedParentId = parentId || "";
      let authUserId: string | null = null;
      if (!resolvedParentId && email) {
        const existingParentResult = await adminClient
          .from("profiles")
          .select("id, auth_user_id, role, ward_id")
          .eq("email", email)
          .maybeSingle();

        if (existingParentResult.error) {
          return errorResponse(existingParentResult.error.message || "Unable to check for existing parent profiles.", 500);
        }

        if (existingParentResult.data) {
          if (existingParentResult.data.role !== "parent" || existingParentResult.data.ward_id !== actor.ward_id) {
            return errorResponse("That email is already attached to another account.", 409);
          }
          resolvedParentId = existingParentResult.data.id;
          authUserId = existingParentResult.data.auth_user_id || null;
        }
      }

      if (email && password && !authUserId) {
        const createdUserResult = await adminClient.auth.admin.createUser({
          email,
          password,
          email_confirm: true,
          user_metadata: {
            role: "parent",
            ward_id: actor.ward_id,
            full_name: fullName
          }
        });

        if (createdUserResult.error || !createdUserResult.data.user) {
          return errorResponse(createdUserResult.error?.message || "Unable to create the parent auth account.", 500);
        }

        authUserId = createdUserResult.data.user.id;
      }

      if (resolvedParentId) {
        const updateParentResult = await adminClient
          .from("profiles")
          .update({
            email: email || null,
            full_name: fullName,
            role: "parent",
            ward_id: actor.ward_id,
            organization: "all",
            approval_status: "verified",
            ...(authUserId ? { auth_user_id: authUserId } : {})
          })
          .eq("id", resolvedParentId)
          .select("id")
          .single();

        if (updateParentResult.error) {
          return errorResponse(updateParentResult.error.message || "Unable to update parent profile.", 500);
        }
      } else {
        const createParentResult = await adminClient
          .from("profiles")
          .insert({
            ...(authUserId ? { id: authUserId, auth_user_id: authUserId } : {}),
            email: email || null,
            full_name: fullName,
            role: "parent",
            ward_id: actor.ward_id,
            organization: "all",
            approval_status: "verified"
          })
          .select("id")
          .single();

        if (createParentResult.error) {
          return errorResponse(createParentResult.error.message || "Unable to create parent profile.", 500);
        }

        resolvedParentId = createParentResult.data.id;
      }

      const linkResult = await adminClient
        .from("parent_youth_links")
        .upsert({
          parent_id: resolvedParentId,
          youth_id: youthId,
          relationship
        })
        .select("parent_id, youth_id, relationship")
        .single();

      if (linkResult.error) {
        return errorResponse(linkResult.error.message || "Unable to link parent to youth.", 500);
      }

      return jsonResponse({ link: linkResult.data });
    }

    return errorResponse("Unsupported admin action.", 400);
  } catch (error) {
    return errorResponse(error instanceof Error ? error.message : "Unexpected function failure.", 500);
  }
});
