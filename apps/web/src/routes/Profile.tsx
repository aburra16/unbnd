import { useParams } from "react-router-dom";
import { Nav } from "../components/Nav";
import { Footer } from "../components/Footer";
import { ProfileHeader } from "../components/ProfileHeader";
import { ProfileStats } from "../components/ProfileStats";
import { TrustCard } from "../components/TrustCard";
import { GenreAffinity } from "../components/GenreAffinity";
import { ProfileShelves } from "../components/ProfileShelves";
import { ProfileActivity } from "../components/ProfileActivity";
import { NotFound } from "./NotFound";
import { getProfileRecord } from "../data/profile-fixtures";

export function Profile() {
  const { handle } = useParams<{ handle: string }>();
  const profile = handle ? getProfileRecord(handle) : undefined;

  if (!profile) return <NotFound />;

  return (
    <div className="page">
      <Nav />
      <ProfileHeader profile={profile} />
      <ProfileStats
        stats={[
          { label: "Books rated", value: profile.stats.booksRated },
          { label: "Reviews", value: profile.stats.reviewsWritten },
          { label: "Tags applied", value: profile.stats.tagsApplied },
          { label: "Followers", value: profile.followers },
          { label: "Following", value: profile.following },
        ]}
      />
      <TrustCard
        tier={profile.trustTier}
        percentile={profile.trustPercentile}
        description="Trust is computed by GrapeRank from the network around this curator. The number here reflects the Unbnd house view."
      />
      <GenreAffinity affinity={profile.genreAffinity} />
      <ProfileShelves shelves={profile.shelves} />
      <ProfileActivity items={profile.activity} />
      <Footer />
    </div>
  );
}
