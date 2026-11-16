import { BRAND } from "@orkestra/shared";

export default function HomePage() {
  return (
    <main
      style={{
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        background: BRAND.colors.primary,
        color: BRAND.colors.lightGray,
        fontFamily: "Inter, system-ui, sans-serif",
      }}
    >
      <div style={{ textAlign: "center" }}>
        <h1 style={{ fontSize: "3rem", letterSpacing: "0.2em", margin: 0 }}>
          {BRAND.name}
        </h1>
        <p style={{ color: BRAND.colors.electricBlue }}>{BRAND.slogan}</p>
      </div>
    </main>
  );
}
