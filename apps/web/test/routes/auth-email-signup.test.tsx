import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { AuthEmailSignup } from "../../src/routes/AuthEmailSignup";
import { ApiError } from "../../src/lib/api";

const navigateMock = vi.fn();
vi.mock("react-router-dom", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-router-dom")>();
  return { ...actual, useNavigate: () => navigateMock };
});

const signupMock = vi.fn();
const loginMock = vi.fn();
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
  api: {
    auth: {
      signup: (...args: unknown[]) => signupMock(...args),
      login: (...args: unknown[]) => loginMock(...args),
    },
  },
}));

function renderScreen() {
  render(
    <MemoryRouter>
      <AuthEmailSignup />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  navigateMock.mockReset();
  signupMock.mockReset();
  loginMock.mockReset();
});

describe("AuthEmailSignup — sign in (default)", () => {
  it("defaults to the sign-in form (no display name field)", () => {
    renderScreen();
    expect(screen.getByRole("button", { name: /^sign in$/i })).toBeInTheDocument();
    expect(screen.queryByLabelText(/display name/i)).not.toBeInTheDocument();
  });

  it("calls api.auth.login and navigates home on success", async () => {
    loginMock.mockResolvedValue({ user: { npub: "npub1abc" } });
    renderScreen();
    fireEvent.change(screen.getByLabelText(/email/i), {
      target: { value: "malfactoryst@gmail.com" },
    });
    fireEvent.change(screen.getByLabelText(/password/i), {
      target: { value: "abcdefghij" },
    });
    fireEvent.click(screen.getByRole("button", { name: /^sign in$/i }));
    await waitFor(() =>
      expect(loginMock).toHaveBeenCalledWith({
        email: "malfactoryst@gmail.com",
        password: "abcdefghij",
      }),
    );
    await waitFor(() => expect(navigateMock).toHaveBeenCalledWith("/"));
  });

  it("shows the API error when login fails and does not navigate", async () => {
    loginMock.mockRejectedValue(
      new ApiError(401, "invalid_credentials", "Email or password is incorrect."),
    );
    renderScreen();
    fireEvent.change(screen.getByLabelText(/email/i), {
      target: { value: "x@y.com" },
    });
    fireEvent.change(screen.getByLabelText(/password/i), {
      target: { value: "wrongpass12" },
    });
    fireEvent.click(screen.getByRole("button", { name: /^sign in$/i }));
    expect(
      await screen.findByText(/email or password is incorrect/i),
    ).toBeInTheDocument();
    expect(navigateMock).not.toHaveBeenCalled();
  });
});

describe("AuthEmailSignup — create account (toggled)", () => {
  function toCreateMode() {
    renderScreen();
    fireEvent.click(screen.getByRole("button", { name: /create an account/i }));
  }

  it("calls api.auth.signup with the form values and navigates to welcome", async () => {
    signupMock.mockResolvedValue({ user: { npub: "npub1abc" } });
    toCreateMode();
    fireEvent.change(screen.getByLabelText(/display name/i), {
      target: { value: "test" },
    });
    fireEvent.change(screen.getByLabelText(/email/i), {
      target: { value: "malfactoryst@gmail.com" },
    });
    fireEvent.change(screen.getByLabelText(/password/i), {
      target: { value: "abcdefghij" },
    });
    fireEvent.click(screen.getByRole("button", { name: /create account/i }));
    await waitFor(() =>
      expect(signupMock).toHaveBeenCalledWith({
        email: "malfactoryst@gmail.com",
        password: "abcdefghij",
        displayName: "test",
      }),
    );
    await waitFor(() => expect(navigateMock).toHaveBeenCalledWith("/auth/welcome"));
  });
});
