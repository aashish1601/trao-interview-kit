import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Interview Kit — Prepare with a plan",
  description: "Company research, targeted interview questions, flashcards, and a study plan tailored to your next role.",
  icons: { icon: "/favicon.svg" },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
