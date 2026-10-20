"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, BriefcaseBusiness, Building2, CalendarDays, Check, ChevronDown, ChevronRight, Clock3, FileJson2, LoaderCircle, Play, Sparkles, Terminal, Upload, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { api, ApiError } from "@/lib/api";
import type { KitRecord } from "@/lib/types";

const statusLabel: Record<KitRecord["status"], string> = { queued: "Queued", running: "Researching", ready: "Ready", failed: "Needs attention", regenerating: "Refreshing" };
const statusColor: Record<KitRecord["status"], string> = {
  queued: "bg-[#f2f2f6] text-[#77798b]", running: "bg-[#fff5e8] text-[#bd8040]", ready: "bg-[#edf8f1] text-[#4d9b70]", failed: "bg-[#fff0f0] text-[#bb5960]", regenerating: "bg-[#f1efff] text-[#6b5bd5]",
};

export function Dashboard() {
  const router = useRouter();
  const [kits, setKits] = useState<KitRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [jd, setJd] = useState("");
  const [companyUrl, setCompanyUrl] = useState("");
  const [days, setDays] = useState(5);
  const [error, setError] = useState("");
  const [batchMessage, setBatchMessage] = useState("");
  const [batchError, setBatchError] = useState("");
  const [showEvaluator, setShowEvaluator] = useState(false);
  const [runningSample, setRunningSample] = useState(false);

  const loadKits = useCallback(async (quiet = false) => {
    try { const result = await api.listKits(); setKits(result.kits); }
    catch (caught) { if (caught instanceof ApiError && caught.status === 401) router.replace("/login"); }
    finally { if (!quiet) setLoading(false); }
  }, [router]);

  useEffect(() => { const timer = setTimeout(() => { void loadKits(); }, 0); return () => clearTimeout(timer); }, [loadKits]);
  useEffect(() => {
    const timer = setInterval(() => { if (kits.some((kit) => kit.status === "queued" || kit.status === "running" || kit.status === "regenerating")) void loadKits(true); }, 3500);
    return () => clearInterval(timer);
  }, [kits, loadKits]);

  async function submitSingle(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(""); setSubmitting(true);
    try {
      const result = await api.createKit({ jd: jd.trim(), company_url: companyUrl.trim(), days });
      router.push(`/kits/${result.kit.id}`);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Could not create a kit."); }
    finally { setSubmitting(false); }
  }

  async function handleBatch(file?: File | null) {
    if (!file) return;
    setBatchError(""); setBatchMessage("");
    try {
      const cases: unknown = JSON.parse(await file.text());
      if (!Array.isArray(cases) || cases.length === 0) throw new Error("Choose a JSON file containing an array of cases.");
      if (cases.length > 20) throw new Error("Upload up to 20 roles at a time.");
      const result = await api.createBatch(cases);
      const queued = result.results.filter((item) => item.kit_id).length;
      const failed = result.results.length - queued;
      setBatchMessage(`${queued} role${queued === 1 ? "" : "s"} added to your workspace${failed ? ` · ${failed} row${failed === 1 ? "" : "s"} need attention` : ""}.`);
      await loadKits(true);
    } catch (caught) { setBatchError(caught instanceof Error ? caught.message : "Could not read that file."); }
  }

  async function runSampleEvaluation() {
    setBatchError(""); setBatchMessage(""); setRunningSample(true);
    try {
      const sampleCases = [
        {
          id: "case-01-fullstack",
          jd: "Senior Full-Stack Engineer\n\nAbout the role:\nWe are looking for a Senior Full-Stack Engineer to lead the architecture of our real-time collaboration platform.\n\nResponsibilities:\n- Design and implement scalable distributed web applications\n- Mentor junior and mid-level engineers through code reviews\n- Collaborate closely with product management and designers\n\nRequirements:\n- Required: 5+ years with TypeScript and React\n- Required: 4+ years building backend microservices with Node.js\n- Required: Strong experience with relational databases and SQL optimization\n- Nice-to-have: Hands-on experience with Docker, Kubernetes, and AWS",
          company_url: "https://posthog.com",
          days: 5
        },
        {
          id: "case-02-stub-jd",
          jd: "Software Developer\n\nJoin our team building next-generation developer tooling. Work hard, ship fast.",
          company_url: "https://example.com",
          days: 2
        }
      ];
      const result = await api.createBatch(sampleCases);
      const queued = result.results.filter((item) => item.kit_id).length;
      setBatchMessage(`${queued} benchmark role${queued === 1 ? "" : "s"} queued! Watch generation in your kits below.`);
      await loadKits(true);
    } catch (caught) {
      setBatchError(caught instanceof Error ? caught.message : "Could not run sample evaluation.");
    } finally {
      setRunningSample(false);
    }
  }

  async function removeKit(id: string) {
    if (!window.confirm("Delete this kit? This also removes its saved practice progress.")) return;
    try { await api.deleteKit(id); setKits((current) => current.filter((kit) => kit.id !== id)); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "Could not delete the kit."); }
  }

  const activeCount = kits.filter((kit) => kit.status === "queued" || kit.status === "running" || kit.status === "regenerating").length;

  return <AppShell>
    <div className="mx-auto max-w-[1180px]">
      <section className="mb-8 flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
        <div><p className="eyebrow mb-2">Your preparation workspace</p><h1 className="text-[32px] font-semibold tracking-[-.045em] text-[#202137] sm:text-[38px]">Good preparation starts here.</h1><p className="mt-2 text-sm text-[#85879a]">Paste the role. We’ll help you turn it into a plan.</p></div>
        <div className="flex items-center gap-2 rounded-full border border-[#e8e7f0] bg-white px-3 py-2 text-[11px] font-semibold text-[#76788b]"><span className={`size-2 rounded-full ${activeCount ? "animate-pulse bg-[#eba95d]" : "bg-[#79c79d]"}`}/>{activeCount ? `${activeCount} kit${activeCount === 1 ? "" : "s"} in progress` : "Your workspace is up to date"}</div>
      </section>

      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1.12fr)_minmax(340px,.88fr)]">
        <section className="surface overflow-hidden">
          <div className="flex items-start justify-between border-b border-[#efeff4] px-5 py-5 sm:px-7"><div><div className="mb-2 flex items-center gap-2 text-[#6c5be2]"><span className="grid size-8 place-items-center rounded-xl bg-[#f1efff]"><Sparkles size={16}/></span><span className="eyebrow !text-[#7667d9]">Create a new kit</span></div><h2 className="text-lg font-semibold tracking-[-.025em]">Let’s get you interview-ready.</h2><p className="mt-1 text-xs leading-5 text-[#8a8c9e]">We’ll research the company and shape preparation around this role.</p></div><span className="hidden rounded-full bg-[#f4f3ff] px-2.5 py-1 text-[9px] font-bold uppercase tracking-[.1em] text-[#8173dc] sm:inline-flex">~2–3 min</span></div>
          <form className="space-y-5 px-5 py-6 sm:px-7" onSubmit={submitSingle}>
            <label className="block"><span className="mb-2 flex items-center justify-between text-xs font-semibold text-[#55566c]"><span>Job description</span><span className="font-normal text-[#aaabb8]">Paste the full description</span></span><textarea className="field min-h-[190px] resize-y text-[13px] leading-6" placeholder={`Senior Product Designer\n\nWe’re looking for a thoughtful designer to…`} value={jd} onChange={(event)=>setJd(event.target.value)} required maxLength={30000} /><span className="mt-1.5 flex justify-end text-[10px] text-[#a1a2b0]">{jd.length.toLocaleString()} / 30,000</span></label>
            <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_145px]">
              <label className="block"><span className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-[#55566c]"><Building2 size={14} className="text-[#9a91de]"/>Company website</span><input type="url" className="field h-[46px] text-[13px]" placeholder="https://company.com" value={companyUrl} onChange={(event)=>setCompanyUrl(event.target.value)} required /></label>
              <label className="block"><span className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-[#55566c]"><CalendarDays size={14} className="text-[#9a91de]"/>Days to prepare</span><input type="number" min={1} max={60} className="field h-[46px] text-[13px]" value={days} onChange={(event)=>setDays(Number(event.target.value))} required /></label>
            </div>
            {error && <div role="alert" className="flex items-start justify-between gap-2 rounded-xl border border-[#f1d6d6] bg-[#fff7f7] p-3 text-xs leading-5 text-[#ae4d55]">{error}<button type="button" aria-label="Dismiss" onClick={()=>setError("")}><X size={14}/></button></div>}
            <div className="flex flex-col justify-between gap-3 border-t border-[#f0f0f5] pt-5 sm:flex-row sm:items-center"><p className="max-w-[330px] text-[10px] leading-4 text-[#9a9bab]">Your job description is used to build this kit and is not shown to other users.</p><button disabled={submitting || !jd.trim() || !companyUrl.trim()} className="btn-primary h-[46px] min-w-[180px] disabled:cursor-wait disabled:opacity-55">{submitting ? <><LoaderCircle className="animate-spin" size={16}/>Creating your kit…</> : <>Start preparing <ArrowRight size={16}/></>}</button></div>
          </form>
        </section>

        <div className="space-y-4">
          <section className="surface p-5 sm:p-6">
            <div className="mb-4 flex items-center gap-2 text-[#6858dc]">
              <span className="grid size-7 place-items-center rounded-lg bg-[#f1efff]"><Sparkles size={14}/></span>
              <p className="eyebrow !text-[#6858dc]">What your kit builds</p>
            </div>
            <div className="space-y-3">
              <div className="rounded-xl border border-[#f0f0f6] bg-[#fafafd] p-3">
                <p className="text-xs font-semibold text-[#323348]">🎯 Must-have requirements</p>
                <p className="mt-1 text-[11px] leading-5 text-[#86889b]">Extracted directly from the posting into Technical, Behavioural, and Domain categories.</p>
              </div>
              <div className="rounded-xl border border-[#f0f0f6] bg-[#fafafd] p-3">
                <p className="text-xs font-semibold text-[#323348]">🏢 Source-grounded brief</p>
                <p className="mt-1 text-[11px] leading-5 text-[#86889b]">Crawls public pages for actual products, mission, and interview context without hallucinating.</p>
              </div>
              <div className="rounded-xl border border-[#f0f0f6] bg-[#fafafd] p-3">
                <p className="text-xs font-semibold text-[#323348]">📅 Spaced schedule & cards</p>
                <p className="mt-1 text-[11px] leading-5 text-[#86889b]">Prioritizes core gaps first with interactive flashcards and confidence-based review.</p>
              </div>
            </div>
          </section>

          <section className="rounded-[18px] border border-[#e4e2f2] bg-white p-4 sm:p-5 transition">
            <button
              type="button"
              onClick={() => setShowEvaluator(!showEvaluator)}
              className="flex w-full items-center justify-between text-left"
              aria-expanded={showEvaluator}
            >
              <div className="flex items-center gap-3">
                <span className="grid size-9 place-items-center rounded-xl bg-[#f2f0ff] text-[#6d5ce0]">
                  <Terminal size={16} />
                </span>
                <div>
                  <p className="text-xs font-bold text-[#353450]">Evaluator & Benchmark Tools</p>
                  <p className="text-[10px] text-[#8e90a2]">For assessment grading & batch pipeline testing</p>
                </div>
              </div>
              <span className={`grid size-7 place-items-center rounded-lg bg-[#f8f8fb] text-[#838598] transition ${showEvaluator ? "rotate-180" : ""}`}>
                <ChevronDown size={14} />
              </span>
            </button>

            {showEvaluator && (
              <div className="mt-4 border-t border-[#f0f0f6] pt-4">
                <p className="mb-3 text-[11px] leading-5 text-[#7a7b8e]">
                  Test multi-role batch generation and schema compliance with one click:
                </p>
                <button
                  type="button"
                  disabled={runningSample}
                  onClick={runSampleEvaluation}
                  className="btn-primary w-full !py-2.5 text-xs font-semibold shadow-sm"
                >
                  {runningSample ? (
                    <><LoaderCircle className="animate-spin" size={14} /> Running evaluation benchmark…</>
                  ) : (
                    <><Play size={13} fill="currentColor" /> Run Sample Evaluation (2 roles)</>
                  )}
                </button>

                <div className="mt-3.5 flex items-center gap-2 text-[10px] text-[#9a9ba9]">
                  <span className="h-px flex-1 bg-[#ececf2]" />
                  <span>or upload custom test cases</span>
                  <span className="h-px flex-1 bg-[#ececf2]" />
                </div>

                <label className="mt-2.5 flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-[#dcdce8] bg-[#fbfbfd] p-2.5 text-center transition hover:border-[#aba1f3] hover:bg-[#faf9ff]">
                  <FileJson2 className="text-[#8376df]" size={14} />
                  <span className="text-[11px] font-semibold text-[#5c5d73]">Upload custom .json file</span>
                  <input
                    type="file"
                    accept=".json,application/json"
                    className="sr-only"
                    onChange={(event) => {
                      void handleBatch(event.target.files?.[0]);
                      event.target.value = "";
                    }}
                  />
                </label>

                {batchError && <p role="alert" className="mt-2.5 rounded-xl bg-[#fff5f5] p-2.5 text-[10px] leading-4 text-[#ac4c54]">{batchError}</p>}
                {batchMessage && <p role="status" className="mt-2.5 flex items-center gap-1.5 rounded-xl bg-[#eff9f3] p-2.5 text-[10px] leading-4 text-[#458967]"><Check size={13}/>{batchMessage}</p>}

                <p className="mt-3 text-[9px] leading-4 text-[#a0a1b0]">
                  Runs batch extraction, concurrent web retrieval, and coverage checks without manual input.
                </p>
              </div>
            )}
          </section>
        </div>
      </div>

      <section id="kits" className="mt-10 scroll-mt-8">
        <div className="mb-4 flex items-end justify-between"><div><p className="eyebrow mb-1.5">Your saved work</p><h2 className="text-xl font-semibold tracking-[-.03em]">Your kits <span className="ml-1 text-sm font-medium text-[#a0a1af]">{kits.length}</span></h2></div>{kits.length > 0 && <span className="hidden text-[11px] text-[#9b9cab] sm:block">Only you can see these kits</span>}</div>
        {loading ? <div className="surface flex items-center justify-center gap-2 p-10 text-xs text-[#898b9e]"><LoaderCircle className="animate-spin" size={16}/>Loading your kits…</div>
        : kits.length === 0 ? <div className="surface flex flex-col items-center px-6 py-12 text-center"><span className="mb-3 grid size-12 place-items-center rounded-2xl bg-[#f1efff] text-[#7464df]"><BriefcaseBusiness size={20}/></span><h3 className="text-sm font-semibold">Your first preparation kit starts above.</h3><p className="mt-1.5 max-w-[350px] text-xs leading-5 text-[#9294a4]">Add a job description and company website to get a brief, targeted questions, flashcards, and a day-by-day plan.</p><a href="#top" className="mt-4 text-xs font-bold text-[#6454d5]">Create a kit <ArrowRight className="ml-1 inline" size={13}/></a></div>
        : <div className="grid gap-3 md:grid-cols-2">{kits.map((kit)=>{
          const title=kit.kit?.role.title||kit.input.jd.split(/\r?\n/)[0]||"New role";
          const company=(kit.kit?.source.company||new URL(kit.input.company_url).hostname.replace(/^www\./,"")).replace(/[.;,\s]+$/, "");
          return <article key={kit.id} className="surface group relative p-4 transition hover:-translate-y-0.5 hover:border-[#d9d5f7] hover:shadow-[0_14px_38px_rgba(45,41,100,.08)] sm:p-5">
            <Link href={`/kits/${kit.id}`} className="absolute inset-0 rounded-[20px] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7969ed]" aria-label={`Open ${title} preparation kit`}/>
            <div className="relative pointer-events-none flex items-start justify-between gap-3"><div className="flex min-w-0 items-center gap-3"><span className="grid size-10 shrink-0 place-items-center rounded-[14px] bg-[#f2f0ff] text-[#6e5ce0]"><BriefcaseBusiness size={18}/></span><div className="min-w-0"><h3 className="truncate text-sm font-semibold text-[#25263b]">{title}</h3><p className="mt-1 truncate text-[11px] text-[#9698a8]">{company} · {kit.input.days} days to prepare</p></div></div><span className={`shrink-0 rounded-full px-2.5 py-1 text-[9px] font-bold ${statusColor[kit.status]}`}>{statusLabel[kit.status]}</span></div>
            <div className="relative mt-4 flex items-center justify-between border-t border-[#f0f0f5] pt-3"><div className="flex items-center gap-3 text-[10px] text-[#9698a8]">{kit.status === "ready" ? <><span>{kit.kit?.questions.length ?? 0} questions</span><span>·</span><span>{kit.kit?.flashcards.length ?? 0} flashcards</span></> : <span className="flex items-center gap-1"><Clock3 size={12}/>{kit.progress.message}</span>}</div><div className="pointer-events-auto flex items-center gap-2"><button aria-label={`Delete ${title}`} title="Delete kit" onClick={()=>void removeKit(kit.id)} className="relative z-10 rounded-lg p-1.5 text-[#b2b3bf] opacity-0 transition hover:bg-[#fff3f3] hover:text-[#bd5962] group-hover:opacity-100 focus:opacity-100"><X size={14}/></button><span className="grid size-7 place-items-center rounded-lg bg-[#f7f7fb] text-[#9293a5] transition group-hover:bg-[#f1efff] group-hover:text-[#6c5be0]"><ChevronRight size={15}/></span></div></div>
            {kit.status === "running" && <div className="mt-3 h-1 overflow-hidden rounded-full bg-[#f0eff8]"><div className="h-full rounded-full bg-[#7969ed] transition-all" style={{width:`${kit.progress.percent}%`}}/></div>}
          </article>;
        })}</div>}
      </section>
      <p className="mt-8 text-center text-[10px] text-[#a2a3b0]">Research is based on the sources available at the time you create a kit.</p>
    </div>
  </AppShell>;
}
