import type { ReactNode } from "react";
import { DataSourceIndicator } from "@/components/DataSourceIndicator";
import { AppHeader } from "./AppHeader";
import { BottomNav } from "@/components/BottomNav";

export default function AppLayout({ children }: { children: ReactNode }) {
  // IMPORTANT: BottomNav is rendered HERE (outside the fade wrapper) so it is never
  // inside a CSS `transform`/`animation` containing block — that was breaking
  // `position: fixed`. The fade below is opacity-only, which is safe.
  return (
    <>
      <DataSourceIndicator />
      <AppHeader />
      <div className="fade-in-opacity">{children}</div>
      <BottomNav />
    </>
  );
}
