import { statementFilterSchema } from "@/domain/list-filters";
import { StatementsList } from "@/features/statements/list";
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ studentId?: string; status?: string }>;
}) {
  const { studentId, status } = await searchParams;
  const selected = statementFilterSchema.safeParse(
    status === "outstanding" || status === "partial" ? "unpaid" : status,
  );
  return (
    <StatementsList
      initialStatus={selected.success ? selected.data : "all"}
      initialStudentId={typeof studentId === "string" ? studentId : ""}
    />
  );
}
