"use client";

import { useState, useTransition, type FormEvent } from "react";
import { signInWithEmailAndPassword, signOut } from "firebase/auth";
import { useRouter } from "next/navigation";
import { Eye, EyeOff } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { clientAuth } from "@/lib/firebase/client";

function authErrorCode(error: unknown) {
  if (typeof error === "object" && error !== null && "code" in error) {
    return error.code;
  }
  return undefined;
}

export function ChangeAdminPassword({ email }: { email: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [visibleFields, setVisibleFields] = useState({ current: false, new: false, confirm: false });

  function toggleVisibility(field: keyof typeof visibleFields) {
    setVisibleFields((visible) => ({ ...visible, [field]: !visible[field] }));
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (newPassword.length < 8 || newPassword.length > 128) {
      toast.error("New password must be between 8 and 128 characters");
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error("New passwords do not match");
      return;
    }

    startTransition(async () => {
      try {
        const credential = await signInWithEmailAndPassword(clientAuth, email, currentPassword);
        const idToken = await credential.user.getIdToken();
        const response = await fetch("/api/auth/change-password", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ idToken, newPassword }),
        });

        if (!response.ok) {
          const result = await response.json().catch(() => null) as { error?: string } | null;
          toast.error(result?.error ?? "Password change failed. Please try again.");
          return;
        }

        const result = await response.json() as { sessionsRevoked: boolean };
        setCurrentPassword("");
        setNewPassword("");
        setConfirmPassword("");
        if (result.sessionsRevoked) {
          toast.success("Password updated. Sign in again with your new password.");
        } else {
          toast.warning("Password changed, but other sessions may still be active. Sign in again.");
        }
        router.replace("/login");
        router.refresh();
      } catch (error) {
        const code = authErrorCode(error);
        if (code === "auth/invalid-credential" || code === "auth/wrong-password") {
          toast.error("Current password is incorrect");
        } else {
          toast.error("Password change failed. Please try again.");
        }
      } finally {
        if (clientAuth.currentUser) {
          try {
            await signOut(clientAuth);
          } catch (error) {
            console.error("Could not clear the temporary password verification sign-in:", error);
          }
        }
      }
    });
  }

  return (
    <Card className="mb-6 max-w-3xl">
      <CardHeader>
        <CardTitle>Change admin password</CardTitle>
        <CardDescription>
          Confirm your current password to set a new password. You will need to sign in again afterward.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="admin-current-password">Current password</Label>
            <div className="relative">
              <Input
                id="admin-current-password"
                type={visibleFields.current ? "text" : "password"}
                autoComplete="current-password"
                required
                value={currentPassword}
                onChange={(event) => setCurrentPassword(event.target.value)}
                className="pr-10"
              />
              <button
                type="button"
                aria-label={visibleFields.current ? "Hide current password" : "Show current password"}
                aria-pressed={visibleFields.current}
                onClick={() => toggleVisibility("current")}
                className="text-muted-foreground hover:text-foreground absolute inset-y-0 right-0 inline-flex w-10 items-center justify-center"
              >
                {visibleFields.current ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              </button>
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="admin-new-password">New password</Label>
            <div className="relative">
              <Input
                id="admin-new-password"
                type={visibleFields.new ? "text" : "password"}
                autoComplete="new-password"
                minLength={8}
                maxLength={128}
                required
                value={newPassword}
                onChange={(event) => setNewPassword(event.target.value)}
                className="pr-10"
              />
              <button
                type="button"
                aria-label={visibleFields.new ? "Hide new password" : "Show new password"}
                aria-pressed={visibleFields.new}
                onClick={() => toggleVisibility("new")}
                className="text-muted-foreground hover:text-foreground absolute inset-y-0 right-0 inline-flex w-10 items-center justify-center"
              >
                {visibleFields.new ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              </button>
            </div>
            <p className="text-muted-foreground text-xs">Use 8 to 128 characters.</p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="admin-confirm-password">Confirm new password</Label>
            <div className="relative">
              <Input
                id="admin-confirm-password"
                type={visibleFields.confirm ? "text" : "password"}
                autoComplete="new-password"
                minLength={8}
                maxLength={128}
                required
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                className="pr-10"
              />
              <button
                type="button"
                aria-label={visibleFields.confirm ? "Hide confirmation password" : "Show confirmation password"}
                aria-pressed={visibleFields.confirm}
                onClick={() => toggleVisibility("confirm")}
                className="text-muted-foreground hover:text-foreground absolute inset-y-0 right-0 inline-flex w-10 items-center justify-center"
              >
                {visibleFields.confirm ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              </button>
            </div>
          </div>
          <div className="sm:col-span-2">
            <Button type="submit" disabled={pending}>
              {pending ? "Updating password…" : "Change password"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
