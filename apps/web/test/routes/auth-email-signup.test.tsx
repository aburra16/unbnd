import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { AuthEmailSignup } from "../../src/routes/AuthEmailSignup";

const navigateMock = vi.fn();
vi.mock("react-router-dom", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-router-dom")>();
  return { ...actual, useNavigate: () => navigateMock };
});

const signupMock = vi.fn();
vi.mock("../../src/lib/api", () => ({
  ApiError: class ApiError extends Error {
    constructor(
      public status: number,
      public code: string | undefined,
      message: string,
    ) {
      super(message);
    }
  },
  api: { auth: { signup: (...args: unknown[]) => signupMock(...args) } },
}));

function fillAndSubmit() {
  fireEvent.change(screen.getByLabelText(/display name/i), {
    target: { value: "Mira Calloway" },
  });
  fireEvent.change(screen.getByLabelText(/email/i), {
    target: { value: "reader@example.com" },
  });
  fireEvent.change(screen.getByLabelText(/password/i), {
    target: { value: "abcdefghij" },
  });
  fireEvent.click(screen.getByRole("button", { name: /create account/i }));
}

describe("AuthEmailSignup form wiring", () => {
  beforeEach(() => {
    navigateMock.mockReset();
    signupMock.mockReset();
  });

  it("calls api.auth.signup with the form values on submit", async () => {
    signupMock.mockResolvedValue({ user: { npub: "npub1abc" } });
    render(
      <MemoryRouter>
        <AuthEmailSignup />
      </MemoryRouter>,
    );
    fillAndSubmit();
    await waitFor(() =>
      expect(signupMock).toHaveBeenCalledWith({
        email: "reader@example.com",
        password: "abcdefghij",
        displayName: "Mira Calloway",
      }),
    );
  });

  it("navigates to /auth/welcome on a successful signup", async () => {
    signupMock.mockResolvedValue({ user: { npub: "npub1abc" } });
    render(
      <MemoryRouter>
        <AuthEmailSignup />
      </MemoryRouter>,
    );
    fillAndSubmit();
    await waitFor(() =>
      expect(navigateMock).toHaveBeenCalledWith("/auth/welcome"),
    );
  });

  it("shows the API error message when signup fails", async () => {
    signupMock.mockRejectedValue(
      Object.assign(new Error("An account with this email already exists."), {
        code: "email_in_use",
      }),
    );
    render(
      <MemoryRouter>
        <AuthEmailSignup />
      </MemoryRouter>,
    );
    fillAndSubmit();
    expect(
      await screen.findByText(/an account with this email already exists/i),
    ).toBeInTheDocument();
    expect(navigateMock).not.toHaveBeenCalled();
  });
});
