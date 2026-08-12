"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function ComiteLesionesHome() {
  const router = useRouter();
  useEffect(() => { router.replace("/comite-lesiones/conapina-fgr"); }, [router]);
  return (
    <div className="flex items-center justify-center h-full">
      <div className="w-7 h-7 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
    </div>
  );
}
