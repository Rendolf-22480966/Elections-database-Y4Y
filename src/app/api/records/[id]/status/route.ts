import { NextResponse } from "next/server";

import { createServerSupabaseClient } from "@/lib/supabase/server";

const VALID_STATUS_VALUES = new Set(["pending", "verified", "requires_correction"]);

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const payload = (await request.json().catch(() => ({}))) as { verification_status?: string };
    const verificationStatus = payload.verification_status?.trim();

    if (!verificationStatus || !VALID_STATUS_VALUES.has(verificationStatus)) {
      return NextResponse.json({ error: "A valid verification status is required." }, { status: 400 });
    }

    const supabase = await createServerSupabaseClient();
    if (!supabase) {
      return NextResponse.json({ error: "Supabase is not configured." }, { status: 503 });
    }

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json({ error: "You must be signed in to update a delegate status." }, { status: 401 });
    }

    const { data, error } = await supabase
      .from("administrative_records")
      .update({
        verification_status: verificationStatus,
        updated_by: user.id,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .select("id, verification_status, updated_at")
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ record: data }, { status: 200 });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unable to update the delegate status.",
      },
      { status: 500 },
    );
  }
}
