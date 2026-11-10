import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { LoginForm } from "./login-form";

export default async function LoginPage() {
  if (await getCurrentUser()) redirect("/");

  const businessName = "ABC Tours and Travels";

  return (
    <main className="relative grid min-h-screen lg:grid-cols-2">
      <div className="absolute top-5 right-5 z-10 text-right text-sm font-bold leading-tight sm:top-8 sm:right-8">
        <p>ABC Tours</p>
        <p>and Travels</p>
      </div>
      <div className="bg-hero-gradient hidden flex-col justify-between p-10 text-[#1C1917] lg:flex">
        <span className="text-sm font-semibold tracking-widest uppercase">Admin Panel</span>
        <div>
          <h1 className="text-5xl font-bold tracking-tight">{businessName}</h1>
        </div>
        <p className="text-sm">© {new Date().getFullYear()} {businessName}</p>
      </div>
      <div className="flex items-center justify-center p-6 pt-28 sm:pt-6">
        <LoginForm businessName={businessName} />
      </div>
    </main>
  );
}