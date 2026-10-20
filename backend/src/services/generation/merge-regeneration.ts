import type { Kit, KitEditState, Question, QuestionCategory } from "../../domain/kit.js";
import { findUncoveredRequirements } from "./coverage.js";
import { buildStudySchedule } from "../scheduling/schedule-builder.js";

export type RegenerationTarget = "company_brief" | "schedule" | "flashcards" | QuestionCategory;

export function createEditState(kit: Kit): KitEditState {
  const state: KitEditState = {
    items: {}, sections: {}, practice: {}, nextIds: {
      question: Math.max(0, ...kit.questions.map((item) => Number(item.id.match(/\d+$/)?.[0] ?? 0))) + 1,
      flashcard: Math.max(0, ...kit.flashcards.map((item) => Number(item.id.match(/\d+$/)?.[0] ?? 0))) + 1,
    },
  };
  for (const item of kit.questions) state.items[item.id] = { origin: "generated", edited: false, pinned: false };
  for (const item of kit.flashcards) state.items[item.id] = { origin: "generated", edited: false, pinned: false };
  return state;
}

function nextId(state: KitEditState, kind: "question" | "flashcard"): string {
  const prefix = kind === "question" ? "q" : "f";
  const value = Math.max(1, state.nextIds[kind] || 1);
  state.nextIds[kind] = value + 1;
  return `${prefix}${value}`;
}

function isProtected(state: KitEditState, id: string): boolean {
  const meta = state.items[id];
  return meta?.origin === "user" || meta?.edited === true || meta?.pinned === true;
}

export function mergeRegeneratedSection(
  existing: Kit,
  editStateInput: KitEditState,
  target: RegenerationTarget,
  generated: Partial<Kit>,
): { kit: Kit; editState: KitEditState } {
  const editState: KitEditState = structuredClone(editStateInput);
  const kit: Kit = structuredClone(existing);
  if (target === "company_brief" && generated.company_brief) {
    const section = editState.sections.company_brief;
    if (!section?.pinned && !section?.edited) kit.company_brief = generated.company_brief;
    return { kit, editState };
  }
  if (target === "schedule" && generated.schedule) {
    const section = editState.sections.schedule;
    if (!section?.pinned && !section?.edited) kit.schedule = generated.schedule;
    return { kit, editState };
  }
  if (target === "flashcards" && generated.flashcards) {
    const removed = kit.flashcards.filter((card) => !isProtected(editState, card.id));
    const kept = kit.flashcards.filter((card) => isProtected(editState, card.id));
    const additions = generated.flashcards.map((card) => {
      const id = nextId(editState, "flashcard");
      editState.items[id] = { origin: "generated", edited: false, pinned: false };
      return { ...card, id };
    });
    for (const card of removed) {
      delete editState.items[card.id];
      delete editState.practice[card.id];
    }
    kit.flashcards = [...kept, ...additions];
    kit.flashcards.sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }));
    return { kit, editState };
  }
  if (!categories.has(target as QuestionCategory) || !generated.questions) return { kit, editState };

  const category = target as QuestionCategory;
  const removed = kit.questions.filter((question) => question.category === category && !isProtected(editState, question.id));
  const kept = kit.questions.filter((question) => question.category !== category || isProtected(editState, question.id));
  const newItems = generated.questions.filter((question) => question.category === category);
  const additions: Question[] = newItems.map((question) => {
    const id = nextId(editState, "question");
    editState.items[id] = { origin: "generated", edited: false, pinned: false };
    return { ...question, id };
  });
  for (const question of removed) delete editState.items[question.id];
  kit.questions = [...kept, ...additions];
  kit.questions.sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }));

  // Preserve day edits and allocations for untouched questions while swapping old generated IDs
  // for regenerated questions that cover the same requirements.
  const newSchedule = buildStudySchedule(kit.role.requirements, kit.questions, kit.schedule.days_available);
  const scheduled = new Set(kit.questions.map((question) => question.id));
  const dayForRemoved = new Map<string, number>();
  for (const day of kit.schedule.days) for (const id of day.question_ids) if (removed.some((question) => question.id === id)) dayForRemoved.set(id, day.day);
  const moved = new Map<number, string[]>();
  for (const fresh of additions) {
    const replaced = removed.find((old) => old.requirement_ids.some((id) => fresh.requirement_ids.includes(id)));
    const day = replaced ? dayForRemoved.get(replaced.id) : undefined;
    const targetDay = Math.max(1, Math.min(kit.schedule.days_available, day ?? newSchedule.days.find((item) => item.question_ids.includes(fresh.id))?.day ?? 1));
    moved.set(targetDay, [...(moved.get(targetDay) ?? []), fresh.id]);
  }
  kit.schedule.days = kit.schedule.days.map((day) => ({
    ...day,
    question_ids: [...day.question_ids.filter((id) => scheduled.has(id)), ...(moved.get(day.day) ?? [])],
  }));

  const uncovered = findUncoveredRequirements(kit.role.requirements, kit.questions);
  for (const requirement of uncovered) {
    const id = nextId(editState, "question");
    const fallback: Question = {
      id,
      requirement_ids: [requirement.id],
      category: requirement.kind === "behavioural" ? "behavioural" : requirement.kind === "domain" ? "company-fit" : "technical",
      prompt: `Describe how you meet this requirement: ${requirement.text}. Use a specific example and explain the outcome.`,
      answer_outline: "Explain the context, your role, the decisions you made, the result, and what you would improve.",
      difficulty: requirement.priority === "must" ? 2 : 1,
    };
    kit.questions.push(fallback);
    editState.items[id] = { origin: "generated", edited: false, pinned: false };
    const day = Math.max(1, Math.min(kit.schedule.days_available, Math.ceil(requirement.priority === "must" ? kit.schedule.days_available / 4 : kit.schedule.days_available / 2)));
    const targetDay = kit.schedule.days.find((item) => item.day === day);
    if (targetDay) targetDay.question_ids.push(id);
  }
  kit.questions.sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }));
  kit.coverage.uncovered_requirement_ids = findUncoveredRequirements(kit.role.requirements, kit.questions)
    .filter((item) => item.priority === "must").map((item) => item.id);
  kit.coverage.passes = uncovered.length ? 2 : 1;
  return { kit, editState };
}

const categories = new Set<QuestionCategory>(["technical", "behavioural", "system-design", "company-fit"]);

export function markEdited(editState: KitEditState, id: string, pinned?: boolean): KitEditState {
  const next = structuredClone(editState);
  const current = next.items[id] ?? { origin: "user" as const, edited: true, pinned: false };
  next.items[id] = { ...current, edited: true, ...(pinned === undefined ? {} : { pinned }) };
  return next;
}

export function togglePinned(editState: KitEditState, id: string): KitEditState {
  const next = structuredClone(editState);
  const current = next.items[id] ?? { origin: "user" as const, edited: false, pinned: false };
  next.items[id] = { ...current, pinned: !current.pinned };
  return next;
}
