import { useMemo } from "react";
import { useTheme } from "./theme";

/** SVG attributes can't read CSS variables reliably, so resolve tokens per theme. */
export function useChartColors() {
  const { resolved } = useTheme();
  return useMemo(() => {
    const cs = getComputedStyle(document.documentElement);
    const rgb = (n: string) => `rgb(${cs.getPropertyValue(`--${n}`).trim().split(" ").join(",")})`;
    return {
      revenue: cs.getPropertyValue("--chart-1").trim(),
      cost: cs.getPropertyValue("--chart-2").trim(),
      grid: rgb("line"),
      axis: rgb("faint"),
      ink: rgb("ink"),
      muted: rgb("muted"),
      surface: rgb("raised"),
      bar: cs.getPropertyValue("--chart-1").trim(),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resolved]);
}
