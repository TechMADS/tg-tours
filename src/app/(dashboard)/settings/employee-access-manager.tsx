"use client";

import { useState, useTransition, type FormEvent } from "react";
import { Eye, EyeOff, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  createEmployee,
  deleteEmployee,
  resetEmployeePassword,
  setEmployeeDisabled,
  updateEmployeeModules,
  type EmployeeAccount,
} from "@/actions/employee-access";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { NAV_ITEMS } from "@/components/layout/nav-items";
import {
  EMPLOYEE_ACCESS_MODES,
  EMPLOYEE_MODULES,
  type EmployeeAccessMode,
  type ModuleKey,
} from "@/types/roles";

const MODULE_OPTIONS = EMPLOYEE_MODULES.map((id) => ({
  id,
  label: NAV_ITEMS.find((item) => item.module === id)?.label ?? id,
}));

function isSelected(modules: ModuleKey[], module: ModuleKey) {
  return modules.includes(module);
}

function toggleModule(modules: ModuleKey[], module: ModuleKey, checked: boolean) {
  return checked
    ? [...modules, module]
    : modules.filter((value) => value !== module);
}

function ModuleChoices({
  idPrefix,
  selected,
  onChange,
}: {
  idPrefix: string;
  selected: ModuleKey[];
  onChange: (modules: ModuleKey[]) => void;
}) {
  return (
    <fieldset className="space-y-2">
      <legend className="text-sm font-medium">Sidebar modules</legend>
      <div className="grid gap-2 sm:grid-cols-2">
        {MODULE_OPTIONS.map(({ id, label }) => (
          <label key={id} htmlFor={`${idPrefix}-${id}`} className="flex items-center gap-2 text-sm">
            <input
              id={`${idPrefix}-${id}`}
              type="checkbox"
              checked={isSelected(selected, id)}
              onChange={(event) => onChange(toggleModule(selected, id, event.target.checked))}
              className="size-4 accent-primary"
            />
            {label}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

function EmployeeRow({
  employee,
  onUpdate,
  onCredentials,
  onDelete,
  visiblePassword,
}: {
  employee: EmployeeAccount;
  onUpdate: (employee: EmployeeAccount) => void;
  onCredentials: (uid: string, password: string) => void;
  onDelete: (uid: string) => void;
  visiblePassword?: string;
}) {
  const [selected, setSelected] = useState(employee.modules);
  const [accessMode, setAccessMode] = useState(employee.accessMode);
  const [newPassword, setNewPassword] = useState("");
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showStoredPassword, setShowStoredPassword] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [pending, startTransition] = useTransition();

  function resetPassword() {
    startTransition(async () => {
      const result = await resetEmployeePassword(employee.uid, newPassword);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      onCredentials(employee.uid, newPassword);
      setShowStoredPassword(true);
      setNewPassword("");
      toast.success(`Password updated for ${employee.name || employee.email}`);
    });
  }

  function saveModules() {
    startTransition(async () => {
      const result = await updateEmployeeModules(employee.uid, selected, accessMode);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      onUpdate({ ...employee, modules: selected, accessMode });
      toast.success(`Access updated for ${employee.name || employee.email}`);
    });
  }

  function changeStatus(enabled: boolean) {
    startTransition(async () => {
      const result = await setEmployeeDisabled(employee.uid, !enabled);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      onUpdate({ ...employee, disabled: !enabled });
      toast.success(enabled ? "Employee account enabled" : "Employee account disabled");
    });
  }

  function removeEmployee() {
    startTransition(async () => {
      try {
        const result = await deleteEmployee(employee.uid);
        if (!result.ok) {
          toast.error(result.error);
          return;
        }
        onDelete(employee.uid);
        toast.success(`${employee.name || employee.email} removed from employee access`);
      } catch (error) {
        console.error("Employee account deletion failed:", error);
        toast.error("Could not delete the employee account. Please try again.");
      }
    });
  }

  return (
    <div className="space-y-4 rounded-lg border p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="font-medium">{employee.name || "Employee"}</p>
          <p className="break-all text-sm text-muted-foreground">{employee.email}</p>
        </div>
        <div className="flex items-center gap-2">
          <Label htmlFor={`enabled-${employee.uid}`} className="text-sm">
            {employee.disabled ? "Disabled" : "Active"}
          </Label>
          <Switch
            id={`enabled-${employee.uid}`}
            checked={!employee.disabled}
            onCheckedChange={changeStatus}
            disabled={pending}
          />
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label={`Delete ${employee.name || employee.email}`}
            title="Delete employee access"
            onClick={() => setConfirmDelete(true)}
            disabled={pending}
            className="text-destructive hover:text-destructive"
          >
            <Trash2 className="size-4" />
          </Button>
        </div>
      </div>
      {visiblePassword && (
        <div className="space-y-1 rounded-md bg-muted p-3 text-sm" role="status">
          <p className="font-medium">Employee credentials</p>
          <p className="break-all">Email: {employee.email}</p>
          <div className="flex items-center gap-2">
            <span>Password:</span>
            <span className="font-mono">
              {showStoredPassword ? visiblePassword : "•".repeat(visiblePassword.length)}
            </span>
            <button
              type="button"
              aria-label={showStoredPassword ? "Hide employee password" : "Show employee password"}
              aria-pressed={showStoredPassword}
              onClick={() => setShowStoredPassword((visible) => !visible)}
              className="text-muted-foreground hover:text-foreground inline-flex size-8 items-center justify-center rounded-md"
            >
              {showStoredPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
            </button>
          </div>
          <p className="text-muted-foreground text-xs">
            Available until you leave Settings. Reset the password to view it again later.
          </p>
        </div>
      )}
      <div className="flex flex-wrap items-end gap-2">
        <div className="min-w-0 flex-1 space-y-2 sm:max-w-xs">
          <Label htmlFor={`password-${employee.uid}`}>Set a new password</Label>
          <div className="relative">
            <Input
              id={`password-${employee.uid}`}
              type={showNewPassword ? "text" : "password"}
              autoComplete="new-password"
              minLength={8}
              maxLength={128}
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
              placeholder="At least 8 characters"
              className="pr-10"
            />
            <button
              type="button"
              aria-label={showNewPassword ? "Hide new password" : "Show new password"}
              aria-pressed={showNewPassword}
              onClick={() => setShowNewPassword((visible) => !visible)}
              className="text-muted-foreground hover:text-foreground absolute inset-y-0 right-0 inline-flex w-10 items-center justify-center"
            >
              {showNewPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
            </button>
          </div>
        </div>
        <Button
          type="button"
          variant="outline"
          onClick={resetPassword}
          disabled={pending || newPassword.length < 8}
        >
          {pending ? "Updating…" : "Reset password"}
        </Button>
      </div>
      <ModuleChoices
        idPrefix={employee.uid}
        selected={selected}
        onChange={setSelected}
      />
      <div className="max-w-xs space-y-2">
        <Label htmlFor={`access-mode-${employee.uid}`}>Access type</Label>
        <select
          id={`access-mode-${employee.uid}`}
          value={accessMode}
          onChange={(event) => setAccessMode(event.target.value as EmployeeAccessMode)}
          className="border-input bg-background h-9 w-full rounded-md border px-3 text-sm"
        >
          <option value="editor">Editor - can view and edit assigned modules</option>
          <option value="viewer">Viewer - can only view assigned modules</option>
        </select>
      </div>
      <Button
        type="button"
        variant="outline"
        onClick={saveModules}
        disabled={
          pending
          || selected.length === 0
          || (selected.length === employee.modules.length
            && selected.every((module) => employee.modules.includes(module))
            && accessMode === employee.accessMode)
        }
      >
        {pending ? "Saving…" : "Save access"}
      </Button>
      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title="Delete this employee account?"
        description={`"${employee.name || employee.email}" will lose access immediately, and their login account will be permanently deleted.`}
        confirmLabel="Delete employee"
        onConfirm={removeEmployee}
      />
    </div>
  );
}

export function EmployeeAccessManager({
  initialEmployees,
}: {
  initialEmployees: EmployeeAccount[];
}) {
  const [employees, setEmployees] = useState(initialEmployees);
  const [modules, setModules] = useState<ModuleKey[]>([]);
  const [accessMode, setAccessMode] = useState<EmployeeAccessMode>("viewer");
  const [visiblePasswords, setVisiblePasswords] = useState<Record<string, string>>({});
  const [showAssignedPassword, setShowAssignedPassword] = useState(false);
  const [pending, startTransition] = useTransition();

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);

    startTransition(async () => {
      const result = await createEmployee({
        name: data.get("name"),
        email: data.get("email"),
        password: data.get("password"),
        modules,
        accessMode,
      });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      setEmployees((current) => [...current, result.employee]);
      setVisiblePasswords((current) => ({
        ...current,
        [result.employee.uid]: result.password,
      }));
      setModules([]);
      setAccessMode("viewer");
      form.reset();
      setShowAssignedPassword(false);
      toast.success("Employee account created");
    });
  }

  function replaceEmployee(updated: EmployeeAccount) {
    setEmployees((current) => current.map((employee) =>
      employee.uid === updated.uid ? updated : employee,
    ));
  }

  function showPassword(uid: string, password: string) {
    setVisiblePasswords((current) => ({ ...current, [uid]: password }));
  }

  function removeEmployee(uid: string) {
    setEmployees((current) => current.filter((employee) => employee.uid !== uid));
    setVisiblePasswords((current) => {
      const remaining = { ...current };
      delete remaining[uid];
      return remaining;
    });
  }

  return (
    <section className="max-w-3xl space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Employee access</CardTitle>
          <CardDescription>
            Create an employee login and choose which sidebar modules it can open.
            Settings stays available to admins only.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={submit} className="space-y-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="employee-name">Employee name</Label>
                <Input id="employee-name" name="name" autoComplete="name" required maxLength={100} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="employee-email">Email</Label>
                <Input id="employee-email" name="email" type="email" autoComplete="email" required />
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="employee-password">Temporary password</Label>
                <div className="relative">
                  <Input
                    id="employee-password"
                    name="password"
                    type={showAssignedPassword ? "text" : "password"}
                    autoComplete="new-password"
                    minLength={8}
                    maxLength={128}
                    required
                    className="pr-10"
                  />
                  <button
                    type="button"
                    aria-label={showAssignedPassword ? "Hide temporary password" : "Show temporary password"}
                    aria-pressed={showAssignedPassword}
                    onClick={() => setShowAssignedPassword((visible) => !visible)}
                    className="text-muted-foreground hover:text-foreground absolute inset-y-0 right-0 inline-flex w-10 items-center justify-center"
                  >
                    {showAssignedPassword
                      ? <EyeOff className="size-4" />
                      : <Eye className="size-4" />}
                  </button>
                </div>
                <p className="text-muted-foreground text-xs">
                  Share this password securely. The employee can use it on the existing login page.
                </p>
              </div>
            </div>
            <ModuleChoices idPrefix="new-employee" selected={modules} onChange={setModules} />
            <div className="max-w-xs space-y-2">
              <Label htmlFor="new-employee-access-mode">Access type</Label>
              <select
                id="new-employee-access-mode"
                value={accessMode}
                onChange={(event) => setAccessMode(event.target.value as EmployeeAccessMode)}
                className="border-input bg-background h-9 w-full rounded-md border px-3 text-sm"
              >
                {EMPLOYEE_ACCESS_MODES.map((mode) => (
                  <option key={mode} value={mode}>
                    {mode === "editor"
                      ? "Editor - can view and edit assigned modules"
                      : "Viewer - can only view assigned modules"}
                  </option>
                ))}
              </select>
            </div>
            <Button type="submit" disabled={pending || modules.length === 0}>
              {pending ? "Creating…" : "Create employee account"}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Employee accounts</CardTitle>
          <CardDescription>
            Access changes take effect immediately and require the employee to sign in again.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {employees.length === 0 ? (
            <p className="text-muted-foreground text-sm">No employee accounts yet.</p>
          ) : (
            employees.map((employee) => (
              <EmployeeRow
                key={employee.uid}
                employee={employee}
                onUpdate={replaceEmployee}
                onCredentials={showPassword}
                onDelete={removeEmployee}
                visiblePassword={visiblePasswords[employee.uid]}
              />
            ))
          )}
        </CardContent>
      </Card>
    </section>
  );
}
