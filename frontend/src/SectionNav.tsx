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
    <nav style={{ minWidth: 220 }}>
      {Object.entries(SECTION_NAMES).map(([num, name]) => {
        const sectionNo = Number(num);
        const complete = sectionsComplete[sectionNo];
        return (
          <button
            key={sectionNo}
            onClick={() => onSelect(sectionNo)}
            style={{
              display: "block",
              width: "100%",
              textAlign: "left",
              padding: "0.5rem",
              marginBottom: "0.25rem",
              background: selected === sectionNo ? "#e0e7ff" : "transparent",
              border: "1px solid #ddd",
              borderRadius: 4,
              cursor: "pointer",
            }}
          >
            {complete ? "✅" : "⬜"} {name}
          </button>
        );
      })}
      <button
        onClick={() => onSelect("MI")}
        style={{
          display: "block",
          width: "100%",
          textAlign: "left",
          padding: "0.5rem",
          marginBottom: "0.25rem",
          background: selected === "MI" ? "#e0e7ff" : "transparent",
          border: "1px solid #ddd",
          borderRadius: 4,
          cursor: "pointer",
          fontWeight: 600,
        }}
      >
        {miComplete ? "✅" : "⬜"} S5A — M&amp;I Details
      </button>
    </nav>
  );
}
