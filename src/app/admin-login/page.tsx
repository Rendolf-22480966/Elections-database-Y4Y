import { redirect } from "next/navigation";

// There is now one sign-in page for everyone. Campaign managers and administrators
// are sent to the colour panel automatically after signing in.
export default function AdminLoginPage() {
  redirect("/login");
}
