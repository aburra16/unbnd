// Guide content loader (Story 84 / ADR 0081 §1). Takes the raw md record
// (production wires import.meta.glob; tests inject fixtures), parses the
// authored frontmatter, and groups entries into the published sections.
// Missing anchor or name fails loudly: anchors are authored, never derived.
import { GUIDE_SECTIONS, type GuideSectionMeta } from "./sections";

export type GuideEntry = {
  readonly anchor: string;
  readonly name: string;
  readonly order: number;
  readonly related: readonly string[];
  readonly body: string;
};

export type GuideSection = GuideSectionMeta & {
  readonly entries: readonly GuideEntry[];
};

export type GuideContent = {
  /** Sections with at least one entry, in manifest order. */
  readonly published: readonly GuideSection[];
};

// STUB (red): real parsing in implementation.
export function loadGuide(_raw: Record<string, string>): GuideContent {
  return { published: [] };
}

void GUIDE_SECTIONS;
