"use client";

import React from "react";
import { LabNavigation } from "@/components/LabNavigation";
import { InteractiveNebulaShader } from "@/components/InteractiveNebulaShader";

export default function Page() {
  return (
    <main className="fixed inset-0">
      <LabNavigation />
      <InteractiveNebulaShader />
    </main>
  );
}
