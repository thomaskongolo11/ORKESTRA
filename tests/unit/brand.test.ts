import { describe, expect, it } from "vitest";
import { BRAND } from "../../packages/shared/constants/brand";

describe("BRAND", () => {
  it("utilise le nom officiel ORKESTRA", () => {
    expect(BRAND.name).toBe("ORKESTRA");
    expect(BRAND.slogan).toBe("Your business. Orchestrated.");
  });

  it("respecte la charte couleurs", () => {
    expect(BRAND.colors).toEqual({
      primary: "#101827",
      secondaryBlue: "#233B5D",
      electricBlue: "#5B8DEF",
      lightGray: "#F2F4F7",
    });
  });
});
