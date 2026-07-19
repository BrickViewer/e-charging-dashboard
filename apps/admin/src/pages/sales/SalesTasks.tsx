// /sales/taken — alleen sales-taken. De volledige takenbeheerder (alle
// categorieën) leeft in het directie-werkblad op /admin/taken.
import { TasksManager } from "@/components/tasks/TasksManager";

export default function SalesTasks() {
  return <TasksManager scope="sales" />;
}
