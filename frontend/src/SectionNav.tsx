import { SECTION_NAMES } from "./sectionNames";

export type NavSelection = number | "MI";

export function SectionNav({
  sectionsComplete,
  miComplete,
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
      {Object.entries(SECTION_NAMES).map(([num, name]) => {
        const sectionNo = Number(num);
        const complete = sectionsComplete[sectionNo];
        return (
          <button
            key={sectionNo}
            onClick={() => onSelect(sectionNo)}
            className={`nav-btn${selected === sectionNo ? " active" : ""}`}
          >
            {complete ? "✅" : "⬜"} {name}
          </button>
        );
      })}
      <button onClick={() => onSelect("MI")} className={`nav-btn${selected === "MI" ? " active" : ""}`} style={{ fontWeight: 600 }}>
        {miComplete ? "✅" : "⬜"} S5A — M&amp;I Details
      </button>
    </nav>
  );
}
