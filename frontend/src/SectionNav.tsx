import { SECTION_NAMES_SHORT } from "./sectionNames";

export type NavSelection = "DASHBOARD" | number | "MI" | "ANALYTICS";

export function SectionNav({
  selected,
  onSelect,
}: {
  sectionsComplete: Record<number, boolean>;
  miComplete: boolean;
  selected: NavSelection;
  onSelect: (selection: NavSelection) => void;
}) {
  return (
    <nav style={{ display: "flex", flexDirection: "column", gap: "0.3rem" }}>
      <button onClick={() => onSelect("DASHBOARD")} className={`nav-btn${selected === "DASHBOARD" ? " active" : ""}`}>
        🏠 {selected === "DASHBOARD" ? "Dashboard" : "Back to Dashboard"}
      </button>

      <div
        style={{
          fontSize: "0.7rem",
          textTransform: "uppercase",
          letterSpacing: "0.6px",
          color: "rgba(255,255,255,0.6)",
          margin: "0.6rem 0 0.2rem 0.3rem",
        }}
      >
        MIS Sections
      </div>

      {Object.entries(SECTION_NAMES_SHORT).map(([num, name]) => {
        const sectionNo = Number(num);
        return (
          <div key={sectionNo}>
            <button onClick={() => onSelect(sectionNo)} className={`nav-btn${selected === sectionNo ? " active" : ""}`}>
              {name}
            </button>
            {sectionNo === 5 && (
              <button
                onClick={() => onSelect("MI")}
                className={`nav-btn${selected === "MI" ? " active" : ""}`}
                style={{ marginLeft: "1rem", width: "calc(100% - 1rem)", fontSize: "0.8rem" }}
              >
                ↳ S5A - M&amp;I MIS
              </button>
            )}
          </div>
        );
      })}
    </nav>
  );
}
