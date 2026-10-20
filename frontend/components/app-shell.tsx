"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { BookOpenCheck, BriefcaseBusiness, LogOut, PanelsTopLeft, Sparkles } from "lucide-react";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import type { User } from "@/lib/types";

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let active = true;
    api.me().then((result) => { if (active) setUser(result.user); }).catch(() => { if (active) router.replace("/login"); }).finally(() => { if (active) setReady(true); });
    return () => { active = false; };
  }, [router]);

  async function signOut() {
    try { await api.logout(); } finally { router.replace("/login"); }
  }

  if (!ready) return <div className="grid min-h-screen place-items-center text-sm text-[#86889d]">Opening your workspace…</div>;
  if (!user) return null;

  const nav = [
    { label: "Overview", href: "/dashboard", icon: PanelsTopLeft },
    { label: "My kits", href: "/dashboard#kits", icon: BriefcaseBusiness },
  ];
  const initials = user.email.slice(0, 1).toUpperCase();

  return <div className="min-h-screen bg-[#f7f7fb] lg:flex">
    <aside className="hidden w-[252px] shrink-0 border-r border-[#e9e9f0] bg-white px-5 py-6 lg:flex lg:flex-col">
      <Link href="/dashboard" className="mb-10 flex items-center gap-3 px-1" aria-label="Interview Kit home">
        <span className="grid size-10 place-items-center rounded-[14px] bg-[#6b5bea] text-white shadow-[0_8px_18px_rgba(103,87,230,.24)]"><Sparkles size={20} /></span>
        <span><span className="block text-[15px] font-bold tracking-[-.03em]">Interview Kit</span><span className="text-[10px] font-semibold tracking-[.16em] text-[#9a9bac]">PREP STUDIO</span></span>
      </Link>
      <div className="eyebrow mb-3 px-3">Workspace</div>
      <nav className="space-y-1">
        {nav.map(({ label, href, icon: Icon }) => {
          const active = href === "/dashboard" ? pathname === "/dashboard" : pathname.startsWith("/kits/");
          return <Link key={label} href={href} className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-[13px] font-semibold transition ${active ? "bg-[#f0efff] text-[#5846d2]" : "text-[#77798d] hover:bg-[#f7f7fa] hover:text-[#303149]"}`}><Icon size={17} strokeWidth={1.9} />{label}</Link>;
        })}
      </nav>
      <div className="mt-8 rounded-[18px] bg-[#f7f6ff] p-4">
        <div className="mb-2 flex size-8 items-center justify-center rounded-xl bg-white text-[#6857e8] shadow-sm"><BookOpenCheck size={16} /></div>
        <p className="text-xs font-bold text-[#373654]">A little every day</p>
        <p className="mt-1 text-[11px] leading-5 text-[#89899c]">Your kit turns the job post into a clear preparation plan.</p>
      </div>
      <div className="mt-auto border-t border-[#efeff4] pt-4">
        <div className="flex items-center gap-3 px-2 py-2">
          <span className="grid size-9 place-items-center rounded-full bg-[#e9e6ff] text-sm font-bold text-[#6352d7]">{initials}</span>
          <span className="min-w-0 flex-1"><span className="block truncate text-xs font-semibold text-[#3d3e53]">{user.email}</span><span className="text-[10px] text-[#9b9dac]">Personal workspace</span></span>
          <button aria-label="Sign out" title="Sign out" onClick={signOut} className="rounded-lg p-2 text-[#8b8da0] hover:bg-[#f2f2f7] hover:text-[#45465b]"><LogOut size={16} /></button>
        </div>
      </div>
    </aside>

    <div className="min-w-0 flex-1">
      <header className="flex h-[68px] items-center justify-between border-b border-[#e9e9f0] bg-white px-4 sm:px-8 lg:px-10">
        <Link href="/dashboard" className="flex items-center gap-2.5 lg:hidden"><span className="grid size-8 place-items-center rounded-xl bg-[#6b5bea] text-white"><Sparkles size={17} /></span><span className="text-sm font-bold">Interview Kit</span></Link>
        <div className="hidden items-center gap-2 text-xs text-[#9b9dac] lg:flex"><span>Workspace</span><span>/</span><span className="font-semibold text-[#55566b]">{pathname.startsWith("/kits/") ? "Your kit" : "Overview"}</span></div>
        <div className="flex items-center gap-2 text-[11px] font-semibold text-[#8a8c9d]"><span className="size-2 rounded-full bg-[#75c9a0]" />PRIVATE WORKSPACE</div>
      </header>
      <main className="mx-auto w-full max-w-[1440px] px-4 py-6 sm:px-8 sm:py-8 lg:px-10">{children}</main>
    </div>
  </div>;
}
