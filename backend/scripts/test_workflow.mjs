// One-off local integration test: fills every required field across all 10 sections for
// a fresh test month, submits, and approves as Checker. Run against a local `npm run dev`
// backend. Not wired into CI — just a manual verification script for Phase 2.

const API = "http://localhost:4000";
const LOCATION = "TESTLOC1";
const MONTH = "2026-05"; // use a month not touched by earlier manual testing

async function login(loginCode, password) {
  const res = await fetch(`${API}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ loginCode, password }),
  });
  const body = await res.json();
  if (!res.ok) throw new Error(`login failed: ${JSON.stringify(body)}`);
  return body.token;
}

function dummyValueFor(field) {
  if (field.type === "select") return field.opts?.[0] ?? "";
  if (field.type === "textarea") return "Test entry";
  if (field.type === "date") return "2026-05-15";
  const min = field.min ?? 0;
  return String(Math.max(min, 1));
}

async function main() {
  const makerToken = await login(LOCATION, "Test@1234");
  console.log("Logged in as Maker");

  for (let s = 1; s <= 10; s++) {
    const defsRes = await fetch(`${API}/api/field-defs/${s}`, {
      headers: { Authorization: `Bearer ${makerToken}` },
    });
    const defs = await defsRes.json();
    const values = {};
    for (const field of defs.fields) {
      if (field.auto) continue;
      values[field.key] = dummyValueFor(field);
    }
    const saveRes = await fetch(`${API}/api/submissions/${LOCATION}/${MONTH}/sections/${s}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${makerToken}` },
      body: JSON.stringify({ values }),
    });
    const saveBody = await saveRes.json();
    if (!saveRes.ok) throw new Error(`section ${s} save failed: ${JSON.stringify(saveBody)}`);
    console.log(`Section ${s} saved. complete=${saveBody.sectionComplete} overallPct=${saveBody.completionPct}`);
  }

  const submitRes = await fetch(`${API}/api/submissions/${LOCATION}/${MONTH}/submit`, {
    method: "POST",
    headers: { Authorization: `Bearer ${makerToken}` },
  });
  const submitBody = await submitRes.json();
  console.log("Submit result:", submitRes.status, submitBody);
  if (!submitRes.ok) throw new Error("submit failed");

  const checkerToken = await login(`${LOCATION}C`, "Test@1234");
  console.log("Logged in as Checker");

  const approveRes = await fetch(`${API}/api/submissions/${LOCATION}/${MONTH}/approve`, {
    method: "POST",
    headers: { Authorization: `Bearer ${checkerToken}` },
  });
  const approveBody = await approveRes.json();
  console.log("Approve result:", approveRes.status, approveBody);
  if (!approveRes.ok) throw new Error("approve failed");

  const finalRes = await fetch(`${API}/api/submissions/${LOCATION}/${MONTH}`, {
    headers: { Authorization: `Bearer ${checkerToken}` },
  });
  console.log("Final state:", await finalRes.json());
}

main().catch((e) => {
  console.error("TEST FAILED:", e.message);
  process.exitCode = 1;
});
