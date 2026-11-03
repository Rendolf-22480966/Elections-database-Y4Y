import { redirect } from "next/navigation";

// Public sign-up is switched off: only the administrator creates accounts (in Supabase).
export default function SignupPage() {
  redirect("/login");
}
