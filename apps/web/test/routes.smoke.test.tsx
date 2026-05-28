import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { Home } from "../src/routes/Home";
import { BookDetail } from "../src/routes/BookDetail";
import { GenreBrowse } from "../src/routes/GenreBrowse";
import { Submit } from "../src/routes/Submit";
import { Profile } from "../src/routes/Profile";

describe("Route smoke tests against the refit fixtures", () => {
  it("renders the Home route with the trending shelf and hero", () => {
    render(
      <MemoryRouter initialEntries={["/"]}>
        <Routes>
          <Route path="/" element={<Home />} />
        </Routes>
      </MemoryRouter>,
    );
    expect(screen.getByText(/Discover books through/i)).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: /Trending this week/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: /Explore genres/i }),
    ).toBeInTheDocument();
  });

  it("renders the BookDetail route for /book/orbital", () => {
    render(
      <MemoryRouter initialEntries={["/book/orbital"]}>
        <Routes>
          <Route path="/book/:slug" element={<BookDetail />} />
        </Routes>
      </MemoryRouter>,
    );
    expect(
      screen.getByRole("heading", { name: "Orbital" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Samantha Harvey" }),
    ).toBeInTheDocument();
    expect(screen.getByText(/from curators you trust/i)).toBeInTheDocument();
  });

  it("renders the GenreBrowse route for /genre/literary-fiction", () => {
    render(
      <MemoryRouter initialEntries={["/genre/literary-fiction"]}>
        <Routes>
          <Route path="/genre/:slug" element={<GenreBrowse />} />
        </Routes>
      </MemoryRouter>,
    );
    expect(
      screen.getByRole("heading", { name: /Literary fiction/i }),
    ).toBeInTheDocument();
    expect(screen.getByText(/Sort/i)).toBeInTheDocument();
  });

  it("renders the Submit route", () => {
    render(
      <MemoryRouter initialEntries={["/submit"]}>
        <Routes>
          <Route path="/submit" element={<Submit />} />
        </Routes>
      </MemoryRouter>,
    );
    expect(
      screen.getByRole("heading", { name: /Submit a book to Unbnd/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: /Book details/i }),
    ).toBeInTheDocument();
  });

  it("renders the Profile route for /profile/mira-calloway", () => {
    render(
      <MemoryRouter initialEntries={["/profile/mira-calloway"]}>
        <Routes>
          <Route path="/profile/:handle" element={<Profile />} />
        </Routes>
      </MemoryRouter>,
    );
    expect(
      screen.getByRole("heading", { name: "Mira Calloway" }),
    ).toBeInTheDocument();
    expect(screen.getByText(/@mira-calloway/)).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: /Genre affinity/i }),
    ).toBeInTheDocument();
  });
});
