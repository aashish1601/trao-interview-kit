export type RequirementKind = "technical" | "behavioural" | "domain";
export type RequirementPriority = "must" | "nice";
export type QuestionCategory = "technical" | "behavioural" | "system-design" | "company-fit";

export interface Requirement {
  id: string;
  text: string;
  kind: RequirementKind;
  priority: RequirementPriority;
}

export interface Question {
  id: string;
  requirement_ids: string[];
  category: QuestionCategory;
  prompt: string;
  answer_outline: string;
  difficulty: 1 | 2 | 3;
}

export interface Flashcard {
  id: string;
  front: string;
  back: string;
  requirement_ids: string[];
}

export interface ScheduleDay {
  day: number;
  focus: string;
  question_ids: string[];
  minutes: number;
}

export interface Kit {
  source: {
    company: string;
    company_url: string;
    role: string;
    location: string;
    jd_chars: number;
    researched_at: string;
    pages_used: string[];
  };
  company_brief: { summary: string; what_they_do: string; sources: string[] };
  role: {
    title: string;
    seniority: string;
    responsibilities: string[];
    requirements: Requirement[];
  };
  questions: Question[];
  flashcards: Flashcard[];
  schedule: { days_available: number; days: ScheduleDay[] };
  coverage: { uncovered_requirement_ids: string[]; passes: number };
  research?: {
    attempted: Array<{ url: string; status: "used" | "skipped" | "failed"; reason?: string }>;
    discussion_found: boolean;
    notes: string[];
  };
}

export interface CaseInput {
  id: string;
  jd: string;
  company_url: string;
  days: number;
}

export type KitItemMeta = { origin: "generated" | "user"; edited: boolean; pinned: boolean };
export interface KitEditState {
  items: Record<string, KitItemMeta>;
  sections: Record<string, { edited: boolean; pinned: boolean }>;
  practice: Record<string, { confidence: number; reviewed_at: string }>;
  nextIds: { question: number; flashcard: number };
}

export const emptyEditState = (): KitEditState => ({ items: {}, sections: {}, practice: {}, nextIds: { question: 1, flashcard: 1 } });
