// The shared write-gate account prompt (Story 73 / ADR 0071). One component,
// keyed by an `action`, renders a consistent "Create a free account to <phrase>."
// line + a "Create account" CTA to /auth. Every write control's signed-out
// branch uses this. It is the single, on-message gate at the write (never on
// read, never an interstitial). The CTA is a router <Link> (correct navigation
// semantics + respects the no-raw-<button> guard); /auth already serves both
// account creation and existing sign-in.
import { Link } from "react-router-dom";
import "./AccountPrompt.css";

/** The write action a signed-out visitor was trying to take. */
export type AccountAction = "rate" | "save" | "follow" | "vouch" | "tag" | "submit";

// One place for the copy (kept on-voice; reference: the wireframe's "Create a
// free account to rate or save this."). The sentence both frames the ask as
// creating a free account (AC-4) and names what it unlocks (AC-5).
const PHRASE: Record<AccountAction, string> = {
  rate: "rate this book",
  save: "save this book to a shelf",
  follow: "follow this curator",
  vouch: "vouch for this curator",
  tag: "suggest a genre or style",
  submit: "submit a book",
};

export function AccountPrompt({ action, className }: { action: AccountAction; className?: string }) {
  return (
    <div className={`account-prompt${className ? ` ${className}` : ""}`} role="note">
      <p className="account-prompt-body">Create a free account to {PHRASE[action]}.</p>
      <Link className="account-prompt-cta" to="/auth">
        Create account
      </Link>
    </div>
  );
}
