// Centrale takenbeheerder van het directie-werkblad: alle categorieën
// (algemeen + sales), inclusief categoriefilter en -beheer.
import { TasksManager } from "@/components/tasks/TasksManager";

export default function DirectieTaken() {
  return <TasksManager scope="all" />;
}
