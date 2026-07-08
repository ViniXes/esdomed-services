"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { doc, getDoc } from "@/lib/firestoreMeter";
import { db } from "@/lib/firebase";
import { ArrowLeft, Printer } from "lucide-react";
import type { SolicitudAnexo5 } from "@/types";
import { Anexo5PrintLayout } from "@/components/anexo5/Anexo5PrintLayout";

export default function ImprimirAnexo5Page() {
  const params = useParams();
  const id = params.id as string;
  const router = useRouter();
  const [data, setData] = useState<SolicitudAnexo5 | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    getDoc(doc(db, "anexo5", id))
      .then((d) => {
        if (d.exists()) {
          setData({ id: d.id, ...d.data() } as SolicitudAnexo5);
        } else {
          setError("Documento no encontrado");
        }
        setLoading(false);
      })
      .catch((e) => {
        setError(e instanceof Error ? e.message : "Error al cargar");
        setLoading(false);
      });
  }, [id]);

  if (loading) {
    return (
      <div className="fixed inset-0 z-50 bg-white flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="fixed inset-0 z-50 bg-white flex flex-col items-center justify-center p-6">
        <p className="text-sm text-slate-500 mb-3">{error ?? "No se pudo cargar el documento"}</p>
        <button
          onClick={() => router.back()}
          className="text-sm text-blue-600 hover:underline"
        >
          ← Volver
        </button>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 bg-slate-200 overflow-y-auto print:bg-white print:static print:inset-auto print:overflow-visible">
      {/* Toolbar — oculto al imprimir */}
      <div className="print:hidden sticky top-0 z-10 bg-white border-b border-slate-200 shadow-sm">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
          <button
            onClick={() => router.back()}
            className="flex items-center gap-1.5 text-sm text-slate-600 hover:text-slate-900 transition-colors"
          >
            <ArrowLeft size={15} />
            Volver
          </button>
          <p className="text-xs text-slate-500">Vista previa — Anexo 5</p>
          <button
            onClick={() => window.print()}
            className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors"
          >
            <Printer size={14} />
            Imprimir / Guardar PDF
          </button>
        </div>
      </div>

      {/* Documento en hoja blanca */}
      <div className="py-6 px-4 print:p-0">
        <div className="bg-white shadow-lg max-w-[21cm] mx-auto print:shadow-none print:max-w-none">
          <Anexo5PrintLayout data={data} />
        </div>
      </div>

      {/* CSS global: oculta sidebar y barras del dashboard al imprimir */}
      <style jsx global>{`
        @media print {
          aside,
          .md\\:hidden,
          [class*="border-r border-slate-200"][class*="dark:border-slate-800"],
          [class*="md:hidden fixed top-0"] {
            display: none !important;
          }
          main {
            padding: 0 !important;
            overflow: visible !important;
          }
          html, body {
            background: white !important;
          }
        }
      `}</style>
    </div>
  );
}
