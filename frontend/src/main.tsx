import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "sonner";
import App from "./app/App";
import { AuthProvider } from "./lib/auth";
import { ThemeProvider, useTheme } from "./lib/theme";
import { ApiError } from "./lib/api";
import "./styles/index.css";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      refetchOnWindowFocus: true,
      // GETs retry with backoff on network/server errors; client errors (4xx) fail fast
      retry: (count, err) => {
        const status = (err as ApiError)?.status ?? 0;
        return count < 3 && (status === 0 || status >= 500);
      },
      retryDelay: (n) => Math.min(1000 * 2 ** n, 8000),
    },
    mutations: { retry: false }, // idempotency keys make a manual retry safe
  },
});

function ThemedToaster() {
  const { resolved } = useTheme();
  return <Toaster theme={resolved} position="bottom-right" richColors closeButton toastOptions={{ style: { fontFamily: "inherit" } }} />;
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ThemeProvider>
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <AuthProvider>
            <App />
            <ThemedToaster />
          </AuthProvider>
        </BrowserRouter>
      </QueryClientProvider>
    </ThemeProvider>
  </React.StrictMode>,
);
