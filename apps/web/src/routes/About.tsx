import { Container } from "@unbnd/ui";
import { Nav } from "../components/Nav";
import { Footer } from "../components/Footer";
import { Breadcrumb } from "../components/Breadcrumb";
import "./About.css";

export function About() {
  return (
    <Container>
      <Nav />
      <Breadcrumb trail={[{ label: "Home", to: "/" }, { label: "About" }]} />
      <article className="about">
        <h1 className="about-title">About Unbnd</h1>
        <p className="about-lede">
          Unbnd helps you find books through the readers you trust.
        </p>
        <p>
          Every rating and every genre or style tag is a signed event on the
          nostr network. Your contributions belong to your own key, and they
          travel with you to any app that reads the same data.
        </p>
        <p>
          The catalog is open and community-curated. Anyone can rate a book,
          apply a tag, or dispute one. The view you see reflects what readers
          actually recorded, shown as plain counts.
        </p>
        <p className="about-state">
          Unbnd is early. Trust-weighted recommendations and search are on the
          way.
        </p>
      </article>
      <Footer />
    </Container>
  );
}
