import Image from "next/image";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { LoginForm } from "./login-form";

export default async function LoginPage() {
  if (await getCurrentUser()) redirect("/");

  return (
    <main className="relative grid min-h-screen lg:grid-cols-2">
      <div className="absolute top-5 right-5 z-10 w-[132px] sm:top-8 sm:right-8 sm:w-[156px]">
        <Image
          src="/adn-logo-light.png"
          alt="ADN Adventures"
          width={655}
          height={390}
          className="h-auto w-full dark:hidden"
        />
        <Image
          src="/adn-logo-dark.png"
          alt="ADN Adventures"
          width={1318}
          height={768}
          className="hidden h-auto w-full dark:block"
        />
      </div>
      <div className="bg-hero-gradient hidden flex-col justify-between p-10 text-[#1C1917] lg:flex">
        <span className="text-sm font-semibold tracking-widest uppercase">Admin Panel</span>
        <div>
          <h1 className="text-5xl font-bold tracking-tight">ADN Adventures</h1>
          <p className="mt-3 text-xl italic">Your Travel Our Responsibilities</p>
        </div>
        <p className="text-sm">© {new Date().getFullYear()} ADN Adventures</p>
      </div>
      <div className="flex items-center justify-center p-6 pt-28 sm:pt-6">
        <LoginForm />
      </div>
    </main>
  );
}