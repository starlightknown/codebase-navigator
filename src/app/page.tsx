"use client";

import { AppLayout } from "@/components/AppLayout";
import { LandingPage } from "@/components/LandingPage";
import { useRepository } from "@/hooks/useRepository";
import { useAppStore } from "@/store";

function AppShell() {
  const { loadRepository, loadLocalFolder, loading, error } = useRepository();
  const tree = useAppStore((s) => s.repo.tree);

  if (!tree) {
    return (
      <LandingPage
        onLoadRepo={loadRepository}
        onLoadFolder={loadLocalFolder}
        loading={loading}
        error={error}
      />
    );
  }

  return <AppLayout />;
}

export default function Home() {
  return <AppShell />;
}
