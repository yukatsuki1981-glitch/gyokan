import type { ReactNode } from "react";
import { Klee_One } from "next/font/google";

const kleeOne = Klee_One({
  variable: "--font-klee-one",
  subsets: ["latin"],
  weight: ["400", "600"],
  preload: false,
});

export default function DiaryLayout({ children }: { children: ReactNode }) {
  return <div className={kleeOne.variable}>{children}</div>;
}
