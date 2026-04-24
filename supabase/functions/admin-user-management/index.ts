import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type"
};

type ActionName = "create_managed_youth_account" | "approve_youth_leader";

type AdminActionRequest = {
  action?: ActionName;
  email?: string;
  password?: string;
  fullName?: string;
  ward?: string;
  organization?: "young_men" | "young_women";
  leaderId?: string;
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
      .eq("id", actorAuthUser.id)
      .maybeSingle();

    if (actorProfileResult.error || !actorProfileResult.data) {
      return errorResponse("No app profile was found for the signed-in user.", 403);
    }

    const actor = actorProfileResult.data;
    const body = await request.json() as AdminActionRequest;

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

    if (body.action === "create_managed_youth_account") {
      if (!["bishop", "youth_leader"].includes(actor.role)) {
        return errorResponse("Only bishops and approved Youth leaders can create youth accounts.", 403);
      }

      if (actor.role === "youth_leader" && actor.approval_status !== "approved") {
        return errorResponse("This Youth leader account is still waiting for bishop approval.", 403);
      }

      const email = String(body.email || "").trim().toLowerCase();
      const fullName = String(body.fullName || "").trim();
      const wardName = String(body.ward || "").trim();
      const organization = body.organization;
      const password = String(body.password || "");

      if (!email || !fullName || !wardName || !organization || !password) {
        return errorResponse("Email, full name, ward, organization, and password are required.");
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

      const existingProfileResult = await adminClient
        .from("profiles")
        .select("id")
        .eq("email", email)
        .maybeSingle();

      if (existingProfileResult.error) {
        return errorResponse(existingProfileResult.error.message || "Unable to check for existing accounts.", 500);
      }

      if (existingProfileResult.data?.id) {
        return errorResponse("That email already has an account.", 409);
      }

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

      const profileResult = await adminClient
        .from("profiles")
        .upsert({
          id: createdUserResult.data.user.id,
          email,
          full_name: fullName,
          role: "youth",
          ward_id: wardResult.data.id,
          organization,
          approval_status: "verified"
        })
        .select("id, email, full_name, role, organization, approval_status")
        .single();

      if (profileResult.error) {
        return errorResponse(profileResult.error.message || "Unable to create the youth profile.", 500);
      }

      return jsonResponse({ profile: profileResult.data });
    }

    return errorResponse("Unsupported admin action.", 400);
  } catch (error) {
    return errorResponse(error instanceof Error ? error.message : "Unexpected function failure.", 500);
  }
});
