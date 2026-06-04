// Container — the typed @unbnd/ui page-frame layout primitive (ADR 0049, under
// epic 0001 / ADR 0038 §5 "structure separated from skin"). The home for the
// one truly-shared screen frame: the former `.page` rule, whose three
// declarations now live in the co-located Container.css. Container emits the
// literal `class="page"`, so every former `<div className="page">` site renders
// byte-identical — same markup, same resolved styles, same tokens (ADR 0049 §1,
// Option A: emit `.page`, zero-diff by construction).
//
// Stack / Grid are NOT built (no dominant zero-diff cluster; left bespoke /
// deferred). The divergent `.rate` frame (RatingControl.css) and the auth shell
// (`.auth-page`) are different frames and stay bespoke (ADR 0049 §"out of
// scope").
import type { ComponentPropsWithoutRef, ElementType, ReactNode } from "react";
import "./Container.css";

interface ContainerOwnProps<T extends ElementType> {
  /**
   * The element to render as. Defaults to "div" (every current .page site is a
   * <div>). A future page that needs a <main>/<section> landmark passes it here
   * and the tag is carried verbatim; extra props flow through `...rest`.
   */
  as?: T;
  /**
   * ADDITIVE LAYOUT-ONLY (ADR 0038 §2). Never a re-skin. Appended after "page".
   * No current site uses it (all sites are the bare "page"); provided for the
   * page-with-extra-layout-class case the Link/Field precedent anticipates.
   */
  className?: string;
  children: ReactNode;
}

// Polymorphic prop type: own props + the rendered element's props (minus any our
// own props override), defaulting to a <div> when `as` is omitted.
export type ContainerProps<T extends ElementType = "div"> =
  ContainerOwnProps<T> &
    Omit<ComponentPropsWithoutRef<T>, keyof ContainerOwnProps<T>>;

export function Container<T extends ElementType = "div">({
  as,
  className,
  children,
  ...rest
}: ContainerProps<T>) {
  const Tag = (as ?? "div") as ElementType;
  const merged = className ? `page ${className}` : "page";
  return (
    <Tag className={merged} {...rest}>
      {children}
    </Tag>
  );
}
