import { Button } from "@/components/ui/button";
import type { PolicyView } from "@/types/api";
import { PolicyRow } from "./PolicyRow";

interface Props {
  policies: PolicyView[];
  onCreate: () => void;
  onRun: (p: PolicyView) => void;
  onStop: (p: PolicyView) => void;
  onEdit: (p: PolicyView) => void;
  onDelete: (p: PolicyView) => void;
  onHistory: (p: PolicyView) => void;
  onOpenActiveRun: (p: PolicyView) => void;
}

export function PolicyList({
  policies,
  onCreate,
  onRun,
  onStop,
  onEdit,
  onDelete,
  onHistory,
  onOpenActiveRun,
}: Props) {
  return (
    <section className="bg-white rounded-lg shadow-sm">
      <header className="flex items-center justify-between p-4 border-b">
        <h2 className="text-lg font-semibold">Policies</h2>
        <Button onClick={onCreate}>New policy</Button>
      </header>
      {policies.length === 0 ? (
        <div className="p-6 text-center text-slate-500">
          No policies yet. Click <strong>New policy</strong> to get started.
        </div>
      ) : (
        <table className="w-full">
          <thead className="text-left text-xs uppercase text-slate-500">
            <tr>
              <th className="px-3 py-2">Name</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2">Next run</th>
              <th className="px-3 py-2">Last run</th>
              <th className="px-3 py-2 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {policies.map((p) => (
              <PolicyRow
                key={p.name}
                policy={p}
                onRun={() => onRun(p)}
                onStop={() => onStop(p)}
                onEdit={() => onEdit(p)}
                onDelete={() => onDelete(p)}
                onHistory={() => onHistory(p)}
                onOpenActiveRun={() => onOpenActiveRun(p)}
              />
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
