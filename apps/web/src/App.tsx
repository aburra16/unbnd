import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Home } from "./routes/Home";
import { BookDetail } from "./routes/BookDetail";
import { GenreBrowse } from "./routes/GenreBrowse";
import { Browse } from "./routes/Browse";
import { About } from "./routes/About";
import { Search } from "./routes/Search";
import { Submit } from "./routes/Submit";
import { Profile } from "./routes/Profile";
import { ProfileMe } from "./routes/ProfileMe";
import { AuthMethodSelect } from "./routes/AuthMethodSelect";
import { AuthEmailSignup } from "./routes/AuthEmailSignup";
import { AuthNostrConnect } from "./routes/AuthNostrConnect";
import { AuthWelcome } from "./routes/AuthWelcome";
import { NotFound } from "./routes/NotFound";

export function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/book/:slug" element={<BookDetail />} />
        <Route path="/genre/:slug" element={<GenreBrowse />} />
        <Route path="/browse" element={<Browse />} />
        <Route path="/about" element={<About />} />
        <Route path="/search" element={<Search />} />
        <Route path="/submit" element={<Submit />} />
        <Route path="/profile/me" element={<ProfileMe />} />
        <Route path="/profile/:handle" element={<Profile />} />
        <Route path="/auth" element={<AuthMethodSelect />} />
        <Route path="/auth/email" element={<AuthEmailSignup />} />
        <Route path="/auth/nostr" element={<AuthNostrConnect />} />
        <Route path="/auth/welcome" element={<AuthWelcome />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </BrowserRouter>
  );
}
