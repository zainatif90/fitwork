import { describe, expect, it } from "vitest";
import { profileStrength } from "./profileStrength";

const BIO = "I build fast, accessible admin dashboards and landing pages with React, TypeScript and Tailwind for startups.";

describe("profileStrength", () => {
  it("calls a single vague skill with no bio weak and says what to add", () => {
    const r = profileStrength(["Developer"], "");
    expect(r.level).toBe("weak");
    expect(r.tips).toHaveLength(2);
  });

  it("does not count generic words as skills", () => {
    expect(profileStrength(["Developer", "Programming", "IT", "React"], BIO).level).toBe("weak");
  });

  it("is good with 3 specific skills and a short bio", () => {
    expect(profileStrength(["React", "TypeScript", "Tailwind CSS"], "React developer building dashboards for startups").level).toBe("good");
  });

  it("is strong with 5+ specific skills and a real bio, with no tips", () => {
    const r = profileStrength(["React", "TypeScript", "Tailwind CSS", "Node.js", "Figma"], BIO);
    expect(r).toEqual({ level: "strong", tips: [] });
  });
});
