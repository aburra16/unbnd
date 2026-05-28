import "./CallToAction.css";

type Props = {
  title: string;
  body: string;
  ctaLabel: string;
  ctaHref?: string;
  onCta?: () => void;
};

export function CallToAction({ title, body, ctaLabel, ctaHref, onCta }: Props) {
  const Btn = ctaHref ? "a" : "button";
  const btnProps = ctaHref
    ? { href: ctaHref }
    : { type: "button" as const, onClick: onCta };
  return (
    <section className="cta">
      <h3 className="cta-title">{title}</h3>
      <p className="cta-body">{body}</p>
      <Btn className="cta-btn" {...(btnProps as any)}>
        {ctaLabel}
      </Btn>
    </section>
  );
}
