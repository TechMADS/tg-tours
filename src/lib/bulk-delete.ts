import { toast } from "sonner";

export type DeleteResult = { ok: true } | { ok: false; error: string };

export async function runBulkDelete(
  ids: string[],
  deleteOne: (id: string) => Promise<DeleteResult>,
): Promise<{ deletedIds: string[]; failedIds: string[]; errors: string[] }> {
  const deletedIds: string[] = [];
  const failedIds: string[] = [];
  const errors: string[] = [];

  for (const id of ids) {
    try {
      const result = await deleteOne(id);
      if (result.ok) deletedIds.push(id);
      else {
        failedIds.push(id);
        errors.push(result.error);
      }
    } catch (error) {
      failedIds.push(id);
      console.error("Bulk delete request failed:", {
        id,
        name: error instanceof Error ? error.name : "UnknownError",
      });
      errors.push("One or more records could not be deleted due to a request error.");
    }
  }

  return { deletedIds, failedIds, errors: Array.from(new Set(errors)) };
}

export function reportBulkDelete(
  result: Awaited<ReturnType<typeof runBulkDelete>>,
  recordLabel: string,
) {
  if (result.deletedIds.length > 0) {
    toast.success(`${result.deletedIds.length} ${recordLabel}${result.deletedIds.length === 1 ? "" : "s"} deleted`);
  }
  if (result.failedIds.length > 0) {
    toast.error(
      `${result.failedIds.length} ${recordLabel}${result.failedIds.length === 1 ? "" : "s"} could not be deleted. ${result.errors.join(" ")}`,
    );
  }
}
