import { useEffect } from "react";

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    // Always set dark mode for this app
    document.documentElement.classList.add("dark");
  }, []);

  return <>{children}</>;
}
