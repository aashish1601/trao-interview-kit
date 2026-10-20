"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, Eye, EyeOff, LockKeyhole, Mail, Sparkles } from "lucide-react";
import { useState } from "react";
import { api, ApiError } from "@/lib/api";

export function AuthForm({ mode }: { mode: "login" | "register" }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const isRegister = mode === "register";

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(""); setBusy(true);
    try {
      if (isRegister) await api.register(email, password); else await api.login(email, password);
      router.replace("/dashboard");
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Could not connect to the server. Check that the backend is running.");
    } finally { setBusy(false); }
  }

  return <main className="grid min-h-screen bg-white lg:grid-cols-[1.03fr_.97fr]">
    <section className="relative flex min-h-[380px] flex-col overflow-hidden bg-[#17172b] px-7 py-8 text-white sm:px-12 lg:min-h-screen lg:px-16 lg:py-12">
      <div className="absolute -right-24 -top-20 size-[360px] rounded-full border border-white/10" /><div className="absolute -right-10 -top-6 size-[280px] rounded-full border border-white/10" /><div className="absolute -bottom-44 -left-20 size-[390px] rounded-full bg-[#6e5cf5]/20 blur-3xl" />
      <Link href="/" className="relative z-10 flex w-fit items-center gap-3"><span className="grid size-10 place-items-center rounded-[14px] bg-[#7563f6]"><Sparkles size={19} /></span><span className="text-sm font-bold tracking-tight">Interview Kit</span></Link>
      <div className="relative z-10 my-auto max-w-[510px] py-12">
        <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3 py-1.5 text-[11px] font-semibold tracking-wide text-[#cac6ff]"><span className="size-1.5 rounded-full bg-[#a99fff]" /> A focused way to prepare</div>
        <h1 className="text-4xl font-semibold leading-[1.12] tracking-[-.045em] sm:text-5xl">Walk into the room<br /><span className="text-[#aaa0ff]">ready for the role.</span></h1>
        <p className="mt-6 max-w-[410px] text-sm leading-7 text-[#b1b1c4]">Turn a job description into a company brief, likely questions, flashcards, and a study plan that fits your time.</p>
        <div className="mt-11 grid max-w-[430px] grid-cols-3 gap-3">
          {[{n:"01",label:"Research"},{n:"02",label:"Practice"},{n:"03",label:"Show up ready"}].map((item)=><div key={item.n} className="border-t border-white/15 pt-3"><span className="text-[10px] font-bold text-[#8d83ed]">{item.n}</span><p className="mt-1 text-xs font-semibold text-[#e2e1ef]">{item.label}</p></div>)}
        </div>
      </div>
      <p className="relative z-10 text-[10px] text-[#77778e]">Private by default · Your kits stay in your account</p>
    </section>

    <section className="flex items-center justify-center px-5 py-12 sm:px-10">
      <div className="w-full max-w-[410px]">
        <Link href="/" className="mb-10 inline-flex items-center gap-2 text-xs font-semibold text-[#8d8ea0] hover:text-[#5e50d3]"><ArrowLeft size={14} /> Back to overview</Link>
        <p className="eyebrow mb-3">{isRegister ? "Create an account" : "Welcome back"}</p>
        <h2 className="text-[30px] font-semibold tracking-[-.04em] text-[#202137]">{isRegister ? "Start your prep" : "Sign in to continue"}</h2>
        <p className="mt-2 text-sm leading-6 text-[#888a9b]">{isRegister ? "Your interview materials, together in one place." : "Pick up where your preparation left off."}</p>
        <form onSubmit={submit} className="mt-8 space-y-5">
          <label className="block"><span className="mb-2 block text-xs font-semibold text-[#55566c]">Email address</span><span className="relative block"><Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#a3a4b2]" size={16} /><input autoComplete="email" type="email" className="field pl-10" placeholder="you@example.com" value={email} onChange={(event)=>setEmail(event.target.value)} required maxLength={254} /></span></label>
          <label className="block"><span className="mb-2 block text-xs font-semibold text-[#55566c]">Password</span><span className="relative block"><LockKeyhole className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#a3a4b2]" size={16} /><input autoComplete={isRegister ? "new-password" : "current-password"} type={showPassword ? "text" : "password"} className="field pl-10 pr-11" placeholder={isRegister ? "At least 10 characters" : "Your password"} value={password} onChange={(event)=>setPassword(event.target.value)} required minLength={isRegister ? 10 : 1} maxLength={72} /><button type="button" aria-label={showPassword ? "Hide password" : "Show password"} onClick={()=>setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-[#9698aa]">{showPassword ? <EyeOff size={16}/> : <Eye size={16}/>}</button></span></label>
          {error && <p role="alert" className="rounded-xl border border-[#f1d0d2] bg-[#fff6f6] px-3.5 py-3 text-xs leading-5 text-[#ac424b]">{error}</p>}
          <button disabled={busy} className="btn-primary mt-1 w-full disabled:cursor-wait disabled:opacity-70">{busy ? "Please wait…" : isRegister ? "Create account" : "Sign in"}{!busy && <ArrowRight size={16}/>}</button>
        </form>
        <p className="mt-7 text-center text-xs text-[#8d8ea0]">{isRegister ? "Already have an account?" : "New to Interview Kit?"} <Link className="ml-1 font-bold text-[#6150d8] hover:underline" href={isRegister ? "/login" : "/register"}>{isRegister ? "Sign in" : "Create an account"}</Link></p>
      </div>
    </section>
  </main>;
}
