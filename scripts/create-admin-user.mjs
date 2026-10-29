import { createClient } from "@supabase/supabase-js";

const ADMIN_EMAIL = "abdulaiiddrisu78@gmail.com";
const ADMIN_PASSWORD = "Tracker78$Admin";
const ADMIN_NAME = "Abdulai Idrisu";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  console.error(
    "Missing Supabase credentials. Set NEXT_PUBLIC_SUPABASE_URL or SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY before running this script.",
  );
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
});

async function upsertAdminProfile(userId, email, fullName) {
  const { error } = await supabase
    .from("profiles")
    .upsert(
      {
        id: userId,
        full_name: fullName,
        email,
        role: "administrator",
      },
      { onConflict: "id" },
    );

  if (error) {
    throw error;
  }
}

try {
  const { data: userListData, error: listUsersError } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 });

  if (listUsersError) {
    throw listUsersError;
  }

  const existingUser = userListData.users.find(
    (user) => user.email?.toLowerCase() === ADMIN_EMAIL.toLowerCase(),
  );

  if (existingUser) {
    const { error: updateError } = await supabase.auth.admin.updateUserById(existingUser.id, {
      password: ADMIN_PASSWORD,
      email_confirm: true,
      user_metadata: {
        ...existingUser.user_metadata,
        full_name: ADMIN_NAME,
      },
    });

    if (updateError) {
      throw updateError;
    }

    await upsertAdminProfile(existingUser.id, ADMIN_EMAIL, ADMIN_NAME);
    console.log(`Updated existing admin user: ${ADMIN_EMAIL}`);
    process.exit(0);
  }

  const { data: createdUser, error: createError } = await supabase.auth.admin.createUser({
    email: ADMIN_EMAIL,
    password: ADMIN_PASSWORD,
    email_confirm: true,
    user_metadata: {
      full_name: ADMIN_NAME,
    },
  });

  if (createError || !createdUser.user) {
    throw createError ?? new Error("Supabase user creation returned no user.");
  }

  await upsertAdminProfile(createdUser.user.id, ADMIN_EMAIL, ADMIN_NAME);

  console.log(`Created admin user: ${ADMIN_EMAIL}`);
  console.log(`Password: ${ADMIN_PASSWORD}`);
  console.log("Use these credentials on the login page.");
} catch (error) {
  console.error("Failed to create Supabase admin user.", error);
  process.exit(1);
}
