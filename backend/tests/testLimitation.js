const { calculateLimitation, parseDate, calculateExpiry } = require('../services/limitationService');

let passedTests = 0;
let failedTests = 0;

function assertEqual(actual, expected, testName) {
  if (actual === expected) {
    console.log(`✅ [PASS] ${testName}`);
    passedTests++;
  } else {
    console.error(`❌ [FAIL] ${testName}: Expected "${expected}", got "${actual}"`);
    failedTests++;
  }
}

function assertBool(actual, expected, testName) {
  if (actual === expected) {
    console.log(`✅ [PASS] ${testName}`);
    passedTests++;
  } else {
    console.error(`❌ [FAIL] ${testName}: Expected ${expected}, got ${actual}`);
    failedTests++;
  }
}

console.log("==================================================");
console.log("RUNNING LIMITATION SCRUTINY ENGINE UNIT TESTS");
console.log("==================================================\n");

// TEST CASE 1: All required dates available & within limitation (Section 19, 3 years)
console.log("--- Test Case 1: All Required Dates Available (Section 19, Valid) ---");
const test1 = calculateLimitation({
  section: "19",
  caseTypeOrAct: "Recovery Application under Section 19 of RDDBFI Act 1993",
  causeOfActionDate: "2023-01-15",
  filingDate: "2024-05-10"
});
assertEqual(test1.status, "Within limitation", "Section 19: Status should be Within limitation");
assertEqual(test1.startingDate, "2023-01-15", "Section 19: Starting date parsed correctly");
assertEqual(test1.expiryDate, "2026-01-15", "Section 19: 3-year expiry calculated correctly");
assertBool(test1.manualVerificationRequired, false, "Section 19: Manual verification required false");

// TEST CASE 2: Missing relevant starting date
console.log("\n--- Test Case 2: Missing Relevant Starting Date ---");
const test2 = calculateLimitation({
  section: "19",
  filingDate: "2024-05-10"
});
assertEqual(test2.status, "Manual verification required", "Missing starting date returns Manual verification required");
assertBool(test2.manualVerificationRequired, true, "Missing starting date sets manualVerificationRequired to true");

// TEST CASE 3: Missing filing date
console.log("\n--- Test Case 3: Missing Filing Date ---");
const test3 = calculateLimitation({
  section: "17",
  possessionNoticeDate: "2023-01-01"
});
assertEqual(test3.status, "Manual verification required", "Missing filing date returns Manual verification required");
assertBool(test3.manualVerificationRequired, true, "Missing filing date sets manualVerificationRequired to true");

// TEST CASE 4: Limitation period appears expired (Section 17, 45 days)
console.log("\n--- Test Case 4: Limitation Period Expired (Section 17) ---");
const test4 = calculateLimitation({
  section: "17",
  caseTypeOrAct: "SARFAESI Act Section 17",
  possessionNoticeDate: "2023-01-01",
  filingDate: "2023-03-01" // 59 days later > 45 days
});
assertEqual(test4.status, "Limitation period appears expired", "Section 17: Status should be Limitation period appears expired");
assertEqual(test4.expiryDate, "2023-02-15", "Section 17: 45-day expiry date calculated correctly (Jan 1 + 45 days)");
assertEqual(test4.reason, "Limitation period appears expired based on the configured rule.", "Section 17: Exact required expired reason wording");
assertBool(test4.manualVerificationRequired, false, "Section 17: Manual verification required false when expired");

// TEST CASE 5: Limitation period appears valid (Section 17, 45 days)
console.log("\n--- Test Case 5: Limitation Period Valid (Section 17) ---");
const test5 = calculateLimitation({
  section: "17",
  caseTypeOrAct: "SARFAESI Act Section 17",
  possessionNoticeDate: "2023-01-01",
  filingDate: "2023-01-20" // 19 days later <= 45 days
});
assertEqual(test5.status, "Within limitation", "Section 17: Status should be Within limitation");
assertEqual(test5.expiryDate, "2023-02-15", "Section 17: Expiry date is 2023-02-15");
assertEqual(test5.reason, "Limitation appears to be within the configured period.", "Section 17: Exact required valid reason wording");
assertBool(test5.manualVerificationRequired, false, "Section 17: Manual verification required false");

// TEST CASE 6: Leap-year & Date boundary cases
console.log("\n--- Test Case 6: Leap-Year & Month-End Boundary Calculations ---");

// Subtest 6A: Leap day Feb 29, 2024 + 3 years = Feb 28, 2027 (clamped non-leap year)
const leap3Yr = calculateLimitation({
  section: "19",
  causeOfActionDate: "2024-02-29",
  filingDate: "2027-02-28"
});
assertEqual(leap3Yr.expiryDate, "2027-02-28", "Leap year Feb 29 + 3 years clamps to Feb 28, 2027");
assertEqual(leap3Yr.status, "Within limitation", "Filing on Feb 28, 2027 is within limitation");

// Subtest 6B: Leap year Feb 15, 2024 + 45 days (Feb 2024 has 29 days) -> Mar 31, 2024
const leap45Days = calculateLimitation({
  section: "17",
  possessionNoticeDate: "2024-02-15",
  filingDate: "2024-03-31"
});
assertEqual(leap45Days.expiryDate, "2024-03-31", "Leap year Feb 15, 2024 + 45 days is Mar 31, 2024");
assertEqual(leap45Days.status, "Within limitation", "Filing on Mar 31, 2024 is within limitation");

// Subtest 6C: Devanagari numerals parsing ("१५/०१/२०२३")
const devanagariTest = calculateLimitation({
  section: "19",
  causeOfActionDate: "१५/०१/२०२३",
  filingDate: "१०/०५/२०२४"
});
assertEqual(devanagariTest.startingDate, "2023-01-15", "Devanagari date parsed to 2023-01-15");
assertEqual(devanagariTest.filingDate, "2024-05-10", "Devanagari filing date parsed to 2024-05-10");
assertEqual(devanagariTest.status, "Within limitation", "Devanagari input calculation succeeds");

console.log("\n==================================================");
console.log(`TEST SUMMARY: ${passedTests} PASSED, ${failedTests} FAILED`);
console.log("==================================================");

if (failedTests > 0) {
  process.exit(1);
} else {
  process.exit(0);
}
