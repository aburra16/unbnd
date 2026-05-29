import { describe, expect, it } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { Avatar } from "../../src/components/Avatar";

describe("Avatar", () => {
  it("renders the picture as an img when provided", () => {
    render(<Avatar label="Satoshi" seed="npub1abc" picture="https://x/p.jpg" />);
    const img = document.querySelector("img.avatar-img") as HTMLImageElement;
    expect(img).toBeTruthy();
    expect(img.src).toBe("https://x/p.jpg");
  });

  it("falls back to initials when no picture", () => {
    render(<Avatar label="Mira Calloway" seed="npub1abc" />);
    expect(screen.getByText("MC")).toBeInTheDocument();
  });

  it("falls back to initials when the picture URL fails to load", () => {
    render(<Avatar label="Mira Calloway" seed="npub1abc" picture="https://x/dead.jpg" />);
    const img = document.querySelector("img.avatar-img") as HTMLImageElement;
    fireEvent.error(img);
    expect(screen.getByText("MC")).toBeInTheDocument();
    expect(document.querySelector("img.avatar-img")).toBeNull();
  });

  it("derives initials from an npub when the label is an npub", () => {
    render(<Avatar label="npub1xy9abc" seed="npub1xy9abc" />);
    expect(screen.getByText("XY")).toBeInTheDocument();
  });
});
