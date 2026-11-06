"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { signInWithEmailAndPassword, signOut } from "firebase/auth";
import { Eye, EyeOff } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { clientAuth } from "@/lib/firebase/client";

const schema = z.object({
  email: z.string().email("Enter a valid email"),
  password: z.string().min(6, "Minimum 6 characters"),
});
type Values = z.infer<typeof schema>;

export function LoginForm({ businessName }: { businessName: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<Values>({ resolver: zodResolver(schema) });

  async function onSubmit(values: Values) {
    setLoading(true);
    try {
      const cred = await signInWithEmailAndPassword(clientAuth, values.email, values.password);
      const idToken = await cred.user.getIdToken();

      const res = await fetch("/api/auth/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idToken }),
      });

      await signOut(clientAuth); // only the server cookie is used from here on

      if (res.status === 403) {
        toast.error("Your account has no access assigned. Contact an admin.");
        return;
      }
      if (!res.ok) throw new Error("session");

      router.replace("/");
      router.refresh();
    } catch {
      toast.error("Invalid email or password");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="w-full max-w-sm space-y-5">
      <div>
        <h2 className="text-2xl font-bold">Welcome back</h2>
        <p className="text-muted-foreground text-sm">Sign in to manage {businessName}</p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="email">Email</Label>
        <Input id="email" type="email" autoComplete="email" {...register("email")} />
        {errors.email && <p className="text-destructive text-xs">{errors.email.message}</p>}
      </div>

      <div className="space-y-2">
        <Label htmlFor="password">Password</Label>
        <div className="relative">
          <Input
            id="password"
            type={showPassword ? "text" : "password"}
            autoComplete="current-password"
            className="pr-10"
            {...register("password")}
          />
          <button
            type="button"
            aria-label={showPassword ? "Hide password" : "Show password"}
            aria-pressed={showPassword}
            onClick={() => setShowPassword((visible) => !visible)}
            className="text-muted-foreground hover:text-foreground absolute inset-y-0 right-0 inline-flex w-10 items-center justify-center"
          >
            {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
          </button>
        </div>
        {errors.password && <p className="text-destructive text-xs">{errors.password.message}</p>}
      </div>

      <Button type="submit" className="w-full" disabled={loading}>
        {loading ? "Signing in…" : "Sign in"}
      </Button>
    </form>
  );
}