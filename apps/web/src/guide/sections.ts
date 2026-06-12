// The eight guide sections (Story 84 / ADR 0081 §1): one ordered manifest.
// Slugs are routes and are stable once published, like entry anchors.
export type GuideSectionMeta = {
  readonly slug: string;
  readonly title: string;
};

export const GUIDE_SECTIONS: readonly GuideSectionMeta[] = [
  { slug: "getting-started", title: "Getting started" },
  { slug: "finding-books", title: "Finding books" },
  { slug: "ratings-you-can-trust", title: "Ratings you can trust" },
  { slug: "rating-reviewing-tagging", title: "Rating, reviewing, and tagging" },
  { slug: "sharing-and-your-profile", title: "Sharing and your profile" },
  { slug: "for-authors", title: "For authors" },
  { slug: "for-curators", title: "For curators" },
  { slug: "your-account-is-yours", title: "Your account is yours" },
];
