import type { Question, Requirement, ScheduleDay } from "../../domain/kit.js";

function priorityFor(question: Question, byId: Map<string, Requirement>): number {
  const requirements = question.requirement_ids.map((id) => byId.get(id)).filter((item): item is Requirement => Boolean(item));
  if (requirements.some((item) => item.priority === "must")) return 0;
  if (requirements.length) return 1;
  return 2;
}

function focusFor(dayQuestions: Question[], byId: Map<string, Requirement>, day: number, total: number): string {
  if (!dayQuestions.length) {
    return day === 1
      ? "Review the posting and the company sources that were available"
      : "Revisit your notes and practise explaining your experience aloud";
  }
  const requirements = [...new Set(dayQuestions.flatMap((question) => question.requirement_ids))]
    .map((id) => byId.get(id)?.text)
    .filter((text): text is string => Boolean(text));
  const keyFocus = requirements.slice(0, 2).map((item) => item.replace(/[.;]+$/, "")).join("; ");
  const phase = day <= Math.max(1, Math.ceil(total * 0.35)) ? "Core preparation" : "Practice and review";
  return keyFocus ? `${phase}: ${keyFocus}`.slice(0, 180) : `${phase}: practise the scheduled questions`;
}

export function buildStudySchedule(requirements: Requirement[], questions: Question[], daysAvailable: number): { days_available: number; days: ScheduleDay[] } {
  const daysCount = Math.max(1, Math.min(60, Math.trunc(daysAvailable)));
  const byId = new Map(requirements.map((item) => [item.id, item]));
  const sortedQuestions = [...questions].sort((a, b) => {
    const priorityDiff = priorityFor(a, byId) - priorityFor(b, byId);
    if (priorityDiff) return priorityDiff;
    if (a.difficulty !== b.difficulty) return b.difficulty - a.difficulty;
    return a.id.localeCompare(b.id, undefined, { numeric: true });
  });
  const assignments: Question[][] = Array.from({ length: daysCount }, () => []);
  if (sortedQuestions.length <= daysCount) {
    sortedQuestions.forEach((question, index) => assignments[index]!.push(question));
  } else {
    sortedQuestions.forEach((question, index) => {
      const dayIndex = Math.min(daysCount - 1, Math.floor(index * daysCount / sortedQuestions.length));
      assignments[dayIndex]!.push(question);
    });
  }
  const days = assignments.map((dayQuestions, index): ScheduleDay => {
    const base = dayQuestions.length ? 20 + dayQuestions.length * 12 + Math.max(...dayQuestions.map((item) => item.difficulty)) * 5 : 25;
    const minutes = Math.min(240, Math.max(20, Math.round(base)));
    return {
      day: index + 1,
      focus: focusFor(dayQuestions, byId, index + 1, daysCount),
      question_ids: dayQuestions.map((question) => question.id),
      minutes,
    };
  });
  return { days_available: daysCount, days };
}
