"use client";

import { use } from "react";
import { HospitalDiaEditor } from "@/components/hospitaldia/HospitalDiaEditor";

export default function EditarHospitalDiaPage({
  params,
}: {
  params: Promise<{ expediente: string }>;
}) {
  const { expediente } = use(params);
  return <HospitalDiaEditor expediente={decodeURIComponent(expediente)} />;
}
