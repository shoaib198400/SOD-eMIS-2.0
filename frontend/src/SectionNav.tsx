import { SECTION_NAMES } from "./sectionNames";

export function SectionNav({
  sectionsComplete,
  selected,
  onSelect,
}: {
  sectionsComplete: Record<number, boolean>;
  selected: number;
  onSelect: (sectionNo: number) => void;
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
    </nav>
  );
}
