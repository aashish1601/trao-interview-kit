export type Requirement = { id: string; text: string; kind: "technical" | "behavioural" | "domain"; priority: "must" | "nice" };
export type QuestionCategory = "technical" | "behavioural" | "system-design" | "company-fit";
export type Question = { id: string; requirement_ids: string[]; category: QuestionCategory; prompt: string; answer_outline: string; difficulty: 1 | 2 | 3 };
export type Flashcard = { id: string; front: string; back: string; requirement_ids: string[] };
export type Kit = {
  source: { company: string; company_url: string; role: string; location: string; jd_chars: number; researched_at: string; pages_used: string[] };
  company_brief: { summary: string; what_they_do: string; sources: string[] };
  role: { title: string; seniority: string; responsibilities: string[]; requirements: Requirement[] };
  questions: Question[];
  flashcards: Flashcard[];
  schedule: { days_available: number; days: Array<{ day: number; focus: string; question_ids: string[]; minutes: number }> };
  coverage: { uncovered_requirement_ids: string[]; passes: number };
  research?: { attempted: Array<{ url: string; status: "used" | "skipped" | "failed"; reason?: string }>; discussion_found: boolean; notes: string[] };
};
export type EditState = {
  items: Record<string, { origin: "generated" | "user"; edited: boolean; pinned: boolean }>;
  sections: Record<string, { edited: boolean; pinned: boolean }>;
  practice: Record<string, { confidence: number; reviewed_at: string }>;
  nextIds: { question: number; flashcard: number };
};
export type KitStatus = "queued" | "running" | "ready" | "failed" | "regenerating";
export type KitRecord = {
  id: string; input: { jd: string; company_url: string; days: number }; status: KitStatus;
  progress: { stage: string; percent: number; message: string };
  generationError: { code: string; message: string } | null;
  kit: Kit | null; editState: EditState; degraded: boolean; createdAt: string; updatedAt: string;
};
export type User = { id: string; email: string };
