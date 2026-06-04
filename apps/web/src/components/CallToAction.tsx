import { Button, Link } from "@unbnd/ui";
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
      {/* Both branches render the Button primary look: the button branch through
          the Button primitive, the link branch through the Link primitive's
          button-primary variant (which emits Button's own skin classes, ADR
          0047 §2). Both add .cta-btn as their shared density-only residue, so
          they render identically. */}
      {ctaHref ? (
        <Link variant="button-primary" href={ctaHref} className="cta-btn">
          {ctaLabel}
        </Link>
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
