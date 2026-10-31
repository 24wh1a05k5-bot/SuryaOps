import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { safeStorage } from "./utils";

export type ThemeChoice = "light" | "dark" | "system";
type Ctx = { choice: ThemeChoice; resolved: "light" | "dark"; setChoice: (c: ThemeChoice) => void };
const ThemeContext = createContext<Ctx | null>(null);
const KEY = "suryaops-theme";

function systemDark() {
  return typeof matchMedia !== "undefined" && matchMedia("(prefers-color-scheme: dark)").matches;
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [choice, setChoiceState] = useState<ThemeChoice>(() => (safeStorage.get(KEY) as ThemeChoice) || "system");
  const [sys, setSys] = useState(systemDark());

  useEffect(() => {
    const mq = matchMedia("(prefers-color-scheme: dark)");
    const fn = () => setSys(mq.matches);
    mq.addEventListener("change", fn);
    return () => mq.removeEventListener("change", fn);
  }, []);

  const resolved: "light" | "dark" = choice === "system" ? (sys ? "dark" : "light") : choice;
  useEffect(() => {
    document.documentElement.dataset.theme = resolved;
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", resolved === "dark" ? "#0D1220" : "#151A25");
  }, [resolved]);

  const setChoice = (c: ThemeChoice) => { setChoiceState(c); safeStorage.set(KEY, c); };
  return <ThemeContext.Provider value={{ choice, resolved, setChoice }}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme outside ThemeProvider");
  return ctx;
}
