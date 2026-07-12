// Ported from the reference app's 10 M&I ("Section 5A") tab functions in app.py
// (_mi_tab_outage, _mi_tab_repair, _mi_tab_vru, _mi_tab_audit2526, _mi_tab_audit2627,
// _mi_tab_tech_audit, _mi_tab_equip, _mi_tab_int_pipeline, _mi_tab_ext_pipeline,
// _mi_tab_tank_status) and sheets.py's _MI_TAB_HEADERS.
//
// One deliberate deviation from the original: wherever the original overwrote a select
// field's value with free text when "Other"/"Others" was chosen (Tank Outage's outage_for,
// Tank Status's tank_no), this rewrite keeps the selection AND the free text as two separate
// stored keys instead of silently discarding which option was originally picked.

export type MiFieldType = "text" | "int" | "float" | "date" | "select" | "textarea";

export interface MiFieldDef {
  key: string;
  label: string;
  type: MiFieldType;
  required: boolean; // required when visible
  opts?: string[];
  maxChars?: number;
  showWhen?: Record<string, string>;
  dynamicOpts?: "tankOpts";
}

export interface MiTabDef {
  key: string;
  code: string;
  label: string;
  isMultiRow: boolean;
  rowLabel: string;
  naLabel: string;
  fields: MiFieldDef[];
}

const OUTAGE_REASONS = [
  "Tank Cleaning",
  "Hydrotest",
  "Cathodic Protection",
  "Inspection / Audit",
  "Planned Maintenance",
  "Repairs",
  "Other",
];

export const MI_TABS: MiTabDef[] = [
  {
    key: "MI_TANK_OUTAGE",
    code: "to",
    label: "Tank Outage",
    isMultiRow: true,
    rowLabel: "Row",
    naLabel: "Not Applicable — No tank under outage this month",
    fields: [
      { key: "tank_no", label: "Tank No.", type: "select", required: true, dynamicOpts: "tankOpts" },
      { key: "other_tank_desc", label: "Other Tank Description", type: "text", required: true, maxChars: 256, showWhen: { tank_no: "Other Tanks" } },
      { key: "planned_start", label: "Planned Start", type: "date", required: true },
      { key: "planned_end", label: "Planned End", type: "date", required: true },
      { key: "actual_start", label: "Actual Start", type: "date", required: true },
      { key: "actual_end", label: "Actual End (blank if ongoing)", type: "date", required: false },
      { key: "outage_for", label: "Outage For", type: "select", required: true, opts: OUTAGE_REASONS },
      { key: "outage_for_other", label: "Specify", type: "text", required: true, maxChars: 256, showWhen: { outage_for: "Other" } },
      {
        key: "current_status",
        label: "Current Status",
        type: "select",
        required: true,
        opts: ["Under Outage", "Cleaning in Progress", "Repairs in Progress", "Pending Commissioning", "Commissioned", "Delayed", "Extended"],
      },
    ],
  },
  {
    key: "MI_MAJOR_REPAIR",
    code: "mr",
    label: "Major Repair",
    isMultiRow: true,
    rowLabel: "Row",
    naLabel: "Not Applicable — No major repair this month",
    fields: [
      { key: "tank_no", label: "Tank No.", type: "select", required: true, dynamicOpts: "tankOpts" },
      { key: "other_tank_desc", label: "Other Tank Description", type: "text", required: true, maxChars: 256, showWhen: { tank_no: "Other Tanks" } },
      { key: "nature_of_repair", label: "Nature of Repair", type: "textarea", required: true, maxChars: 256 },
      { key: "revenue_capex", label: "Revenue / Capex", type: "select", required: true, opts: ["Revenue", "Capex"] },
      { key: "ar_code", label: "AR Code", type: "text", required: true, maxChars: 50, showWhen: { revenue_capex: "Capex" } },
      { key: "current_status", label: "Current Status", type: "select", required: true, opts: ["In Progress", "Completed", "Delayed", "On Hold", "Cancelled"] },
      { key: "etc_date", label: "ETC Date", type: "date", required: true },
    ],
  },
  {
    key: "MI_VRU",
    code: "vr",
    label: "VRU",
    isMultiRow: false,
    rowLabel: "",
    naLabel: "Not Applicable — VRU not installed at this location",
    fields: [
      { key: "vru_operational", label: "VRU Operational this month?", type: "select", required: true, opts: ["Yes", "No"] },
      { key: "date_not_operating", label: "Date Since Not Operating", type: "date", required: true, showWhen: { vru_operational: "No" } },
      { key: "action_taken", label: "Action Taken", type: "textarea", required: true, maxChars: 256, showWhen: { vru_operational: "No" } },
      { key: "etc_date", label: "ETC Date", type: "date", required: true, showWhen: { vru_operational: "No" } },
      { key: "ms_vol_recovered_kl", label: "MS Vol Recovered (KL)", type: "text", required: true, showWhen: { vru_operational: "Yes" } },
      { key: "inlet_mfm_start_m3", label: "Inlet MFM Start (m³)", type: "text", required: true, showWhen: { vru_operational: "Yes" } },
      { key: "inlet_mfm_end_m3", label: "Inlet MFM End (m³)", type: "text", required: true, showWhen: { vru_operational: "Yes" } },
      { key: "outlet_mfm_start_m3", label: "Outlet MFM Start (m³)", type: "text", required: true, showWhen: { vru_operational: "Yes" } },
      { key: "outlet_mfm_end_m3", label: "Outlet MFM End (m³)", type: "text", required: true, showWhen: { vru_operational: "Yes" } },
      { key: "vapour_treated_m3", label: "Vapour Treated (m³)", type: "text", required: true, showWhen: { vru_operational: "Yes" } },
      { key: "voc_value_mgcc", label: "VOC Value (mg/cc)", type: "text", required: true, showWhen: { vru_operational: "Yes" } },
      { key: "inlet_emission_mgcc", label: "Inlet Emission (mg/cc)", type: "text", required: true, showWhen: { vru_operational: "Yes" } },
      { key: "ms_gasohol_tt_vol_kl", label: "MS/Gasohol TT Vol (KL)", type: "text", required: false, showWhen: { vru_operational: "Yes" } },
      { key: "hsd_tt_vol_kl", label: "HSD TT Vol (KL)", type: "text", required: false, showWhen: { vru_operational: "Yes" } },
      { key: "ms_gasohol_tw_vol_kl", label: "MS/Gasohol TW Vol (KL)", type: "text", required: false, showWhen: { vru_operational: "Yes" } },
      { key: "hsd_tw_vol_kl", label: "HSD TW Vol (KL)", type: "text", required: false, showWhen: { vru_operational: "Yes" } },
      { key: "vru_uptime_pct", label: "VRU Uptime %", type: "text", required: true, showWhen: { vru_operational: "Yes" } },
    ],
  },
  {
    key: "MI_AUDIT_2526",
    code: "a25",
    label: "M&I Audit 25-26",
    isMultiRow: false,
    rowLabel: "",
    naLabel: "Not Applicable",
    fields: [
      { key: "audit_date", label: "Audit Date", type: "date", required: true },
      { key: "no_recommendations", label: "No. of Recommendations", type: "int", required: true },
      { key: "no_pending", label: "No. Pending", type: "int", required: true },
      { key: "external_score", label: "External Score (0-100)", type: "float", required: true },
    ],
  },
  {
    key: "MI_AUDIT_2627",
    code: "a27",
    label: "M&I Audit 26-27",
    isMultiRow: false,
    rowLabel: "",
    naLabel: "Not Applicable",
    fields: [
      { key: "audit_carried_out", label: "Audit Carried Out?", type: "select", required: true, opts: ["Yes", "No"] },
      { key: "audit_date", label: "Audit Date", type: "date", required: true, showWhen: { audit_carried_out: "Yes" } },
      { key: "no_recommendations", label: "No. of Recommendations", type: "int", required: true, showWhen: { audit_carried_out: "Yes" } },
      { key: "no_pending", label: "No. Pending", type: "int", required: true, showWhen: { audit_carried_out: "Yes" } },
      { key: "external_score", label: "External Score (0-100)", type: "float", required: true, showWhen: { audit_carried_out: "Yes" } },
    ],
  },
  {
    key: "MI_TECH_AUDIT",
    code: "ta",
    label: "Tech. Audit",
    isMultiRow: true,
    rowLabel: "Audit",
    naLabel: "Not Applicable — No technical audit this month",
    fields: [
      { key: "audit_date", label: "Audit Date", type: "date", required: true },
      { key: "no_recommendations", label: "No. of Recommendations", type: "text", required: true },
      { key: "no_pending", label: "No. Pending", type: "text", required: true },
      { key: "ref_no", label: "Audit Ref No. as per Audit Portal", type: "text", required: true, maxChars: 256 },
    ],
  },
  {
    key: "MI_EQUIP_BREAKDOWN",
    code: "eb",
    label: "Equip. Breakdown",
    isMultiRow: true,
    rowLabel: "Breakdown",
    naLabel: "Not Applicable — No equipment breakdown this month",
    fields: [
      { key: "equipment_name", label: "Equipment Name", type: "select", required: true, opts: ["Pipeline", "Pump", "Fire Fighting Equipment", "Fire Engine", "DG Set", "Other"] },
      { key: "equipment_name_other", label: "Specify Equipment", type: "text", required: true, maxChars: 256, showWhen: { equipment_name: "Other" } },
      { key: "equipment_details", label: "Equipment Details", type: "textarea", required: true, maxChars: 256 },
      { key: "start_date", label: "Breakdown Start Date", type: "date", required: true },
      { key: "issue", label: "Issue Description", type: "textarea", required: true, maxChars: 256 },
      { key: "proposed_date", label: "Proposed Resolution Date", type: "date", required: true },
      { key: "actual_end_date", label: "Actual End Date (blank if unresolved)", type: "date", required: false },
      { key: "resolution_action", label: "Resolution Action", type: "textarea", required: true, maxChars: 256 },
    ],
  },
  {
    key: "MI_INT_PIPELINE",
    code: "ip",
    label: "Int. Pipeline",
    isMultiRow: false,
    rowLabel: "",
    naLabel: "Not Applicable",
    fields: [
      { key: "last_ut_date", label: "Last UT Date", type: "date", required: true },
      { key: "last_hydrotest_date", label: "Last Hydrotest Date", type: "date", required: true },
      { key: "last_dcvg_date", label: "Last DCVG Date", type: "date", required: true },
      { key: "last_lrut_date", label: "Last LRUT Date", type: "date", required: true },
      { key: "other_testing", label: "Other Testing Details", type: "textarea", required: false, maxChars: 256 },
    ],
  },
  {
    key: "MI_EXT_PIPELINE",
    code: "ep",
    label: "Ext. Pipeline",
    isMultiRow: true,
    rowLabel: "Pipeline",
    naLabel: "Not Applicable — No external pipeline at this location",
    fields: [
      { key: "pipeline_type", label: "Pipeline Type", type: "select", required: true, opts: ["UG", "AG"] },
      { key: "pipeline_details", label: "Pipeline Details", type: "textarea", required: true, maxChars: 256 },
      { key: "length_metres", label: "Length (metres)", type: "text", required: true },
      { key: "product", label: "Product", type: "text", required: true },
      { key: "size_inch", label: "Size (inch)", type: "text", required: true },
      { key: "last_ut_date", label: "Last UT Date", type: "date", required: true },
      { key: "last_hydrotest_date", label: "Last Hydrotest Date", type: "date", required: true },
      { key: "last_dcvg_date", label: "Last DCVG Date", type: "date", required: true },
      { key: "last_lrut_date", label: "Last LRUT Date", type: "date", required: true },
      { key: "other_testing", label: "Other Testing Details", type: "textarea", required: false, maxChars: 256 },
    ],
  },
  {
    key: "MI_TANK_STATUS",
    code: "ts",
    label: "Tank Status",
    isMultiRow: true,
    rowLabel: "Tank",
    naLabel: "Not Applicable — No tanks at this location",
    fields: [
      { key: "tank_no", label: "Tank No.", type: "select", required: true, dynamicOpts: "tankOpts" },
      { key: "tank_other", label: "Specify Tank No.", type: "text", required: true, showWhen: { tank_no: "Other Tanks" } },
      { key: "cleaning_completed_date", label: "Date of Cleaning Completed", type: "date", required: false },
      { key: "cleaning_due_date", label: "Due Date of Tank Cleaning", type: "date", required: false },
      { key: "extension_taken", label: "Extension Taken?", type: "select", required: false, opts: ["Yes", "No", "NA"] },
      { key: "extension_efn_no", label: "eFN# (Extension Order No.)", type: "text", required: true, maxChars: 50, showWhen: { extension_taken: "Yes" } },
      { key: "inspection_date", label: "Date of Comprehensive Inspection", type: "date", required: false },
      { key: "inspection_due_date", label: "Due Date for Comprehensive Inspection", type: "date", required: false },
      { key: "painting_date", label: "Date of Tank Painting", type: "date", required: false },
      { key: "painting_due_date", label: "Due Date of Tank Painting", type: "date", required: false },
      { key: "tank_status", label: "Tank Status", type: "select", required: true, opts: ["Operational", "Under Repair", "Under Cleaning", "Idle", "Revamp", "Others"] },
      { key: "tank_status_other", label: "Tank Status Details", type: "text", required: true, maxChars: 128, showWhen: { tank_status: "Others" } },
    ],
  },
];

export function getMiTab(key: string): MiTabDef | undefined {
  return MI_TABS.find((t) => t.key === key);
}
