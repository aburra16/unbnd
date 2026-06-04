import { Button } from "@unbnd/ui";
import "./CallToAction.css";

type Props = {
  title: string;
  body: string;
  ctaLabel: string;
  ctaHref?: string;
  onCta?: () => void;
};

export function CallToAction({ title, body, ctaLabel, ctaHref, onCta }: Props) {
  return (
    <section className="cta">
      <h3 className="cta-title">{title}</h3>
      <p className="cta-body">{body}</p>
      {/* The button branch goes through the Button primitive (ADR 0045); the
          link branch stays a raw <a> until the Link primitive (epic story 10).
          Both share the .cta-btn density/skin class so they render identically. */}
      {ctaHref ? (
        <a className="cta-btn" href={ctaHref}>
          {ctaLabel}
        </a>
      ) : (
        <Button
          variant="primary"
          size="md"
          className="cta-btn"
          type="button"
          onClick={onCta}
        >
          {ctaLabel}
        </Button>
      )}
    </section>
  );
}
