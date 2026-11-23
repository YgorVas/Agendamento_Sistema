import Link from "next/link";
import { env } from "@/lib/env";
import { RecoveryForm } from "./recovery-form";

export const dynamic = "force-dynamic";

export default function RecoveryPage() {
  const support = env.PILOT_SUPPORT_EMAIL;
  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-8 shadow-lg">
        <h1 className="text-2xl font-bold">Recuperar acesso</h1>
        <p className="mb-6 mt-2 text-sm text-slate-600">
          Solicite um código temporário ao suporte{support && <> pelo e-mail <a className="font-semibold underline" href={`mailto:${support}`}>{support}</a></>},
          informando o e-mail da sua conta. Se já recebeu o código, use-o abaixo.
        </p>
        <RecoveryForm />
        <Link href="/login" className="mt-4 inline-block text-sm font-semibold text-brand-700 hover:underline">Voltar ao login</Link>
      </div>
    </main>
  );
}
