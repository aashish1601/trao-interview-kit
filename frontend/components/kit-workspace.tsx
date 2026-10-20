"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, BookOpenCheck, Building2, CalendarDays, Check, ChevronDown, ClipboardList, ExternalLink, FileText, Layers3, LoaderCircle, LockKeyhole, MessageCircleQuestion, Pin, PinOff, Plus, RefreshCw, Sparkles, Trash2, Trophy, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { api, ApiError } from "@/lib/api";
import type { EditState, Flashcard, Kit, KitRecord, Question, QuestionCategory, Requirement } from "@/lib/types";

type TabId = "brief" | "role" | "questions" | "flashcards" | "schedule" | "practice";
const tabs: Array<{ id: TabId; label: string; icon: typeof Building2 }> = [
  { id: "brief", label: "Company brief", icon: Building2 }, { id: "role", label: "Role", icon: FileText },
  { id: "questions", label: "Questions", icon: MessageCircleQuestion }, { id: "flashcards", label: "Flashcards", icon: Layers3 },
  { id: "schedule", label: "Schedule", icon: CalendarDays }, { id: "practice", label: "Practice", icon: BookOpenCheck },
];
const categoryLabels: Record<QuestionCategory, string> = { technical: "Technical", behavioural: "Behavioural", "system-design": "System design", "company-fit": "Company fit" };
const categoryOrder: QuestionCategory[] = ["technical", "behavioural", "system-design", "company-fit"];

function clone<T>(value: T): T { return structuredClone(value); }
function computeUncovered(kit: Kit): string[] {
  const covered = new Set(kit.questions.flatMap((question) => question.requirement_ids));
  return kit.role.requirements.filter((requirement) => !covered.has(requirement.id)).map((item) => item.id);
}
function titleFor(record: KitRecord, kit: Kit | null): string { return kit?.role.title || record.input.jd.split(/\r?\n/)[0]?.trim() || "Interview preparation"; }

export function KitWorkspace() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const kitId = params.id;
  const [record, setRecord] = useState<KitRecord | null>(null);
  const [kit, setKit] = useState<Kit | null>(null);
  const [editState, setEditState] = useState<EditState | null>(null);
  const [activeTab, setActiveTab] = useState<TabId>("brief");
  const [loading, setLoading] = useState(true);
  const [pageError, setPageError] = useState("");
  const [notice, setNotice] = useState("");
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [filter, setFilter] = useState<QuestionCategory | "all">("all");
  const [newCategory, setNewCategory] = useState<QuestionCategory>("technical");
  const [newQuestionRequirement, setNewQuestionRequirement] = useState("");
  const [newCardRequirement, setNewCardRequirement] = useState("");
  const [showAnswer, setShowAnswer] = useState(false);
  const [currentCardId, setCurrentCardId] = useState("");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveChain = useRef<Promise<unknown>>(Promise.resolve());
  const latest = useRef<{ kit: Kit | null; editState: EditState | null; revision: number }>({ kit: null, editState: null, revision: 0 });
  const recordRef = useRef<KitRecord | null>(null);

  const hydrate = useCallback((nextRecord: KitRecord) => {
    recordRef.current = nextRecord;
    setRecord(nextRecord);
    if (nextRecord.kit) {
      const nextKit = clone(nextRecord.kit);
      const nextState = clone(nextRecord.editState);
      latest.current = { kit: nextKit, editState: nextState, revision: latest.current.revision + 1 };
      setKit(nextKit); setEditState(nextState);
    }
  }, []);

  const loadKit = useCallback(async (quiet = false) => {
    try {
      const result = await api.getKit(kitId);
      hydrate(result.kit);
      setPageError("");
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) router.replace("/login");
      else if (!quiet) setPageError(error instanceof Error ? error.message : "Could not open this kit.");
    } finally { if (!quiet) setLoading(false); }
  }, [hydrate, kitId, router]);

  useEffect(() => { const loadTimer = setTimeout(() => { void loadKit(); }, 0); return () => { clearTimeout(loadTimer); if (timer.current) clearTimeout(timer.current); }; }, [loadKit]);
  useEffect(() => {
    if (!record || !["queued", "running", "regenerating"].includes(record.status)) return;
    const interval = setInterval(async () => {
      try {
        const response = await api.getKit(kitId);
        const wasBusy = ["queued", "running", "regenerating"].includes(recordRef.current?.status ?? "");
        recordRef.current = response.kit; setRecord(response.kit);
        if (response.kit.kit && (wasBusy && response.kit.status === "ready" || !latest.current.kit)) hydrate(response.kit);
      } catch { /* Keep the last progress snapshot; a later poll can recover. */ }
    }, 1800);
    return () => clearInterval(interval);
  }, [kitId, record, hydrate]);

  const enqueueSave = useCallback((snapshot: { kit: Kit; editState: EditState; revision: number }) => {
    saveChain.current = saveChain.current.then(async () => {
      const result = await api.saveKit(kitId, snapshot.kit, snapshot.editState);
      if (latest.current.revision === snapshot.revision) setSaveState("saved");
      recordRef.current = result.kit;
      return result;
    }).catch((error) => {
      setSaveState("error");
      setNotice(error instanceof Error ? error.message : "Your changes could not be saved. Try again.");
      return undefined;
    });
    return saveChain.current;
  }, [kitId]);

  const commit = useCallback((nextKit: Kit, nextState: EditState) => {
    nextKit.coverage.uncovered_requirement_ids = computeUncovered(nextKit);
    const revision = latest.current.revision + 1;
    latest.current = { kit: nextKit, editState: nextState, revision };
    setKit(nextKit); setEditState(nextState); setSaveState("saving"); setNotice("");
    if (timer.current) clearTimeout(timer.current);
    const snapshot = { kit: clone(nextKit), editState: clone(nextState), revision };
    timer.current = setTimeout(() => { void enqueueSave(snapshot); }, 700);
  }, [enqueueSave]);

  const flushSave = useCallback(async () => {
    const hadPendingTimer = Boolean(timer.current);
    if (timer.current) { clearTimeout(timer.current); timer.current = null; }
    const current = latest.current;
    if (!current.kit || !current.editState || (!hadPendingTimer && saveState !== "saving")) return;
    await enqueueSave({ kit: clone(current.kit), editState: clone(current.editState), revision: current.revision });
  }, [enqueueSave, saveState]);

  function editQuestion(id: string, patch: Partial<Question>) {
    if (!kit || !editState || record?.status === "regenerating") return;
    const nextKit = clone(kit); const question = nextKit.questions.find((item) => item.id === id); if (!question) return;
    Object.assign(question, patch);
    const nextState = clone(editState); nextState.items[id] = { ...(nextState.items[id] ?? { origin: "user", edited: false, pinned: false }), edited: true };
    commit(nextKit, nextState);
  }

  function editCard(id: string, patch: Partial<Flashcard>) {
    if (!kit || !editState || record?.status === "regenerating") return;
    const nextKit = clone(kit); const card = nextKit.flashcards.find((item) => item.id === id); if (!card) return;
    Object.assign(card, patch);
    const nextState = clone(editState); nextState.items[id] = { ...(nextState.items[id] ?? { origin: "user", edited: false, pinned: false }), edited: true };
    commit(nextKit, nextState);
  }

  function editBrief(field: "summary" | "what_they_do", value: string) {
    if (!kit || !editState || record?.status === "regenerating") return;
    const nextKit = clone(kit); nextKit.company_brief[field] = value;
    const nextState = clone(editState); nextState.sections.company_brief = { edited: true, pinned: nextState.sections.company_brief?.pinned ?? false };
    commit(nextKit, nextState);
  }

  function editRole(mutator: (nextKit: Kit) => void) {
    if (!kit || !editState || record?.status === "regenerating") return;
    const nextKit = clone(kit); mutator(nextKit);
    const nextState = clone(editState); nextState.sections.role = { edited: true, pinned: nextState.sections.role?.pinned ?? false };
    commit(nextKit, nextState);
  }

  function editSchedule(dayNumber: number, field: "focus" | "minutes", value: string) {
    if (!kit || !editState || record?.status === "regenerating") return;
    const nextKit = clone(kit); const day = nextKit.schedule.days.find((item) => item.day === dayNumber); if (!day) return;
    if (field === "focus") day.focus = value;
    else day.minutes = Math.max(0, Math.min(1440, Math.round(Number(value) || 0)));
    const nextState = clone(editState); nextState.sections.schedule = { edited: true, pinned: nextState.sections.schedule?.pinned ?? false };
    commit(nextKit, nextState);
  }

  function toggleSectionPin(section: "company_brief" | "schedule") {
    if (!kit || !editState || record?.status === "regenerating") return;
    const nextState = clone(editState); const current = nextState.sections[section] ?? { edited: false, pinned: false };
    nextState.sections[section] = { ...current, pinned: !current.pinned };
    commit(clone(kit), nextState);
  }

  async function regenerate(target: "company_brief" | "schedule" | "flashcards" | QuestionCategory) {
    if (!record || !kit || record.status === "regenerating") return;
    const sectionKey = target === "company_brief" || target === "schedule" || target === "flashcards" ? target : "";
    const metadata = sectionKey ? editState?.sections[sectionKey] : undefined;
    const force = Boolean(sectionKey && (metadata?.edited || metadata?.pinned));
    if (force && !window.confirm("This section has your edits. Replace those edits with a fresh version?")) return;
    await flushSave();
    setNotice(""); setSaveState("idle");
    try {
      const result = await api.regenerate(record.id, target, force);
      recordRef.current = result.kit; setRecord(result.kit);
    } catch (error) { setNotice(error instanceof Error ? error.message : "Could not regenerate this section."); }
  }

  async function retry() {
    if (!record) return;
    try { const result = await api.retry(record.id); recordRef.current = result.kit; setRecord(result.kit); setPageError(""); }
    catch (error) { setPageError(error instanceof Error ? error.message : "Could not retry generation."); }
  }

  function addQuestion() {
    if (!kit || !editState || record?.status === "regenerating") return;
    const nextKit = clone(kit); const nextState = clone(editState); const id = `q${nextState.nextIds.question++}`;
    const requirementId = newQuestionRequirement || nextKit.role.requirements[0]?.id;
    const question: Question = { id, requirement_ids: requirementId ? [requirementId] : [], category: newCategory, prompt: "Write your interview question", answer_outline: "Add the main points you want to cover in your answer.", difficulty: 2 };
    nextKit.questions.push(question); nextState.items[id] = { origin: "user", edited: true, pinned: false };
    nextKit.schedule.days[0]?.question_ids.push(id);
    commit(nextKit, nextState); setFilter(newCategory);
  }

  function deleteQuestion(question: Question) {
    if (!kit || !editState || record?.status === "regenerating") return;
    const gaps = question.requirement_ids.filter((id) => kit.role.requirements.some((requirement) => requirement.id === id && requirement.priority === "must") && kit.questions.filter((item) => item.id !== question.id && item.requirement_ids.includes(id)).length === 0);
    if (gaps.length) {
      const labels = gaps.map((id) => kit.role.requirements.find((requirement) => requirement.id === id)?.text).filter(Boolean).join("; ");
      setNotice(`Add another question for this must-have before deleting its only question: ${labels}`); return;
    }
    const nextKit = clone(kit); nextKit.questions = nextKit.questions.filter((item) => item.id !== question.id);
    nextKit.schedule.days.forEach((day) => { day.question_ids = day.question_ids.filter((id) => id !== question.id); });
    const nextState = clone(editState); delete nextState.items[question.id];
    commit(nextKit, nextState);
  }

  function moveQuestion(question: Question, direction: -1 | 1) {
    if (!kit || !editState || record?.status === "regenerating") return;
    const visible = kit.questions.filter((item) => filter === "all" || item.category === filter);
    const visibleIndex = visible.findIndex((item) => item.id === question.id); const other = visible[visibleIndex + direction]; if (!other) return;
    const nextKit = clone(kit); const index = nextKit.questions.findIndex((item) => item.id === question.id); const otherIndex = nextKit.questions.findIndex((item) => item.id === other.id);
    [nextKit.questions[index], nextKit.questions[otherIndex]] = [nextKit.questions[otherIndex]!, nextKit.questions[index]!];
    commit(nextKit, clone(editState));
  }

  function addCard() {
    if (!kit || !editState || record?.status === "regenerating") return;
    const nextKit = clone(kit); const nextState = clone(editState); const id = `f${nextState.nextIds.flashcard++}`;
    const requirementId = newCardRequirement || nextKit.role.requirements[0]?.id;
    nextKit.flashcards.push({ id, front: "Add a recall prompt", back: "Write the key points to remember", requirement_ids: requirementId ? [requirementId] : [] });
    nextState.items[id] = { origin: "user", edited: true, pinned: false };
    commit(nextKit, nextState);
  }

  function deleteCard(card: Flashcard) {
    if (!kit || !editState || record?.status === "regenerating") return;
    const nextKit = clone(kit); nextKit.flashcards = nextKit.flashcards.filter((item) => item.id !== card.id);
    const nextState = clone(editState); delete nextState.items[card.id]; delete nextState.practice[card.id];
    commit(nextKit, nextState);
  }

  function togglePin(id: string) {
    if (!editState || record?.status === "regenerating") return;
    const nextState = clone(editState); const current = nextState.items[id] ?? { origin: "user" as const, edited: false, pinned: false };
    nextState.items[id] = { ...current, pinned: !current.pinned };
    if (latest.current.kit) commit(clone(latest.current.kit), nextState);
  }

  async function recordConfidence(card: Flashcard, confidence: number, ordered: Flashcard[]) {
    if (!kit || !editState) return;
    const index = ordered.findIndex((item) => item.id === card.id);
    const nextCard = ordered[index + 1] ?? ordered.find((item) => item.id !== card.id && !editState.practice[item.id]) ?? ordered[0];
    setShowAnswer(false); setCurrentCardId(nextCard?.id ?? "");
    const reviewedAt = new Date().toISOString();
    const nextState = clone(editState); nextState.practice[card.id] = { confidence, reviewed_at: reviewedAt };
    latest.current = { ...latest.current, editState: nextState, revision: latest.current.revision + 1 };
    setEditState(nextState);
    try { await api.recordPractice(kitId, card.id, confidence); setSaveState("saved"); }
    catch (error) { setNotice(error instanceof Error ? error.message : "Practice progress could not be saved."); setSaveState("error"); }
  }

  const orderedCards = useMemo(() => {
    if (!kit || !editState) return [] as Flashcard[];
    return [...kit.flashcards].sort((a, b) => {
      const aa = editState.practice[a.id]; const bb = editState.practice[b.id];
      if (!aa && bb) return -1; if (aa && !bb) return 1;
      if (aa && bb && aa.confidence !== bb.confidence) return aa.confidence - bb.confidence;
      if (aa && bb) return aa.reviewed_at.localeCompare(bb.reviewed_at);
      return a.id.localeCompare(b.id, undefined, { numeric: true });
    });
  }, [kit, editState]);
  const activeCard = orderedCards.find((card) => card.id === currentCardId) ?? orderedCards[0];

  if (loading) return <AppShell><div className="surface flex items-center justify-center gap-2 p-12 text-sm text-[#898b9d]"><LoaderCircle className="animate-spin" size={17}/>Opening your kit…</div></AppShell>;
  if (!record || pageError && !kit) return <AppShell><div className="surface mx-auto max-w-xl p-8 text-center"><p className="eyebrow mb-2">Couldn’t open this kit</p><h1 className="text-lg font-semibold">{pageError || "Kit not found"}</h1><Link className="btn-secondary mt-5" href="/dashboard"><ArrowLeft size={14}/>Back to your kits</Link></div></AppShell>;

  const busy = ["queued", "running", "regenerating"].includes(record.status);
  const completed = kit !== null;
  const mustCount = kit?.role.requirements.filter((item) => item.priority === "must").length ?? 0;
  const mustCovered = kit?.role.requirements.filter((item) => item.priority === "must" && !kit.coverage.uncovered_requirement_ids.includes(item.id)).length ?? 0;

  return <AppShell>
    <div className="mx-auto max-w-[1240px]">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3"><Link href="/dashboard" className="inline-flex items-center gap-2 text-xs font-semibold text-[#838599] hover:text-[#5f50d5]"><ArrowLeft size={14}/>All kits</Link><div className="flex items-center gap-2 text-[10px] font-semibold text-[#8d8fa1]">{(busy || record.status === "failed" || saveState === "saving" || saveState === "error") && <span className={`size-2 rounded-full ${busy || saveState === "saving" ? "animate-pulse bg-[#e7a14e]" : "bg-[#d86c74]"}`}/>}{busy ? record.progress.message : record.status === "failed" ? "Generation needs attention" : saveState === "saving" ? "Saving changes…" : saveState === "error" ? "Save needs attention" : "Saved to your workspace"}{completed && <><span className="mx-1 text-[#d0d0da]">·</span><span className="flex items-center gap-1"><LockKeyhole size={11}/>Private</span></>}</div></div>
      <header className="mb-6 flex flex-col justify-between gap-4 sm:flex-row sm:items-end"><div className="min-w-0"><p className="eyebrow mb-2">{(record.kit?.source.company ?? "Company research").replace(/[.;,\s]+$/, "")} · {record.input.days} days to prepare</p><h1 className="max-w-[820px] truncate text-[28px] font-semibold tracking-[-.045em] text-[#202137] sm:text-[36px]">{titleFor(record, kit)}</h1><p className="mt-2 text-xs text-[#9294a5]">Generated from your job description and the sources we could retrieve.</p></div>{completed && <div className="flex shrink-0 items-center gap-2 rounded-[14px] border border-[#e9e8f2] bg-white px-3 py-2.5"><span className="grid size-8 place-items-center rounded-xl bg-[#f1efff] text-[#6858dc]"><Trophy size={15}/></span><span><span className="block text-xs font-bold text-[#3b3c51]">{mustCovered} / {mustCount}</span><span className="text-[9px] text-[#9799a9]">must-haves covered</span></span></div>}</header>

      {!kit && record.status !== "failed" && <GenerationProgress record={record} />}
      {!kit && record.status === "failed" && <div className="surface mx-auto max-w-[760px] p-7 sm:p-9"><div className="mb-4 grid size-11 place-items-center rounded-2xl bg-[#fff1f1] text-[#c05c64]"><X size={20}/></div><p className="eyebrow mb-2 !text-[#bf626a]">Generation stopped</p><h2 className="text-xl font-semibold">We couldn’t finish this kit.</h2><p className="mt-2 text-sm leading-6 text-[#888a9c]">{record.generationError?.message ?? "The research or generation step failed. Your job description is still saved."}</p><button onClick={()=>void retry()} className="btn-primary mt-5"><RefreshCw size={15}/>Try again</button></div>}

      {kit && editState && <>
        <div className="mb-5 flex flex-col justify-between gap-3 rounded-[16px] border border-[#e9e8f1] bg-white px-4 py-3 sm:flex-row sm:items-center sm:px-5"><div className="flex min-w-0 items-center gap-3"><span className="grid size-8 shrink-0 place-items-center rounded-xl bg-[#edf8f2] text-[#4b9b71]"><Check size={15}/></span><div className="min-w-0"><p className="text-xs font-semibold">Your first draft is ready to shape.</p><p className="mt-0.5 text-[10px] text-[#9294a4]">Edit inline. Your changes save automatically.</p></div></div><div className="flex items-center gap-3 text-[10px] text-[#9395a5]"><span>{kit.questions.length} questions</span><span>·</span><span>{kit.flashcards.length} cards</span><span>·</span><span>{kit.schedule.days.length} days</span></div></div>

        {notice && <div role="status" className="mb-4 flex items-start justify-between gap-3 rounded-xl border border-[#f0dfc4] bg-[#fffaf1] px-4 py-3 text-xs leading-5 text-[#8e6a39]">{notice}<button aria-label="Dismiss" onClick={()=>setNotice("")}><X size={14}/></button></div>}
        <nav aria-label="Kit sections" className="quiet-scroll mb-5 flex gap-1 overflow-x-auto rounded-[15px] border border-[#eaeaf1] bg-white p-1.5">{tabs.map(({id,label,icon:Icon})=><button key={id} onClick={()=>setActiveTab(id)} className={`flex shrink-0 items-center gap-2 rounded-[11px] px-3.5 py-2.5 text-xs font-semibold transition ${activeTab===id?"bg-[#f1efff] text-[#5d4bd4]":"text-[#85879a] hover:bg-[#f8f8fb] hover:text-[#45465c]"}`}><Icon size={15}/>{label}{id==="questions"&&<span className="ml-0.5 text-[10px] opacity-65">{kit.questions.length}</span>}</button>)}</nav>

        {busy && record.status === "regenerating" && <div role="status" className="mb-4 flex items-center gap-2 rounded-xl border border-[#e6e2ff] bg-[#f8f7ff] px-4 py-3 text-xs text-[#6557c8]"><LoaderCircle className="animate-spin" size={14}/>The selected section is refreshing. Your saved edits are protected while it runs.</div>}

        {activeTab === "brief" && <section className="surface p-5 sm:p-7"><SectionHeading eyebrow="Company brief" title={`A clearer picture of ${kit.source.company.replace(/[.;,\s]+$/, "")}.`} description="Only information supported by the sources we could access appears here." action={<div className="flex gap-2"><button disabled={busy} onClick={()=>toggleSectionPin("company_brief")} className={`btn-secondary disabled:opacity-50 ${editState.sections.company_brief?.pinned?"!border-[#d7d2fb] !text-[#6757d7]":""}`}><Pin size={13}/>{editState.sections.company_brief?.pinned?"Pinned":"Pin brief"}</button><button disabled={busy} onClick={()=>void regenerate("company_brief")} className="btn-secondary disabled:opacity-50"><RefreshCw size={13}/>Regenerate brief</button></div>} />
          <div className="mt-6 grid gap-5 lg:grid-cols-[1fr_290px]"><div className="space-y-5"><label className="block"><span className="eyebrow mb-2 block">Overview</span><textarea disabled={busy} placeholder="Overview of company background and hiring process..." value={kit.company_brief.summary} onChange={(event)=>editBrief("summary",event.target.value)} className="field min-h-[125px] resize-y text-[13px] leading-6 disabled:bg-[#fafafd]" /></label><label className="block"><span className="eyebrow mb-2 block">What they do</span><textarea disabled={busy} placeholder="Core business, products, services, and mission..." value={kit.company_brief.what_they_do} onChange={(event)=>editBrief("what_they_do",event.target.value)} className="field min-h-[100px] resize-y text-[13px] leading-6 disabled:bg-[#fafafd]" /></label></div>
          <aside className="rounded-[16px] bg-[#f8f7ff] p-4"><div className="mb-3 flex items-center gap-2 text-[#7163d8]"><Sparkles size={15}/><span className="eyebrow !text-[#766bd0]">Research notes</span></div>{(() => {
            const cleanNotes = (kit.research?.notes || []).filter((note) => {
              if (!note || typeof note !== "string") return false;
              const lower = note.toLowerCase();
              if (lower.includes("timeout") || lower.includes("aborted")) return false;
              if (lower.includes("api_key") || lower.includes("api key")) return false;
              if (lower.includes("fallback")) return false;
              if (lower.includes("json")) return false;
              if (lower.includes("robots")) return false;
              if (lower.includes("fetch") && (lower.includes("fail") || lower.includes("error"))) return false;
              if (lower.includes("http ") || lower.includes("502") || lower.includes("404")) return false;
              if (lower.includes("unreachable")) return false;
              return true;
            });
            return cleanNotes.length ? <ul className="space-y-2">{cleanNotes.map((note,index)=><li key={index} className="text-[11px] leading-5 text-[#77788e]">{note}</li>)}</ul> : <p className="text-[11px] leading-5 text-[#85869b]">The available sources were reviewed for company and hiring context.</p>;
          })()}<div className="mt-4 border-t border-[#eae8fb] pt-3"><p className="mb-2 text-[9px] font-bold uppercase tracking-[.12em] text-[#9894b9]">Sources used · {kit.company_brief.sources.length}</p>{kit.company_brief.sources.length ? <ul className="space-y-2">{kit.company_brief.sources.slice(0,8).map((source)=><li key={source}><a target="_blank" rel="noreferrer" href={source} className="flex items-start gap-1.5 break-all text-[10px] leading-4 text-[#7468c8] hover:underline"><ExternalLink className="mt-0.5 shrink-0" size={11}/>{new URL(source).hostname}{new URL(source).pathname}</a></li>)}</ul> : <p className="text-[10px] text-[#9899a8]">No company pages were available.</p>}</div></aside>
          </div>
        </section>}

        {activeTab === "role" && <section className="surface p-5 sm:p-7"><SectionHeading eyebrow="Role breakdown" title="What this role is asking for." description="The requirements below were extracted from your job description." />
          <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(300px,.75fr)]"><div><div className="grid gap-4 sm:grid-cols-2"><label className="block"><span className="eyebrow mb-2 block">Role title</span><input disabled={busy} className="field text-sm disabled:bg-[#fafafd]" value={kit.role.title} onChange={(event)=>editRole((next)=>{next.role.title=event.target.value;})}/></label><label className="block"><span className="eyebrow mb-2 block">Seniority</span><input disabled={busy} className="field text-sm disabled:bg-[#fafafd]" value={kit.role.seniority} onChange={(event)=>editRole((next)=>{next.role.seniority=event.target.value;})}/></label></div>
            <div className="mt-6"><div className="mb-3 flex items-center justify-between"><h3 className="text-sm font-semibold">Responsibilities</h3><span className="text-[10px] text-[#999baa]">{kit.role.responsibilities.length} identified</span></div>{kit.role.responsibilities.length ? <div className="space-y-2">{kit.role.responsibilities.map((item,index)=><label key={index} className="flex items-start gap-3 rounded-xl border border-[#efeff4] p-3"><span className="mt-2 size-1.5 shrink-0 rounded-full bg-[#8c7df0]"/><textarea disabled={busy} rows={2} value={item} onChange={(event)=>editRole((next)=>{next.role.responsibilities[index]=event.target.value;})} className="w-full resize-y bg-transparent text-xs leading-5 text-[#636579] outline-none disabled:opacity-65" aria-label={`Responsibility ${index+1}`}/></label>)}</div> : <p className="rounded-xl bg-[#fafafd] p-4 text-xs text-[#9294a4]">The posting did not state clear responsibilities.</p>}</div>
          </div><div><div className="mb-3 flex items-center justify-between"><h3 className="text-sm font-semibold">Requirements</h3><span className="rounded-full bg-[#f3f1ff] px-2.5 py-1 text-[10px] font-bold text-[#6e5ed6]">{kit.role.requirements.length} found</span></div>{kit.role.requirements.length ? <div className="space-y-2">{kit.role.requirements.map((requirement,index)=><RequirementRow key={requirement.id} requirement={requirement} disabled={busy} onChange={(next)=>editRole((draft)=>{draft.role.requirements[index]=next;draft.coverage.uncovered_requirement_ids=computeUncovered(draft);})}/>)}</div> : <div className="rounded-[15px] border border-dashed border-[#dedee9] px-4 py-6 text-center"><p className="text-xs font-semibold text-[#55566b]">No clear requirements were found.</p><p className="mt-1 text-[10px] leading-5 text-[#9899a8]">The description may be too short or general. The kit avoids making requirements up.</p></div>}</div></div>
          <div className="mt-5 flex items-start gap-2 rounded-xl bg-[#faf9ff] px-3.5 py-3 text-[10px] leading-5 text-[#85859b]"><ClipboardList className="mt-0.5 shrink-0 text-[#8577e3]" size={14}/>Must-have marks follow the wording of the posting. Add a replacement practice question before removing the only question linked to a must-have.</div>
        </section>}

        {activeTab === "questions" && <section className="surface p-5 sm:p-7"><SectionHeading eyebrow="Question bank" title="Practise the questions that matter." description={`${kit.questions.length} prompts linked to ${kit.role.requirements.length} extracted requirements.`} action={<select aria-label="Regenerate question category" disabled={busy} value={newCategory} onChange={(event)=>setNewCategory(event.target.value as QuestionCategory)} className="field !w-auto !py-2 text-[11px]">{categoryOrder.map((category)=><option key={category} value={category}>{categoryLabels[category]}</option>)}</select>} />
          <div className="mt-5 flex flex-col justify-between gap-3 border-y border-[#f0f0f5] py-3 sm:flex-row sm:items-center"><div className="quiet-scroll flex gap-1 overflow-x-auto">{(["all",...categoryOrder] as const).map((value)=><button key={value} onClick={()=>setFilter(value)} className={`shrink-0 rounded-full px-3 py-1.5 text-[10px] font-semibold ${filter===value?"bg-[#f1efff] text-[#6554d5]":"text-[#9294a5] hover:bg-[#f7f7fa]"}`}>{value==="all"?`All · ${kit.questions.length}`:`${categoryLabels[value]} · ${kit.questions.filter((question)=>question.category===value).length}`}</button>)}</div><div className="flex items-center gap-2"><button disabled={busy} onClick={()=>void regenerate(newCategory)} className="btn-secondary !px-3 !py-2 text-[10px] disabled:opacity-50"><RefreshCw size={12}/>Regenerate {categoryLabels[newCategory]}</button></div></div>
          <div className="mt-4 space-y-3">{kit.questions.filter((question)=>filter==="all"||question.category===filter).map((question,index,shown)=><QuestionCard key={question.id} question={question} index={index} total={shown.length} requirements={kit.role.requirements} meta={editState.items[question.id]} disabled={busy} onChange={(patch)=>editQuestion(question.id,patch)} onDelete={()=>deleteQuestion(question)} onMove={(direction)=>moveQuestion(question,direction)} onPin={()=>togglePin(question.id)}/>)}</div>
          {kit.questions.filter((question)=>filter==="all"||question.category===filter).length===0 && <div className="rounded-xl bg-[#fafafd] px-4 py-9 text-center text-xs text-[#9294a4]">No questions in this category yet. Add one or regenerate the category.</div>}
          <div className="mt-4 rounded-[15px] border border-dashed border-[#dfdfea] p-4"><p className="mb-3 text-xs font-semibold">Add your own question</p><div className="flex flex-col gap-2 sm:flex-row"><select disabled={busy} value={newQuestionRequirement} onChange={(event)=>setNewQuestionRequirement(event.target.value)} className="field !w-auto text-xs"><option value="">Link to a requirement…</option>{kit.role.requirements.map((item)=><option key={item.id} value={item.id}>{item.id} · {item.text.slice(0,70)}</option>)}</select><div className="flex gap-2"><select disabled={busy} value={newCategory} onChange={(event)=>setNewCategory(event.target.value as QuestionCategory)} className="field !w-auto text-xs">{categoryOrder.map((category)=><option key={category} value={category}>{categoryLabels[category]}</option>)}</select><button disabled={busy} onClick={addQuestion} className="btn-primary !px-3 !py-2 text-[11px] disabled:opacity-50"><Plus size={14}/>Add question</button></div></div></div>
          <CoverageNotice kit={kit}/>
        </section>}

        {activeTab === "flashcards" && <section className="surface p-5 sm:p-7"><SectionHeading eyebrow="Flashcards" title="Keep the important details close." description={`${kit.flashcards.length} cards · Cards are generated from known role requirements.`} action={<button disabled={busy} onClick={()=>void regenerate("flashcards")} className="btn-secondary disabled:opacity-50"><RefreshCw size={13}/>Regenerate flashcards</button>} />
          <div className="mt-6 grid gap-3 md:grid-cols-2">{kit.flashcards.map((card,index)=><FlashcardEditor key={card.id} card={card} index={index} total={kit.flashcards.length} requirements={kit.role.requirements} meta={editState.items[card.id]} disabled={busy} onChange={(patch)=>editCard(card.id,patch)} onDelete={()=>deleteCard(card)} onPin={()=>togglePin(card.id)}/>)}</div>
          {!kit.flashcards.length && <div className="rounded-xl bg-[#fafafd] p-8 text-center text-xs text-[#9193a4]">No flashcards were generated from the available details. You can add your own.</div>}
          <div className="mt-5 flex flex-col gap-2 rounded-[15px] border border-dashed border-[#dfdfea] p-4 sm:flex-row sm:items-center sm:justify-between"><div><p className="text-xs font-semibold">Create a card by hand</p><p className="mt-1 text-[10px] text-[#9798a8]">Link it to a requirement so it appears in your review flow.</p></div><div className="flex gap-2"><select disabled={busy} value={newCardRequirement} onChange={(event)=>setNewCardRequirement(event.target.value)} className="field !w-auto text-xs"><option value="">Choose requirement</option>{kit.role.requirements.map((item)=><option key={item.id} value={item.id}>{item.id} · {item.text.slice(0,55)}</option>)}</select><button disabled={busy} onClick={addCard} className="btn-primary !px-3 !py-2 text-[11px] disabled:opacity-50"><Plus size={14}/>Add card</button></div></div>
        </section>}

        {activeTab === "schedule" && <section className="surface p-5 sm:p-7"><SectionHeading eyebrow="Study schedule" title={`${kit.schedule.days_available} days, with a reason for each one.`} description="Must-have and higher-difficulty topics are placed first. Adjust focus or time to fit your routine." action={<div className="flex gap-2"><button disabled={busy} onClick={()=>toggleSectionPin("schedule")} className={`btn-secondary disabled:opacity-50 ${editState.sections.schedule?.pinned?"!border-[#d7d2fb] !text-[#6757d7]":""}`}><Pin size={13}/>{editState.sections.schedule?.pinned?"Pinned":"Pin schedule"}</button><button disabled={busy} onClick={()=>void regenerate("schedule")} className="btn-secondary disabled:opacity-50"><RefreshCw size={13}/>Regenerate schedule</button></div>} />
          <div className="mt-6 grid gap-3 lg:grid-cols-2">{kit.schedule.days.map((day)=><article key={day.day} className="rounded-[16px] border border-[#ececf2] bg-white p-4 sm:p-5"><div className="mb-4 flex items-start justify-between gap-3"><div className="flex items-center gap-3"><span className="grid size-9 place-items-center rounded-[13px] bg-[#f2f0ff] text-xs font-bold text-[#6b5be0]">{String(day.day).padStart(2,"0")}</span><div><p className="text-[10px] font-bold uppercase tracking-[.11em] text-[#999aab]">Day {day.day}</p><p className="mt-0.5 text-xs font-semibold text-[#48495e]">{day.question_ids.length} question{day.question_ids.length===1?"":"s"} · {day.minutes} min</p></div></div><span className="rounded-full bg-[#f8f7ff] px-2.5 py-1 text-[9px] font-bold text-[#7a6edd]">{day.minutes} min</span></div><label className="block"><span className="sr-only">Focus for day {day.day}</span><textarea disabled={busy} value={day.focus} onChange={(event)=>editSchedule(day.day,"focus",event.target.value)} className="field min-h-[76px] resize-y bg-[#fbfbfd] text-xs leading-5 disabled:bg-[#fafafd]" /></label><div className="mt-3 flex flex-wrap items-center justify-between gap-3"><div className="flex flex-wrap gap-1.5">{day.question_ids.length ? day.question_ids.map((id)=><span key={id} className="rounded-lg bg-[#f4f4f8] px-2 py-1 text-[9px] font-semibold text-[#77798c]">{id}</span>) : <span className="text-[10px] text-[#9b9cab]">Review notes and practise aloud</span>}</div><label className="flex items-center gap-2 text-[10px] text-[#85879a]">Minutes<input disabled={busy} type="number" min={0} max={1440} value={day.minutes} onChange={(event)=>editSchedule(day.day,"minutes",event.target.value)} className="field !w-[76px] !px-2 !py-1.5 text-center text-xs disabled:bg-[#fafafd]" /></label></div></article>)}</div>
          <CoverageNotice kit={kit}/>
        </section>}

        {activeTab === "practice" && <section className="surface p-5 sm:p-7"><SectionHeading eyebrow="Practice mode" title="Recall first. Reveal when you’re ready." description="New cards appear first. After review, the least confident cards return sooner." />
          <div className="mt-6 grid gap-5 lg:grid-cols-[minmax(0,1fr)_260px]"><div>{!activeCard ? <div className="rounded-[18px] border border-dashed border-[#dedee9] px-6 py-12 text-center"><BookOpenCheck className="mx-auto mb-3 text-[#8374e7]" size={24}/><h3 className="text-sm font-semibold">No cards to practise yet.</h3><p className="mt-2 text-xs text-[#9294a4]">Add flashcards in the Flashcards section to start a review session.</p><button onClick={()=>setActiveTab("flashcards")} className="btn-secondary mt-4">Open flashcards <ArrowRight size={13}/></button></div>
            : <article className="rounded-[20px] border border-[#e9e8f1] bg-[#fbfaff] p-5 sm:p-7"><div className="mb-5 flex items-center justify-between"><span className="rounded-full bg-white px-3 py-1.5 text-[10px] font-bold text-[#6d5dd8]">{editState.practice[activeCard.id]?`Reviewed · confidence ${editState.practice[activeCard.id]!.confidence}/5`:"New card"}</span><span className="text-[10px] font-semibold text-[#a1a2af]">{Math.max(1,orderedCards.findIndex((item)=>item.id===activeCard.id)+1)} / {orderedCards.length}</span></div><p className="eyebrow mb-3">Prompt</p><h3 className="min-h-[100px] text-xl font-semibold leading-8 tracking-[-.025em] text-[#27283e]">{activeCard.front}</h3>{showAnswer&&<div className="mt-5 rounded-[15px] border border-[#eeecf8] bg-white p-4"><p className="eyebrow mb-2">Key points</p><p className="text-sm leading-6 text-[#67697d]">{activeCard.back}</p></div>}<div className="mt-5 flex flex-wrap items-center gap-2.5"><button onClick={()=>setShowAnswer(!showAnswer)} className="btn-secondary">{showAnswer?"Hide answer":"Reveal answer"}<ChevronDown size={13} className={showAnswer?"rotate-180":""}/></button><button onClick={()=>{if(!activeCard||!orderedCards.length)return;const cur=orderedCards.findIndex((c)=>c.id===activeCard.id);const nxt=orderedCards[(cur+1)%orderedCards.length];setShowAnswer(false);if(nxt)setCurrentCardId(nxt.id);}} className="btn-secondary">Next question <ArrowRight size={13}/></button></div>{showAnswer&&<div className="mt-6 border-t border-[#e9e7f2] pt-5"><p className="mb-3 text-xs font-semibold">How confident did that feel?</p><div className="grid grid-cols-5 gap-2">{[1,2,3,4,5].map((value)=><button key={value} onClick={()=>void recordConfidence(activeCard,value,orderedCards)} className="rounded-xl border border-[#e9e8f0] bg-white py-2.5 text-xs font-bold text-[#67697c] transition hover:border-[#9c91ed] hover:bg-[#f5f3ff] hover:text-[#6554d4]"><span className="block">{value}</span><span className="mt-1 block text-[8px] font-medium text-[#9a9bab]">{["Low","","Okay","","High"][value-1]}</span></button>)}</div></div>}</article>}</div>
            <aside className="rounded-[17px] bg-[#f8f7ff] p-4"><p className="eyebrow !text-[#7b70cc]">Review progress</p><div className="mt-4 flex items-end justify-between"><span className="text-3xl font-semibold tracking-[-.05em] text-[#383654]">{Object.keys(editState.practice).filter((id)=>kit.flashcards.some((card)=>card.id===id)).length}<span className="ml-1 text-sm font-medium text-[#a1a0b3]">/ {kit.flashcards.length}</span></span><span className="pb-1 text-[10px] text-[#9998ac]">covered</span></div><div className="mt-3 h-1.5 overflow-hidden rounded-full bg-[#e9e7f8]"><div className="h-full rounded-full bg-[#7869e8] transition-all" style={{width:`${kit.flashcards.length?Math.min(100,Object.keys(editState.practice).filter((id)=>kit.flashcards.some((card)=>card.id===id)).length/kit.flashcards.length*100):0}%`}}/></div><div className="mt-5 border-t border-[#e9e7f8] pt-4"><p className="text-[10px] font-bold text-[#54546d]">Next session order</p><p className="mt-1.5 text-[10px] leading-5 text-[#89889e]">Cards you haven’t reviewed come first. After that, the lowest confidence and oldest review come next.</p></div><div className="mt-4 space-y-2">{orderedCards.slice(0,4).map((card,index)=><div key={card.id} className="flex items-center gap-2"><span className="grid size-5 place-items-center rounded-md bg-white text-[9px] font-bold text-[#8377db]">{index+1}</span><span className="flex-1 truncate text-[10px] text-[#77788c]">{card.front}</span><span className="text-[9px] text-[#a1a1b1]">{editState.practice[card.id]?`${editState.practice[card.id]!.confidence}/5`:"new"}</span></div>)}</div></aside>
          </div>
        </section>}
      </>}
    </div>
  </AppShell>;
}

function SectionHeading({ eyebrow, title, description, action }: { eyebrow: string; title: string; description: string; action?: React.ReactNode }) {
  return <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start"><div><p className="eyebrow mb-1.5">{eyebrow}</p><h2 className="text-xl font-semibold tracking-[-.035em] text-[#25263b]">{title}</h2><p className="mt-1.5 text-xs leading-5 text-[#8d8fa0]">{description}</p></div>{action}</div>;
}

function RequirementRow({ requirement, disabled, onChange }: { requirement: Requirement; disabled: boolean; onChange: (value: Requirement) => void }) {
  return <div className="rounded-[14px] border border-[#ececf2] bg-white p-3"><div className="mb-2 flex items-center justify-between"><span className="flex items-center gap-2"><span className={`rounded-md px-1.5 py-1 text-[9px] font-bold ${requirement.priority==="must"?"bg-[#fff1eb] text-[#c47b52]":"bg-[#f4f4f7] text-[#858799]"}`}>{requirement.priority}</span><span className="text-[9px] font-bold uppercase tracking-wide text-[#a0a1b0]">{requirement.id} · {requirement.kind}</span></span><span className={`size-1.5 rounded-full ${requirement.priority==="must"?"bg-[#e89c74]":"bg-[#c3c4d0]"}`}/></div><textarea disabled={disabled} value={requirement.text} onChange={(event)=>onChange({...requirement,text:event.target.value})} rows={2} className="w-full resize-y bg-transparent text-xs leading-5 text-[#55576b] outline-none disabled:opacity-65" aria-label={`Requirement ${requirement.id}`}/><div className="mt-2 flex gap-2 border-t border-[#f1f1f5] pt-2"><select disabled={disabled} value={requirement.kind} onChange={(event)=>onChange({...requirement,kind:event.target.value as Requirement["kind"]})} className="rounded-lg border border-[#efeff4] bg-[#fcfcfd] px-2 py-1 text-[9px] text-[#7c7e90]"><option value="technical">Technical</option><option value="behavioural">Behavioural</option><option value="domain">Domain</option></select><select disabled={disabled} value={requirement.priority} onChange={(event)=>onChange({...requirement,priority:event.target.value as Requirement["priority"]})} className="rounded-lg border border-[#efeff4] bg-[#fcfcfd] px-2 py-1 text-[9px] text-[#7c7e90]"><option value="must">Must-have</option><option value="nice">Nice-to-have</option></select></div></div>;
}

function QuestionCard({ question, index, total, requirements, meta, disabled, onChange, onDelete, onMove, onPin }: { question: Question; index: number; total: number; requirements: Requirement[]; meta?: EditState["items"][string]; disabled: boolean; onChange: (patch: Partial<Question>) => void; onDelete: () => void; onMove: (direction: -1 | 1) => void; onPin: () => void }) {
  const linked = question.requirement_ids.map((id)=>requirements.find((item)=>item.id===id)).filter((item):item is Requirement=>Boolean(item));
  return <article className="rounded-[16px] border border-[#ececf2] bg-white p-4 sm:p-5"><div className="mb-4 flex flex-wrap items-center justify-between gap-2"><div className="flex items-center gap-2"><span className="grid size-7 place-items-center rounded-[10px] bg-[#f1efff] text-[10px] font-bold text-[#6d5bdc]">{question.id}</span><select disabled={disabled} value={question.category} onChange={(event)=>onChange({category:event.target.value as QuestionCategory})} className="rounded-lg border border-[#efeff4] bg-[#fcfcfd] px-2.5 py-1.5 text-[10px] font-semibold text-[#66687b]">{categoryOrder.map((category)=><option key={category} value={category}>{categoryLabels[category]}</option>)}</select><span className="rounded-full bg-[#f7f7fa] px-2 py-1 text-[9px] text-[#9294a4]">Level {question.difficulty}</span></div><div className="flex items-center gap-1"><button disabled={disabled||index===0} aria-label="Move question up" title="Move up" onClick={()=>onMove(-1)} className="rounded-lg p-1.5 text-[#8d8fa0] hover:bg-[#f4f3fa] disabled:opacity-35"><ArrowUp size={14}/></button><button disabled={disabled||index===total-1} aria-label="Move question down" title="Move down" onClick={()=>onMove(1)} className="rounded-lg p-1.5 text-[#8d8fa0] hover:bg-[#f4f3fa] disabled:opacity-35"><ArrowDown size={14}/></button><button disabled={disabled} aria-label={meta?.pinned?"Unpin question":"Pin question"} title={meta?.pinned?"Unpin":"Pin"} onClick={onPin} className={`rounded-lg p-1.5 hover:bg-[#f4f3fa] disabled:opacity-40 ${meta?.pinned?"text-[#6b5bd5]":"text-[#a3a4b1]"}`}>{meta?.pinned?<Pin size={14}/>:<PinOff size={14}/>}</button><button disabled={disabled} aria-label="Delete question" title="Delete" onClick={onDelete} className="rounded-lg p-1.5 text-[#a2a3b0] hover:bg-[#fff3f3] hover:text-[#bd5962] disabled:opacity-40"><Trash2 size={14}/></button></div></div><label className="block"><span className="eyebrow mb-1.5 block">Prompt</span><textarea disabled={disabled} value={question.prompt} onChange={(event)=>onChange({prompt:event.target.value})} rows={2} className="field min-h-[66px] resize-y text-xs leading-5 disabled:bg-[#fafafd]"/></label><label className="mt-3 block"><span className="eyebrow mb-1.5 block">Answer outline</span><textarea disabled={disabled} value={question.answer_outline} onChange={(event)=>onChange({answer_outline:event.target.value})} rows={3} className="field min-h-[82px] resize-y text-xs leading-5 disabled:bg-[#fafafd]"/></label><div className="mt-3 flex flex-wrap items-center gap-1.5 border-t border-[#f0f0f4] pt-3"><span className="mr-1 text-[9px] font-bold uppercase tracking-wide text-[#a0a1af]">Covers</span>{linked.length?linked.map((item)=><span key={item.id} className="rounded-md bg-[#f6f5fb] px-2 py-1 text-[9px] text-[#7b7b91]">{item.id} · {item.text.slice(0,58)}{item.text.length>58?"…":""}</span>):<span className="text-[9px] text-[#a0a1af]">No requirement link</span>}</div></article>;
}

function FlashcardEditor({ card, index, total, requirements, meta, disabled, onChange, onDelete, onPin }: { card: Flashcard; index: number; total: number; requirements: Requirement[]; meta?: EditState["items"][string]; disabled: boolean; onChange: (patch: Partial<Flashcard>) => void; onDelete: () => void; onPin: () => void }) {
  return <article className="rounded-[16px] border border-[#ececf2] bg-white p-4"><div className="mb-3 flex items-center justify-between"><span className="flex items-center gap-2"><span className="grid size-7 place-items-center rounded-[10px] bg-[#f1efff] text-[9px] font-bold text-[#6d5bdc]">{card.id}</span><span className="text-[9px] text-[#a0a1af]">Card {index+1} / {total}</span></span><span className="flex items-center gap-1"><button disabled={disabled} onClick={onPin} aria-label={meta?.pinned?"Unpin card":"Pin card"} className="rounded-lg p-1.5 text-[#9495a5] hover:bg-[#f5f4fa] disabled:opacity-40">{meta?.pinned?<Pin size={13}/>:<PinOff size={13}/>}</button><button disabled={disabled} onClick={onDelete} aria-label="Delete card" className="rounded-lg p-1.5 text-[#a2a3b0] hover:bg-[#fff3f3] hover:text-[#bd5962] disabled:opacity-40"><Trash2 size={13}/></button></span></div><label className="block"><span className="eyebrow mb-1.5 block">Front · prompt</span><textarea disabled={disabled} value={card.front} onChange={(event)=>onChange({front:event.target.value})} rows={2} className="field min-h-[64px] resize-y text-xs leading-5 disabled:bg-[#fafafd]"/></label><label className="mt-3 block"><span className="eyebrow mb-1.5 block">Back · key points</span><textarea disabled={disabled} value={card.back} onChange={(event)=>onChange({back:event.target.value})} rows={3} className="field min-h-[82px] resize-y text-xs leading-5 disabled:bg-[#fafafd]"/></label><div className="mt-3 flex flex-wrap gap-1.5">{card.requirement_ids.map((id)=><span key={id} className="rounded-md bg-[#f6f5fb] px-2 py-1 text-[9px] text-[#7b7b91]">{requirements.find((item)=>item.id===id)?.text.slice(0,48)??id}</span>)}</div></article>;
}

function CoverageNotice({ kit }: { kit: Kit }) {
  const mustUncovered = kit.role.requirements.filter((item)=>item.priority==="must"&&kit.coverage.uncovered_requirement_ids.includes(item.id));
  return <div className={`mt-5 flex items-start gap-2 rounded-xl px-3.5 py-3 text-[10px] leading-5 ${mustUncovered.length?"bg-[#fff4f1] text-[#aa614b]":"bg-[#f4f9f6] text-[#668875]"}`}><Check className="mt-0.5 shrink-0" size={13}/><span>{mustUncovered.length?`Coverage needs attention: ${mustUncovered.map((item)=>item.text).join("; ")}`:`Coverage check complete. ${kit.role.requirements.length-kit.coverage.uncovered_requirement_ids.length} of ${kit.role.requirements.length} requirements have at least one linked question.`}</span></div>;
}

function GenerationProgress({ record }: { record: KitRecord }) {
  const steps = [{id:"extracting",label:"Reading your job description"},{id:"researching",label:"Researching the company site"},{id:"searching",label:"Looking for interview discussion"},{id:"brief",label:"Building the company brief"},{id:"questions",label:"Writing targeted questions"},{id:"coverage",label:"Checking requirement coverage"},{id:"flashcards",label:"Preparing flashcards"},{id:"schedule",label:"Laying out your study days"}];
  const progress = record.progress.percent;
  return <section className="surface mx-auto max-w-[880px] overflow-hidden"><div className="grid gap-7 p-5 sm:p-8 md:grid-cols-[.8fr_1.2fr]"><div className="flex flex-col justify-center"><div className="mb-5 grid size-12 place-items-center rounded-[17px] bg-[#f1efff] text-[#6f5edf]"><Sparkles size={20}/></div><p className="eyebrow mb-2">Your prep is coming together</p><h2 className="text-xl font-semibold tracking-[-.03em]">We’re doing the research and shaping your kit.</h2><p className="mt-2 text-xs leading-5 text-[#888a9b]">This can take a little while. You can leave this page and come back; your progress is saved.</p><div className="mt-6"><div className="mb-2 flex justify-between text-[10px]"><span className="font-semibold text-[#64667a]">{record.progress.message}</span><span className="text-[#999aaa]">{Math.max(0,Math.min(100,progress))}%</span></div><div className="h-1.5 overflow-hidden rounded-full bg-[#efeff6]"><div className="h-full rounded-full bg-[#7564e8] transition-all duration-500" style={{width:`${Math.max(2,Math.min(100,progress))}%`}}/></div></div></div><div className="rounded-[17px] bg-[#fbfaff] p-4 sm:p-5"><p className="eyebrow mb-4">What’s happening</p><ol className="space-y-3">{steps.map((step,index)=>{const active=step.id===record.progress.stage;const done=progress>=([8,20,42,50,58,78,82,90][index]??100);return <li key={step.id} className="flex items-center gap-3"><span className={`grid size-7 shrink-0 place-items-center rounded-full ${done?"bg-[#eceaff] text-[#6d5bdd]":active?"bg-white text-[#6d5bdd] shadow-sm":"bg-white text-[#c2c3cf]"}`}>{done?<Check size={13}/>:active?<LoaderCircle className="animate-spin" size={13}/>:<span className="text-[9px] font-bold">{String(index+1).padStart(2,"0")}</span>}</span><span className={`text-[11px] ${done||active?"font-semibold text-[#55566b]":"text-[#a0a1af]"}`}>{step.label}</span>{active&&<span className="ml-auto text-[9px] font-semibold text-[#8376e0]">IN PROGRESS</span>}</li>})}</ol></div></div><div className="border-t border-[#efeff4] bg-[#fcfcfe] px-5 py-3 text-[10px] leading-5 text-[#9294a5] sm:px-8">Sources that cannot be reached are skipped and recorded. A missing hiring page does not stop the kit.</div></section>;
}
