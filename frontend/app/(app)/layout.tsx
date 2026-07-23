import { AppNav } from "@/components/app-nav";
import { CoachingCharacter } from "@/components/coaching-character";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-1">
      <AppNav />
      <main className="flex flex-1 flex-col">{children}</main>
      <CoachingCharacter />
    </div>
  );
}