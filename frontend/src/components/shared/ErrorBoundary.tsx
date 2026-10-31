import { Component, type ReactNode } from "react";
import { EmptyState } from "./EmptyState";
import { Button } from "../ui/button";

export class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) { return { error }; }
  componentDidCatch(error: Error) { console.error("Page crashed", error); }
  render() {
    if (this.state.error) {
      return (
        <EmptyState tone="bad" title="This page hit a problem"
          description="The rest of the app still works. Reload this page, and if it keeps happening, tell the team what you were doing."
          action={<Button onClick={() => this.setState({ error: null })}>Reload page</Button>} />
      );
    }
    return this.props.children;
  }
}
