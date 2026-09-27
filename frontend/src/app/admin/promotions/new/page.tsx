"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { AdminHeader } from "@/components/admin/AdminHeader";
import { PromotionForm } from "@/components/admin/PromotionForm";

export default function NewPromotionPage() {
  const router = useRouter();
  return (
    <>
      <Link href="/admin/promotions" className="text-sm text-muted hover:text-ink">
        ← Все акции
      </Link>
      <AdminHeader title="Новая акция" />
      <PromotionForm onSaved={(p) => router.replace(`/admin/promotions/${p.id}`)} />
    </>
  );
}
